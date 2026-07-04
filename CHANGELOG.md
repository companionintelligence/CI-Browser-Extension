# Changelog

All notable changes to the Companion Intelligence Browser Extension are
documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — Design system

- **CI canonical teal theme.** The popup `--primary` now maps to the CI
  canonical teal — light `#0f717a`, dark `#abd4d8` (expressed in OKLCH in
  `src/theme.css`) — replacing the previous non-canonical brand color. A
  design-canon lint gate enforces this going forward (#55).
- **Montserrat type.** Self-hosted via `@fontsource/montserrat` (weights
  200/400/500/600/700), imported in `src/entrypoints/popup/main.tsx` and set as
  `--font-sans`. Bundled by Vite so it is MV3/CSP-safe with no CDN or Google
  Fonts request. The popup root is wrapped in a `next-themes` `ThemeProvider`
  (`attribute="class"`, `storageKey="vite-ui-theme"`, `defaultTheme="system"`)
  so the dark theme activates and persists (#55).
- **Enriched design tokens v0.2.0** in `src/theme.css` — additive, no existing
  token changed:
  - full brand-teal ramp (`--teal-50` … `--teal-950`) plus `--aqua`,
    `--aqua-light`, and `--mint` accents;
  - semantic status colors (`--success`, `--warning`, `--info`) with
    foregrounds, tuned per light/dark;
  - brand / hero / aurora gradients (`--gradient-brand`, `--gradient-hero`,
    `--gradient-aurora`) and an elevation shadow scale (`--shadow-sm/md/lg`);
  - a radius scale (`--radius-sm` … `--radius-2xl`).
  The semantic and teal-utility tokens are wired into the Tailwind `@theme
  inline` block (`--color-success`, `--color-teal-500/600`, …) (#55).

### Added — CI

- **Design-canon lint gate.** `scripts/lint-canon.mjs` fails the build if a
  resolvable `--primary` is not CI teal (hardcoded hex uses are reported as
  non-blocking warnings), run by `.github/workflows/style-canon-lint.yml` on
  every push and pull request (#55).

### Notes

- Refreshed light/dark before-after UI board committed at
  `docs/style-audit/CI-Browser-Extension-before-after.png` (#55).
- Tokens are defined inline in `src/theme.css`; this repo does not yet depend on
  a shared `@companionintelligence/tokens` package.

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
