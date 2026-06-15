# 15 — OAuth Integration with CI-Server Cloud Proxy

## Context

CI-Server has three open OAuth-related PRs that change how OAuth flows work across the CI ecosystem. The extension needs to understand and align with this work.

| CI-Server PR | Branch | What it does |
|---|---|---|
| [#1295](https://github.com/companionintelligence/CI-Server/pull/1295) | `feat/proxy-oauth-through-ci-cloud` | Adds `CloudOAuthProxyService` + `/api/connections/complete-proxy`. Foundation for proxying OAuth via CI-Cloud. |
| [#1407](https://github.com/companionintelligence/CI-Server/pull/1407) | `cloud-oauth-proxy` | Enables cloud proxy by default; lets users override per-provider with their own credentials. |
| [#1388](https://github.com/companionintelligence/CI-Server/pull/1388) | `copilot/fix-error-message-references` | Bug fixes (Google→Facebook/Microsoft naming, console.log→logger, async forEach, null guards). |

## Architecture (post-merge)

```
                                ┌────────────────────────────┐
                                │   CI-Cloud / CI-Portal     │
                                │  /api/oauth/authorize      │  ← OAuth client secrets live here
                                │  /api/oauth/callback       │
                                │  /api/oauth/token/refresh  │
                                │  /api/oauth/token/revoke   │
                                └──────────────▲─────────────┘
                                               │  HTTPS + basic(box_id:device_key)
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │                CI-Server (box)                │
                       │  CloudOAuthProxyService                       │
                       │  /api/connections/complete-proxy              │
                       │  stores: access_token + proxy_refresh_token   │
                       └──────────────▲────────────────────────────────┘
                                      │ JWT (existing flow)
                                      │
                       ┌──────────────┴────────────────┐
                       │     CI-Browser-Extension      │
                       │     (this repo)               │
                       └───────────────────────────────┘
```

Key facts from reading [CloudOAuthProxyService.ts](https://github.com/companionintelligence/CI-Server/blob/cloud-oauth-proxy/backend/apps/api/src/domains/connections/services/CloudOAuthProxyService.ts):

- CI-Server authenticates to CI-Cloud with HTTP basic using `box_id` + `device_key` from env (`HUB_DEVICE_ID`, `HUB_API_KEY`).
- Providers supported in the initial cut: Google, Microsoft, Facebook, Spotify.
- CI-Server receives an opaque `proxy_refresh_token`; the real provider refresh token never leaves CI-Cloud.
- `POST /api/oauth/authorize` returns `{ session_id, authorization_url }`.
- `POST /api/oauth/token/refresh` and `POST /api/oauth/token/revoke` are self-authenticating via the proxy refresh token.
- Frontend OAuth callback handler distinguishes "cloud proxy" (`access_token`, `proxy_refresh_token` in URL) vs. "direct" (`code + state`).

## What this means for the browser extension

**The CI-Server OAuth work is about outbound connections to 3rd-party providers** (Google, Microsoft, Facebook, Spotify). It is *not* about authenticating the extension to CI-Server — that's the existing session-cookie + CSRF + JWT flow ([background.ts:1804](../src/entrypoints/background.ts)).

So the extension has two distinct integration paths to think about:

1. **Path A — Trigger and observe outbound OAuth connections** (relevant to scraping/data-gathering use cases).
2. **Path B — Adopt OAuth-style scoped tokens for the extension → CI-Server channel** (relevant to the PR #14 OAuth work and to Browser-Use in [11](11-browser-use.md)).

Both need work, but they're independent. Address them in that order.

## Path A — Outbound connection triggering

### Why

Right now, the extension scrapes streaming sites because those providers have no public API. For providers that *do* have APIs (Gmail, Google Calendar, Outlook, Spotify), it's strictly better to query the provider directly through CI-Server's connection layer than to scrape.

If the extension can drive the user through a "Connect your Google account to CI" flow, we get:
- Higher-fidelity data (real API responses, not DOM scraping).
- Server-side rate limiting and quota management already built into CI-Server.
- No selector rot.
- Less storage on the user's device because the server pulls and stores directly.

### Design

The extension never talks to CI-Cloud directly. It always talks to CI-Server. CI-Server handles the cloud-proxy details transparently.

New CI-Server endpoints (extension-facing):

```
GET  /api/extension/providers
  → list of providers with `id`, `name`, `connected: boolean`, `scopes_available`, `icon_url`

POST /api/extension/providers/:id/connect
  body: { callback_url?: "chrome-extension://<id>/oauth-return.html" }
  → { authorization_url, session_id }

POST /api/extension/providers/:id/disconnect
  → 204
```

The extension flow:

1. Popup shows "Connect Google" button.
2. Click → POST `/api/extension/providers/google/connect`.
3. Open `authorization_url` in a new tab (or via `browser.identity.launchWebAuthFlow`).
4. User completes consent at Google → CI-Cloud → CI-Server callback → CI-Server stores the connection.
5. Extension polls `/api/extension/providers/google` (or subscribes via the command channel in [11](11-browser-use.md)) until `connected: true`.
6. Popup updates UI.

The `callback_url` parameter is optional — if omitted, CI-Server uses its existing web-dashboard callback and the user returns there. If provided, CI-Server passes it through to CI-Cloud's `redirect_uri` step, and the user lands in an extension-owned tab that closes itself.

### `browser.identity.launchWebAuthFlow`

Chrome/Firefox/Edge all support `chrome.identity.launchWebAuthFlow`. Use it:

```ts
const authUrl = await api.startConnect("google");
const redirect = await browser.identity.launchWebAuthFlow({
  url: authUrl,
  interactive: true,
});
// redirect URL contains a session id we POST back to CI-Server to confirm.
```

`launchWebAuthFlow` opens a managed popup, captures the redirect, and returns the final URL. Much cleaner than a new tab.

Caveats:
- Each browser computes the redirect URI differently. Use `browser.identity.getRedirectURL()` to get the canonical one and register it with CI-Cloud's allowed callback list (one entry per browser is fine; `https://<extid>.chromiumapp.org/` style).
- Safari extensions have spotty `identity` API support — fall back to `tabs.create` + listener for that one.

### Provider registry

Extension reads the list of available providers from CI-Server (not hardcoded) so adding `Discord`, `Instagram`, etc. on the server doesn't need an extension release.

### Surfacing connected data

Once a provider is connected, the extension should *not* re-implement provider queries. Instead, it surfaces a small "Browse data" link that opens the CI dashboard view for that provider. The extension's job ends at "I helped you connect."

## Path B — Extension → CI-Server OAuth

### Why

PR #14 in this repo introduced OAuth as a replacement for the current cookie+JWT flow. Three motivations:
- **Per-scope consent** — Browser-Use commands ([11](11-browser-use.md)) need narrower permissions than "act as the user."
- **Revocability per device** — sign out a specific extension install without invalidating the user's web session.
- **No reliance on cookies** — useful if the user clears cookies aggressively.

The CI-Server cloud-proxy work doesn't directly apply here, but the **pattern is reusable**: just as CI-Server proxies OAuth secrets through CI-Cloud, the extension can rely on CI-Server to be its OAuth authority without ever needing client secrets.

### Design

Treat the extension as an OAuth client of CI-Server itself. CI-Server already has user accounts; just expose a new app type "browser_extension" with its own client ID (public — no secret needed for PKCE flows).

New endpoints on CI-Server (extension-auth-facing):

```
GET  /oauth/authorize
  query: client_id, redirect_uri, code_challenge, code_challenge_method=S256, scope, state
  → user-facing consent page → redirects with `code`

POST /oauth/token
  body: { grant_type: "authorization_code", code, code_verifier, redirect_uri, client_id }
  → { access_token, refresh_token, expires_in, token_type, scope }

POST /oauth/token
  body: { grant_type: "refresh_token", refresh_token, client_id }
  → { access_token, refresh_token, expires_in }

POST /oauth/revoke
  body: { token, client_id }
  → 200
```

PKCE-only (no client secret in the extension). Scopes match the CI-Server permission model: `history:write`, `bookmarks:write`, `downloads:write`, `content:write`, `commands:read`, `commands:execute`, `connections:read`, `me`.

### Migration from cookie+JWT

Coexist for one release:

- The extension keeps reading `sessionToken` + `csrfToken` cookies and using `/api/authenticate/refresh` (current path).
- A new "Switch to OAuth (recommended)" button in the popup triggers `launchWebAuthFlow` against `/oauth/authorize` with full scopes.
- Once OAuth tokens are obtained, the extension prefers them; if they're missing, it falls back to cookie+JWT.
- After v1.6 (one release), make OAuth the default for new installs; cookie+JWT becomes a fallback.
- After v1.7, remove cookie+JWT in the extension (server keeps it for the web dashboard).

### Token storage

- `access_token`: in-memory + `storage.session` (cleared on browser close) with `expires_at`.
- `refresh_token`: `storage.local` (long-lived). Encrypt at rest with a key derived from a hardware-bound source where available (`crypto.subtle.deriveKey` + `crypto.subtle.exportKey`'s non-extractability flag).
- On every API call, check `expires_at - skewMs < now` and refresh if needed before issuing the call.

## Coordination with CI-Server team

Both paths require server-side endpoints we don't yet have. File two tracking issues on `companionintelligence/CI-Server`:

1. **Extension-facing connections proxy** (Path A): `/api/extension/providers*` endpoints. Block: needs reasonable shape signed off.
2. **Extension OAuth** (Path B): `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, with `extension:read|write` scope vocabulary. Block: needs OAuth-server library decision (jose? node-oauth2-server?).

Link both back to this doc.

## Sequencing

This is **after Phase 1** of the main planning doc (modularization, alarms, configurable server). Order within this slice:

1. Wait for CI-Server PRs #1295 / #1407 / #1388 to merge to `main`.
2. Coordinate Path-A endpoint design with CI-Server team (small RFC).
3. Implement Path-A in the extension (popup UI + `launchWebAuthFlow`).
4. Path-B design RFC (extension OAuth) — likely a quarter's effort on the server side.
5. Implement Path-B coexisting with cookie+JWT.
6. Cut over OAuth default after one release of coexistence.

## Risks & open questions

- **CI-Cloud availability is now load-bearing** — the cloud-proxy design means if CI-Cloud is down, fresh OAuth connections cannot be initiated, even for users who self-host CI-Server. Document this trade-off; provide a "use my own provider credentials" escape hatch (CI-Server PR #1407 already supports this via per-user `providerKeys`).
- **redirect_uri allowlisting** — CI-Cloud's OAuth proxy needs to accept the extension's `chromiumapp.org` redirect URIs. Coordinate with the CI-Cloud team to add them once.
- **Different extension IDs per browser** — Chrome, Firefox, Edge, Safari all generate different IDs. Cloud allowlist needs all of them. Use a wildcard if the proxy supports it, otherwise enumerate.
- **Scope granularity** — Path-B's scope list above is a first draft. Get sign-off from product before coding.
- **PKCE vs. confidential clients** — extensions are public clients, must use PKCE. Don't even suggest a client secret path; reviewers will catch it.
- **Refresh-token rotation** — CI-Server's cloud-proxy responses include a rotated `proxy_refresh_token`. The extension's OAuth flow (Path B) should likewise rotate refresh tokens on every use.
- **Revocation propagation** — if the user revokes a connection on the CI dashboard, the extension's next API call gets 401. The error handler must clear local tokens and prompt re-auth, not silently retry-storm.
- **Storage of refresh tokens** — `storage.local` is not encrypted at rest in extensions. Document the threat model; consider `storage.session` for the access token + memory-only refresh in a future iteration where SW lifetime allows it.

## Acceptance criteria

### Path A — outbound provider connections
- [ ] Popup shows a "Connections" tab listing providers from `/api/extension/providers`.
- [ ] Clicking "Connect Google" launches `launchWebAuthFlow`, completes the flow through CI-Cloud, and the popup reflects `connected: true` within 5 seconds.
- [ ] Disconnect calls `/api/extension/providers/:id/disconnect` and updates the UI.
- [ ] No CI-Cloud URLs are referenced directly by the extension; only CI-Server endpoints.
- [ ] Works against `feat/proxy-oauth-through-ci-cloud` once merged.

### Path B — extension OAuth
- [ ] RFC merged in this repo defining scopes, endpoints, and migration plan.
- [ ] PKCE flow implemented; no client secret in the bundle.
- [ ] Refresh-token rotation honored on every refresh.
- [ ] One release of coexistence with cookie+JWT.
- [ ] Token refresh works after SW suspension (rebuilds state from `storage.local`).
- [ ] Revocation from the CI dashboard cleans up extension state within one alarm tick.
