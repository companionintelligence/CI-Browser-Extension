# CI Browser Extension — Architecture

## 1. Purpose & Role in Companion Intelligence

The CI Browser Extension is the **client-side data collector** in the Companion Intelligence (CI) ecosystem. It is a privacy-focused, user-installed browser extension that captures the user's web activity (page visits, bookmarks, downloads, scroll depth, form submissions, and site-specific personal data) and forwards it to the user's **private CI-Server** for ingestion into their personal digital memory.

It is one of several "edges" feeding the CI knowledge graph:

```
                              ┌───────────────────────────┐
                              │       CI-Server (API)     │
                              │  /api/authenticate/refresh│
                              │  /api/devices             │
                              │  /api/browser-activity    │
                              │  /api/content (planned)   │
                              └────────────▲──────────────┘
                                           │ HTTPS + JWT
       ┌───────────────────────┬───────────┼───────────┬─────────────────────┐
       │                       │           │           │                     │
┌──────┴───────┐      ┌────────┴────────┐  │  ┌────────┴────────┐  ┌─────────┴────────┐
│ CI Browser   │      │ CI Mobile App   │  │  │ CI Desktop /    │  │ Future ingestion │
│ Extension    │      │ (companion)     │  │  │ Browser-Use     │  │ (email, calendar)│
│ (this repo)  │      │                 │  │  │ automation      │  │                  │
└──────────────┘      └─────────────────┘  │  └─────────────────┘  └──────────────────┘
                                           │
                                ┌──────────┴──────────┐
                                │  CI Web Dashboard   │
                                │  (alpha.companion   │
                                │   intel.com etc.)   │
                                └─────────────────────┘
```

The extension does **not** perform analytics or send data anywhere besides the user-configured CI-Server. It is essentially a "personal logger" — its value is realized once data arrives in the user's CI graph.

## 2. Technology Stack

| Layer            | Choice                                         |
|------------------|------------------------------------------------|
| Build framework  | [WXT](https://wxt.dev) (Vite-based)            |
| Language         | TypeScript 5.8                                 |
| UI               | React 19 + Tailwind v4 + shadcn/ui (workspace) |
| State            | Redux Toolkit + `webext-redux`                 |
| HTTP             | axios + a small `fetchJson` helper             |
| Local DB         | IndexedDB (wrapper in [src/indexeddb.ts](src/indexeddb.ts)) |
| Auth             | JWT (access) + httpOnly session cookie + CSRF  |
| Browser identity | `bowser`                                       |
| Testing          | Jest + Testing Library (minimal coverage)      |
| Package mgr      | Yarn 4 / npm                                   |
| Manifest         | MV3 (Chrome/Edge/Opera/Brave/DuckDuckGo/Safari), MV2 (Firefox) |

## 3. Extension Surfaces

WXT compiles four entrypoint surfaces:

1. **Background service worker** — [src/entrypoints/background.ts](src/entrypoints/background.ts) (~2.3k LOC). The brain of the extension.
2. **Content script — universal** — [src/entrypoints/content.ts](src/entrypoints/content.ts). Runs on `<all_urls>`. Tracks scroll depth, intercepts form submissions (including AJAX via fetch wrapping), and answers `getScrollDepth` / `getMetaDescription` messages from the background.
3. **Content script — domain scraper** — [src/entrypoints/domainScraper.content.ts](src/entrypoints/domainScraper.content.ts). Activated on whitelisted streaming domains; executes JSON scrape profiles ([src/scrapeProfiles/](src/scrapeProfiles/)) and POSTs structured personal data to the background via `DOMAIN_SCRAPE_DATA`.
4. **Popup UI** — [src/entrypoints/popup/App.tsx](src/entrypoints/popup/App.tsx). Previously also an `options/` page — those were consolidated into the popup in PR #38. Houses auth status, server URL, sync toggles, blacklist (now "ignored") manager, and sync history.

## 4. Background Script — Responsibilities

`background.ts` is a single monolithic module. Functional clusters:

- **Authentication lifecycle**
  - Polls `browser.cookies.getAll` every 1s to detect the `sessionToken` (httpOnly) and `csrfToken` cookies set by the CI-Server domain.
  - Decodes the access-token JWT to determine expiry; calls `/api/authenticate/refresh` (with CSRF header, `credentials: "include"`) to mint a new access token.
  - Broadcasts `AUTH_STATE_UPDATED` to the popup.

- **Device registration** ([getDeviceInfo](src/entrypoints/background.ts), [createDeviceOnServer](src/entrypoints/background.ts))
  - Identifies the device via `bowser` (OS + browser + device type) and registers via `POST /api/devices`.
  - Matches against existing server-side devices to avoid duplicates (legacy bug — see PR #37).
  - Stores `deviceId` in `browser.storage.local` and Redux state.

- **Real-time activity recording** ([recordHit](src/entrypoints/background.ts))
  - Listens on `webNavigation.onCompleted` and `webNavigation.onHistoryStateUpdated`.
  - Resolves the active tab, checks against `siteBlacklist` / `pageBlacklist` regex lists, deduplicates against `lastUrl`, and POSTs a `BrowserActivity` event to `/api/browser-activity`.

- **History / bookmark / download sync**
  - Three independent toggles: `historySyncEnabled`, `bookmarkSyncEnabled`, `downloadSyncEnabled`.
  - Manual trigger: `triggerManualSync({ timeRange })`. Auto-trigger: `setInterval` every 10 minutes when `autoSyncEnabled` is true.
  - Browser-level event listeners (`bookmarks.onCreated/Changed/Removed`, `downloads.onCreated`) registered conditionally based on toggle state.
  - Synced-IDs cache (`syncedHistory`, `syncedBookmarks`, `syncedDownloads`) lives in `browser.storage.local` to avoid double-uploads. Cleared on re-enable.
  - Batched uploads in slices of 100. Each upload sets the matching `addSyncedItem` on success; failures preserve the unsynced state.

- **Domain scrape pipeline**
  - Listens for `DOMAIN_SCRAPE_DATA` from `domainScraper.content.ts`.
  - Currently flattened into `browser-activity` events with `action_type: "visit"` and a `properties` payload (see `handleScrapedData`).

- **Cross-context state**
  - `createWrapStore()` from `webext-redux` exposes the Redux store to the popup over `runtime` messaging.

## 5. State Shape

[src/store/ciStateSlice.ts](src/store/ciStateSlice.ts) defines a flat `CiState`. Persistence is handled by two thunks:

- `loadUserSettings` reads a whitelist of keys from `browser.storage.local`.
- `saveUserSettings` reducer writes the same keys back synchronously after most mutations.

This is effectively a manual "rehydration" pattern. The slice also holds transient UI state (`historySyncInProgress`, `historySyncStatus`, current `url` / `domain`).

## 6. Data Contract — `/api/browser-activity`

All sync paths normalize into a single payload shape (see [convertToBrowserActivity](src/entrypoints/background.ts:443)):

```ts
{
  time: string,                  // ISO 8601 with ms
  device_id: string,
  url: string,
  title?: string,
  action_type: "visit" | "reload" | "bookmark" | "search" | "download" | "form_submit",
  properties?: Record<string, any>,
  duration_seconds?: number,     // derived from history.getVisits gaps
  scroll_depth_percent?: number, // from content script
  is_incognito?: boolean,
  contains_sensitive?: boolean
}
```

This is the single point of contract with the CI-Server. Any new collector (highlight save, scraped streaming history, etc.) must either fit this shape or move to a new endpoint (PR #26 proposes `/api/content`).

## 7. Local Storage Layout

| Store                        | Used for                                              |
|------------------------------|-------------------------------------------------------|
| `browser.storage.local`      | Settings, tokens, device info, synced-IDs caches, scroll/form local buffers |
| Cookie jar (`serverDomain`)  | `sessionToken` (httpOnly), `csrfToken`                |
| IndexedDB `CIBrowserExtensionDB` | `surfing_records`, `location_records` — defined but **not yet wired** into the main sync paths |

## 8. Browser & Mobile Support

WXT cross-compiles per `wxt.config.ts`. Manifest fragments:

- `host_permissions` — currently scoped to `*.companionintelligence.com`, `*.companionintel.com`, `*.ci.computer` plus the three streaming providers we scrape.
- `permissions` — `bookmarks`, `cookies`, `downloads`, `history`, `storage`, `tabs`, `webNavigation`.
- Firefox-specific `data_collection_permissions` declared for AMO review.

Targets built: Chrome, Firefox, Edge, Opera, Brave, DuckDuckGo, Safari (incl. iOS Safari MV3). Mobile support landed in PRs #10, #12.

## 9. Where the Extension Fits with Other CI Systems

| Adjacent system                      | Relationship                                                                 |
|--------------------------------------|------------------------------------------------------------------------------|
| **CI-Server**                        | Single upstream consumer. Owns auth (`/api/authenticate/refresh`), device registry, and the activity/content APIs. |
| **CI-Server device service**         | The extension is a "device" entity; matching logic was recently refactored on the server side (see open PR #37). |
| **CI Web Dashboard** (alpha / dev)   | Visualizes the same data the extension uploads. Auth cookies are issued by the dashboard's domain and read by the extension. |
| **Browser-Use (planned)**            | Roadmap item — extension becomes bidirectional and receives commands from the server to drive the browser. |
| **CI Mobile / Desktop collectors**   | Peer collectors. All write to the same `BrowserActivity` / device model; deduplication is server-side. |
| **Streaming scrape profiles**        | The extension is currently the only edge that knows how to read Netflix/Hulu/Disney+ viewing history because those services have no public API. |

## 10. Authentication Flow (current, post-PR #40)

1. User logs in on the CI dashboard (`dashboard.companionintel.com` or equivalent) which sets an httpOnly `sessionToken` cookie and a `csrfToken` cookie on its domain.
2. Background polls cookies once per second. When `sessionToken` appears and the access token is missing/expired, it POSTs to `/api/authenticate/refresh` with `X-CSRF-Token` and `credentials: include`.
3. Server returns `{ accessToken, sessionToken }`. Extension stores `accessToken` in Redux/`storage.local`; the cookie is rotated by the server.
4. All subsequent API calls send `Authorization: Bearer <accessToken>`.
5. On `sessionToken` removal (logout / domain switch) the extension clears `accessToken`.

## 11. Known Architectural Tensions

These are described here for context; remediation lives in [planning.MD](planning.MD).

- **Monolithic background**: 2.3k lines, hard to navigate or unit-test.
- **Server URL is per-user free text**: configurable but with no validation, multi-server, or environment switcher.
- **Auth-check polling at 1Hz** rather than driven off `cookies.onChanged`.
- **Auto-sync polling at 10 minutes** rather than `chrome.alarms`.
- **IndexedDB is defined but unused** by the sync paths — feature merged in PR #8, never adopted.
- **Form-submission and scroll-depth buffers** live in `storage.local` with no upload path.
- **Scrape profiles are statically imported** in `domainScraper.ts`; adding sites requires code changes (the open PR #30 introduces a `ProfileManager` to fix this).
- **`host_permissions` is hardcoded** to a handful of streaming sites — new scrape targets require manifest changes and re-review.
