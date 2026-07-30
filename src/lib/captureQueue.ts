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
 * queue is bounded in both directions: at most MAX_QUEUED_CAPTURES entries
 * (oldest dropped first, matching the trimming policy in @/lib/syncedItems) and
 * at most MAX_CAPTURE_ATTEMPTS delivery attempts each, so one permanently
 * rejected record cannot wedge the queue behind it.
 */

import type { BrowserActivity } from "@/services/browserActivity";

export const CAPTURE_QUEUE_KEY = "captureRetryQueue";

/** Storage cap. Roughly a day of heavy browsing while fully offline. */
export const MAX_QUEUED_CAPTURES = 500;

/** After this many failed sends an entry is dropped rather than retried forever. */
export const MAX_CAPTURE_ATTEMPTS = 5;

export interface QueuedCapture {
  activity: BrowserActivity;
  /** Failed delivery attempts so far; entries start at 0. */
  attempts: number;
}

export interface DrainResult {
  sent: number;
  requeued: number;
  dropped: number;
}

export async function getQueuedCaptures(): Promise<QueuedCapture[]> {
  const result = await browser.storage.local.get(CAPTURE_QUEUE_KEY);
  const queued = result[CAPTURE_QUEUE_KEY] as QueuedCapture[] | undefined;

  return Array.isArray(queued) ? queued : [];
}

/** Newest-wins trimming: an old queued visit matters less than a fresh one. */
async function writeQueue(entries: QueuedCapture[]): Promise<void> {
  const bounded =
    entries.length > MAX_QUEUED_CAPTURES
      ? entries.slice(-MAX_QUEUED_CAPTURES)
      : entries;

  await browser.storage.local.set({ [CAPTURE_QUEUE_KEY]: bounded });
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
  await writeQueue([
    ...existing,
    ...activities.map((activity) => ({ activity, attempts })),
  ]);
}

/**
 * Re-send everything queued through `send`, which throws on failure exactly
 * like postBrowserCaptures. A failed batch is re-queued with its attempt count
 * incremented until MAX_CAPTURE_ATTEMPTS, then dropped.
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
    const retryable = queued
      .map((entry) => ({ ...entry, attempts: entry.attempts + 1 }))
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
