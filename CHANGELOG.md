# Changelog

All notable changes to the Companion Intelligence Browser Extension are
documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/companionintelligence/CI-Browser-Extension/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/companionintelligence/CI-Browser-Extension/releases/tag/v1.4.0
