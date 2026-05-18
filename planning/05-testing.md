# 05 — Testing Strategy

## Problem

Current coverage:

- [src/store/ciStateSlice.test.ts](../src/store/ciStateSlice.test.ts) (193 LOC) — reducer tests.
- [src/utils.test.ts](../src/utils.test.ts) (80 LOC) — covers one regex.
- That's it. **Background script: zero tests. Content scripts: zero tests. Popup: zero tests. Scrape profiles: zero tests.**

The reasons coverage is low are structural, not cultural:

- Background is a 2.3k-line file with no exported seams (see [01](01-background-modularization.md)).
- WXT entrypoints use top-level `defineBackground({ main() { ... } })` which executes side effects on import.
- No browser-API stubbing layer; calling Jest with `browser.*` undefined explodes immediately.
- No E2E harness for the built extension.

## Goals

- Reliable unit-test path for any pure or pure-ish function.
- Fast integration-test path for `browser.*`-using code via a small stub layer.
- E2E smoke test that loads the built MV3 extension in headed Chrome and exercises a happy path.
- Stop merging PRs that regress the core sync flow without anyone noticing until production.

## Test layers

### Layer 1 — Pure unit tests (Jest + ts-jest, no browser shim)

Targets:

- `convertToBrowserActivity` (with injected metadata provider)
- `isUrlBlacklisted`, `isValidUrl`, `ensureISOTimeFormat`
- JWT expiry helpers
- Scrape-profile DSL evaluation
- Logger redaction
- Reducer cases (existing)

Live in `src/__tests__/unit/*.test.ts`. Should take <2 s total.

### Layer 2 — Browser-API stubbed tests

Build a `tests/fixtures/browser.ts` that exposes a typed in-memory mock of the subset of `browser.*` we use:

```ts
export function makeBrowserStub() {
  const storage = new Map<string, unknown>();
  const cookies = new Map<string, browser.cookies.Cookie>();
  const listeners = { onChanged: new Set<Function>(), onMessage: new Set<Function>() };
  return {
    storage: { local: {
      get: async (k: string | string[]) => /* read from map */,
      set: async (obj: Record<string, unknown>) => /* write + fire onChanged */,
      remove: async (k: string) => /* ... */,
    }},
    cookies: { getAll: async (q) => /* filter */, onChanged: { addListener: (fn) => listeners.onChanged.add(fn) } },
    runtime: { onMessage: { addListener: (fn) => listeners.onMessage.add(fn) }, sendMessage: jest.fn() },
    history: { search: jest.fn().mockResolvedValue([]) },
    bookmarks: { /* ... */ },
    downloads: { /* ... */ },
    webNavigation: { onCompleted: { addListener: jest.fn() }, onHistoryStateUpdated: { addListener: jest.fn() } },
    tabs: { query: jest.fn().mockResolvedValue([]) },
    alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
    _internals: { listeners, storage, cookies },
  };
}
```

Globally install via `setupTests.ts`:

```ts
(globalThis as any).browser = makeBrowserStub();
```

Now `syncHistory({ accessToken, deviceId })` can be tested end-to-end without a real browser, with `nock` or `msw` stubbing the axios POST.

Targets:

- `syncHistory` happy path: 543 entries → 6 batches of 100 → all marked synced.
- `syncHistory` failure path: batch 3 errors → batches 1–2 marked synced, 3–6 retried next run.
- `checkAuthenticationState` decision table (cookie present + token expired, etc.) — 8 branches.
- `setupDevice` first-run vs. existing-device match.
- Bookmark `onCreated` listener wired only when toggle on.

Lives in `src/__tests__/integration/*.test.ts`. Aim for <10 s.

### Layer 3 — E2E (Playwright)

Build the extension (`npm run build`), launch headed Chromium with `--load-extension=.output/chrome-mv3`, and drive it:

```ts
test("first-run wizard → authenticated → sync", async () => {
  const ctx = await chromium.launchPersistentContext("/tmp/profile", {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const ext = await getExtensionId(ctx);
  await ctx.newPage().goto(`chrome-extension://${ext}/popup.html`);
  // ...
});
```

Smoke tests:

1. Popup loads without errors.
2. Setup wizard accepts a domain and probes it (against a `nock`/`msw` mock or a fake server).
3. After cookie is set, popup shows authenticated state.
4. Manual sync triggers the expected POSTs to `/api/browser-activity`.

Run on `pull_request` in CI, allowed to fail for now (mark as `continue-on-error: true` until stable).

## Tooling improvements

- **Coverage** — `jest --coverage` already wired (`test:coverage` script). Add a CI gate: fail on coverage drop > 2 percentage points.
- **Snapshot the BrowserActivity payload** — one canonical fixture, snapshot-tested, so any contract change is loud.
- **Lint stays green** — flip `no-console` to `"error"` once [04 — logging](04-logging-observability.md) lands.
- **Pre-commit hook** — `lint-staged` is already a dependency but unconfigured. Wire it to run `eslint --fix` + `jest --findRelatedTests` on staged files.

## CI workflow

Add `.github/workflows/test.yml`:

```yaml
on: [pull_request, push]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: yarn install --immutable
      - run: yarn lint
      - run: yarn compile
      - run: yarn test --coverage
      - uses: codecov/codecov-action@v4   # optional
  e2e:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      # build, launch xvfb, run playwright
```

## Migration / sequencing

Don't try to retrofit tests onto the monolith. Tests follow the extraction in [01](01-background-modularization.md):

1. Layer-1 unit tests for each pure helper as it's extracted.
2. Browser stub + Layer-2 tests after the auth/device/sync modules exist.
3. E2E after the setup wizard ([03](03-configurable-server.md)) exists — it's the easiest happy path to script.

## Risks & open questions

- **`browser` vs `chrome` global** — WXT polyfills `browser` for both Chromium and Firefox. Our stub should provide the same. Tests using `chrome.*` directly will break; codify a "use `browser.*` only" lint rule.
- **MV3 service-worker semantics in Playwright** — Playwright supports SW background contexts in launchPersistentContext. Confirm before relying on the SW for E2E assertions.
- **Flakiness budget** — E2E suites attract flake. Set a clear policy: a flaky test gets one fix attempt then `test.skip` with an issue link.
- **Fake CI-Server** — we need a stand-in for `/api/health`, `/api/authenticate/refresh`, `/api/devices`, `/api/browser-activity`. Build it as a tiny Express script in `tests/fake-server/`, reusable across integration and E2E.

## Acceptance criteria

- [ ] Coverage ≥60% lines, ≥50% branches on `src/background/**` after [01](01-background-modularization.md) lands.
- [ ] At least one E2E test passes in CI on every PR (allowed to be smoke-only).
- [ ] Browser stub is exported from `tests/fixtures/` and used by ≥5 test files.
- [ ] CI pipeline includes lint + compile + unit + (eventually) E2E with a documented runtime <5 min.
- [ ] A regression in `convertToBrowserActivity` payload shape fails a snapshot test in CI before merge.
