# 20 — Iteration 4 (Implementation Snapshot)

Follows [19 — iteration 3](19-iteration-3.md). This pass lands the five "create these systems now" items from the user's request: sync subsystem extraction, `chrome.alarms` migration, IndexedDB outbox, the `/api/content` contract document, and the first-run setup wizard.

## What landed

### ✅ Sync subsystem extraction (planning/01 step 4)

New `src/background/sync/`:

- **`run.ts`** — generic `runSync<TItem, TPayload>` engine. Encapsulates the five steps every sync path repeats: load → filter against the `storage.local` dedup-cache → map to payload → batch upload in `SLICE_SIZE` slices → mark synced. Surfaces a `SyncResult` with `total / considered / uploaded / failed / durationMs / lastError`. Logs `sync.<kind>.start|filtered|batchUploaded|batchFailed|done`.
- **`bookmarks.ts`** — `syncBookmarks()` + `createBookmarkEvent()`. Walks `browser.bookmarks.getTree()` and feeds the runner. Local `BookmarkNode` type because `wxt/browser` doesn't re-export the namespace.
- **`downloads.ts`** — `syncDownloads()` + `createDownloadEvent()` against `browser.downloads.search({})`.

`background.ts` now imports these from `@/background/sync/{bookmarks,downloads}` and the inline `syncBookmarksToServer`, `syncDownloadsToServer`, `getAllBookmarks`, `createBookmarkEvent`, `createDownloadEvent` were deleted (≈330 LOC). History sync still lives inline — its 500-line state machine + UI status plumbing deserves its own focused pass; ticketed in the "deferred" section below.

### ✅ chrome.alarms migration (planning/02)

New **`src/background/schedule.ts`** with two primitives:

- `schedulePeriodic({ name, intervalMs, handler })` — uses `browser.alarms` when available (Chromium MV3), falls back to `setInterval` (Firefox MV2). Idempotent on `name`. Single global `alarms.onAlarm` listener.
- `watchCookies(match, handler)` — `cookies.onChanged` event-driven auth refresh.

`background.ts`'s three legacy timers are replaced:

| Old (`setInterval`) | New |
|---|---|
| 1 Hz `checkAuthenticationState` poll | `watchCookies()` on `sessionToken`/`csrfToken` (debounced 250 ms) + 5-min `authProbe` alarm as fallback |
| 10-min auto-sync | `autoSync` alarm |
| 5-min `last_seen` heartbeat | `lastSeen` alarm |
| — | New 1-min `outboxDrain` alarm |

`alarms` permission added to manifest.

### ✅ IndexedDB outbox (planning/06)

New **`src/background/outbox.ts`** — single durable queue for any content the extension wants to send. Replaces the `pendingCaptures` array in `storage.local`. Built directly on `indexedDB` (no Dexie dependency).

- Single object store with indexes on `state`, `kind`, `createdAt`, `dedupKey`.
- `enqueue(payload, { dedupKey })` — idempotent on `dedupKey`.
- `listPending(limit)` — filters by `state=pending` AND `nextAttemptAt <= now`.
- `markInFlight` / `markSynced` / `markFailed(ids, error, retryable)`. Failed rows back off (30s → 2m → 8m → 30m → 2h) up to 5 attempts before being marked `failed` terminally.
- `pruneSyncedOlderThan(ms)` GC.
- `migrateLegacyPendingCaptures()` — one-shot migration from the old `storage.local.pendingCaptures` array. Called on every cold start (idempotent).

**`src/background/outbox-drain.ts`** — the drain loop:

- Pulls up to 5 rows at a time, marks them `in_flight`.
- POSTs each to `/api/content`, marks `synced` on success.
- Maps HTTP failures: 408/425/429/5xx → retryable, others → permanent.
- 401 → break the batch early so the auth subsystem can re-mint without us hammering.
- When the queue is empty, opportunistically prunes synced rows older than 7 days.

**`src/background/content-cache.ts`** is now a thin wrapper that derives a `dedupKey` and calls `enqueue`. Both the screenshot path ([capture.ts](../src/background/capture.ts)) and highlight save path ([highlight.ts](../src/background/highlight.ts)) flow through the outbox unchanged.

Diagnostics tab gains live counts: pending / in-flight / failed, plus the legacy `pendingCaptures` count while migration is in progress.

### ✅ /api/content contract documented (planning/06 follow-up)

**`docs/api/content.md`** — single source of truth from the extension's side:

- Endpoint, headers, request shape with field-by-field commentary.
- Response codes: 201 / 200+duplicate / 400 / 401 / 413 / 429 (honors `Retry-After`) / 5xx.
- Dedup model (client uses `kind:source_url:captured_at`, server may dedup more aggressively).
- 1 MB soft cap.
- Privacy/delete contract pointer.
- Current status (not implemented; client queues locally).

When CI-Server ships the endpoint, the drain loop already handles every status code and the deployment is a no-op on the client. Until then the Diagnostics tab is the audit surface.

### ✅ Setup wizard (planning/03)

**`src/lib/environments.ts`** — curated `ENVIRONMENTS` list (prod/alpha/dev/local + implicit custom), `probeServer(domain)` that fetches `/api/health` with a 5s `AbortController` timeout and reports `{ ok, status, latencyMs, version, error }`.

**`src/entrypoints/popup/SetupWizard.tsx`** — radio-list UI for picking an env, custom-domain input, "Test connection" button showing latency + status + version, and "Use this server" that writes `serverDomain` + `serverEnvironmentId` and dispatches `saveUserSettings`.

State changes: `CiState` gains `serverEnvironmentId: string | null`. Initial state is `null`; saved via the existing `saveUserSettings` reducer.

**Popup gating**: when both `serverEnvironmentId === null` AND `serverDomain === ""`, the popup mounts the wizard instead of the main view. The user can dismiss for the session ("Skip for now") and it'll resurface next popup open until they pick something. Existing users (with `serverDomain` already saved from previous versions) skip straight to the main view — no migration needed.

### Tests

- `src/__tests__/background/outbox.test.ts` — 4 tests exercising enqueue/dedup/markSynced/markFailed against `fake-indexeddb`.
- `src/__tests__/lib/environments.test.ts` — 3 tests for the env list + lookup.
- `setupTests.ts` polyfills `structuredClone` (fake-indexeddb needs it; jsdom doesn't expose it).
- `ciStateSlice.test.ts` updated for the new `serverEnvironmentId` field.

## Verification

| Check | Result |
|---|---|
| `yarn compile` | ✅ |
| `yarn lint` | ✅ |
| `yarn test` | ✅ 38 passing (was 31) |
| `yarn build` | ✅ 2.33 MB chrome-mv3 |
| LOC of `background.ts` | 1,741 (was ~2,100; was ~2,440 before iteration 3) |
| New permissions | `alarms` |
| New manifest commands | none |
| Migrations performed at runtime | legacy `pendingCaptures` → outbox |

## What's deferred (and why)

- **History sync extraction** — 500 LOC with intricate UI-status plumbing and a re-enable cache flag. Worth a dedicated PR rather than mixed into this batch.
- **`syncedHistory` migration to outbox** — depends on history sync being extracted first.
- **`/api/content` endpoint live** — server-side work tracked in companion ticket. Until then, every screenshot/highlight queues locally; drain is a no-op on the network.
- **Custom-domain `permissions.request`** — the wizard accepts a custom domain but doesn't yet request `host_permissions` for it at runtime. Users running self-hosted CI on a domain outside the manifest will hit CORS until that lands.
- **`browser.alarms` minimum-period testing on Safari** — manifest permission added, scheduler abstracts both transports; Safari validation belongs in the [13 — distribution](13-distribution.md) pass.

## Acceptance criteria for this iteration

- [x] `runSync<TItem, TPayload>` exists, used by bookmarks and downloads.
- [x] `chrome.alarms` replaces all 3 legacy `setInterval`s in MV3 builds.
- [x] IndexedDB outbox with dedup, backoff, prune, migration.
- [x] `/api/content` contract documented in `docs/api/content.md`.
- [x] Setup wizard renders for new users and writes both `serverDomain` and `serverEnvironmentId`.
- [x] Diagnostics tab shows live outbox counts.
- [x] `yarn compile`, `yarn lint`, `yarn test`, `yarn build` all green.
- [x] Test count up: 38 (was 31).
- [x] `background.ts` LOC continues to shrink: 1,741 (was 2,100).
