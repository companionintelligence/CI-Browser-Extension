# 18 — Iteration 2 (Implementation Snapshot)

Captures what landed in the second implementation pass after [17 — branch audit](17-branch-audit.md). This is a working log — keep it short, mark items as done with file/line pointers so future readers can verify quickly.

## Steps from the recommended landing order

### ✅ Step 7 — Scrape profiles (PR #30 essence)

Goal: reorganize profiles into category subdirectories and load them dynamically so adding a new site is a no-code change.

What changed:

- **Reorganized existing profiles** into category folders:
  - `src/scrapeProfiles/streaming/{netflix,hulu,disney}.json` (moved)
  - `src/scrapeProfiles/community/{slashdot,github}.json` (moved)
  - `src/scrapeProfiles/template.json` (kept at the root as a starting point)
- **Added 8 new profiles** from PR #30 (`copilot/fix-27`):
  - Streaming: `max.json`, `primevideo.json`, `paramount.json`
  - Social media: `quora.json`
  - News: `cnn.json`, `wsj.json`
  - Travel: `airbnb.json`
  - Finance: `robinhood.json`
- **`src/domainScraper.ts` switched to `import.meta.glob`** for profile loading:
  ```ts
  const PROFILE_MODULES = import.meta.glob<{ default: ScrapeProfile }>(
    "./scrapeProfiles/*/*.json",
    { eager: true },
  );
  ```
  Adding a new JSON registers automatically — no `import` line, no class edit. Loader validates each profile has a `domain` field; bad files are logged and skipped.
- **Added `getProfileCategory(domain)`** so the popup (or future Diagnostics view) can group profiles by their directory category.
- **`wxt.config.ts` host_permissions** + **`domainScraper.content.ts` matches** updated in lock-step (max, primevideo, amazon/gp/video, paramountplus, quora, cnn, wsj, airbnb, robinhood). Comments on both call out the dependency.

Skipped (per audit): `locationService.ts` and `profileTemplateGenerator.ts`. Location tracking is a different concern; a template generator isn't needed yet since `template.json` is a sufficient hand-authoring starting point.

Verification:
- `yarn build` produces a manifest with 20 host entries and 18 content-script match entries (cross-checked with `python3 -c "import json; ..."`).
- `domainScraper.scrape(document, url)` continues to work — no test regression in `src/__tests__/entrypoints/background.test.ts` (26 → 26 passing).

### ✅ Step 8 — Logger module

`src/lib/log.ts` introduces a structured logger per [04 — logging](04-logging-observability.md):

- `debug` / `info` / `warn` / `error` levels.
- `info` is the default in production builds; `debug` activates under Vite dev (`import.meta.env.DEV`) or jest (`process.env.NODE_ENV !== "production"`). Detection wrapped in `detectLevel()` so jest's tsconfig — which doesn't allow `import.meta` — still compiles the file.
- **Redaction at log time** for `accessToken`, `sessionToken`, `csrfToken`, `authorization`, `password`, `refresh_token`, `proxy_refresh_token`.
- URL-shaped fields have their query strings stripped (token leakage protection).
- **Ring buffer of 500 entries** mirrored to `browser.storage.local.logRing` with a 1-second debounced flush. `logger.snapshot()` and `logger.clear()` expose it to the popup for a future Diagnostics view.
- `errMessage(err)` helper formats unknown thrown values into strings.

Wiring: `updateDeviceLastSeen` uses `logger.debug` for success and failure (replaces a `console.debug`). Capture path uses `logger.info` / `logger.warn`. Tests at `src/__tests__/lib/log.test.ts` cover redaction, URL stripping, recursion, ring bounds, and `errMessage` — 5 new tests passing.

### ✅ Step 9 — Active-tab screenshot

`captureActiveTab()` added to `src/entrypoints/background.ts`:

- Uses `browser.tabs.captureVisibleTab(windowId, { format: "png" })`.
- Strips the `data:image/png;base64,` prefix and packages a `ContentPayload`-shaped record (see [08 — highlight capture](08-highlight-capture.md) for the shared shape).
- Tries `POST https://${serverDomain}/api/content`. If the endpoint isn't live yet (current case), caches the captured payload in `browser.storage.local.pendingCaptures` (capped at 20) for a future outbox drain.
- Permission added: `activeTab` in `wxt.config.ts`. No new broad host permissions.
- Shortcut declared: `commands.capture-active-tab` with `Alt+Shift+C` default. Listener registered in the background `defineBackground.main` so the command works whether the popup is open or not.
- Popup adds a "📸 Snapshot Current Tab" button under the History Sync section with:
  - `aria-busy` while in flight.
  - Toast string (auto-dismissed after 6s) showing captured title and KB size.
  - Title attribute mentions the keyboard shortcut.

Message contract: `runtime.sendMessage({ action: "CAPTURE_ACTIVE_TAB" })` returns `{ success: boolean, url?, title?, size?, error? }`.

### ✅ Step UX — Punch-list wins from [16 — UI/UX](16-ui-ux-testing.md)

1. **Auto-dismiss `historySyncStatus`** after 10 seconds when no sync is in progress (`popup/App.tsx`). Stale "Successfully synced N visits" no longer lingers forever.
2. **Auto-dismiss capture toast** after 6 seconds.
3. **`aria-live="polite"`** on sync-status and capture-status containers so screen readers announce them.
4. **Full sync-log error preview**: bumped truncation from 20 chars to 60 chars; full error stays available via `title` attribute.

Deferred from the punch list:
- Setup wizard / configurable server with env switcher (planning/03) — bigger UX change.
- Replace native `<select>` for time range with shadcn `Select` — cosmetic; defer.
- Storage-key migration for `siteBlacklist`/`pageBlacklist` → `ignoredSites`/`ignoredPages` — needs a one-shot migration; defer.
- Popup chunk size (1.05 MB) reduction — needs code-splitting of BlacklistManager.

## Verification matrix

| Check | Result |
|---|---|
| `yarn install --immutable` | ✅ |
| `yarn compile` | ✅ |
| `yarn lint` (`--fix` applied) | ✅ |
| `yarn test` | ✅ 31 passing (was 26; +5 from logger tests) |
| `yarn build` | ✅ 2.29 MB chrome-mv3 |
| `manifest.json` host_permissions count | 20 |
| `manifest.json` content_scripts.matches count | 18 |
| `manifest.json` commands declared | `capture-active-tab` |
| New permissions added | `activeTab` |

## What's deferred (and why)

The following steps from [17 — branch audit](17-branch-audit.md) remain as follow-up issues:

- **Step 8 (highlight save)** — PR #26 — blocked on CI-Server `/api/content` endpoint contract. Reuse the same `pendingCaptures` outbox pattern from step 9 above when it lands.
- **Step 10 (PR #14 webcam/desktop/OAuth)** — gated on the OAuth RFC in [15 — OAuth integration](15-oauth-integration.md).
- **Step 11 (close PR #36)** — administrative; do via `gh pr close 36 --comment ...` once a reviewer confirms.
- **Step 4 follow-up** — full state-key migration from `siteBlacklist`/`pageBlacklist` to `ignoredSites`/`ignoredPages` with a `browser.storage.local` migration shim.
- **Modularization** ([01](01-background-modularization.md)) — `background.ts` is still 2.4k LOC; the heartbeat + capture code added here makes it slightly worse. Modularization should be the next sprint's first PR so further features have a clean home.

## Acceptance criteria for this iteration

- [x] `yarn compile`, `yarn lint`, `yarn test`, `yarn build` all green.
- [x] Test count strictly increases (26 → 31).
- [x] All new code paths emit structured logs via `logger`.
- [x] No console.* call sites added by this iteration; existing console.* not in scope (sweep deferred to [04](04-logging-observability.md) Phase-1 work).
- [x] At least one new user-visible feature shipped (active-tab snapshot).
- [x] At least one in-flight PR's contribution salvaged (PR #30 profiles → step 7).
- [x] Iteration documented here.
