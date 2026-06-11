# Store Listing Kit — Companion Intelligence v1.4.0

> Private & Confidential — Property of Lifescope Inc.
> Copy-paste source for Chrome Web Store, Firefox AMO, and Apple App Store
> submissions. Assets live alongside this file in `chrome/`, `firefox/`,
> `safari/`, and `shared/`.

## Shared metadata

| Field | Value |
|-------|-------|
| **Name** | Companion Intelligence |
| **Category** | Productivity |
| **Developer / company** | Lifescope Inc. |
| **Privacy policy URL** | https://ci.computer/privacy-policy (publish `PRIVACY.md` here before submitting) |
| **Support email** | support@ci.computer _(confirm a monitored inbox — Kyle)_ |
| **Homepage** | https://ci.computer |
| **Version** | 1.4.0 |

### Short summary (≤132 chars — Chrome & AMO)
> Capture your browsing history, bookmarks, and highlights to your own private Companion Intelligence server. You own your data.

(126 characters.)

### Full description (Chrome ≤16k, AMO similar)

```
Companion Intelligence is a personal web-archival tool. It records your own
browsing activity — history, bookmarks, downloads, and page highlights — and
sends it to a Companion Intelligence (CI) server that YOU control. Nothing is
shared with third parties, and Lifescope never receives your data.

WHAT IT DOES
• Sync browsing history to your private CI server, with a time range you choose
• Sync bookmarks and downloads — toggle each independently
• Highlight-to-save: select text on any page and archive it to your server
• Background auto-sync that respects the browser's battery/efficiency rules
• A full sync log so you can see exactly what was sent and when

PRIVACY BY DESIGN
• Self-hosted: your data goes only to the server domain you enter
• Ignore lists: exclude any site or page from capture in one click
• No third-party analytics, ads, or trackers
• No passwords or form contents are ever collected

SUPPORTED SITES
Built-in profiles capture structured items (e.g. watchlists) from a small set
of media sites you visit — Netflix, Hulu, Disney+, Max, Paramount+, Prime
Video — plus GitHub and Slashdot. These run only on those domains.

YOU ARE IN CONTROL
Turn any data type on or off, ignore sites/pages, sign out to stop capture, or
remove the extension to clear its local state. Your CI server governs
retention and deletion.

Companion Intelligence works on Chrome, Firefox, and Safari.
```

### What's new (1.4.0)
```
• Reliable background sync on Chrome MV3 via the alarms lifecycle
• Highlight-to-save: archive selected text from any page
• New supported sites: Max, Paramount+, Prime Video
• "Ignored Pages and Sites" — clearer privacy controls
• Faster, lighter sync bookkeeping and numerous stability fixes
```

---

## Chrome Web Store

**Assets** (`store-assets/`)
- Screenshots 1280×800: `shared/screenshot-1..4.png` (min 1, up to 5 — all four recommended)
- Small promo tile 440×280: `chrome/promo-tile-440x280.png`
- Marquee promo 1400×560: `promo-marquee-1400x560.png`
- Store icon 128×128: `public/icon/128.png` (in the package)

**Single purpose statement**
> Archive the signed-in user's own browsing activity (history, bookmarks,
> downloads, highlights) to a self-hosted Companion Intelligence server.

**Permission justifications**

| Permission | Justification |
|------------|---------------|
| `history` | Read the user's browsing history to sync it to their own server (core feature). |
| `bookmarks` | Read/observe bookmarks when bookmark sync is enabled. |
| `downloads` | Read/observe downloads when download sync is enabled. |
| `cookies` | Read the CI server's `sessionToken`/`csrfToken` cookies — on the user-configured server domain only — to authenticate. |
| `tabs` | Read the active tab's URL/title to record the current visit. |
| `webNavigation` | Detect navigations to know when a page visit occurred. |
| `storage` | Persist settings and the "already synced" bookkeeping locally. |
| `contextMenus` | Add the right-click "save selection" menu item for highlight-to-save. |
| `alarms` | Schedule background sync without keeping the service worker awake. |
| Host access (content script) | A lightweight script reads only scroll depth + the page meta description and supports highlight-to-save; it does not otherwise read page content. Supported-site profiles run only on their listed domains. |

**Data-use disclosures (Chrome privacy tab):** Collects "Web history," "User
activity" (bookmarks/downloads), and "Website content" (highlighted text / page
metadata). Declare: data is **not sold**, **not used for purposes unrelated to
the single purpose**, and **not transferred to third parties** (it goes only to
the user's own server). Link the privacy policy URL.

---

## Firefox Add-ons (AMO)

**Assets**: `store-assets/shared/screenshot-1..4.png` (1280×800).
Icon 128 ships in the package.

**Required source upload:** AMO requires a reviewable source archive because the
build uses a bundler. `yarn zip:firefox` emits both the add-on zip and a
`*-sources.zip`; upload the sources zip and point reviewers to `DEVELOPMENT.md`
for the build (`corepack enable && yarn install && yarn build:firefox`). Code is
intentionally **not minified** (`wxt.config.ts` → `vite.build.minify: false`).

**Data collection (declared in manifest):** `bookmarksInfo`, `websiteActivity`,
`websiteContent`, `browsingActivity` (Firefox consent prompts these at install).

**Permission justifications:** same table as Chrome above.

---

## Apple App Store (Safari)

Safari ships as a macOS/iOS app that wraps the extension — this requires an
Xcode container project (not in this repo yet; see release notes "deferred").

**Assets**
- App icon 1024×1024 (opaque, no alpha): `safari/app-icon-1024.png`
- Screenshots 1280×800: `shared/screenshot-1..4.png`

**Privacy manifest (`PrivacyInfo.xcprivacy`, iOS 17+):**
- `NSPrivacyTracking` = `false`
- `NSPrivacyTrackingDomains` = [] (no cross-user tracking)
- `NSPrivacyCollectedDataTypes` = browsing history, user content (highlights) —
  collected, not linked to identity for tracking, not used for tracking
- `NSPrivacyAccessedAPITypes` = declare reasons for any required-reason APIs used
  by the wrapper (e.g. UserDefaults `CA92.1`)

**App Store privacy answers:** Data Types = Browsing History, User Content;
Use = App Functionality; **not** linked to the user for tracking; **not** used
for tracking. Privacy policy URL required.

---

## Asset inventory

| File | Size | Used for |
|------|------|----------|
| `shared/demo.gif` | 420×798 | README + listing animation |
| `shared/hero.png` | 1280×640 | README hero / social card |
| `shared/screenshot-1..4.png` | 1280×800 | Screenshots (Chrome / AMO / App Store) |
| `chrome/promo-tile-440x280.png` | 440×280 | Chrome small promo tile |
| `chrome/promo-marquee-1400x560.png` | 1400×560 | Chrome marquee |
| `safari/app-icon-1024.png` | 1024×1024 | App Store icon |

All raster assets are regenerated from vector source with
`store-assets/render.sh` (`node src/generate.mjs` → `rsvg-convert` → `ffmpeg`/
ImageMagick). Edit `store-assets/src/*.mjs` and re-run to update.
