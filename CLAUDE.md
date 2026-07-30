# CLAUDE.md — CI-Browser-Extension

> **Private & Confidential — Property of Lifescope Inc. Do not distribute.**

## Platform role

**CI-Browser-Extension** sits in the **Capture** layer of the Companion Intelligence platform.

Roadmap & status: `CI-Engineering/projects/ci-browser-extension/README.md`
Issues: <https://github.com/companionintelligence/CI-Browser-Extension/issues> (platform-wide: <https://github.com/companionintelligence/CI-Engineering/issues>)

## What this repo does

WXT-based browser extension that captures browsing activity and sends it to CI-Server. Captures history, live navigation, bookmarks, downloads, saved highlights, and domain-specific scrapes.

## Stack

- WXT (browser extension framework)
- TypeScript
- Redux Toolkit + webext-redux (state, bridged to the popup)
- `browser.storage.local` (settings, synced-ID bookkeeping, capture retry queue)
- Jest (unit tests)

## Key commands

```bash
# Install dependencies
yarn install

# Start development server / service
yarn dev

# Run tests
yarn test

# Type check and lint
yarn compile
yarn lint

# Build for production (Chrome MV3 / Firefox MV2)
yarn build
yarn build:firefox
```

## Package manager

**yarn 4** (via corepack; pinned by the `packageManager` field in package.json) —
required because the workspace uses the `workspace:*` protocol, which npm cannot
install. Do not mix with npm/pnpm/bun.

## Cross-repo connections

- **Auth:** OIDC Authorization-Code + PKCE against **CI-Portal** as the public
  client `ci-browser-extension`. The Bearer sent to CI-Server is the portal
  **`id_token`** (a JWKS-signed JWT) — *not* the opaque OAuth `access_token`,
  which CI-Server's `jwtVerify` rejects. No API keys, session cookies, or CSRF
  tokens are involved. See `src/services/oidcAuth.ts`.
- **Memory discovery:** after sign-in the extension asks CI-Portal
  `/api/users/me/apps?slug=ci-memory` where the user's Memory server runs and
  sets `serverURL` from it; a manually-set URL is never overwritten.
- **Ingest:** captures POST to CI-Server's typed bulk lanes —
  `POST <serverURL>/api/v1/browser-activity` (visits, downloads, scrapes) and
  `POST <serverURL>/api/v1/contents` (bookmarks, highlights). The `/api` prefix
  is stripped by the gateway; a bare `/v1/...` does not route.
- **Indexing:** those bulk lanes do **not** index as they write, so the
  extension calls `POST /api/v1/ingest/finish` (`searchIndexOnly`) after a sync
  and debounced after live captures. Without it, uploaded data is in Postgres
  but invisible to search.
- **Server requirement:** CI-Server must run with `PORTAL_OIDC_ENABLED=true`, or
  it rejects every portal token with an undiagnosable 401.
- Supports Chrome, Firefox, Edge, and Safari (see `yarn build:all`).

## Build targets

`yarn build` produces the Chrome variant and `yarn build:firefox` the Firefox variant. See PUBLISHING.md for store submission.

## Multi-agent safety

Multiple AI agents work these repos in parallel. Never use `git reset --hard`, `git clean -f`, or any destructive git command without explicit confirmation from the user.

## Confidentiality

Private & Confidential — Property of Lifescope Inc. Do not distribute.
