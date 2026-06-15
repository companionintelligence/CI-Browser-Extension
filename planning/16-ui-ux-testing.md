# 16 — UI/UX Testing & Concrete Findings

This document captures the **current state of the popup UI/UX**, observed from a build + lint + test + static review pass on May 18 against `companion/dazzling-lederberg-1549e5`. It also proposes the test infrastructure needed to keep regressions out.

Pair with [05 — testing strategy](05-testing.md) for the broader test approach and [14 — i18n & a11y](14-i18n-a11y.md) for the accessibility-specific roadmap. This doc focuses on the popup surface specifically.

## 1. Build / compile / test pass

```
$ yarn install --immutable    → OK
$ yarn build                  → OK (2.25 MB total)
$ yarn lint                   → OK (no errors)
$ yarn compile                → ❌ 24 type errors
$ yarn test                   → ❌ 1 suite failed to run, 1 test failing
```

**Compile failures fall in three buckets** (file:line):

- `browser.storage.local.get(string[])` typed wrong — TS thinks it returns `{}`. Affects: `background.ts:59`, `background.ts:193`, `background.ts:236`, `content.ts:56-196`, `store/ciStateSlice.ts:6`, `store/ciStateSlice.ts:223`.
- `jwtDecode<T>()` not parameterized — used as `jwtDecode(token) as string`, then `.exp` accessed on `string`. Affects: `background.ts:1942`, `background.ts:1948`.
- `csrfTokenCookie.value` accessed without nullish-check — `background.ts:1888`.
- `wxt.config.ts:32` — `data_collection_permissions` is not in the WXT type for `browser_specific_settings.gecko`.
- `packages/shadcn/src/components/coalescers/field.tsx:14` — undefined `FieldComponent` identifier.

**Build succeeds anyway** because Vite strips types. So today these errors are silently shipped — anyone running `yarn compile` to validate changes would block, but `yarn build` cheerfully produces a 2.25 MB extension.

**Test failures:**

- `src/__tests__/entrypoints/background.test.ts` — blacklist matching regression at line 95.
- `src/store/ciStateSlice.test.ts` — entire suite fails to compile due to the TS errors above.

These need to be fixed before anything else in [05 — testing](05-testing.md) is meaningful.

## 2. Bundle analysis

```
.output/chrome-mv3/chunks/popup-DK06V_1D.js     1,054,937 bytes (1.05 MB)
.output/chrome-mv3/assets/popup-DVjg4hse.css      132,747 bytes
.output/chrome-mv3/background.js                  336,073 bytes
.output/chrome-mv3/content-scripts/content.js      13,053 bytes
.output/chrome-mv3/content-scripts/domainScraper.js 31,761 bytes
```

A **1 MB popup** is huge. Loading happens every time the user clicks the toolbar icon. Likely culprits:

- React 19 + all of shadcn/ui + Tailwind v4 bundled into one chunk.
- `BlacklistManager` and `App` are statically imported; should be split.
- No source-map analysis run yet — recommend `vite-bundle-visualizer`.

Targets: popup chunk under 250 KB compressed (currently no gzip, so ~1 MB serves up at install/load time).

## 3. Popup UI findings (static read)

The popup ([src/entrypoints/popup/App.tsx](../src/entrypoints/popup/App.tsx), [BlacklistManager.tsx](../src/entrypoints/popup/BlacklistManager.tsx)) shows a number of concrete issues.

### 3.1 Terminology drift — "blacklist" vs. "ignored"

PR #32 (`feat/copy-and-style`, open) renames "blacklist" → "ignored" in some files but not all. Current state:

- [App.tsx:323](../src/entrypoints/popup/App.tsx) — "Excludes blacklisted items"
- [App.tsx:531](../src/entrypoints/popup/App.tsx) — `Manage Blacklists`
- [App.tsx:535-538](../src/entrypoints/popup/App.tsx) — `Sites: {siteBlacklist.length}` / `Pages: {pageBlacklist.length}`
- [BlacklistManager.tsx](../src/entrypoints/popup/BlacklistManager.tsx) — class names, imports, headings all use `blacklist`/`Blacklist`.
- [store/ciStateSlice.ts](../src/store/ciStateSlice.ts) — state keys `siteBlacklist`, `pageBlacklist`.

**Action**: Decide one name (we recommend "ignored" / "Don't sync these"). Sweep the codebase including state keys; provide one-shot storage migration. Close or merge PR #32.

### 3.2 Server URL UX is hostile to new users

[App.tsx:254-282](../src/entrypoints/popup/App.tsx) renders:

> CI Server URL
> Enter the domain of your CI server
> [empty text input]  [Save]

Problems:
- No default, no environment dropdown, no validation, no health probe.
- Users without insider knowledge can't proceed.
- Empty domain still triggers a 1 Hz cookie poll against `https://${""}` style URLs.

Aligns with [03 — configurable server](03-configurable-server.md). Move to a setup wizard.

### 3.3 Auth state UX is muddled

[App.tsx:285-345](../src/entrypoints/popup/App.tsx) flow:

```
if (domain) {
  show "Log in to continue" / "Logged in to Companion Intelligence" button
}
if (token) {
  show "Browser History Sync" section
  if (deviceId) show device row
  else show "Not Authenticated" + "Please log in through the main application first."
}
```

The inner block uses `token` to gate visibility, then immediately tells the user "Not Authenticated" if no `deviceId` — which is the device-setup-in-flight state, not "not authenticated." Confusing.

**Action**: collapse to three real states: `unconfigured` (no `serverDomain`), `signed-out` (domain but no token), `setting-up` (token but no deviceId — show a spinner with "Registering this device…"), `ready` (token + deviceId).

### 3.4 `historySyncStatus` strings have no auto-dismiss

[App.tsx:383-387](../src/entrypoints/popup/App.tsx) renders the status string into a div whenever set. Status is never cleared — last sync's success message persists until the next sync runs. Should auto-clear after ~10 s, or move to a toast / `aria-live` region.

### 3.5 Sync error truncated to 20 characters

[App.tsx:513](../src/entrypoints/popup/App.tsx):

```tsx
⚠️ {log.error.substring(0, 20)}...
```

Too short to be useful. Show the full error in a tooltip *and* truncate at, say, 60 chars in the row.

### 3.6 Dead commented code in App.tsx

[App.tsx:117-159](../src/entrypoints/popup/App.tsx) — 43 lines of commented-out `triggerManualSync`. Delete.

### 3.7 Heavy inline Tailwind classes; shadcn underused

Buttons in the popup carry 200+ characters of utility classes each:

```tsx
className="rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] w-full touch-manipulation bg-[#555] dark:bg-[#555] light:bg-[#e0e0e0] ..."
```

shadcn's `<Button variant="...">` is the right level of abstraction. Refactor by:
- Creating semantic variants (`primary`, `secondary`, `destructive`, `ghost`).
- Moving color tokens to CSS variables (`--ci-accent`, `--ci-accent-fg`, etc.) — currently `#4ba7a6` is hardcoded ≈20× across App.tsx alone.
- Letting Tailwind utility classes handle only layout, not theme.

### 3.8 Native `<select>` doesn't match shadcn styling

[App.tsx:356-368](../src/entrypoints/popup/App.tsx) uses a native `<select>` for the sync time-range dropdown. shadcn ships a `Select` primitive — use it for visual consistency.

### 3.9 Color contrast risks

Repeated `text-[#888]` on white backgrounds (light theme): `#888` is `4.49:1` on `#fff` — passes AA for normal text but fails AAA. On the actual light-theme background `#f9f9f9`, it drops to `4.37:1` — borderline AA failure.

Action: audit with axe (see § 4 below) and bump muted-text to `#737373` or darker on light.

### 3.10 No keyboard `Esc` from BlacklistManager

Only the back-arrow button (`←`) returns. Bind `Esc` → `onBack()`.

### 3.11 Mobile detection via UA only

[App.tsx:107](../src/entrypoints/popup/App.tsx): `bowser.getParser(...).getPlatformType() === "mobile"`. Mobile rotation, desktop window resizes, and DPI changes don't update layout. Use CSS media queries (Tailwind `md:` etc.) instead; reserve UA detection for true device-class branches.

### 3.12 Sync history grid columns are fixed

[App.tsx:475](../src/entrypoints/popup/App.tsx): `grid-cols-[2fr_1fr_1fr]` with fixed column meanings (Date, Range, Status). The "Date" column shows full `toLocaleString()` which wraps awkwardly on narrow popups (350px) — and overflow becomes ellipsis-truncated, hiding the time.

Use a two-line layout (date on top, range/status row below) on widths < 360 px.

### 3.13 Manifest issues visible after build

`.output/chrome-mv3/manifest.json` review:
- `name: "Companion Intelligence"` — OK.
- `description: "Companion Intelligence browser extension for Chrome and Firefox"` — bland; not market-ready.
- `host_permissions` does not include `*://*.slashdot.org/*` or `*://*.github.com/*` even though `content_scripts.matches` does. Mismatch means content scripts inject but can't `fetch()` cross-origin to those hosts.
- `version: "1.3.0"` — no matching `CHANGELOG.md`.

### 3.14 Popup width hardcoded

`w-[350px]` on desktop. Chrome popup supports up to 800 × 600. Most users have screen real estate; consider a more spacious layout (or at least responsive max-width).

## 4. Recommended test infrastructure

### 4.1 Component tests (Jest + React Testing Library)

Stand up jest-dom with a small `browser` stub (see [05 — testing](05-testing.md)). Cover:

```
src/entrypoints/popup/__tests__/App.test.tsx
  - renders setup wizard when serverDomain is empty
  - renders sign-in CTA when domain present but token absent
  - renders "Registering this device…" when token present but deviceId null
  - renders sync controls when token + deviceId present
  - triggerHistorySync click sends correct runtime message
  - toggle changes dispatch correct actions
  - syncHistoryLogs row click expands error text

src/entrypoints/popup/__tests__/BlacklistManager.test.tsx
  - add site validates against domainRegex
  - add page validates against siteRegex
  - "Add current site" reads active tab and dispatches
  - Esc returns to main popup
  - back button returns to main popup
```

### 4.2 Accessibility tests (axe-playwright)

Build the extension and run a Playwright suite against `chrome-extension://<id>/popup.html`:

```ts
test("popup has zero serious or critical a11y violations", async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await injectAxe(page);
  const violations = await getViolations(page);
  const blocking = violations.filter(v => ["serious", "critical"].includes(v.impact));
  expect(blocking).toEqual([]);
});
```

Run in CI on every PR. Wire to fail the build only on serious/critical at first; raise the bar over time.

### 4.3 Visual regression (Playwright + pixelmatch)

For each viewport (350×500, 400×600, 800×600 mobile-tablet-ish) and theme (light/dark/system):

```
tests/visual/popup-{viewport}-{theme}.spec.ts
  - takes a screenshot of popup.html
  - diffs against tests/visual/baseline/...
```

Update baselines explicitly via `npx playwright test --update-snapshots`.

### 4.4 Keyboard nav E2E

```ts
test("popup is fully keyboard-navigable", async ({ page }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  const trail: string[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName);
    trail.push(focused);
  }
  expect(trail).toMatchSnapshot();
});
```

### 4.5 Manual test matrix

For things automation doesn't catch, keep a checked-in matrix:

| Surface | Chrome desktop | Chrome mobile (Android) | Firefox desktop | Safari desktop | Edge desktop |
|---|---|---|---|---|---|
| Popup renders | | | | | |
| Sign-in flow | | | | | |
| Manual history sync | | | | | |
| Bookmark toggle | | | | | |
| BlacklistManager | | | | | |
| Dark theme | | | | | |
| Light theme | | | | | |
| 350px width | | | | | |
| 800px width | | | | | |

Run before each release; attach to the release PR.

## 5. Concrete punch list (in priority order)

1. **Fix the 24 TypeScript errors** so `yarn compile` is a real gate. Largely typing `browser.storage.local.get` calls and parameterizing `jwtDecode<{ exp: number }>`.
2. **Fix the failing background.test.ts blacklist match** — minor regex/normalization fix.
3. **Delete the 43 lines of commented `triggerManualSync` code** in App.tsx.
4. **Decide and unify "blacklist" / "ignored" terminology** including state keys + migration.
5. **Replace the bare server-domain input with the setup wizard** from [03](03-configurable-server.md).
6. **Untangle the auth state machine** into four named states.
7. **Move inline color hex codes to CSS variables**; introduce semantic shadcn button variants.
8. **Replace native `<select>` with shadcn `Select`** for the time-range dropdown.
9. **Bind `Esc` to BlacklistManager `onBack`.**
10. **Auto-dismiss `historySyncStatus`** after success messages.
11. **Show full error text on hover** in sync-history rows instead of `substring(0, 20)`.
12. **Align `host_permissions` and `content_scripts.matches`** in `wxt.config.ts`.
13. **Update manifest `description`** to ship-quality copy.
14. **Bundle-analyze the popup** and code-split BlacklistManager.
15. **Stand up RTL component tests** for App and BlacklistManager.
16. **Stand up axe-playwright** in CI.
17. **Visual regression snapshots** across viewport × theme matrix.

## 6. Acceptance criteria

- [ ] `yarn compile` passes with zero errors on `master`.
- [ ] `yarn test` passes with zero failures.
- [ ] At least one component test per popup surface.
- [ ] axe-playwright integrated into CI; zero serious/critical violations on `popup.html`.
- [ ] Visual regression baseline exists for 3 viewports × 2 themes.
- [ ] Manual test matrix attached to the next release PR.
- [ ] All punch-list items in §5 (1)–(13) closed with linked PRs.
