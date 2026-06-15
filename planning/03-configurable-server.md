# 03 — Configurable Server URL & First-Run Setup

## Problem

The `serverDomain` setting is technically configurable (stored in Redux + `storage.local`), but the surrounding UX and code assume one environment:

- [README.md](../README.md) hardcodes `dev.companionintelligence.com` and notes "this needs to be made configurable."
- Initial `serverDomain` defaults to `""` (empty string) — see [ciStateSlice.ts:60](../src/store/ciStateSlice.ts). First-run users see an empty input box and have to know what to type.
- No validation: any string is accepted. Typos produce silent network failures ("Network Error" toasts with no path to recovery).
- No environment switcher. Internal users juggling `alpha.companionintel.com`, `dev.companionintelligence.com`, `ci.computer`, and self-hosted instances have to manually clear the input.
- No connectivity probe before the user attempts auth.
- The 1 Hz cookie poll (#02) reads cookies for `https://${serverDomain}` — with an empty domain this either no-ops or hits a malformed URL.

## Goals

- First-run setup that gets a user from "freshly installed" to "authenticated and syncing" in under 60 seconds.
- Multi-environment switcher for internal users.
- Validation: probe `/api/health` (or equivalent) before accepting the URL.
- Single source of truth for the active server URL; no hardcoded references in code or docs.

## Non-goals

- Multiple simultaneous server connections (one extension instance = one CI-Server). The roadmap mentions multi-server; defer until Phase 5.
- OAuth flows (covered in [09 — media capture / OAuth](09-media-capture-oauth.md)).

## Approach

### Default environments

Ship a curated list in `src/lib/environments.ts`:

```ts
export const ENVIRONMENTS = [
  { id: "prod",  label: "Companion Intelligence",  domain: "app.companionintel.com" },
  { id: "alpha", label: "Alpha / Demo",            domain: "alpha.companionintel.com" },
  { id: "dev",   label: "Development",             domain: "dev.companionintelligence.com" },
  { id: "local", label: "Local (https://localhost)", domain: "localhost" },
] as const;
export type EnvironmentId = typeof ENVIRONMENTS[number]["id"] | "custom";
```

State gains:

```ts
serverEnvironmentId: EnvironmentId | null;  // null until user picks
serverDomain: string;                       // mirrors selected env or custom value
```

### First-run setup screen

When `serverEnvironmentId === null`, the popup renders a `<SetupWizard>` instead of `<App>`. Three steps:

1. **Pick environment** — radio list of `ENVIRONMENTS` + "Custom domain".
2. **Probe** — `GET https://${domain}/api/health` with 5 s timeout. Show status (green / yellow / red), HTTP code, response time.
3. **Authenticate** — link out to `https://${domain}/login` (opens new tab); explain that returning to the popup will detect the cookie.

After step 3, persist `serverEnvironmentId` + `serverDomain`, fire `loadUserSettings`, and unmount the wizard.

### Health probe

```ts
// background/health.ts
export async function probeServer(domain: string): Promise<HealthResult> {
  const start = performance.now();
  try {
    const res = await fetch(`https://${domain}/api/health`, {
      method: "GET",
      mode:   "cors",
      cache:  "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: performance.now() - start,
      version: res.headers.get("x-ci-version") ?? undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

If CI-Server doesn't yet expose `/api/health`, file a companion ticket; fall back to `HEAD /` while waiting.

### Switching environments mid-session

Adding "Server" tab to the popup with:

- Current environment badge.
- "Switch" button that opens the wizard.
- On switch, clear: `accessToken`, `deviceId`, `syncedHistory`, `syncedBookmarks`, `syncedDownloads`, `historySyncReEnabledAt`. Show a confirmation modal — this is destructive (cached sync state is per-server).

### `host_permissions` for multiple environments

`wxt.config.ts` currently lists:

```ts
"*://*.companionintelligence.com/*",
"*://*.companionintel.com/*",
"*://*.ci.computer/*",
```

Add custom-domain support by requesting at runtime via `permissions.request({ origins: [...] })` when the user picks "Custom". Show a permission dialog explanation.

### Removing hardcoded references

Search for `dev.companionintelligence.com`, `companionintelligence.com`, `companionintel.com` in source and replace with computed `state.serverDomain`. README rewrites to reference the wizard.

```sh
grep -RIn "companionintel\(ligence\)\?\.com\|ci\.computer" src/ wxt.config.ts public/
```

Anything that remains should be `host_permissions`, README examples (labeled as examples), or the environment list above.

## Migration / sequencing

1. Add `environments.ts` + setup wizard, gated so existing users skip it (`if (serverDomain !== "") setEnvironmentId("custom")` on first load).
2. Replace bare `state.serverDomain` usages where appropriate with a `useServerDomain()` hook that throws if unset, so accidental empty-string requests fail loudly during dev.
3. Ship the "Switch server" UI in a follow-up.

## Risks & open questions

- **CORS on `/api/health`** — must allow extension origin (`chrome-extension://<id>`) or accept opaque responses. Coordinate with CI-Server.
- **Custom-domain `permissions.request`** is gated on a user gesture. The wizard's "Test connection" button must call it directly inside the click handler, not after an `await`.
- **Localhost + self-signed certs** — the README documents importing `localhost.crt` manually. Surface this in the wizard when `domain === "localhost"`.
- **Telemetry of which environment** — opt-in only. Don't auto-collect.
- **Cookie domain quirks** — `*.companionintelligence.com` and `*.companionintel.com` are different parent domains. The wizard must understand that switching from prod to alpha is a *different cookie jar*, not a session migration.

## Acceptance criteria

- [ ] Fresh-install flow: install extension → open popup → setup wizard appears → pick "Alpha" → probe succeeds → "Sign in" opens dashboard → return to popup → authenticated state shown.
- [ ] No string match for `dev.companionintelligence.com` exists in `src/` outside of `environments.ts` and tests.
- [ ] `npm run test` includes a probe-success + probe-timeout + probe-CORS-error case.
- [ ] Switching environment clears per-server caches and the user re-authenticates without restart.
- [ ] README updated to describe the wizard; "hardcoded URL" note removed.
