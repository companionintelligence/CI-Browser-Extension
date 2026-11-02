/**
 * Durable retry queue for live captures.
 *
 * Live captures have no second chance. History, bookmark, and download sync all
 * re-derive their work list from the browser on every `ci-auto-sync` tick, so a
 * failed upload there is retried for free — the item is simply not marked
 * synced. A live capture (a saved highlight, a recorded visit, a scrape) exists
 * only in the moment its event fires: before this queue, any POST failure
 * (offline, server restarting, session expired mid-session) dropped it for good.
 *
 * Failed captures land here and are re-sent on the next auto-sync tick. The
 * queue is bounded by QUEUE_LIMITS: entries older than the age limit go first,
 * then the oldest past the count or byte cap (oldest dropped first, matching the
 * trimming policy in @/lib/syncedItems). Only a server rejection of a record
 * counts toward MAX_CAPTURE_ATTEMPTS, so one permanently rejected record cannot
 * wedge the queue behind it. An outage does not count, so its captures wait out
 * the outage up to the age limit.
 */

import type { BrowserActivity } from "@/services/browserActivity";

export const CAPTURE_QUEUE_KEY = "captureRetryQueue";

export interface QueueLimits {
  maxAgeMs: number;
  maxEntries: number;
  maxBytes: number;
}

/**
 * Every queue limit lives here. An outage can run for hours, so captures are
 * kept for a day. The byte cap is under the 50 MB that unlimitedStorage allows
 * (wxt.config.ts); Chrome's default storage.local quota is 10 MB.
 */
export const QUEUE_LIMITS: QueueLimits = {
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxEntries: 2_000,
  maxBytes: 50 * 1024 * 1024,
};

/** After this many server rejections an entry is dropped rather than retried forever. */
export const MAX_CAPTURE_ATTEMPTS = 5;

/** Statuses that mean "try again later", not "this record is bad". */
const NOT_A_REJECTION = new Set([401, 403, 408, 429]);

export interface QueuedCapture {
  activity: BrowserActivity;
  /** Server rejections so far; entries start at 0. */
  attempts: number;
  /** When the capture was first queued, in ms since the epoch. */
  queuedAt: number;
}

export interface DrainResult {
  sent: number;
  requeued: number;
  dropped: number;
}

export interface BoundResult {
  entries: QueuedCapture[];
  droppedByAge: number;
  droppedByCount: number;
  droppedByBytes: number;
}

export async function getQueuedCaptures(): Promise<QueuedCapture[]> {
  const result = await browser.storage.local.get(CAPTURE_QUEUE_KEY);
  const queued = result[CAPTURE_QUEUE_KEY] as QueuedCapture[] | undefined;

  if (!Array.isArray(queued)) {
    return [];
  }

  // Entries queued before queuedAt existed start their age now.
  const now = Date.now();

  return queued.map((entry) =>
    typeof entry.queuedAt === "number" ? entry : { ...entry, queuedAt: now },
  );
}

/** UTF-8 size of an entry as stored, so the byte cap follows the real payload. */
function storedBytes(entry: QueuedCapture): number {
  return new Blob([JSON.stringify(entry)]).size;
}

/**
 * Trim the queue to its limits, oldest first. Entries are ordered by queuedAt;
 * anything past the age limit goes, then the oldest past the count cap, then
 * the oldest past the byte cap.
 */
export function boundQueue(
  entries: QueuedCapture[],
  now: number,
  limits: QueueLimits = QUEUE_LIMITS,
): BoundResult {
  const ordered = [...entries].sort((a, b) => a.queuedAt - b.queuedAt);
  const fresh = ordered.filter(
    (entry) => now - entry.queuedAt <= limits.maxAgeMs,
  );
  const counted = fresh.slice(-limits.maxEntries);

  // Keep the newest entries whose combined stored size fits under the cap.
  let total = 0;
  let firstKept = counted.length;
  for (let i = counted.length - 1; i >= 0; i--) {
    total += storedBytes(counted[i]);
    if (total > limits.maxBytes) {
      break;
    }

    firstKept = i;
  }

  const kept = counted.slice(firstKept);

  return {
    entries: kept,
    droppedByAge: ordered.length - fresh.length,
    droppedByCount: fresh.length - counted.length,
    droppedByBytes: counted.length - kept.length,
  };
}

/** Keep the queue inside its limits, warning once per trim with counts only. */
async function writeQueue(entries: QueuedCapture[]): Promise<void> {
  const bounded = boundQueue(entries, Date.now());
  const dropped =
    bounded.droppedByAge + bounded.droppedByCount + bounded.droppedByBytes;

  if (dropped > 0) {
    // Counts only: a queued capture can carry a page's URL and text.
    console.warn(
      `Capture queue trimmed ${dropped} entries: ${bounded.droppedByAge} past the age limit, ${bounded.droppedByCount} over the count cap, ${bounded.droppedByBytes} over the size cap.`,
    );
  }

  await browser.storage.local.set({ [CAPTURE_QUEUE_KEY]: bounded.entries });
}

/** Queue captures whose upload failed, for the next drain to retry. */
export async function enqueueCaptures(
  activities: BrowserActivity[],
  attempts = 0,
): Promise<void> {
  if (activities.length === 0) {
    return;
  }

  const existing = await getQueuedCaptures();
  const queuedAt = Date.now();
  await writeQueue([
    ...existing,
    ...activities.map((activity) => ({ activity, attempts, queuedAt })),
  ]);
}

/**
 * Whether a failed send means the server rejected the record itself. The upload
 * error names its status ("failed: HTTP 422"). Outages (5xx, network errors),
 * expired sessions (401, 403), and rate limits (408, 429) are not the record's
 * fault, so they do not count toward MAX_CAPTURE_ATTEMPTS.
 */
function isRecordRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.match(/HTTP (\d{3})\b/);
  if (!status) {
    return false;
  }

  const code = Number(status[1]);

  return code >= 400 && code < 500 && !NOT_A_REJECTION.has(code);
}

/**
 * Re-send everything queued through `send`, which throws on failure exactly
 * like postBrowserCaptures. A batch the server rejects is re-queued with its
 * attempt count incremented until MAX_CAPTURE_ATTEMPTS, then dropped. Any other
 * failure re-queues the batch unchanged, to be retried until the age limit.
 *
 * The queue is cleared before sending and failures are appended back onto
 * whatever is there afterwards, so a capture that fails *during* the drain is
 * still queued exactly once rather than being overwritten by this write.
 */
export async function drainCaptureQueue(
  send: (activities: BrowserActivity[]) => Promise<void>,
): Promise<DrainResult> {
  const queued = await getQueuedCaptures();
  if (queued.length === 0) {
    return { sent: 0, requeued: 0, dropped: 0 };
  }

  await writeQueue([]);

  try {
    await send(queued.map((entry) => entry.activity));

    return { sent: queued.length, requeued: 0, dropped: 0 };
  } catch (error) {
    const rejected = isRecordRejection(error);
    const retryable = queued
      .map((entry) =>
        rejected ? { ...entry, attempts: entry.attempts + 1 } : entry,
      )
      .filter((entry) => entry.attempts < MAX_CAPTURE_ATTEMPTS);
    const dropped = queued.length - retryable.length;

    console.warn(
      `Capture retry drain failed; ${retryable.length} re-queued, ${dropped} dropped:`,
      error,
    );

    const arrivedDuringDrain = await getQueuedCaptures();
    await writeQueue([...arrivedDuringDrain, ...retryable]);

    return { sent: 0, requeued: retryable.length, dropped };
  }
}
