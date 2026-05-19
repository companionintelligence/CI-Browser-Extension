# CI Browser Extension — Planning & Gap Analysis

Companion to [architecture.MD](architecture.MD). This document inventories outstanding work — open issues, open PRs, unmerged feature branches, and architectural debt — and proposes a prioritized modernization plan.

## 1. Gap Analysis Snapshot

### 1.1 Open GitHub Issues

| # | Title                                  | Status of work               |
|---|----------------------------------------|------------------------------|
| 13 | Add camera capture shortcut            | PR [#14](https://github.com/companionintelligence/CI-Browser-Extension/pull/14) open — expanded into webcam + desktop + OAuth + scheduled capture |
| 15 | Add domain scrape tool                 | Foundation merged (PRs #16, partly #30); core abstraction still needs land |
| 25 | Save Highlighted Content to CI Server  | PR [#26](https://github.com/companionintelligence/CI-Browser-Extension/pull/26) open — requires CI-Server `/api/content` |
| 27 | [EPIC] Site Scrape Template List       | PR [#30](https://github.com/companionintelligence/CI-Browser-Extension/pull/30) open — adds 11 profiles + ProfileManager, ~100 still to go |

### 1.2 Open Pull Requests Not Yet Merged

| # | Branch | What it does | Why it's open |
|---|--------|--------------|---------------|
| 14 | `copilot/fix-13` | Webcam + desktop capture, OAuth flow, scheduled alarms | Scope ballooned past the original ticket; needs split + CI-Server OAuth contract |
| 26 | `copilot/fix-25` | Highlight-to-save selection UI | Awaits `/api/content` endpoint on CI-Server |
| 30 | `copilot/fix-27` | ProfileManager + 11 scrape profiles + templating | Adds `locationService.ts`, `profileTemplateGenerator.ts`; conflicts with recent UI consolidation |
| 32 | `feat/copy-and-style` | Terminology change "blacklist" → "ignored" | Already partly merged in `master`; verify before close |
| 36 | `move-domain-selector` | Domain selector copied into popup | Superseded by PR #38 popup consolidation? — verify |
| 37 | `refactor/align-device-service` | `last_seen` updates and better matching | Depends on a matching CI-Server change; ready when server ships |

### 1.3 Architectural Debt (not currently tracked in issues)

| Area | Debt |
|------|------|
| `background.ts` | 2,271 LOC single file. No module boundaries between auth / sync / scrape / device. |
| Auth polling | `setInterval(checkAuthenticationState, 1000)` runs forever in the service worker. MV3 service workers can be suspended — this fights the platform. |
| Auto-sync | `setInterval` instead of `chrome.alarms` — won't fire after MV3 service-worker suspension. |
| Server URL | Hardcoded references to `dev.companionintelligence.com` in README and code paths. No UI affordance to pick between `dev`, `alpha`, prod, or self-hosted. |
| IndexedDB | [src/indexeddb.ts](src/indexeddb.ts) defines `surfing_records` and `location_records` but no sync path reads or writes them. Dead code from PR #8. |
| Form / scroll buffers | [src/entrypoints/content.ts](src/entrypoints/content.ts) writes `formSubmissions` and `scrollDepthData` arrays to `storage.local` with 1000-row caps but no upload path. |
| Scrape profiles | Hardcoded `import` statements in [src/domainScraper.ts](src/domainScraper.ts); not dynamic; not category-organized; manifest `host_permissions` must be edited per site. |
| Tests | Coverage limited to [src/store/ciStateSlice.test.ts](src/store/ciStateSlice.test.ts) and [src/utils.test.ts](src/utils.test.ts). No background-script tests; no E2E. |
| `host_permissions` | Locked to a small allowlist; sites added in PR #30 (Max, Prime, Paramount, Robinhood, CNN, WSJ, Quora, Airbnb) aren't represented. |
| Logging | Pervasive `console.log` left in shipping code (see commit `137dabc` for one round of cleanup). Needs a leveled logger gated by build mode. |
| Error handling | API errors silently swallowed (`continue without …`). User has no visibility into recurring failures beyond toast strings. |
| Security | CSRF token read from cookie and re-sent in header — correct pattern, but `result.find(...)?.value` paths can throw if cookie is missing (line ~1888). |
| Browser-Use | Roadmap item with no scaffolding; bidirectional messaging from server to extension does not exist. |
| Manifest content | Streaming `host_permissions` may trip Chrome Web Store review (broad host access on extra sites) — needs justification doc. |

## 2. Strategic Direction

The medium-term arc of this codebase, derived from the README roadmap and open PRs, is to evolve from a **history scraper** into a **bidirectional companion agent** that:

1. Captures everything (history, bookmarks, downloads, scroll, forms, highlights, media — also **streaming history** that has no API).
2. Persists locally first (IndexedDB) and syncs reliably even across SW restarts.
3. Receives commands from the CI-Server to drive the browser ("Browser-Use" integration).
4. Plugs in arbitrary sites via JSON scrape profiles without code edits or manifest changes.

The plan below is sequenced so that prerequisites land before the harder integrations.

## 3. Recommended Roadmap

### Phase 1 — Stabilize the foundation (1–2 sprints)

These unblock everything else.

1. **Modularize [background.ts](src/entrypoints/background.ts)**
   Split into: `auth/`, `device/`, `sync/{history,bookmarks,downloads}.ts`, `scrape/`, `messaging.ts`, and a thin `background.ts` entrypoint that wires them. Target ≤200 LOC per file.
2. **Replace timers with `chrome.alarms`**
   Auto-sync, periodic auth check, and token-refresh prechecks should be alarms so they survive MV3 service-worker suspension.
3. **Event-drive auth instead of polling**
   Use `cookies.onChanged.addListener` filtered to `serverDomain`. Keep a single fallback alarm at 5-minute cadence.
4. **Configurable `serverDomain`**
   First-run setup screen offers `alpha.companionintel.com`, `dev.companionintelligence.com`, or "Custom". Validate via a lightweight `/api/health` check before saving. Remove hardcoded references in README.
5. **Land PR #37 (device service alignment)** once CI-Server ships the matching refactor.
6. **Introduce a logger** (`src/lib/log.ts`) with `debug/info/warn/error` levels; gate `debug` on `import.meta.env.DEV`.
7. **Bring test coverage up**
   At minimum, unit tests around: blacklist matching, `convertToBrowserActivity`, sync slicing, JWT-expiry logic, cookie-derived auth state. Add a smoke test that loads the built MV3 zip in Playwright.

### Phase 2 — Land in-flight features (1 sprint)

1. **PR #30 — ProfileManager**: rebase onto Phase 1's modular layout, expose profiles dynamically, and either (a) declare a broad `optional_host_permissions` and request per-site at runtime, or (b) generate `host_permissions` from the profile manifest at build time.
2. **PR #26 — Highlight save**: coordinate with CI-Server `/api/content` rollout. Until then, ship behind a feature flag.
3. **PR #14 — Webcam/desktop capture**: split into two PRs — (a) OAuth flow used by all features, (b) capture itself. Confirm CI-Server has a media-upload endpoint.

### Phase 3 — Reliability and local-first sync (1–2 sprints)

1. **Wire IndexedDB as the source of truth**: every captured event is written to `surfing_records` immediately; the sync loop drains unsynced rows. This makes us robust to offline use, SW restarts, and bursty events.
2. **Adopt a single outbox abstraction** for history, bookmarks, downloads, form submits, scroll depth, highlights, and scrapes. One sync loop, one retry policy, one telemetry surface.
3. **Sync form submissions and scroll-depth buffers** through the outbox — they currently accumulate locally and are never uploaded.
4. **Backoff and resumability**: exponential backoff on 5xx, paginated cursors so a 100k-row backfill doesn't redo work on a crash.

### Phase 4 — Site coverage (continuous)

1. **Finish the EPIC #27 site list**: streaming (Peacock, Crunchyroll, Sling, Apple TV, Tubi, Vimeo, Dailymotion), social (TikTok, Reddit, LinkedIn), news (WaPo, Axios, Politico), finance (banks, Venmo), health (23andMe, Ancestry).
2. **Profile authoring workflow**: a `npm run new-profile <domain>` scaffold + a markdown-rendered profile gallery + a contributor doc.
3. **In-extension test harness for profiles**: open `test-multi-domain-scraper.html` is already a primitive of this; make it first-class.

### Phase 5 — Bidirectional / Browser-Use (research → MVP)

1. **Server → Extension command channel**
   Options: long-polling, SSE over the existing API, or a WebSocket on the CI-Server. SSE is the cheapest fit for MV3.
2. **Command surface**: `navigate`, `click`, `type`, `extract`, `screenshot`, `wait_for`. Mirror Playwright/Browser-Use vocabulary.
3. **Permission model**: every command requires user opt-in per origin; default deny.
4. **Replay / audit log** of every server-issued command stored in IndexedDB and visible from the popup.

### Phase 6 — Distribution

1. **Chrome Web Store / Edge / Firefox AMO / Safari** submissions. Privacy review packet (data-collection declaration is already in `wxt.config.ts` for Firefox — formalize).
2. **CI/CD release pipeline**: tagged builds → `prepare:store` artifacts → GitHub Release → manual upload (until store APIs are wired). Track `version` and `changelog.md` in repo.
3. **Auto-update channel** for self-hosted users who side-load.

## 4. Cross-Cutting Concerns

- **Privacy posture**: Document exactly what's sent, when, and how the user can purge it (`browser.storage.local.clear()` + server-side delete). Surface this in the popup.
- **Sensitive-content detection**: `contains_sensitive: false` is hardcoded on every event. Add a heuristic (banking domains, password-protected forms, incognito tabs).
- **Incognito**: `is_incognito` is also hardcoded `false`. Use `browser.extension.inIncognitoContext` and a per-tab check.
- **i18n**: All UI strings are English-only and inline. Move to `messages.json` (WXT supports it).
- **Accessibility**: Popup uses shadcn but no audit yet; verify keyboard navigation and screen-reader labeling.
- **Observability**: Send opt-in extension telemetry to the CI-Server (latency, sync sizes, failure counts) so the user (and we) can debug their own flows.

## 5. Suggested First-PR Slice

If picking a single concrete piece to start with, do **Phase 1.1 + 1.2 + 1.6** together:

- Carve `background.ts` into modules.
- Convert `setInterval` to `chrome.alarms`.
- Drop in the logger.

This is a refactor with no behavior change, unblocks the rest of the roadmap, and produces a `background.ts` small enough that the open feature PRs can be rebased without merge-conflict pain.

## 6. Tracking

Each Phase 1–3 item should become a GitHub issue with a `roadmap` label and link back to this file. Phase 4 items belong under the existing EPIC #27. Phase 5 deserves its own EPIC once the CI-Server side of Browser-Use is scoped.

## 7. Detailed sub-plans

Each major area is expanded into its own document with problem statement, proposed approach, risks, and acceptance criteria. See [planning/00-index.md](planning/00-index.md) for the full index.

**Phase 1 — Stabilize the foundation**
- [01 — Background script modularization](planning/01-background-modularization.md) — break the 2.3k-line `background.ts` into testable modules.
- [02 — MV3 lifecycle: alarms and event-driven auth](planning/02-mv3-lifecycle.md) — replace `setInterval` with `chrome.alarms`; drive auth from `cookies.onChanged`.
- [03 — Configurable server URL & first-run setup](planning/03-configurable-server.md) — env switcher, health probe, remove hardcoded domains.
- [04 — Logging and observability](planning/04-logging-observability.md) — structured logger, redaction, in-popup diagnostics.
- [05 — Testing strategy](planning/05-testing.md) — three-layer test pyramid, browser-API stub, Playwright E2E.

**Phase 2 — Land in-flight features**
- [07 — Scrape profile system](planning/07-scrape-profiles.md) — rebase PR #30, dynamic profile loading, DSL v2 with `prerequisites`.
- [08 — Highlight-to-save](planning/08-highlight-capture.md) — finish PR #26 with Shadow-DOM UI and outbox integration.
- [09 — Media capture + OAuth split](planning/09-media-capture-oauth.md) — split PR #14 into screenshot / webcam / OAuth / scheduled.
- [10 — Device service alignment](planning/10-device-service.md) — land PR #37, add `last_seen` heartbeat, fix duplicate-device matching.

**Phase 3 — Reliability**
- [06 — Local-first sync via IndexedDB outbox](planning/06-local-first-sync.md) — single outbox abstraction, kills the dead IndexedDB layer.

**Phase 5 — Bidirectional**
- [11 — Browser-Use bidirectional command channel](planning/11-browser-use.md) — SSE transport, command vocabulary, consent model, audit log.

**Cross-cutting**
- [12 — Privacy, incognito, sensitive-content detection](planning/12-privacy.md) — incognito skip, sensitive-host allowlist, purge UX.
- [13 — Distribution & release pipeline](planning/13-distribution.md) — Changesets, CI build matrix, store submission automation.
- [14 — Internationalization & accessibility](planning/14-i18n-a11y.md) — `_locales/`, axe-Playwright, WCAG AA targets.

**OAuth & UI/UX iteration**
- [15 — OAuth integration with CI-Server cloud proxy](planning/15-oauth-integration.md) — Path A (outbound provider connections via `CloudOAuthProxyService` from CI-Server PRs #1295/#1407) + Path B (extension→server OAuth replacing cookie+JWT, evolving PR #14).
- [16 — UI/UX testing & concrete findings](planning/16-ui-ux-testing.md) — live build/lint/test pass results (24 TS errors, 1 failing test, 1.05 MB popup), popup-specific punch list, component/axe/visual test plan.

**Branch audit & re-implementation**
- [17 — Branch & PR audit](planning/17-branch-audit.md) — per-branch contributions, landability ratings, recommended landing order. Steps 1–6 of that order have landed on this branch.
