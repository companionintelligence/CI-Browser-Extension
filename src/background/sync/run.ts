/**
 * Shared sync engine. Every "sync this list of things" path in the extension
 * does the same 5 steps:
 *
 *   load → filter against dedup-cache → map to payload → batch upload → mark synced
 *
 * This module captures that as `runSync<TItem, TPayload>`. The three callers
 * (history, bookmarks, downloads) only need to supply:
 *
 *  - how to load items
 *  - a stable string key per item (for dedup)
 *  - how to turn one item into one upload payload
 *  - which API endpoint receives the payloads
 *
 * The dedup cache is still the `storage.local` string-array model for now;
 * planning/06 moves it into IndexedDB.
 */

import axios from "axios";
import { logger, errMessage } from "@/lib/log";
import { store } from "@/store";

export interface SyncOptions<TItem, TPayload> {
  /** Used for log scoping and the synced-IDs cache key. */
  kind: "history" | "bookmarks" | "downloads";
  /** Cache key in browser.storage.local — e.g. "syncedBookmarks". */
  syncedKey: string;
  /** Endpoint path relative to the server domain — e.g. "/api/browser-activity". */
  endpoint: string;
  /** Items to consider syncing. */
  loadItems: () => Promise<TItem[]>;
  /** Stable string ID per item; used for dedup. Return null to skip. */
  itemKey: (item: TItem) => string | null;
  /** Map a single item to a single upload payload. */
  toPayload: (item: TItem) => Promise<TPayload>;
  /** Optional pre-flight filter (returns false to skip). */
  shouldInclude?: (item: TItem) => boolean;
  /** Upload batch size. */
  sliceSize?: number;
  /** Per-batch timeout in ms. */
  timeoutMs?: number;
  /** Optional progress callback fired after every batch upload. */
  onProgress?: (state: SyncProgress) => void;
}

export interface SyncProgress {
  kind: "history" | "bookmarks" | "downloads";
  total: number;
  uploaded: number;
  failed: number;
  durationMs: number;
}

export interface SyncResult {
  total: number;
  considered: number;
  uploaded: number;
  failed: number;
  durationMs: number;
  lastError?: string;
}

async function readSyncedSet(key: string): Promise<Set<string>> {
  const result = await browser.storage.local.get(key);
  const items = (result[key] as string[] | undefined) ?? [];

  return new Set(items);
}

async function writeSyncedSet(key: string, set: Set<string>): Promise<void> {
  await browser.storage.local.set({ [key]: Array.from(set) });
}

export async function runSync<TItem, TPayload>(
  opts: SyncOptions<TItem, TPayload>,
): Promise<SyncResult> {
  const startedAt = Date.now();
  const sliceSize = opts.sliceSize ?? 100;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const { accessToken, serverDomain } = store.getState().ciState;
  if (!accessToken || !serverDomain) {
    return {
      total: 0,
      considered: 0,
      uploaded: 0,
      failed: 0,
      durationMs: 0,
      lastError: "Not authenticated",
    };
  }

  logger.info(`sync.${opts.kind}.start`, {});

  const allItems = await opts.loadItems();
  const syncedSet = await readSyncedSet(opts.syncedKey);

  const filtered: TItem[] = [];
  for (const item of allItems) {
    if (opts.shouldInclude && !opts.shouldInclude(item)) {
      continue;
    }

    const key = opts.itemKey(item);
    if (!key) {
      continue;
    }

    if (syncedSet.has(key)) {
      continue;
    }

    filtered.push(item);
  }

  logger.info(`sync.${opts.kind}.filtered`, {
    total: allItems.length,
    considered: filtered.length,
  });

  let uploaded = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (let i = 0; i < filtered.length; i += sliceSize) {
    const slice = filtered.slice(i, i + sliceSize);
    let payloads: TPayload[];
    try {
      payloads = await Promise.all(slice.map((item) => opts.toPayload(item)));
    } catch (err) {
      failed += slice.length;
      lastError = errMessage(err);
      logger.warn(`sync.${opts.kind}.payloadFailed`, {
        err: lastError,
        batch: i / sliceSize,
      });
      continue;
    }

    try {
      await axios.post(`https://${serverDomain}${opts.endpoint}`, payloads, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: timeoutMs,
      });
      uploaded += slice.length;
      for (const item of slice) {
        const key = opts.itemKey(item);
        if (key) {
          syncedSet.add(key);
        }
      }

      // Persist the set after every successful batch so a crash mid-run
      // doesn't re-upload the previous batches.
      await writeSyncedSet(opts.syncedKey, syncedSet);
      logger.debug(`sync.${opts.kind}.batchUploaded`, {
        uploaded,
        total: filtered.length,
      });
      opts.onProgress?.({
        kind: opts.kind,
        total: filtered.length,
        uploaded,
        failed,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      failed += slice.length;
      lastError = errMessage(err);
      logger.warn(`sync.${opts.kind}.batchFailed`, {
        err: lastError,
        batch: i / sliceSize,
      });
      break;
    }
  }

  const result: SyncResult = {
    total: allItems.length,
    considered: filtered.length,
    uploaded,
    failed,
    durationMs: Date.now() - startedAt,
    lastError,
  };

  logger.info(`sync.${opts.kind}.done`, {
    total: result.total,
    considered: result.considered,
    uploaded: result.uploaded,
    failed: result.failed,
    durationMs: result.durationMs,
  });

  return result;
}
