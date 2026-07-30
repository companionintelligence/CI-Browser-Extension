# Store Listing Kit — Companion Intelligence v1.4.0

> Private & Confidential — Property of Lifescope Inc.
> Copy-paste source for Chrome Web Store, Firefox AMO, and Apple App Store
> submissions. Assets live alongside this file in `chrome/`, `safari/`, and
> `shared/`.
>
> **Every claim below is checked against the shipped code.** Reviewers at all
> three stores diff the listing against the uploaded manifest, so do not add a
> capability here that the build does not have — and do not drop a disclosure
> because it is unflattering.

## Shared metadata

| Field | Value |
|-------|-------|
| **Name** | Companion Intelligence |
| **Category** | Productivity |
| **Developer / company** | Lifescope Inc. |
| **Privacy policy URL** | https://ci.computer/privacy-policy (publish `PRIVACY.md` here before submitting) |
| **Support email** | support@ci.computer _(confirm a monitored inbox)_ |
| **Homepage** | https://ci.computer |
| **Version** | 1.4.0 |

### Short summary (≤132 chars — Chrome & AMO)

> Services delete your history. Back up browsing, bookmarks, downloads and highlights to a Companion server you run yourself.

(123 characters.)

### Full description (Chrome ≤16k, AMO similar)

```
The services holding your history do not keep it. Pocket shut down in 2025 and
everything saved there went with it unless you exported in time. Streaming
services show a rolling window of what you watched and quietly drop the rest.
Reading lists, watch lists and order histories get trimmed on someone else's
schedule, and nobody asks you first.

Companion Intelligence is a backup for the parts of your life that live in
other people's accounts. It copies what you browse, save and download into a
Companion Memory server that you run — where nothing expires because a company
changed a retention policy. Your server indexes every batch for search, so the
archive stays answerable by you and by your own assistant, not just stored.

WHAT YOU GET BACK
• "What was that article I read in the spring?" — every page you visited, with
  its title and visit time, plus articles from CNN, WSJ and Slashdot.
• "Have I already watched this?" — viewing history and watch lists from six
  streaming services, filed as titles with dates instead of anonymous visits.
• "Where did we stay in Lisbon?" — Airbnb trips and wish lists.
• "Find that paragraph I saved" — select text, right-click, and it lands as a
  searchable annotation attached to the page it came from.
• A back catalogue on day one — one click imports the last 24 hours, 7, 30 or
  90 days, or a full year, out of your browser's own history.

WHAT IT BACKS UP
• Browsing history — a live feed that records each page as you visit it, plus
  the one-click backfill above. Both stop when you turn History off.
• Original dates are preserved. A Wednesday backfill files Monday's browsing as
  Monday, using the browser's real per-visit timestamps. Entries with no usable
  timestamp are skipped rather than stamped "now".
• Bookmarks — URL, title and date added, captured when you add or change one.
  Separate switch, off by default.
• Downloads — URL, filename, size and state. Separate switch, off by default.
• Highlights — select text, right-click, "Save highlight to Companion
  Intelligence". Selecting text alone captures nothing; only the menu item
  saves it. Long selections are truncated at 10,000 characters, not rejected.
• Site profiles — structured records from 13 sites, every one listed below.

THE 13 SITES, AND WHAT EACH ONE READS
• Netflix, Hulu, Disney+, Max, Paramount+ and Prime Video (which also runs on
  amazon.com/gp/video) — viewing history, watch lists, continue-watching,
  recommendations, and profile names.
• CNN and WSJ — headlines, summaries, authors, sections and publish dates from
  the pages you open. The WSJ profile also reads the market quotes shown on
  those pages (ticker symbol, price, change).
• GitHub — repositories, issues, pull requests, commits and activity.
• Quora — questions, answers and the people you follow.
• Airbnb — trips (property, location, dates, guests, total price), wish lists,
  and, if you host, your listings and their earnings.
• Slashdot — story titles, summaries and comment counts.
• Robinhood — portfolio holdings, order history and watch list. Off by
  default; see the next section.

How narrowly a profile runs depends on the site, so here it is exactly. The
streaming, travel and brokerage profiles run only on specific pages —
Netflix's viewing-activity, my-list and account pages, Airbnb's trips, wish
list and hosting pages, Robinhood's portfolio, orders and account pages — and
being anywhere else on those sites captures nothing. The CNN, WSJ, GitHub,
Quora and Slashdot profiles are scoped to the whole site.

FINANCIAL DATA — READ THIS FIRST
• The Robinhood profile captures portfolio holdings (symbol, company, shares,
  current price, market value, total return), order history (order type,
  quantity, execution price, date, status) and your watch list.
• It is OFF by default. You turn it on yourself, with the "Include financial
  accounts" checkbox in the popup.
• The check runs in the page script before any element is read. With the box
  unticked the extension does not read your brokerage page and discard it — it
  does not read it at all.
• One thing that switch does not cover, stated plainly: WSJ's market-quote
  selector (ticker, price, change) runs as part of ordinary news capture. That
  is published market data on a news page, not an account of yours.

WHERE YOUR DATA GOES
• To a Companion Memory server you run and control. There is no Lifescope
  content backend, no analytics, no advertising and no third-party endpoint —
  the only hosts this extension may contact are your Portal and your server.
• Sign-in is the one exception, and it deserves naming: you authenticate
  through a Companion Portal, which defaults to hub.ci.computer, operated by
  Lifescope, using the OpenID Connect scopes openid, profile, email and
  offline_access. That Portal receives your account identity and email address
  at each sign-in and each silent renewal. Your pages, bookmarks, downloads,
  highlights and site-profile data never pass through it. You can point the
  extension at a different Portal, including one you host.
• Your server governs retention and deletion. Nothing is uploaded while you are
  signed out or before a server is configured.
• Re-syncing does not duplicate your archive. Every record carries a stable
  source system and per-record source id, so the same page, bookmark or
  download uploaded twice updates one row instead of creating two.

SIGN-IN AND SETUP
• Sign in once with a Companion account. It is a standard OpenID Connect
  authorization-code + PKCE flow in a browser-managed window — no password is
  ever typed into the extension, which stores tokens, never credentials.
• No cookie access at all. The cookies permission is not requested, so the
  extension cannot read the session cookies of any site you visit.
• No server URL to paste and no API key to copy. After sign-in the extension
  asks your Portal where your Memory server runs and points itself there. If
  you run Memory on more than one machine, the popup asks which one, and treats
  your answer as deliberate so later auto-discovery never overrides it.
• Your session renews in the background — you see a sign-in prompt only when
  one is genuinely required.

WHAT IS ON BY DEFAULT
• History capture: on.
• Bookmarks, downloads, background auto-sync and financial-account capture: off
  until you turn them on.

WHAT IT DOES NOT COLLECT
• No passwords, form contents or payment fields.
• No email addresses, plan or billing details from the sites you visit.
• No cookies, from any site.
• Outside the 13 site profiles, no page text and no page HTML. One small script
  does run on every site you visit; it reports scroll depth and the page's meta
  description when asked, and stores nothing.
• Nothing from browser-internal pages — chrome://, about:, file://, data:,
  blob:, javascript: and extension URLs are filtered out of every capture path.
• Nothing at all while you are signed out.

CONTROLS
• Independent switches for history, bookmarks, downloads, background auto-sync,
  and "Include financial accounts".
• Ignore lists — add a hostname to exclude a site, or a full URL to exclude one
  page. The rules are applied at the upload step, so they cover every kind of
  capture: page visits, history backfill, site profiles, bookmarks, downloads
  and saved highlights alike.
• Sign out to stop all capture; remove the extension to clear its local state.

HOW IT BEHAVES
• Nothing is lost because your server was offline. Failed captures go to a
  local queue — 500 items, 5 attempts each, so one bad record cannot wedge the
  rest — and are retried at the start of the next sync, automatic or manual.
• Background work runs on browser alarms rather than timers, so scheduled work
  survives the browser suspending the extension.
• A readable sync log keeps the last 50 runs with time range, entries
  processed, entries uploaded, status, error and duration. Export it as JSON or
  clear it whenever you like.
• Adding a supported site is a JSON profile, not a code change, and the
  manifest's site list is generated from that registry — so the 13 sites named
  here are exactly the sites this extension can reach.

WHAT YOU NEED
• A Companion Memory server you can reach, and a Companion account to sign in
  with. This is not a hosted service — without your own server there is nowhere
  for the backup to go, and the extension uploads nothing.
• Chrome, Firefox and Safari, plus Edge, Brave, Opera and DuckDuckGo.
```

### What's new (1.4.0)

```
NEW SITES — eight profiles went live this cycle, bringing the total to 13.
Five were registered in earlier builds but unreachable until now.
• Max, Paramount+ and Prime Video (also amazon.com/gp/video).
• CNN and WSJ — headlines, summaries, authors, sections. WSJ also reads the
  market quotes shown on those pages.
• Quora — questions, answers, follows.
• Airbnb — trips, wish lists, and hosting listings including earnings.
• Robinhood — portfolio, order history and watch list. OFF by default, and
  named here deliberately: it is the most sensitive thing the extension reads.

NEW: "INCLUDE FINANCIAL ACCOUNTS" OPT-IN
• One checkbox, off by default, gating the Robinhood profile. The gate runs
  before any DOM read, so with it off nothing on your brokerage page is read.

SIGN-IN REBUILT ON OPENID CONNECT
• Authorization-code + PKCE through Companion Portal in a browser-managed
  window, replacing the old cookie-and-CSRF login. Your password never reaches
  the extension.
• The cookies permission was removed from the manifest entirely. The identity
  permission was added for the auth window.
• Zero-configuration setup: the extension asks your Portal where your Memory
  server runs and points itself there.

PRIVACY FIXES
• Ignore lists now cover every kind of capture. They previously applied only to
  live page visits and history backfill, so site profiles, bookmarks, downloads
  and saved highlights slipped past them.
• Turning History off now also stops the live page-visit feed, not just the
  backfill.
• The Disney+ and Hulu profiles no longer read account email, plan type,
  billing date, or whether a profile is a kids profile.

ALSO
• Durable capture queue (500 items, 5 attempts) so nothing is lost when your
  server is unreachable; it drains at the start of every sync.
• Background scheduling moved onto browser alarms, so scheduled work survives
  Chrome MV3 service-worker suspension.
• Highlight capture: select a passage, right-click, save it as a searchable
  annotation.
```

---

## Chrome Web Store

**Assets** (`store-assets/`)
- Screenshots 1280×800: `shared/screenshot-1..5.png` (min 1, max 5 — submit all five)
- Small promo tile 440×280: `chrome/promo-tile-440x280.png`
- Marquee promo 1400×560: `chrome/promo-marquee-1400x560.png`
- Store icon 128×128: `public/icon/128.png` (in the package)

**Single purpose statement**
> Archive the signed-in user's own browsing activity (history, bookmarks,
> downloads, highlights, and structured items from supported sites) to a
> self-hosted Companion Memory server.

**Permission justifications** — one row per permission in the manifest. Verified
against `wxt.config.ts`; do not add rows for permissions the build does not
request.

| Permission | Justification |
|------------|---------------|
| `history` | Read the user's browsing history to sync it to their own server (core feature). |
| `bookmarks` | Read/observe bookmarks when bookmark sync is enabled. |
| `downloads` | Read/observe downloads when download sync is enabled. |
| `identity` | Run the OIDC sign-in window via `chrome.identity.launchWebAuthFlow` and obtain the extension's redirect URL. This replaced the previous cookie-based login. |
| `tabs` | Read the URL/title of the tab a navigation occurred in, to record the visit. |
| `webNavigation` | Detect navigations to know when a page visit occurred. |
| `storage` | Persist settings, the "already synced" bookkeeping, and the offline retry queue locally. |
| `contextMenus` | Add the right-click "save highlight" item. |
| `alarms` | Schedule background sync without keeping the service worker awake. |
| Host access — `*.companionintelligence.com`, `*.companionintel.com`, `*.ci.computer` | Reach the user's Companion Portal (sign-in, server discovery) and their Memory server (uploads). |
| Host access — `<all_urls>` content script | A lightweight script reports scroll depth and the page `<meta name="description">` when the extension asks. It stores nothing and does not read page text or HTML. Highlight capture is handled by the background script from the context-menu event, not by this script. |
| Host access — 14 site-profile match patterns | The supported-site profiles listed in the description. Each runs only on its own domain. |

**Data-use disclosures (Chrome privacy tab)** — declare **all** of:

| Category | Why it applies |
|---|---|
| Web history | Page visits, titles, visit times. |
| User activity | Bookmarks, downloads, scroll depth. |
| Website content | Saved highlights, page meta descriptions, structured items from site profiles. |
| **Financial and payment information** | The Robinhood profile's holdings and order history, and WSJ market quotes. Required even though the Robinhood profile is opt-in — the capability ships. |

Declare: data is **not sold**, **not used for purposes unrelated to the single
purpose**, and **not transferred to third parties** (it goes to the user's own
server; the Portal receives sign-in identity only). Link the privacy policy URL.

---

## Firefox Add-ons (AMO)

**Assets**: `store-assets/shared/screenshot-1..5.png` (1280×800).
Icon 128 ships in the package.

**Required source upload:** AMO requires a reviewable source archive because the
build uses a bundler. `yarn zip:firefox` emits both the add-on zip and a
`*-sources.zip`; upload the sources zip and point reviewers to `DEVELOPMENT.md`
for the build (`corepack enable && yarn install && yarn build:firefox`). Code is
intentionally **not minified** (`wxt.config.ts` → `vite.build.minify: false`).

**Data collection (declared in the manifest, prompted at install):**
- Required: `bookmarksInfo`, `websiteActivity`, `websiteContent`, `browsingActivity`
- Optional: `financialAndPaymentInfo` — declared optional because the Robinhood
  profile does not run until the user enables "Include financial accounts",
  which matches Firefox's separate opt-in consent for optional categories.

**Permission justifications:** same table as Chrome above.

---

## Apple App Store (Safari)

Safari ships as a macOS/iOS app that wraps the extension — this requires an
Xcode container project (not in this repo; see `PUBLISHING.md`).

**Assets**
- App icon 1024×1024 (opaque, no alpha): `safari/app-icon-1024.png`
- Screenshots 1280×800: `shared/screenshot-1..5.png`

**Privacy manifest (`PrivacyInfo.xcprivacy`, iOS 17+):**
- `NSPrivacyTracking` = `false`
- `NSPrivacyTrackingDomains` = [] (no cross-user tracking)
- `NSPrivacyCollectedDataTypes` = Browsing History, User Content (highlights and
  site-profile items), **Financial Info** (Robinhood holdings/orders, WSJ
  quotes) — collected, not linked to identity for tracking, not used for tracking
- `NSPrivacyAccessedAPITypes` = declare reasons for any required-reason APIs used
  by the wrapper (e.g. UserDefaults `CA92.1`)

**App Store privacy answers:** Data Types = Browsing History, User Content,
**Financial Info**; Use = App Functionality; **not** linked to the user for
tracking; **not** used for tracking. Privacy policy URL required.

---

## Asset inventory

| File | Size | Used for |
|------|------|----------|
| `shared/demo.gif` | 420×~1300 | README + listing animation |
| `shared/hero.png` | 1280×640 | README hero / social card |
| `shared/screenshot-1..5.png` | 1280×800 | Screenshots (Chrome / AMO / App Store) |
| `chrome/promo-tile-440x280.png` | 440×280 | Chrome small promo tile |
| `chrome/promo-marquee-1400x560.png` | 1400×560 | Chrome marquee |
| `safari/app-icon-1024.png` | 1024×1024 | App Store icon |

All raster assets are regenerated from vector source with
`store-assets/render.sh`, which now also copies the results into the committed
`shared/`, `chrome/` and `safari/` directories — that copy used to be a manual
step people forgot. Edit `store-assets/src/*.mjs` and re-run.

The popup mock-ups in those images are generated from the real `App.tsx` layout
and design tokens, so they must be regenerated whenever the popup changes.
