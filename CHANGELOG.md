# Changelog

All notable changes to the Companion Intelligence Browser Extension are
documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.2] — 2026-10-31

### Fixed
- **Safari iOS startup** — register only the `webNavigation` events supported by
  the current browser. Safari omits `onHistoryStateUpdated`; registering it
  unconditionally caused the background extension to fail during startup and
  left the popup loading indefinitely.

## [1.6.1] — 2026-10-29

### Added
- **Opt-out error reporting (Sentry)** — the background worker and the popup can
  report their own crashes to Sentry project `ci-browser-extension`. On wherever
  a DSN was compiled in (`WXT_SENTRY_DSN`); the user turns it off with **Send
  error reports** in the popup, which overrides a baked-in DSN immediately in
  every context. Content scripts do **not** report at all — the SDK is not
  linked into them — because a content script's own URL is the page the user is
  reading. Every web address is removed from every event (origin and path, not
  just the query string), except Lifescope's own Portal hosts; the Firefox
  `moz-extension://<uuid>` install identifier is collapsed out of stack frames;
  breadcrumbs, request context, user, locale and timezone are all removed. No
  new permissions, no manifest change, no remotely hosted code. A build without
  a DSN tree-shakes the SDK out entirely. See
  `docs/operations/error-reporting.md`, `PRIVACY.md` §3.1, and `.env.example`.
- **Safari CI coverage** — `build-and-test.yml` now builds the Safari desktop
  (MV2) and iOS/mobile (MV3) bundles on every push/PR, and `release.yml`
  attaches both as release assets alongside Chrome and Firefox.
- **Safari release documentation** — PUBLISHING.md now has a full Apple App
  Store section covering the `safari-web-extension-converter` Xcode-wrapper
  step, signing, and App Store Connect submission (previously undocumented —
  the Xcode wrapper project itself is still generated manually per release,
  not committed to this repo). DEVELOPMENT.md and README.md document local
  Safari testing.
- **Store auto-publish** — `release.yml` now publishes to Chrome Web Store,
  Firefox AMO, and Microsoft Edge Add-ons when the Release workflow is dispatched for a matching `v*` tag, gated on
  per-store secrets (skips cleanly if they're unset). Edge's release zip is
  now attached to GitHub Releases too (previously built but never uploaded).
  See PUBLISHING.md → "CI/CD Auto-Publish Setup" for which secrets each store
  needs. The Edge step is unverified against a live account — flagged in the
  workflow and docs.

### Fixed
- **`release.yml` was broken** — it ran `npm ci`, which cannot install this
  workspace (`workspace:*` protocol isn't supported by npm). Switched to the
  same yarn 4 / corepack flow already used in `build-and-test.yml`.
- **Firefox-only manifest keys leaking into other browsers** —
  `browser_specific_settings.gecko` (AMO's `data_collection_permissions`
  disclosure) was appearing in the Chrome and Safari manifests too. Scoped it
  to the Firefox build only.
- **Stale toolbar name** — the popup's `<title>` ("CI Browser Extension"),
  which WXT uses as the manifest `action.default_title`, was overriding the
  "Companion Intelligence" branding set in `wxt.config.ts` on every browser.
- `package.json`'s `description` (baked into every manifest) still said
  "Chrome and Firefox"; now mentions Safari too.

## [1.4.0] — 2026-06-10

First release prepared for public store submission (Chrome Web Store,
Firefox AMO, Safari). Consolidates the June stability, privacy, and
capture-expansion work.

### Added
- **MV3 alarms lifecycle** — background scheduling moved to `chrome.alarms`
  (`ci-auth-check` 1 min, `ci-auto-sync` 10 min, `ci-last-seen` 5 min) so
  scheduled work survives service-worker suspension (#45, #37).
- **Highlight capture** — context-menu "save selection" posts the highlighted
  text to your CI Server (#45, closes #25).
- **Streaming scrape profiles** — Max, Paramount+, and Prime Video, joining
  Netflix, Hulu, and Disney+ (#46).
- **Device `last_seen` heartbeat** and improved device matching aligned with
  the refactored CI-Server device service (#37).
- Regression tests for blacklist matching, URL parsing, and sync bookkeeping.

### Changed
- **Terminology: "blacklist" → "ignored"** across the popup and background,
  with the "Ignored Pages and Sites" manager (#32). Internal identifiers are
  unchanged.
- Device identity now reports `device_type: "browser"` / `platform: "web"`
  plus manufacturer / OS / app version to match CI-Server's `ensureDeviceExists`.

### Fixed
- **Privacy: blacklist off-by-one** — the recorder evaluated the ignore list
  against the _previously_ visited page while uploading the _current_ one, so a
  page visited right after a clean one could be sent despite being ignored. It
  now checks the URL actually being recorded (#44).
- **Chrome 88 compatibility** — replaced `URL.parse()` (Chrome/Firefox 126+)
  with a `try/catch` helper, matching the declared `minimum_chrome_version` (#44).
- **Fresh-install error loop** — auth polling no longer throws
  `Invalid url: "https://"` every second before a server domain is configured (#44).
- Removed dead code: an unused cross-site form-field capture and a no-op
  `window.fetch` patch in the content script, and no-op settings-reload
  dispatches (#44).

### Performance
- **Bounded sync bookkeeping** — marking items synced now batches one
  storage write per uploaded slice instead of one per item (#44).

## [1.3.0] — 2026-02-27
- Popup redesign on shadcn/Tailwind; sync history & logs panel.

## [1.2.0] — 2026-02-25
- Bookmark and download sync; per-type sync toggles.

## [1.1.0] — 2026-02-04
- Auto-sync of full browser history with configurable time ranges.

## [1.0.1] — 2025-11-19
- Stability fixes to history sync and authentication.

## [1.0.0] — 2025-09
- Initial release: browsing-history capture to a private CI Server with
  token-based authentication.

[Unreleased]: https://github.com/companionintelligence/CI-Browser-Extension/compare/v1.6.2...HEAD
[1.6.2]: https://github.com/companionintelligence/CI-Browser-Extension/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/companionintelligence/CI-Browser-Extension/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/companionintelligence/CI-Browser-Extension/releases/tag/v1.6.0
[1.4.0]: https://github.com/companionintelligence/CI-Browser-Extension/releases/tag/v1.4.0
