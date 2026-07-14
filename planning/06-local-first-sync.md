# 06 — Local-First Sync via IndexedDB Outbox

## Problem

Today's sync model is fragile in three ways:

1. **Capture and upload are coupled.** `recordHit` ([background.ts:108](../src/entrypoints/background.ts)) detects a page visit and immediately POSTs to `/api/browser-activity`. If the request fails, the visit is lost (no retry).
2. **Synced-IDs cache** ([SYNCED_HISTORY_KEY](../src/entrypoints/background.ts:51)) is just a `string[]` in `storage.local`. Adding a row requires reading the entire array, modifying it, and writing it back. With months of activity this becomes a multi-megabyte string written on every visit.
3. **IndexedDB scaffolding is dead.** [src/indexeddb.ts](../src/indexeddb.ts) was added in PR #8 with `surfing_records` and `location_records` stores — and is **never written to or read from anywhere in the sync paths**. We pay the bundle cost and the `database.init()` call on startup for no behavioral benefit.

The other ungated buffers in [src/entrypoints/content.ts](../src/entrypoints/content.ts) make this worse: `formSubmissions` and `scrollDepthData` accumulate up to 1000 entries each in `storage.local`, with no upload path. They sit there forever.

## Goals

- One **outbox** abstraction. Every captured event (visit, bookmark, download, form, scroll, scrape, highlight) writes a row to IndexedDB **first**. A separate sync loop drains unsynced rows.
- Crash-safe: a partially uploaded batch resumes correctly after SW restart.
- Backoff and quota: a 5xx storm doesn't hammer the server; quota cap prevents unbounded local growth.
- Single sync API for the popup ("sync now", "x unsynced events").

## Non-goals

- Conflict resolution (events are append-only).
- Server-side dedup (it already exists; we just respect it).
- Replacing `storage.local` for settings — only for queued events.

## Approach

### Schema

```ts
// src/db/schema.ts
export interface OutboxRow {
  id: string;                            // uuid
  kind: "visit" | "bookmark" | "download" | "form_submit" | "scroll" | "scrape" | "highlight";
  payload: BrowserActivity | ContentPayload;
  createdAt: number;                     // epoch ms
  attempts: number;
  lastError?: string;
  state: "pending" | "in_flight" | "synced" | "failed_permanent";
  origin?: string;                       // host that produced it, for filtering
}
```

Single `outbox` object store with indexes on `state`, `createdAt`, `kind`.

A second `dedup` store (key: kind+naturalKey, value: outbox id) preserves the existing "don't upload the same visit twice" semantics, replacing the string-array sets.

### Capture path

Every existing capture site changes from "POST" to "enqueue":

```ts
// activity/recordHit.ts
await outbox.enqueue({
  kind: "visit",
  payload: await convertToBrowserActivity(url, time, deviceId),
  dedupKey: `visit:${url}:${time}`,
});
```

`enqueue()` upserts on `dedupKey` so re-visiting the same URL doesn't queue twice.

### Sync loop

```ts
// sync/outbox-drain.ts
export async function drainOutbox() {
  const batch = await db.outbox
    .where("state").equals("pending")
    .limit(SLICE_SIZE)
    .toArray();
  if (batch.length === 0) return;

  await db.outbox.bulkUpdate(batch.map(r => ({ key: r.id, changes: { state: "in_flight" } })));

  try {
    await api.postBrowserActivity(batch.map(r => r.payload));
    await db.outbox.bulkUpdate(batch.map(r => ({ key: r.id, changes: { state: "synced", attempts: r.attempts + 1 } })));
  } catch (err) {
    const next = isRetryable(err) ? "pending" : "failed_permanent";
    await db.outbox.bulkUpdate(batch.map(r => ({
      key: r.id,
      changes: { state: next, attempts: r.attempts + 1, lastError: errMessage(err) },
    })));
    throw err;
  }
}
```

Driven by the alarms scheduler from [02](02-mv3-lifecycle.md):

- `ci.outboxDrain` alarm every 1 minute.
- Also triggered immediately after enqueue when the queue depth crosses a threshold (50).

### Garbage collection

Rows with `state === "synced"` older than 7 days get deleted. Failed-permanent rows kept indefinitely for debugging (visible in the Diagnostics tab from [04](04-logging-observability.md)).

### Quota

`navigator.storage.estimate()` checked before enqueue. If usage > 80% of quota, oldest `synced` rows are evicted first; if still over, oldest `pending` rows are evicted with a `logger.warn("outbox.evicted", ...)` and the user sees a "storage quota reached — increase or clear" banner.

### Backoff

Per-attempt exponential backoff stored in `nextAttemptAt`:

```
attempts 1: +30s
attempts 2: +2m
attempts 3: +8m
attempts 4: +30m
attempts 5+: marked failed_permanent
```

`drainOutbox()` filters `nextAttemptAt < now` so backed-off rows skip naturally.

### Migration from string-array caches

On first run after upgrade:

```ts
async function migrateSyncedCaches() {
  const { syncedHistory = [], syncedBookmarks = [], syncedDownloads = [] } =
    await browser.storage.local.get(["syncedHistory", "syncedBookmarks", "syncedDownloads"]);
  await db.dedup.bulkPut([
    ...syncedHistory.map(k => ({ key: `visit:${k}`, outboxId: null })),
    /* ... */
  ]);
  await browser.storage.local.remove(["syncedHistory", "syncedBookmarks", "syncedDownloads"]);
  logger.info("migrate.syncedCaches.done", { historyCount: syncedHistory.length });
}
```

One-shot; idempotent if interrupted.

### Library choice

Two options:

- **Dexie** (~7KB gz) — ergonomic Promise-based wrapper, supports versioned migrations cleanly. Recommended.
- **idb** (~2KB gz) — thinner; usable, but we'd reinvent table abstractions.

Replace the hand-rolled wrapper in [src/indexeddb.ts](../src/indexeddb.ts) with Dexie.

### Existing IndexedDB stores

`surfing_records` and `location_records` either get repurposed (deletion of the standalone tables, replaced by `outbox.kind === "visit" | "location"`) or kept for read-only API:

```ts
// db/migrations.ts
db.version(2).stores({
  outbox: "id, state, kind, createdAt, nextAttemptAt",
  dedup:  "key, outboxId",
}).upgrade(async tx => {
  // Migrate any rows from surfing_records into outbox.kind=visit
});
```

## Migration / sequencing

Single biggest refactor on the roadmap. Sequence:

1. Add `src/db/` with Dexie schema, no callers.
2. Behind a `OUTBOX_ENABLED` flag, dual-write: capture sites enqueue *and* POST as today. Observe queue grows correctly.
3. Flip drain loop on; verify it can drain the dual-written queue without duplicating uploads.
4. Remove direct POST from capture sites — outbox is now sole source of truth.
5. Migrate the synced-caches (one-shot script).
6. Delete the legacy code paths.

Each step is its own PR.

## Risks & open questions

- **IndexedDB in SW** — Chrome supports IndexedDB in service workers, but transactions are tied to the SW lifecycle. If the SW is suspended mid-transaction the transaction aborts. Keep transactions short (single bulkPut/bulkUpdate per batch) and never hold a tx across `await`s outside the tx.
- **Order guarantees** — POST batches preserve enqueue order via `createdAt` index. Server should treat each batch as a set, not a stream.
- **Cross-context writes** — content scripts (for form/scroll) can't open the SW's IndexedDB directly. Route through `runtime.sendMessage({ action: "OUTBOX_ENQUEUE", row })` to the background.
- **Quota differences across browsers** — Firefox is stricter (50 MB unit) than Chrome (effectively unlimited). The quota check must be conservative.
- **Privacy posture** — the outbox now holds a durable copy of every visit on disk. Document this and provide a "Clear local queue" button.
- **Race with logout** — when `accessToken` is cleared, the drain loop must pause, not error-storm. `drainOutbox()` short-circuits if `!accessToken`.

## Acceptance criteria

- [ ] `recordHit`, bookmark/download listeners, form submit, scroll-depth save, scrape ingest, and highlight save all enqueue to the outbox instead of POSTing directly.
- [ ] Killing the SW mid-batch and waking it loses zero events.
- [ ] `syncedHistory` / `syncedBookmarks` / `syncedDownloads` keys removed from `storage.local` after migration.
- [ ] Diagnostics tab shows outbox depth by state and last-error per kind.
- [ ] A 100-row queue drains in ≤2 alarm ticks; a 10k-row queue drains in ≤5 minutes on a fresh install backfill.
- [ ] `formSubmissions` and `scrollDepthData` buffers are no longer accumulated in `storage.local` (they go straight to outbox).
