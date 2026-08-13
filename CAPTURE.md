# What the extension captures

> **Private & Confidential — Property of Lifescope Inc. Do not distribute.**

This is the honest, complete list of what Companion Intelligence reads from your
browser and sends to **your own** Memory server. Nothing here goes to Lifescope,
to an analytics service, or to any third party. See [PRIVACY.md](PRIVACY.md) for
the formal policy.

Two rules govern everything below:

1. **Your ignore list always wins.** Any site or page you add under *Ignored
   Pages and Sites* is never captured, by any mechanism. The rules are applied
   at the upload transport, so every capture path — visits, highlights, scrapes,
   bookmarks, downloads — is covered by construction.
2. **Nothing is captured before you sign in.** Capture requires a valid
   Companion session and a configured Memory server.

---

## 1. Browser data

Captured from the browser's own APIs. Each is an independent switch in the
popup.

| Source | Default | What is captured | Lands in |
|---|---|---|---|
| **History** | On | URL, page title, visit time, time spent, scroll depth, meta description | `browser_activity` |
| **Bookmarks** | Off | URL, title, date added | `content` (`bookmark`) |
| **Downloads** | Off | URL, filename, size, state, start time | `browser_activity` |
| **Highlights** | On | The text you select, plus the page it came from | `content` (`highlight`) |

**History** covers both a live feed (pages captured as you browse) and backfill
(a one-off import of the last *N* days from the browser's own history store).
Backfill records the *original* visit time, not the import time, so a Wednesday
import does not rewrite Monday's browsing as Wednesday's.

**Highlights** are explicit: select text, right-click, *Save highlight to
Companion Intelligence*. Nothing is captured from a page merely because you
selected text on it.

### Never captured

- Passwords, form contents, and payment fields
- Page HTML or full page text (only the title and meta description)
- Cookies, local storage, or session tokens belonging to the sites you visit
- Anything on an ignored site or page
- Anything at all while signed out

---

## 2. Site profiles ("scrapes")

Some of the most valuable parts of your history are locked inside individual
services — what you have actually watched, read, or booked. A **site profile**
is a small declarative recipe that reads *your own* data from *your own* logged-in
account on a specific site and files it into Memory.

A profile only runs when **all** of these hold:

- You are on one of the profile's declared pages (e.g. Netflix's *viewing
  activity* page, not every Netflix page)
- You are signed in to Companion Intelligence
- The site is not on your ignore list
- For sensitive profiles, you have opted in (see below)

Each profile classifies what it finds, so a watched title arrives in Memory as
`entertainment_preferences` rather than as an anonymous page view — which is
what makes it searchable and useful to your assistant later.

### Shipping today (13 profiles)

| Category | Sites | Captured as |
|---|---|---|
| **Streaming** | Netflix, Hulu, Disney+, Max, Paramount+, Prime Video | `entertainment_preferences` — viewing history, watchlist, recommendations |
| **Accounts** | Disney+, Hulu | `account_data` — profile names, account info |
| **News & reading** | CNN, WSJ, Slashdot | `news_consumption`, `browsing_history` — articles read. WSJ's markets section also files as `financial_interests` |
| **Work** | GitHub | `professional_activity` — repos, issues, pull requests, commits |
| **Social** | Quora | `social_activity`, `social_connections` — questions, answers, follows |
| **Travel** | Airbnb | `travel_history`, `travel_preferences`, `business_activity` — trips, wishlist, hosting |
| **Finance** ⚠️ | Robinhood | `financial_data`, `financial_interests` — portfolio, orders, watchlist |

### Sensitive profiles are opt-in

Profiles marked ⚠️ read data most people would not expect an extension to touch.
They are **off by default** and do nothing until you tick **Include financial
accounts** in the popup. The check happens *before* reading the page — the
extension does not read your brokerage data and then discard it, it does not read
it at all.

**The gate is about *account* data, not the word "financial".** Robinhood is the
only gated profile: it reads your holdings and order history. WSJ's markets
section also produces `financial_interests`, but that is the publicly-listed
market data on a news page — the same class of thing as any other article you
read — so it is not gated. Nothing reads a financial *account* of yours without
the opt-in.

Any future profile touching balances, holdings,
health records, or private messages will be gated the same way.

### What we plan to add, and why

The extension's job is **the data you cannot get any other way**. If a service
offers a good bulk export, the right tool is
[CI-Import-Tools](https://github.com/companionintelligence/CI-Import-Tools), not
a scraper — an export is more complete, more stable, and does not break when the
site redesigns. So the roadmap deliberately targets services whose export is
**missing, crippled, or paywalled**, plus the freshness a one-off export can't
give you.

By that standard, several obvious-looking targets are explicitly *not* worth
scraping: **Google/YouTube** (Takeout is comprehensive), **Spotify** (the
extended-streaming-history export beats anything scrapable), **Strava**,
**Goodreads**, **Steam**, **X**, and **Uber** all have solid exports. Those
belong in the importer.

| Priority | Target | Why it, and not an export |
|---|---|---|
| 1 | **Kindle highlights** (`read.amazon.com/notebook`) | An export exists but publishers cap it at 10–20% of a book. Highlights are the densest, most self-curated material a reader produces. |
| 2 | **Travel** — Booking.com, Expedia, then airlines | **No export exists anywhere in this category**, and Google removed Timeline's export path. A dated location trail is the backbone of episodic memory. |
| 3 | **Amazon orders** | Hybrid: the CSV export handles history, the extension captures *new* orders plus the product context the CSV lacks. |
| 4 | **Audible** | No export at all. "What I finished, and when" is otherwise unrecoverable. |
| 5 | **Reddit saved + comments** (`old.reddit.com`) | The official export is lossy exactly here — bare IDs and permalinks, no titles or bodies. |
| 6 | **Letterboxd** | Diary entries are dated, rated and reviewed — far richer than the undated title lists the streaming profiles yield. Export is Pro-only. |
| 7 | **Reservations** — OpenTable, Resy | No consumer export. Dining is a strong episodic anchor. |
| 8 | **Events** — Eventbrite, then Ticketmaster | No export; Eventbrite has already purged pre-2022 consumer data. |
| 9 | **Food** — Instacart, DoorDash | Item-level grocery history is a diet and household signal nothing else captures. |
| 10 | **Learning** — Coursera, Udemy, edX | No consumer-side export exists; complements the GitHub profile. |

Two prerequisites before most of that is buildable, because the current profile
schema cannot express it:

- **Pagination / load-more.** Amazon orders, Letterboxd diary, Reddit saved and
  every itinerary list are paginated or infinite-scroll. `dataSelectors` reads
  one rendered page and stops.
- **A `json` field type.** Modern SPAs ship their state in `__NEXT_DATA__` or
  `window.__INITIAL_STATE__`. Reading that is dramatically more stable than CSS
  selectors and is the only sane approach for Instacart/DoorDash-class sites.

### Deliberately out of scope

Some data is valuable and still not ours to take:

- **LinkedIn** — its terms explicitly prohibit browser extensions that scrape,
  enforcement is aggressive, and the penalty lands on *the user's* account. It
  also has a perfectly good export.
- **Meta (Facebook/Instagram)** — automated collection prohibited, litigious,
  good export available.
- **Banks and credit cards** — highest value on the list, but anti-automation
  systems lock accounts and the liability is not appropriate for a consumer
  extension. Use CSV/OFX import instead.
- **Health portals** — HIPAA-adjacent; Blue Button and EHI exports already exist.
- **Message stores** (DMs, Discord, Slack, WhatsApp Web) — these contain *other
  people's* words. Capturing them ingests third-party data from people who never
  consented. This is the firmest line here.
- **Employer-owned systems** (corporate Jira, Linear, Slack, Notion) — copying
  work data into a personal server can breach an employment agreement.

### Known weak spots in what we already ship

- **CNN, WSJ, Slashdot** capture "articles the user read", which the generic
  history capture already records. Their only real addition is article text,
  which the highlight pipeline serves better. This category is frozen rather
  than extended.
- **Six streaming profiles** yield mostly undated title lists. Letterboxd
  (dated, rated, reviewed) is worth more than a seventh streaming service.
- **The binary `sensitive` flag will not scale.** Past ~20 profiles this needs
  per-category consent (`financial`, `health`, `location`, `purchases`), which
  is also what Chrome's Limited Use policy and Firefox's install-time data
  disclosure expect.

### Adding a profile

Profiles are JSON, one file per site in [`src/scrapeProfiles/`](src/scrapeProfiles/),
registered in [`src/scrape/profiles.ts`](src/scrape/profiles.ts). Start from
[`template.json`](src/scrapeProfiles/template.json). A profile declares:

- `matchPatterns` — where the content script may run (this drives the manifest)
- `targetUrl` — the specific pages the selectors were written for
- `dataSelectors` — what to read, and a `personalDataType` saying what it *is*
- `sensitive` — whether it requires the opt-in above

Because `matchPatterns` lives in the profile, the manifest and the registry
cannot drift apart. (They previously did: five profiles were registered but
absent from the content script's hand-maintained match list, so they silently
never ran.)

Profiles are **schema-validated at load**, so a misspelled key, an unknown field
`type`, or a selector missing its `personalDataType` fails immediately and by
name rather than silently capturing nothing.

**A fixture is required.** Every profile ships with a saved copy of a page it
runs on plus the extraction expected from it
([`src/scrapeProfiles/__fixtures__/`](src/scrapeProfiles/__fixtures__/)), and the
test suite fails if one is missing. `yarn scrape:check <domain>` runs a profile
against its fixture and reports, per selector, how many containers matched and
how many items were produced — which is what distinguishes "this page is empty"
from "this site was redesigned and every field selector now misses".

Note what a fixture does *not* prove: one written by reading the profile's own
selectors is circular, and only confirms the profile agrees with itself. That is
why fixtures record a `provenance` of `captured` or `synthetic`. Prefer captured.

---

## 3. Where it goes

Captures upload to your Memory server's typed ingest routes:

- `POST <your-server>/api/v1/browser-activity` — visits and downloads
- `POST <your-server>/api/v1/contents` — bookmarks, highlights, and scraped items
- `POST <your-server>/api/v1/ingest/finish` — makes the batch searchable

Authentication is a CI-Portal OIDC login (Authorization Code + PKCE). The
extension sends a signed, short-lived identity token; it never handles or stores
a password.

Every record carries `source_system: ci-browser-extension` and a stable
`source_id`, so re-uploading the same item updates rather than duplicates it.

If an upload fails — you are offline, or your server is down — captures are
queued locally and retried on the next sync rather than being dropped.
