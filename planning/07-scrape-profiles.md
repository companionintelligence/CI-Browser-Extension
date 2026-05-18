# 07 — Scrape Profile System (PR #30, EPIC #27, Issue #15)

## Problem

Scrape profiles are how the extension captures personal data from sites that have no public API — viewing history on Netflix/Hulu/Disney+ today, plus the long list in EPIC #27 (Max, Prime Video, Paramount+, Peacock, Crunchyroll, TikTok, Quora, Robinhood, CNN, WSJ, Airbnb, banks, etc.).

Current shape ([src/domainScraper.ts](../src/domainScraper.ts)):

```ts
import netflixProfileData from "./scrapeProfiles/netflix.json";
import huluProfileData    from "./scrapeProfiles/hulu.json";
// ...one static import per site...
this.profiles["netflix.com"] = netflixProfileData as ScrapeProfile;
this.profiles["hulu.com"]    = huluProfileData    as ScrapeProfile;
// ...etc...
```

This pattern doesn't scale:

- Every new profile requires a code change + new manifest `host_permissions` entry + a release.
- `wxt.config.ts` lists only `netflix.com`, `hulu.com`, `disneyplus.com` under `host_permissions`. The Slashdot and GitHub profiles in the directory aren't even reachable.
- PR #30 introduces a `ProfileManager` that loads profiles by category and adds 8 new sites, but conflicts with the recent popup-consolidation merges and hasn't landed.
- The `ScrapeProfile` DSL ([src/domainScraper.ts:1](../src/domainScraper.ts)) is fixed: CSS selectors only, no waiting, no pagination, no infinite scroll. Most modern SPAs (Max, Prime, Netflix list pages) load content lazily.
- No validation step. A typo in a profile JSON ships silently and produces empty results.

## Goals

- Add a new site by writing one JSON file. No code, no manifest edit, no release.
- Profile DSL handles the common SPA quirks: wait-for-selector, scroll-to-bottom, paginate, click-to-expand.
- Profile authoring is testable in isolation — feed it an HTML fixture, assert the extracted records.
- Site-permission acquisition is on-demand and user-visible.

## Approach

### 1. ProfileManager (adopt PR #30, evolved)

Replace `domainScraper.ts`'s static imports with `import.meta.glob` from Vite:

```ts
const PROFILE_MODULES = import.meta.glob("../scrapeProfiles/**/*.json", { eager: true });
export const profiles = Object.fromEntries(
  Object.entries(PROFILE_MODULES).map(([path, mod]) => {
    const profile = (mod as any).default as ScrapeProfile;
    return [profile.domain, profile];
  }),
);
```

Adding a JSON file under `src/scrapeProfiles/<category>/<site>.json` automatically registers it. Categories from PR #30 (streaming, social-media, news, travel, finance, etc.) become directory structure only.

### 2. Profile DSL v2

Backwards-compatible with v1. Adds:

```jsonc
{
  "version": 2,
  "domain": "max.com",
  "name": "HBO Max",
  "targetUrl": ["https://play.max.com/profile/history"],
  "prerequisites": {
    "waitForSelector": "[data-testid='history-row']",
    "scroll": { "until": "stable", "maxIterations": 50, "stepPx": 800 },
    "click": [{ "selector": "button[aria-label='Load more']", "untilDisabled": true }]
  },
  "dataSelectors": {
    "viewingHistory": {
      "container": "[data-testid='history-row']",
      "fields": {
        "title":  { "selector": "[data-testid='title']", "type": "text" },
        "watchedAt": { "selector": "time", "type": "attribute", "attribute": "datetime" },
        "thumbnail": { "selector": "img", "type": "attribute", "attribute": "src" }
      }
    }
  },
  "dataTypes": [{ "name": "viewingHistory", "description": "...", "personalDataType": "entertainment_preferences" }],
  "ttl": { "seconds": 86400 }
}
```

`prerequisites` is the killer feature — `waitForSelector`, `scroll until stable`, `click load-more until disabled`. Each is a small, validated operation that runs in the content script before extraction.

### 3. Permission model

Two-tier:

- **Built-in profiles** (curated, shipped with the extension) — `host_permissions` generated at build time from the profile list. The build script reads every profile under `src/scrapeProfiles/**/*.json` and emits matching origin patterns.

```ts
// scripts/generate-host-permissions.ts
const origins = profilePaths
  .map(p => JSON.parse(readFileSync(p, "utf8")).domain)
  .map(d => `*://*.${d}/*`);
```

  Plugged into `wxt.config.ts` so adding a profile JSON automatically appears in the manifest.

- **User-installed profiles** (future) — fetched at runtime from a community registry, requested with `permissions.request({ origins })`. Out of scope for this round but the manager should be ready for it.

### 4. Content script wiring

Today's [domainScraper.content.ts](../src/entrypoints/domainScraper.content.ts) is auto-injected by manifest match patterns. With the dynamic profile list:

- Generate `content_scripts.matches` from the same profile list.
- The injected script reads the current `location.hostname`, looks up the profile, executes `prerequisites` in sequence, extracts via selectors, and `runtime.sendMessage("DOMAIN_SCRAPE_DATA", { ... })`.

### 5. Validation + tests

- Add `ProfileSchema` (zod or io-ts) validated at load time. Invalid profiles log `logger.error("profile.invalid", { domain, errors })` and are skipped.
- Per-profile test fixture: `src/scrapeProfiles/streaming/__tests__/netflix.fixture.html` + `netflix.test.ts` running the profile against the fixture and snapshotting output.
- CI gate: every profile JSON must have at least one fixture-based test.

### 6. Targeting & dedup

Scraped rows go through the outbox ([06](06-local-first-sync.md)) with `kind: "scrape"` and a stable dedup key (`scrape:${domain}:${naturalKey}`), so re-running the scrape on the same page doesn't re-upload.

### 7. Backoff per domain

The current code re-runs every page load. Add per-domain TTL (`profile.ttl.seconds`) so a Netflix scrape only re-runs once a day unless the user clicks "Refresh now."

## Migration / sequencing

1. **Rebase PR #30 onto master** with the popup-consolidation conflict resolved. Land it minus the new `locationService.ts` (different concern).
2. Introduce `import.meta.glob` replacement for the static imports.
3. Wire the build-time `host_permissions` generator.
4. Add Profile DSL v2 fields and an evaluator for the new `prerequisites` block. Existing v1 profiles keep working.
5. Backfill the remaining EPIC #27 sites one PR per category: streaming, social, news, finance, etc.
6. Add the ProfileSchema validator + per-profile tests.

## Risks & open questions

- **Selector rot** — sites change DOM frequently. Need a monitoring story: emit `logger.warn("profile.zeroResults", { domain })` when a scrape returns nothing, and aggregate in the Diagnostics tab.
- **ToS** — scraping personal data the *user already has access to* is generally fine for personal-use extensions, but we should add a per-profile `legalNotes` field documenting precedent and limits.
- **Performance** — `prerequisites.scroll until stable` on a long history list could take 30+ seconds. Run scrapes off the main user thread by triggering them only when the tab is hidden, or via a hidden iframe (with care for CSP).
- **Auth-walled scrapes** — most streaming history pages require login. Document this in the profile and surface "Please open Netflix and sign in" if the scrape fails with what looks like a sign-in page.
- **Captcha / anti-bot** — sites like Robinhood or banks are aggressive. Likely *don't* ship those by default; gate behind explicit user opt-in.
- **Optional host permissions** — Chrome allows `optional_host_permissions` and runtime requests via `permissions.request`. Firefox supports it too. Safari is the wildcard — verify.

## Acceptance criteria

- [ ] Adding a new profile JSON under `src/scrapeProfiles/<category>/` and re-running `npm run build` produces an extension that scrapes the new site, with `host_permissions` automatically updated.
- [ ] Profile JSON schema is validated; an invalid profile is skipped with a clear error in Diagnostics.
- [ ] At least 10 profiles ship: Netflix, Hulu, Disney+, Max, Prime Video, Paramount+, Peacock, Crunchyroll, plus one news (CNN or WSJ) and one social (Quora).
- [ ] Profile-level unit tests pass against checked-in HTML fixtures.
- [ ] Scraped data flows through the outbox ([06](06-local-first-sync.md)) and survives SW restarts.
- [ ] Per-domain TTL prevents re-scraping the same page > 1×/day by default.
- [ ] EPIC #27 closed or significantly burned down with sub-issues remaining for the long tail.
