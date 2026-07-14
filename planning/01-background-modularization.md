# 01 — Background Script Modularization

## Problem

[src/entrypoints/background.ts](../src/entrypoints/background.ts) is **2,271 lines** in a single file. It mixes:

- Cookie-driven auth refresh + JWT decoding
- Device registration / matching
- Real-time `recordHit` activity capture
- Three sync subsystems (history, bookmarks, downloads)
- Domain-scrape ingestion (`handleScrapedData`)
- `webext-redux` wiring
- Message-router for popup → background commands
- Two `setInterval` loops (auth check 1 Hz, auto-sync 10 min)

Symptoms:

- Every open feature PR (#14, #26, #30, #37) touches `background.ts` and stomps on each other (see the 500–800 LOC diffs in §1 of `gh diff --stat` runs).
- New hires can't onboard onto a single file this size.
- Unit tests are effectively impossible — the file has no exported seams; everything is wired inside `defineBackground({ main() { ... } })`.
- Constants and storage keys are redeclared inside `main()` (e.g. `AUTO_SYNC_TIME_RANGE`, `AUTO_SYNC_INTERVAL` exist both at module scope and inside `main`).

## Goals

- Reduce `background.ts` to ≤200 LOC: it should only compose modules and register listeners.
- Make each subsystem unit-testable by exporting pure-ish functions and isolating side effects behind injectable interfaces.
- Zero behavior change. This refactor must be a pure reorganization — same network requests in the same order with the same payloads.

## Non-goals

- Switching off `setInterval` (see [02 — MV3 lifecycle](02-mv3-lifecycle.md)).
- Wiring IndexedDB into sync paths (see [10 — local-first sync](06-local-first-sync.md)).
- Changing the `BrowserActivity` data contract.

## Proposed file layout

```
src/
  background/
    index.ts                    # defineBackground entrypoint, wires modules
    constants.ts                # storage keys, intervals, slice size
    auth/
      cookies.ts                # readSessionToken, readCsrfToken
      jwt.ts                    # decode + isExpired helpers
      refresh.ts                # refreshAccessToken()
      state.ts                  # checkAuthenticationState()
    device/
      info.ts                   # getDeviceInfo() from bowser
      registry.ts               # fetchDeviceFromServer, createDeviceOnServer
      setup.ts                  # setupDevice() (idempotent guard)
    activity/
      recordHit.ts              # webNavigation handler
      convert.ts                # convertToBrowserActivity (pure)
      blacklist.ts              # isUrlBlacklisted, isValidUrl
    sync/
      manager.ts                # triggerManualSync (toggle-aware coordinator)
      history.ts                # syncHistory
      bookmarks.ts              # syncBookmarks + onCreated/Changed/Removed
      downloads.ts              # syncDownloads + onCreated
      synced-cache.ts           # getSyncedItems/addSyncedItem (storage.local set)
      api.ts                    # postBrowserActivity (axios wrapper w/ retries)
    scrape/
      ingest.ts                 # handleScrapedData
    messaging/
      router.ts                 # browser.runtime.onMessage dispatch
      actions.ts                # action-name string union + payload types
    redux/
      wrap.ts                   # createWrapStore + storageDefaults
```

Every module exports plain functions; side-effectful glue lives only in `background/index.ts`.

## Code-level approach

### Step 1 — extract constants

Pull every magic number and storage key in `background.ts` into `background/constants.ts`. Single source of truth.

```ts
export const SLICE_SIZE = 100;
export const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;
export const AUTO_SYNC_TIME_RANGE_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTH_POLL_INTERVAL_MS = 1000;       // marked for removal in #02
export const SESSION_TOKEN_KEY = "sessionToken";
export const CSRF_COOKIE_NAME  = "csrfToken";
export const SYNC_KEYS = {
  HISTORY:   "syncedHistory",
  BOOKMARKS: "syncedBookmarks",
  DOWNLOADS: "syncedDownloads",
  LAST_BOOKMARK: "lastBookmarkSync",
  LAST_DOWNLOAD: "lastDownloadSync",
} as const;
```

### Step 2 — extract pure helpers first

`isValidUrl`, `isUrlBlacklisted`, `ensureISOTimeFormat`, `getDeviceInfo`, `convertToBrowserActivity` (almost-pure — the `browser.history.search` / `browser.tabs.sendMessage` parts need to be injected).

Make `convertToBrowserActivity` accept a `BrowserMetadataProvider` interface so tests can pass in a fake:

```ts
export interface BrowserMetadataProvider {
  getHistoryTitle(url: string, visitTime: number): Promise<string | undefined>;
  getVisitDuration(url: string, visitTime: number): Promise<number | undefined>;
  getDescription(url: string): Promise<string | undefined>;
  getScrollDepth(url: string): Promise<number | undefined>;
}
```

Production implementation lives in `activity/convert.ts`; tests stub the interface.

### Step 3 — auth module

`auth/state.ts` becomes one exported function:

```ts
export async function checkAuthenticationState(deps: {
  store: typeof store;
  refreshAccessToken: () => Promise<void>;
  setupDevice: () => Promise<string>;
  notifyPopup: (payload: AuthStatePayload) => void;
}): Promise<void> { /* ... */ }
```

That signature alone is documentation; today it's a 130-line inline closure.

### Step 4 — sync modules

Each `sync/{history,bookmarks,downloads}.ts` exports `sync*({ accessToken, deviceId, serverDomain, options })`. The current `syncHistory` is 500 LOC and shares 80% of its scaffolding with the others — extract a `runSync<TItem>` higher-order helper that handles: load → filter blacklist → diff against synced-cache → batch into `SLICE_SIZE` slices → POST → mark synced → log. The three callers differ only in `loadItems` and `toBrowserActivity`.

### Step 5 — messaging router

Replace the giant `if (message.action === "X")` chain with a typed dispatch table:

```ts
type Action =
  | { action: "SETUP_DEVICE" }
  | { action: "TRIGGER_MANUAL_SYNC", options?: { timeRange?: number } }
  | { action: "CHECK_AUTH_STATUS" }
  | { action: "DOMAIN_SCRAPE_DATA", data: ScrapeResult };

const handlers: { [K in Action["action"]]: Handler<Extract<Action, { action: K }>> } = { ... };
```

Catches typos at compile time and gives one place to add new commands.

### Step 6 — entrypoint

`background/index.ts` ends up reading like a wiring diagram:

```ts
export default defineBackground({
  main() {
    redux.wrap(store);
    listeners.registerNavigation(recordHit);
    listeners.registerBookmarks(state, handleBookmarkCreated, ...);
    listeners.registerDownloads(state, handleDownloadCreated);
    listeners.registerMessages(router);
    schedule.start({ authCheck, autoSync });
    bootstrap.run();              // load settings, setup device, etc.
  },
});
```

## Migration / sequencing

Do this **before** any other Phase-1 work so subsequent PRs don't fight a moving target.

1. **One commit per module extraction**, in this order: constants → pure helpers → auth → device → activity → sync → scrape → messaging → entrypoint.
2. After each commit, the build must pass and the extension must still load. Use `npm run compile && npm run lint && npm run build`.
3. Diff each extraction with `git show --stat` to confirm only moved code, not rewritten logic.
4. Once `background.ts` is empty, rename `background/index.ts` to `background.ts`? — no. Keep the directory; WXT can be pointed at `background/index.ts` via `entrypoint` config or just keep a one-line `background.ts` that `export *`s from `background/index`.

## Risks

- **`webext-redux` ordering** — `createWrapStore()` must run before any `browser.runtime.onMessage` listener fires that depends on the store. Keep wrap-store as the first call in `main()`.
- **Listener identity for add/remove** — bookmark and download listeners are registered/unregistered as setting toggles. The handler functions must be module-level (not closures over per-call state) so `removeListener` works.
- **`deviceSetupInProgress` flag** is a module-level mutable. After extraction it must remain singleton; export through `device/setup.ts` and never `import { deviceSetupInProgress }` directly — instead expose `setupDevice()` which guards internally.
- **Service-worker import cost** — many small files won't slow down WXT (it bundles), but watch for circular imports between `auth/refresh.ts` and `device/setup.ts` (refresh calls setup; setup checks auth).

## Open questions

- Do we keep the legacy `triggerManualHistorySync` shim, or remove it now that nothing inside the file calls it cross-module? Probably remove — it's only there for an old message name that the popup no longer sends.
- Should `axios` be wrapped once with `Authorization` interceptor + base URL, eliminating the dozen call sites that build headers by hand? Yes — do this inside `sync/api.ts`.

## Acceptance criteria

- [ ] `background.ts` (or `background/index.ts`) is ≤200 LOC.
- [ ] No file in `src/background/` exceeds 300 LOC.
- [ ] `npm run compile`, `npm run lint`, `npm run test`, `npm run build` all green.
- [ ] Loading the built extension and exercising the popup produces identical network traffic to master (verify with DevTools Network panel: same URLs, same payload shape, same order).
- [ ] At least 10 new unit tests covering: `isUrlBlacklisted`, `convertToBrowserActivity` with mocked metadata, `runSync` slicing, `checkAuthenticationState` decision branches.
- [ ] One follow-up tracking issue exists for [02 — MV3 lifecycle](02-mv3-lifecycle.md) so reviewers don't expect the `setInterval`s to be gone in this PR.
