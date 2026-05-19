/**
 * IndexedDB outbox. Every piece of content the extension wants to send to
 * CI-Server is written here first, then drained by a background loop that
 * survives service-worker suspension.
 *
 * Replaces the legacy `pendingCaptures` array in `browser.storage.local` and
 * (in a follow-up) the `syncedHistory`/`syncedBookmarks`/`syncedDownloads`
 * string-array caches.
 *
 * See planning/06-local-first-sync.md.
 *
 * NOTE: This module deliberately uses raw `indexedDB` (no Dexie) so we keep
 * the bundle small. Schema migrations happen in `onupgradeneeded`.
 */

import { logger, errMessage } from "@/lib/log";
import type { ContentPayload } from "./content-cache";

const DB_NAME = "CIOutbox";
const DB_VERSION = 1;
const STORE_OUTBOX = "outbox";

export type OutboxState = "pending" | "in_flight" | "synced" | "failed";

export interface OutboxRow {
  id: string;
  kind: ContentPayload["kind"];
  payload: ContentPayload;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  state: OutboxState;
  lastError?: string;
  dedupKey?: string;
}

const MAX_ATTEMPTS = 5;
const BACKOFFS_MS: number[] = [
  30 * 1000,
  2 * 60 * 1000,
  8 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const store = db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
        store.createIndex("state", "state", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("dedupKey", "dedupKey", { unique: true });
      }
    };
  });

  return dbPromise;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // RFC4122-ish fallback for older runtimes.
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_OUTBOX, mode);
        const store = transaction.objectStore(STORE_OUTBOX);
        const result = Promise.resolve(fn(store));
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => result.then(resolve, reject);
      }),
  );
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface EnqueueOptions {
  dedupKey?: string;
}

export async function enqueue(
  payload: ContentPayload,
  options: EnqueueOptions = {},
): Promise<OutboxRow | null> {
  const row: OutboxRow = {
    id: uuid(),
    kind: payload.kind,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    state: "pending",
    dedupKey: options.dedupKey,
  };

  try {
    return await tx<OutboxRow | null>("readwrite", async (store) => {
      if (options.dedupKey) {
        const existing = await reqAsPromise(
          store.index("dedupKey").get(options.dedupKey),
        );
        if (existing) {
          logger.debug("outbox.dedupSkipped", { dedupKey: options.dedupKey });

          return existing as OutboxRow;
        }
      }

      await reqAsPromise(store.add(row));
      logger.debug("outbox.enqueued", { id: row.id, kind: row.kind });

      return row;
    });
  } catch (err) {
    logger.warn("outbox.enqueueFailed", { err: errMessage(err) });

    return null;
  }
}

export async function listPending(limit = 25): Promise<OutboxRow[]> {
  return tx<OutboxRow[]>("readonly", async (store) => {
    const now = Date.now();
    const out: OutboxRow[] = [];

    return new Promise<OutboxRow[]>((resolve, reject) => {
      const cursorReq = store
        .index("state")
        .openCursor(IDBKeyRange.only("pending"));
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || out.length >= limit) {
          resolve(out);

          return;
        }

        const row = cursor.value as OutboxRow;
        if (row.nextAttemptAt <= now) {
          out.push(row);
        }

        cursor.continue();
      };
    });
  });
}

export async function markInFlight(ids: string[]): Promise<void> {
  await tx<void>("readwrite", async (store) => {
    for (const id of ids) {
      const row = (await reqAsPromise(store.get(id))) as OutboxRow | undefined;
      if (!row) {
        continue;
      }

      row.state = "in_flight";
      await reqAsPromise(store.put(row));
    }
  });
}

export async function markSynced(ids: string[]): Promise<void> {
  await tx<void>("readwrite", async (store) => {
    for (const id of ids) {
      const row = (await reqAsPromise(store.get(id))) as OutboxRow | undefined;
      if (!row) {
        continue;
      }

      row.state = "synced";
      row.attempts += 1;
      await reqAsPromise(store.put(row));
    }
  });
  logger.debug("outbox.markedSynced", { count: ids.length });
}

export async function markFailed(
  ids: string[],
  error: string,
  retryable: boolean,
): Promise<void> {
  await tx<void>("readwrite", async (store) => {
    for (const id of ids) {
      const row = (await reqAsPromise(store.get(id))) as OutboxRow | undefined;
      if (!row) {
        continue;
      }

      row.attempts += 1;
      row.lastError = error;
      if (!retryable || row.attempts >= MAX_ATTEMPTS) {
        row.state = "failed";
      } else {
        row.state = "pending";
        const idx = Math.min(row.attempts - 1, BACKOFFS_MS.length - 1);
        row.nextAttemptAt = Date.now() + BACKOFFS_MS[idx];
      }

      await reqAsPromise(store.put(row));
    }
  });
  logger.debug("outbox.markedFailed", {
    count: ids.length,
    retryable,
    error,
  });
}

export interface OutboxCounts {
  pending: number;
  inFlight: number;
  synced: number;
  failed: number;
}

export async function counts(): Promise<OutboxCounts> {
  return tx<OutboxCounts>("readonly", async (store) => {
    const result: OutboxCounts = {
      pending: 0,
      inFlight: 0,
      synced: 0,
      failed: 0,
    };
    const idx = store.index("state");
    for (const state of ["pending", "in_flight", "synced", "failed"] as const) {
      const count = await reqAsPromise(idx.count(IDBKeyRange.only(state)));
      switch (state) {
        case "pending":
          result.pending = count;
          break;
        case "in_flight":
          result.inFlight = count;
          break;
        case "synced":
          result.synced = count;
          break;
        case "failed":
          result.failed = count;
          break;
      }
    }

    return result;
  });
}

export async function pruneSyncedOlderThan(ms: number): Promise<number> {
  const cutoff = Date.now() - ms;

  return tx<number>("readwrite", async (store) => {
    let removed = 0;

    return new Promise<number>((resolve, reject) => {
      const cursorReq = store
        .index("state")
        .openCursor(IDBKeyRange.only("synced"));
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) {
          resolve(removed);

          return;
        }

        const row = cursor.value as OutboxRow;
        if (row.createdAt < cutoff) {
          cursor.delete();
          removed += 1;
        }

        cursor.continue();
      };
    });
  });
}

/**
 * One-shot migration of the legacy `pendingCaptures` array in storage.local
 * into the outbox. Called once on startup; safe to re-run.
 */
export async function migrateLegacyPendingCaptures(): Promise<number> {
  const result = await browser.storage.local.get("pendingCaptures");
  const legacy = result.pendingCaptures as ContentPayload[] | undefined;
  if (!legacy || legacy.length === 0) {
    return 0;
  }

  let migrated = 0;
  for (const payload of legacy) {
    const dedupKey = `${payload.kind}:${payload.source_url ?? ""}:${
      payload.captured_at
    }`;
    const row = await enqueue(payload, { dedupKey });
    if (row) {
      migrated += 1;
    }
  }

  await browser.storage.local.remove("pendingCaptures");
  logger.info("outbox.migrated", { count: migrated });

  return migrated;
}
