# 02 — MV3 Lifecycle: Alarms and Event-Driven Auth

## Problem

The current background runs two persistent timers (see [background.ts:2051](../src/entrypoints/background.ts) and [background.ts:2191](../src/entrypoints/background.ts)):

```ts
setInterval(checkAuthenticationState, 1000);            // 1 Hz cookie poll
setInterval(async () => { /* auto-sync */ }, 10 * 60 * 1000);
```

In MV3, the service worker **is not persistent**. Chrome can suspend it after ~30 seconds of inactivity. When the SW restarts:

- All `setInterval` handles are gone.
- All in-memory state (Redux store, `deviceSetupInProgress`, `lastUrl`) is gone.
- The next event listener fire (e.g. `webNavigation.onCompleted`) re-imports the file and re-runs top-level code, but `main()` callbacks won't re-register the intervals until `defineBackground` runs again.

Net effect today: the auth refresh and auto-sync silently stop working after every suspension. Users who don't keep the popup open or trigger nav events lose syncing without any visible failure.

Auth checks at 1 Hz are also expensive for what's effectively "tell me when a cookie changes" — there's a dedicated API for that.

## Goals

- Replace persistent timers with platform-native scheduling that survives SW suspension: `chrome.alarms`.
- Replace 1 Hz cookie polling with `cookies.onChanged` listener.
- Make all top-level state restore correctly when the SW wakes from suspension.
- Behavior-preserving: auto-sync still happens roughly every 10 minutes; auth-refresh latency stays sub-second on cookie change.

## Non-goals

- Removing Redux. `webext-redux` already round-trips through storage on hydration.
- Removing IndexedDB (separate effort, see [10](06-local-first-sync.md)).
- Migrating Firefox MV2 to alarms — MV2 has a persistent background, so the existing intervals are fine there. Keep a small abstraction layer.

## Approach

### Scheduling — `chrome.alarms`

```ts
// background/schedule.ts
const ALARMS = {
  AUTO_SYNC:  "ci.autoSync",
  AUTH_PROBE: "ci.authProbe",   // fallback if cookies.onChanged is missed
} as const;

export function installAlarms() {
  browser.alarms.create(ALARMS.AUTO_SYNC,  { periodInMinutes: 10 });
  browser.alarms.create(ALARMS.AUTH_PROBE, { periodInMinutes: 5 });
}

browser.alarms.onAlarm.addListener(async ({ name }) => {
  switch (name) {
    case ALARMS.AUTO_SYNC:  return runAutoSyncTick();
    case ALARMS.AUTH_PROBE: return checkAuthenticationState();
  }
});
```

`browser.alarms.create` is idempotent on name, so we can safely call `installAlarms()` on every SW startup.

### Auth — event-driven via `cookies.onChanged`

```ts
browser.cookies.onChanged.addListener(async ({ cookie, removed }) => {
  const { serverDomain } = store.getState().ciState;
  if (!serverDomain) return;
  if (!cookie.domain.endsWith(serverDomain)) return;
  if (cookie.name !== SESSION_TOKEN_KEY && cookie.name !== CSRF_COOKIE_NAME) return;

  // Coalesce bursts (Chrome can fire multiple change events for one server response)
  scheduleDebouncedAuthCheck();
});
```

Debounce because Chrome fires `removed: true` followed by `removed: false` for each cookie rotation. 250 ms is plenty.

Keep the 5-minute alarm as a safety net for cases where `onChanged` is missed (e.g. cross-context cookie writes the listener doesn't see).

### State rehydration on SW wake

Every event handler that reads from Redux must first run:

```ts
async function ensureHydrated() {
  if (!hydrated) {
    await store.dispatch(loadUserSettings());
    hydrated = true;
  }
}
```

This is already happening implicitly via `loadUserSettings` calls scattered through sync paths — make it explicit and call it at the top of every external entrypoint (`onAlarm`, `onMessage`, `webNavigation.*`, `bookmarks.*`, `downloads.*`, `cookies.onChanged`).

### Cross-browser abstraction

```ts
// background/schedule.ts
const isMv3 = typeof browser.alarms?.create === "function" &&
              typeof self !== "undefined" &&
              "ServiceWorkerGlobalScope" in self;

export function startPeriodic(name: string, fn: () => Promise<void>, ms: number) {
  if (isMv3) {
    // alarm + onAlarm dispatch
  } else {
    setInterval(fn, ms);
  }
}
```

Firefox MV2 keeps `setInterval`; Chromium MV3 uses alarms. One call site.

### Auto-sync coalescing

Today's auto-sync interval (10 min) can collide with a user-triggered manual sync. After this change, both paths funnel through `triggerManualSync()`; add a single in-flight guard:

```ts
let inFlight: Promise<void> | null = null;
export function triggerManualSync(opts) {
  if (inFlight) return inFlight;
  inFlight = (async () => { try { await doSync(opts); } finally { inFlight = null; } })();
  return inFlight;
}
```

## Migration / sequencing

This depends on [01 — background modularization](01-background-modularization.md) — much easier to introduce `schedule.ts` and `auth/state.ts` as new files than to surgically replace timers inside the monolith.

1. Land #01 first.
2. Add `schedule.ts` and `cookies.onChanged` wiring side-by-side with existing `setInterval`s, behind a flag (`USE_ALARMS=true` constant). Both run.
3. Verify alarms fire on Chrome by adding temporary `console.log` and watching the SW devtools after toggling "Inactive" → "Active" cycles.
4. Remove the legacy `setInterval`s in a follow-up commit.

## Risks & open questions

- **Cookie listener scope** — `cookies.onChanged` fires for *every* cookie change across the browser. Filter aggressively or this becomes a hot path. The example above filters on `cookie.domain.endsWith(serverDomain)` which is sufficient since `serverDomain` is user-configured to the CI host.
- **Alarm minimum period on Chrome** — `chrome.alarms` enforces a 30-second minimum `periodInMinutes` value in production builds. Our 5- and 10-minute alarms are well above this; just don't try to schedule sub-minute work.
- **`browser.alarms` on Safari** — supported in Safari 14+. Safari iOS extension support has its own quirks; verify on the Safari Mobile build (PR #10/#12 added it).
- **Firefox MV2 persistence going away** — Firefox plans to deprecate MV2 persistent pages. When the extension flips to MV3 on Firefox we'll need the same alarms path; the abstraction above keeps that flip trivial.
- **Race on first install** — `installAlarms()` must run after `loadUserSettings` resolves so `serverDomain` exists. Otherwise the first auto-sync tick runs with an empty domain. Use `await ensureHydrated()` before `installAlarms()`.

## Acceptance criteria

- [ ] No `setInterval` or `setTimeout` longer than 5 s in the MV3 codepath. (`setTimeout` for debouncing inside an event handler is fine — it dies when the SW does, which is the desired behavior.)
- [ ] Manually suspending the SW in `chrome://serviceworker-internals` and waiting > 1 minute, then changing a cookie on the CI domain, results in `checkAuthenticationState` running within 1 s.
- [ ] After SW restart, auto-sync resumes on the next 10-minute boundary without manual intervention.
- [ ] Firefox build still uses `setInterval` and still passes its dev smoke test.
- [ ] A new doc string at the top of `schedule.ts` explains the model so future contributors don't reintroduce a `setInterval` "just to be safe."
