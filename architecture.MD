# CI Browser Extension — Architecture

## 1. Purpose & Role in Companion Intelligence

The CI Browser Extension is the **client-side data collector** in the Companion Intelligence (CI) ecosystem. It is a privacy-focused, user-installed browser extension that captures the user's web activity (page visits, bookmarks, downloads, saved highlights, scroll depth, and site-specific personal data) and forwards it to the user's **private CI-Server** for ingestion into their personal digital memory.

It is one of several "edges" feeding the CI knowledge graph:

```
        ┌──────────────────────────┐        ┌───────────────────────────────┐
        │   CI-Portal (IdP)        │        │      CI-Server (Memory)       │
        │  OIDC Auth-Code + PKCE   │        │  /api/devices                 │
        │  /api/auth/jwks          │        │  /api/v1/browser-activity     │
        │  /api/users/me/apps      │        │  /api/v1/contents             │
        └────────────▲─────────────┘        │  /api/v1/ingest/finish        │
                     │ id_token             └───────────────▲───────────────┘
                     │                                      │ HTTPS + Bearer id_token
       ┌─────────────┴────────────┬─────────────────────────┴───────┬─────────────────────┐
       │                          │                                 │                     │
┌──────┴───────┐      ┌───────────┴─────┐      ┌────────────────────┴┐  ┌─────────────────┴┐
│ CI Browser   │      │ CI-Import-Tools │      │ CI Desktop /        │  │ Future ingestion │
│ Extension    │      │ (importer)      │      │ Browser-Use         │  │ (email, calendar)│
│ (this repo)  │      │                 │      │ automation          │  │                  │
└──────────────┘      └─────────────────┘      └─────────────────────┘  └──────────────────┘
```

The extension does **not** perform analytics or send data anywhere besides CI-Portal (for login) and the user-configured CI-Server. It is essentially a "personal logger" — its value is realized once data arrives in the user's CI graph.

## 2. Technology Stack

| Layer            | Choice                                         |
|------------------|------------------------------------------------|
| Build framework  | [WXT](https://wxt.dev) (Vite-based)            |
| Language         | TypeScript 5.8                                 |
| UI               | React 19 + Tailwind v4 + shadcn/ui (workspace) |
| State            | Redux Toolkit + `webext-redux`                 |
| HTTP             | `fetch` for captures; axios for the device endpoints |
| Local storage    | `browser.storage.local` only                   |
| Auth             | CI-Portal OIDC Authorization-Code + PKCE; portal `id_token` as the CI-Server Bearer |
| Browser identity | `bowser`                                       |
| Testing          | Jest + Testing Library                         |
| Package mgr      | Yarn 4 (npm cannot install the `workspace:*` protocol) |
| Manifest         | MV3 (Chrome/Edge/Opera/Brave/DuckDuckGo/Safari), MV2 (Firefox) |

## 3. Extension Surfaces

WXT compiles four entrypoint surfaces:

1. **Background service worker** — [src/entrypoints/background.ts](src/entrypoints/background.ts) (~2.3k LOC). The brain of the extension.
2. **Content script — universal** — [src/entrypoints/content.ts](src/entrypoints/content.ts). Runs on `<all_urls>`. Tracks scroll depth in memory and answers `getScrollDepth` / `getMetaDescription` messages from the background. It persists nothing.
3. **Content script — domain scraper** — [src/entrypoints/domainScraper.content.ts](src/entrypoints/domainScraper.content.ts). Activated on the scraped domains listed in its `matches`; executes JSON scrape profiles ([src/scrapeProfiles/](src/scrapeProfiles/)) and posts structured personal data to the background via `DOMAIN_SCRAPE_DATA`.
4. **Popup UI** — [src/entrypoints/popup/App.tsx](src/entrypoints/popup/App.tsx). Houses sign-in, Memory picker, sync toggles, ignore list, logs, **Settings** (Memory URL), and a hidden developer panel (Portal/cloud env only).

## 4. Background Script — Responsibilities

`background.ts` is a single monolithic module. Functional clusters:

- **Authentication lifecycle**
  - Runs the OIDC Auth-Code + PKCE flow against CI-Portal via `browser.identity.launchWebAuthFlow` (in the background, because the popup is torn down when the auth window takes focus).
  - Mirrors the portal `id_token` into Redux so capture guards and the popup reflect the session; attempts a **silent** (`interactive: false`) renewal before dropping the user to the sign-in view, because the refresh grant does not reissue an `id_token`.
  - Discovers where the user's Memory server runs via CI-Portal `/api/users/me/apps?slug=ci-memory`.
  - Broadcasts `AUTH_STATE_UPDATED` to the popup.
  - Driven by the `ci-auth-check` alarm (1 min).

- **Device registration** (`getDeviceInfo`, `createDeviceOnServer`)
  - Identifies the device via `bowser` (OS + browser + device type) and registers via `POST /api/devices`.
  - Matches against existing server-side devices to avoid duplicates — CI-Server has **no** device dedup of its own, so repeated registration would otherwise create duplicate rows.
  - Stores `deviceId` in `browser.storage.local` and Redux state.
  - A `ci-last-seen` alarm (5 min) heartbeats `PATCH /api/devices/:id/last-seen`.

- **Real-time activity recording** (`recordHit`)
  - Listens on `webNavigation.onCompleted` and `webNavigation.onHistoryStateUpdated`, both gated to http(s) URLs.
  - Reads the URL from the navigation event itself (not the active tab — those differ for background-tab navigation), checks `siteBlacklist` / `pageBlacklist`, deduplicates against `lastUrl`, and uploads.

- **History / bookmark / download sync**
  - Three independent toggles: `historySyncEnabled`, `bookmarkSyncEnabled`, `downloadSyncEnabled`.
  - Manual trigger: `triggerManualSync({ timeRange })`. Auto-trigger: the `ci-auto-sync` alarm (10 min) when `autoSyncEnabled` is true.
  - Browser-level event listeners (`bookmarks.onCreated/onChanged`, `downloads.onCreated`) are registered conditionally on toggle state — **after** `loadUserSettings` resolves, since before that the toggles still hold their defaults.
  - Synced-ID caches (`syncedHistory`, `syncedBookmarks`, `syncedDownloads`) live in `browser.storage.local`, capped at 20k ids each (oldest trimmed). Each set is read **once per sync run**, not per item.
  - Batched uploads in slices of 100, one request per slice. Ids are marked synced only after the batch lands, so a failure retries next run.

- **Live-capture retry queue** ([src/lib/captureQueue.ts](src/lib/captureQueue.ts))
  - The sync engines re-derive their work from the browser each run, so a failed upload costs nothing. Live captures do not: a highlight or visit exists only at the moment its event fires.
  - Failed live captures are queued in `browser.storage.local` (bounded: 500 entries, 5 attempts each) and re-sent at the start of the next auto-sync tick.

- **Domain scrape pipeline**
  - Listens for `DOMAIN_SCRAPE_DATA` from `domainScraper.content.ts`.
  - Each scraped item becomes a capture with a per-item `source_id` so distinct items on one page do not dedup into a single row. See §6 for why this lane is a holding position.

- **Search indexing**
  - CI-Server's bulk lanes write **without** indexing. The extension calls `POST /api/v1/ingest/finish` (`searchIndexOnly`, scoped to the entity types it writes) after each sync and debounced after live captures. Without this, uploaded data is in Postgres but invisible to search.

- **Cross-context state**
  - `createWrapStore()` from `webext-redux` exposes the Redux store to the popup over `runtime` messaging.

## 5. State Shape

[src/store/ciStateSlice.ts](src/store/ciStateSlice.ts) defines a flat `CiState`. Persistence is handled by two thunks:

- `loadUserSettings` reads a whitelist of keys from `browser.storage.local` and runs the one-time migrations (`portalIssuer` → `portalUrl`, `serverDomain` → `serverURL`, dropping `serverEnvironmentId`).
- `saveUserSettings` writes the same keys back after most mutations.

This is effectively a manual "rehydration" pattern. The slice also holds transient UI state (`historySyncInProgress`, `historySyncStatus`, `discoveryHint`, `memoryAppChoices`) and current-tab state (`url` / `domain`).

Tokens are **not** in Redux: they live in `browser.storage.local` under `oidcTokens`, managed by [src/services/oidcAuth.ts](src/services/oidcAuth.ts). `ciState.accessToken` is only a mirror of the current `id_token` used by the capture guards and the popup.

## 6. Data Contract — the typed bulk lanes

Captures are built as a `BrowserActivity` (see [src/services/browserActivity.ts](src/services/browserActivity.ts)) and routed to one of two CI-Server endpoints by kind:

| Capture | Destination | Row |
|---|---|---|
| visit, download, scrape | `POST /api/v1/browser-activity` | `ci.browser_activity` |
| bookmark, highlight | `POST /api/v1/contents` | `ci.content` (`type: 'bookmark'` / `'highlight'`) |

Both take `{ records: [...] }` and dedup server-side on `(user_id, source_type, source_system, source_id)`.

```ts
{
  time: string,                  // ISO 8601 Z — when it happened
  observed_at?: string,          // when the extension saw it (import time)
  device_id: string,
  url: string,
  title?: string,
  action_type: "visit" | "reload" | "bookmark" | "search" | "download"
             | "form_submit" | "highlight" | "scrape",
  properties?: Record<string, unknown>,
  duration_seconds?: number,     // derived from history.getVisits gaps
  scroll_depth_percent?: number, // from content script
  is_incognito?: boolean,
  contains_sensitive?: boolean
}
```

Two impedance mismatches the mappers absorb, both documented in `browserActivity.ts`:

- The server's `action_type` enum has no `highlight` or `scrape`, and there is no `observed_at` column. Those values ride in `properties` instead of being dropped — which means a scrape's capture kind degrades to `web.page_view` server-side.
- `device_id` is `z.string().uuid()` server-side; a non-UUID id degrades to a property rather than rejecting the record.

**`/api/v1/events` is deliberately not used.** That endpoint hardcodes `destination: 'events'` and has no per-destination fan-out, so every capture landed in `ci.events` and `ci.browser_activity` stayed empty. CI-Import-Tools reaches the same conclusion and keeps the typed lanes as its default.

## 7. Local Storage Layout

Everything lives in `browser.storage.local`. There is no IndexedDB and no cookie usage.

| Key(s)                                        | Used for                                    |
|-----------------------------------------------|---------------------------------------------|
| settings keys (`serverURL`, `portalUrl`, toggles, ignore lists, …) | User configuration, rehydrated into Redux |
| `oidcTokens`                                  | Portal access / refresh / id tokens          |
| `deviceId`, `deviceName`, `deviceType`, `devicePlatform` | Device registration                |
| `syncedHistory`, `syncedBookmarks`, `syncedDownloads` | Dedup bookkeeping, 20k cap each      |
| `captureRetryQueue`                           | Live captures awaiting retry (500 cap)       |
| `lastBookmarkSync`, `lastDownloadSync`, `historySyncReEnabledAt` | Sync watermarks           |

## 8. Browser & Mobile Support

WXT cross-compiles per `wxt.config.ts`. Manifest fragments:

- `host_permissions` — the CI origins only (`*.companionintelligence.com`, `*.companionintel.com`, `*.ci.computer`), plus localhost origins in development builds. Scraped sites are **not** listed: a content script's `matches` already grants access to its own page.
- `permissions` — `alarms`, `bookmarks`, `contextMenus`, `downloads`, `history`, `identity`, `storage`, `tabs`, `webNavigation`. (`cookies` was removed with the legacy auth flow.)
- Firefox-specific `browser_specific_settings.gecko` with `data_collection_permissions` for AMO review, scoped so it does not leak into the Chrome/Safari manifests.

Targets built: Chrome, Firefox, Edge, Opera, Brave, DuckDuckGo, Safari (incl. iOS Safari MV3).

## 9. Where the Extension Fits with Other CI Systems

| Adjacent system                      | Relationship                                                                 |
|--------------------------------------|------------------------------------------------------------------------------|
| **CI-Portal**                        | The identity provider. Registered OIDC client `ci-browser-extension`; also answers "where does this user's Memory app run?" |
| **CI-Server**                        | Single data consumer. Device registry + the typed `/api/v1/*` ingest lanes. Must run with `PORTAL_OIDC_ENABLED=true` to accept portal tokens. |
| **CI-Import-Tools**                  | Peer capture source on the same lanes; its `toV1BrowserActivity` / `toV1Content` mappers are what this extension's mappers mirror. |
| **Browser-Use (planned)**            | Roadmap item — extension becomes bidirectional and receives commands from the server to drive the browser. |
| **CI Mobile / Desktop collectors**   | Peer collectors. All write the same models; deduplication is server-side. |
| **Streaming scrape profiles**        | The extension is the only edge that can read Netflix/Hulu/Disney+ viewing history, because those services have no public API. |

## 10. Authentication Flow

Two hops, two credentials (same model as Companion Capture):

| Credential | Used for | Validates |
|---|---|---|
| Opaque Portal `access_token` | `GET /api/users/me/apps` (Memory discovery) | Portal OAuth / `PUBLIC_CLIENTS` |
| Portal JWT `id_token` (`aud=ci-browser-extension`) | Memory `/api/devices`, `/api/v1/*` | CI-Server `PortalTokenService` JWKS |
| Same `id_token` | Hub Traefik forward-auth when Memory is behind edge SSO | Hub `portal-token` (audience includes `ci-browser-extension`) |

1. The user clicks **Sign in** in the popup (`AUTHORIZE`). Work runs in the background; the popup is often torn down when the auth UI takes focus. Authorize uses `prompt=select_account` so Portal shows an account picker instead of silently reusing the last SSO cookie.
2. OIDC Authorization-Code + PKCE against the configured Portal (default `https://hub.ci.computer`, issuer `{portal}/api/auth`):
   - **Chrome / Firefox:** `browser.identity.launchWebAuthFlow` + `getRedirectURL()` (`*.chromiumapp.org` / `*.extensions.allizom.org`).
   - **Safari:** open the authorize URL in a tab; `redirect_uri` is Portal HTTPS `{portal}/extension/oidc-callback` (CI-Portal #451). The extension captures `?code=` via a content script on that page (plus `webNavigation` / `tabs` polling), then exchanges the code.
3. Token exchange uses `credentials: "omit"` so Portal session cookies are not attached from the extension origin.
4. **Memory / device:** Portal `GET /me/apps?slug=ci-memory` lists this account’s Memory instances. One → auto-set `serverURL`. Several → popup **Choose Memory** (saved as a manual URL). A Settings URL marked manual is never overwritten. Each browser profile binds to one Memory; switching accounts uses **Use another account**.
5. All CI-Server calls send `Authorization: Bearer <id_token>`. Never send the opaque `access_token` to Memory or Hub.
6. When the `id_token` expires, Chrome/Firefox try non-interactive renewal; Safari requires Sign in again (no silent tab flow).
7. Public Memory behind Hub edge SSO needs a Hub build that accepts Portal Bearer JWTs; Memory needs `PORTAL_OIDC_ENABLED` with audience including `ci-browser-extension`.

## 11. Known Architectural Tensions

These are described here for context; remediation lives in [planning.MD](planning.MD).

- **Monolithic background**: ~2.3k lines and ~14 responsibilities, hard to navigate and — because `defineBackground` cannot be imported under Jest — not directly unit-testable. The lever is moving logic out into `src/lib` and `src/services`, which are well covered.
- **Server URL is per-user free text**: normalized but not validated against a reachable server.
- **Scrapes ride the page-view lane**: each profile's `data_type` implies a different destination (Netflix `viewingHistory` → media.watch, Robinhood holdings → inventory), but no server-side fan-out contract exists, so they all land as `web.page_view`.
- **Five scrape profiles are unreachable**: `cnn`, `wsj`, `quora`, `robinhood`, and `airbnb` are registered in `domainScraper.ts` but absent from the content script's `matches`, so they never run. Wiring them is a privacy decision (notably Robinhood), not just a code change.
- **Scrape profiles are statically imported** in `domainScraper.ts`; adding sites requires code changes and a manifest update.
- **Re-sends never repair**: CI-Server's `INGEST_REFRESH_COLUMNS` for both destinations are empty, so a corrected title or duration on a re-uploaded record is silently discarded.
- **Provenance vocabulary split**: the extension sends `source_system: "browser-extension"` while the platform's event-ingest spec says `"ci-browser-extension"`. Content→event auto-linking joins on the exact triple, so importer and extension records for the same item will not link until this is reconciled.
