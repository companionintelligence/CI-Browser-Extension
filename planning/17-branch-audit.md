# 17 — Branch & PR Audit (May 18, 2026)

A line-by-line tour of every open branch on `origin/`, what unique value it carries, and a landability rating. This complements the high-level summaries in [planning.MD § 1.1–1.2](../planning.MD) and the per-feature plans in [07](07-scrape-profiles.md), [08](08-highlight-capture.md), [09](09-media-capture-oauth.md), [10](10-device-service.md).

All seven branches were created **before** the recent popup/shadcn consolidation (master commit `dbeb2dc` and following). That makes their diffs look enormous because they re-add or re-organize files that have since changed shape on master. The unique substance per branch — what's *new* code, not just shadcn re-shuffling — is much smaller, and is what we capture here.

## Landability scale

- **Easy** — additive code, no contract changes, can be cherry-picked or re-typed in <1 day.
- **Medium** — touches a stable subsystem, requires conflict resolution and one design call.
- **Hard** — depends on CI-Server work or unresolved RFC.

## Branch-by-branch

### `feat/copy-and-style` — PR [#32](https://github.com/companionintelligence/CI-Browser-Extension/pull/32)

- One commit: `5b569fe feat: change blacklist verbiage to "ignored"`.
- Unique additions in `src/`:
  - [src/entrypoints/popup/BlacklistManager.tsx](../src/entrypoints/popup/BlacklistManager.tsx) — strings: "Blacklist Management" → "Ignored Pages and Sites", "Blacklisted Sites" → "Ignored Sites", etc. (≈8 string changes)
  - [src/store/ciStateSlice.ts](../src/store/ciStateSlice.ts) — adds `sessionToken` + `isAuthenticated` to `loadUserSettings` whitelist; removes `serverDomain` from same. **Note**: this also subtly changes auth-state shape, not just copy.
- Conflict with master: master already shipped some terminology cleanup but only in `9ba6ea8 refactor: update terminology from "blacklist" to "ignored" for consistency in history sync and UI components`. The BlacklistManager rename is not in master.
- **Verdict — Easy.** Pull just the string changes; skip the state-shape changes (they want a real migration; see below).

### `move-domain-selector` — PR [#36](https://github.com/companionintelligence/CI-Browser-Extension/pull/36)

- One commit: `3ce8e49 Added a copy of the domain selector to the Popup.`
- Master already merged the popup consolidation that brought the domain selector into the popup (commits `2f6ec67`, `e8c278e`). This branch is effectively superseded.
- **Verdict — Close PR #36 as redundant.** Confirm the popup-side domain input on master matches what #36 intended; if it does, drop the branch.

### `refactor/align-device-service` — PR [#37](https://github.com/companionintelligence/CI-Browser-Extension/pull/37)

- Two commits: `aab719a feat: implement device last_seen updates and improve device matching logic.`, `6fad456 chore: bump version to 1.0.2`.
- Unique substantive additions:
  - **`updateDeviceLastSeen(deviceId)`** — `PATCH /api/devices/:id/last-seen`, fire-and-forget, 5s timeout, swallows errors.
  - **5-minute `setInterval`** registered in `defineBackground.main` calling `updateDeviceLastSeen`.
  - **Tiered device matching** in `fetchDeviceFromServer`:
    1. Match stored `deviceId` first (exact).
    2. Fall back to matching by `device_type === "browser"` + `platform === "web"` + `(device_name match OR model match)`.
  - **`getDeviceInfo()` returns extended fields**: `manufacturer`, `os_version`, `app_version`. `device_type` hardcoded to `"browser"`, `platform` to `"web"` to match server's `ensureDeviceExists`.
- Master's current `fetchDeviceFromServer` only matches on `(device_name + platform)`. Master's `getDeviceInfo` returns only `{ device_name, device_type, platform, model }`.
- **Verdict — Easy/Medium.** Three concerns to land separately:
  1. `getDeviceInfo` extension — easy, additive.
  2. Tiered matching — easy, but verify against CI-Server's current `ensureDeviceExists`.
  3. `last_seen` heartbeat — easy if `PATCH /api/devices/:id/last-seen` is live; trivial to feature-flag if not.

### `style/inject-dark-styles` — PR [#34](https://github.com/companionintelligence/CI-Browser-Extension/pull/34) (CLOSED)

- One commit: `654322a feat: implement dark mode and light mode styling for popup interface with theme detection`.
- Unique additions: ~1300 lines of additional Tailwind classes scattered through `popup/App.tsx`, plus `popup/App.css` and `options/App.css` with theme variables.
- Master shipped a much cleaner dark/light approach via shadcn + Tailwind v4 in PR #38. This branch is superseded.
- **Verdict — Closed already; no salvage.**

### `copilot/fix-13` — PR [#14](https://github.com/companionintelligence/CI-Browser-Extension/pull/14)

- Three feature commits on top of an "Initial plan" stub.
- Unique substantive additions:
  - **`navigator.mediaDevices.getUserMedia` webcam capture** — opens a stream, captures one PNG frame from a hidden `<video>` + `<canvas>`, tears down.
  - **`chrome.desktopCapture` integration** — full-screen / window picker → frame capture.
  - **OAuth 2.0 authorization-code flow** — `browser.identity.launchWebAuthFlow`, `identity` permission requested. Replaces the cookie+JWT auth path.
  - **`browser.alarms`-based scheduled capture** — periodic webcam-then-desktop cascade at user-configurable intervals.
  - New `permissions`: `desktopCapture`, `scripting`, `identity`.
  - Popup additions: OAuth status indicator, capture buttons (Smart / Webcam / Desktop), schedule controls.
  - Removes `setupTests.ts`, several scrape profiles, and `BlacklistManager.tsx` — these are all currently *in* master, so this is destructive against current state.
- **Verdict — Hard.** Per [09 — media capture + OAuth split](09-media-capture-oauth.md), this needs to be three or four separate PRs. The OAuth piece additionally needs the design RFC in [15 — OAuth integration](15-oauth-integration.md) to land first.
- **Salvageable now**: the screenshot-capture-active-tab piece using `chrome.tabs.captureVisibleTab` — but it's easier to write fresh against the current `background/` structure than to extract from this branch.

### `copilot/fix-25` — PR [#26](https://github.com/companionintelligence/CI-Browser-Extension/pull/26)

- Three commits: planning stub + two implementation commits.
- Unique substantive additions in `src/`:
  - [src/entrypoints/content.ts](../src/entrypoints/content.ts) — 312-line rewrite that adds:
    - `window.getSelection()` watcher with selection-change debounce.
    - Inline-injected `<button id="ci-save-highlight-btn">` near selection rect.
    - Click → `runtime.sendMessage("SAVE_HIGHLIGHT", { selectedText, url, title, context })`.
    - Cleanup on selection-clear or click-elsewhere.
  - [src/entrypoints/background.ts](../src/entrypoints/background.ts) — `SAVE_HIGHLIGHT` handler that POSTs to `/api/content` with a structured payload (`{ url, title, mime_type: "text/plain", body, context }`).
- The UI is inline-styled (not Shadow DOM); will collide with strict-CSP host pages.
- **Verdict — Medium.** Server contract for `/api/content` not yet finalized (see [08 — highlight capture](08-highlight-capture.md)). When server lands, rewrite the selection toolbar in Shadow DOM and route through the outbox ([06 — local-first sync](06-local-first-sync.md)).

### `copilot/fix-27` — PR [#30](https://github.com/companionintelligence/CI-Browser-Extension/pull/30)

- Six commits, ending with `f4c9557 Merge branch 'master' into copilot/fix-27`.
- Unique substantive additions:
  - **`src/profileManager.ts` (187 LOC)** — `ProfileManager` class with category-organized profile loading, `domainToProfile: Map` for O(1) lookup, `getAllProfiles`, `getProfilesByCategory`, `canScrape(url)` helpers.
  - **`src/profileTemplateGenerator.ts` (382 LOC)** — `generateProfileTemplate(domain, name, category, targetUrls)` returning a typed `ScrapeProfile` with category-appropriate selectors. Templates for `streaming`, `social-media`, `news`, `ecommerce`, `finance`, `travel`, `gaming`, `health`.
  - **`src/locationService.ts` (247 LOC)** — wraps `navigator.geolocation.watchPosition` + IndexedDB `location_records` writes. **Out of scope for this PR — different concern.**
  - **New scrape profiles** under category directories: `streaming/{max,paramount,primevideo}.json`, `social-media/quora.json`, `news/{cnn,wsj}.json`, `travel/airbnb.json`, `finance/robinhood.json`. Existing Netflix / Hulu / Disney+ moved into `streaming/`.
  - `slashdot.json` and `github.json` **removed**.
  - `PROFILE_REGISTRY.md`, `SCRAPING_SYSTEM.md` documentation.
- **Verdict — Medium.** Approach is the right shape but the static `import` list in `ProfileManager` doesn't scale; replace with `import.meta.glob` as proposed in [07 — scrape profiles](07-scrape-profiles.md). Also drop `locationService.ts` from this slice. New profiles themselves are good — bring them all in, plus build-time `host_permissions` generation.

## Cross-branch findings

- **Every branch dropped at least one file** that has since shipped on master (e.g. `setupTests.ts`, `BlacklistManager.tsx`, individual profile JSONs). Cherry-picking by file is the safest move; do not attempt full rebases.
- **`yarn.lock` vs `pnpm-lock.yaml` mismatch** — `copilot/*` branches add `pnpm-lock.yaml`. Master is `yarn`. Don't migrate.
- **No branch fixes the 24 TypeScript errors** captured in [16 — UI/UX](16-ui-ux-testing.md). The errors predate them all.
- **OAuth across PRs is inconsistent** — PR #14 implements OAuth as the extension's primary auth; the CI-Server OAuth proxy work is for provider-side connections (see [15 — OAuth integration](15-oauth-integration.md)). These have not been reconciled.

## Recommended landing order

Sequenced so each step is independently verifiable.

1. **Type-error cleanup** — fix the 24 compile errors so `yarn compile` becomes a real gate. (No branch source; see [16 — UI/UX](16-ui-ux-testing.md) § 1.)
2. **Failing-test repair** — fix the blacklist-match test or update the regex.
3. **Dead-code removal** — strip the 43 commented lines from `popup/App.tsx`.
4. **Terminology pass** — finish `blacklist` → `ignored` in BlacklistManager.tsx strings only. State keys + migration deferred.
5. **Device service alignment (PR #37)** — bring in `updateDeviceLastSeen`, tiered matching, extended `getDeviceInfo`. Feature-flag the `PATCH …/last-seen` call.
6. **Manifest alignment** — match `host_permissions` to `content_scripts.matches`; ship-quality `description`.
7. **Scrape profiles (PR #30)** — port the 8 new JSONs into `src/scrapeProfiles/<category>/`, add `ProfileManager` with `import.meta.glob`. Skip `locationService.ts`.
8. **Highlight save (PR #26)** — gated on CI-Server `/api/content`. Rewrite the toolbar in Shadow DOM when picked up.
9. **Tab screenshot** — fresh implementation per [09 — media capture + OAuth split](09-media-capture-oauth.md) § PR-A, not an extraction from PR #14.
10. **PR #14 webcam/desktop/OAuth** — deferred until the OAuth RFC in [15](15-oauth-integration.md) is signed off.
11. **PR #36** — close as redundant against master.
12. **PR #34** — already closed.

## Acceptance criteria for this audit

- [x] Every open branch enumerated with its unique additions.
- [x] Landability rated for each.
- [x] Landing order documented.
- [ ] Steps 1–6 from "Recommended landing order" implemented on `companion/dazzling-lederberg-1549e5`.
- [ ] Steps 7+ scheduled as follow-up issues.
