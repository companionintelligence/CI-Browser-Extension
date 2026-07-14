# 13 — Distribution & Release Pipeline

## Problem

[README.md](../README.md) and [PUBLISHING.md](../PUBLISHING.md) describe an aspiration to publish on all major stores, but today:

- Distribution is **manual unpacked installs**. Every user runs `npm install && npm run build` and points their browser at `.output/chrome-mv3`.
- No versioned releases on GitHub.
- No store presence anywhere.
- `package.json` version sits at `1.3.0` but there is no `CHANGELOG.md` and no signed releases.
- `wxt.config.ts` only declares `data_collection_permissions` for Firefox; Chrome / Edge submissions will need their own privacy disclosures.
- No automated build matrix in CI — `npm run build:all` exists but isn't wired to GitHub Actions.

This makes the extension effectively private-beta. Real adoption requires the distribution surface.

## Goals

- One-command release: `gh release create vX.Y.Z` produces signed, store-ready artifacts for every supported browser.
- Submitted and approved on Chrome Web Store, Firefox AMO, Edge Add-ons, Safari App Store, Opera Add-ons. Brave + DuckDuckGo inherit Chrome.
- Predictable update cadence with changelogs.
- Beta channel for internal testing.

## Approach

### 1. Versioning + changelog

Adopt [Changesets](https://github.com/changesets/changesets) or [conventional-commits + standard-version](https://github.com/conventional-changelog/standard-version).

- Each PR includes a changeset describing user-visible impact (`feat`, `fix`, `chore`).
- Release script consumes changesets → bumps `package.json` → writes `CHANGELOG.md` → tags release.

Bump policy:

- `major` — breaking change to CI-Server contract or config.
- `minor` — new feature.
- `patch` — bug fix / docs.

### 2. CI build matrix

`.github/workflows/build.yml`:

```yaml
on:
  push: { branches: [master] }
  pull_request:
  release: { types: [created] }
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [chrome, firefox, edge, opera, brave, duckduckgo, safari]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: yarn install --immutable
      - run: yarn zip:${{ matrix.target }}
      - uses: actions/upload-artifact@v4
        with:
          name: ci-extension-${{ matrix.target }}-${{ github.sha }}
          path: dist/*.zip
```

On release events, also push to a `release` artifact and (eventually) the store APIs.

### 3. Store submission automation

#### Chrome Web Store

Use [chrome-webstore-upload](https://github.com/fregante/chrome-webstore-upload):

```yaml
- name: Chrome Web Store
  if: github.event_name == 'release'
  run: yarn dlx chrome-webstore-upload-cli upload \
        --source dist/chrome-*.zip --extension-id $CHROME_EXTENSION_ID
  env:
    CLIENT_ID:     ${{ secrets.CWS_CLIENT_ID }}
    CLIENT_SECRET: ${{ secrets.CWS_CLIENT_SECRET }}
    REFRESH_TOKEN: ${{ secrets.CWS_REFRESH_TOKEN }}
```

#### Firefox AMO

`web-ext sign` with AMO API key + secret.

#### Edge

Microsoft Edge Add-ons API (similar to Chrome's; needs Partner Center setup).

#### Safari

Safari is harder — requires Xcode and an App Store Connect API key. Build a macOS runner job:

```yaml
build-safari:
  runs-on: macos-latest
  steps:
    - run: yarn build:safari
    - run: xcrun safari-web-extension-converter --no-prompt --bundle-identifier com.companionintel.extension --copy-resources --force .output/safari-mv3
    - # xcodebuild archive + altool upload
```

#### Opera

Opera Add-ons does manual review; automate the artifact creation but submit manually for now.

### 4. Store assets

`store-assets/` directory:

```
store-assets/
  description.md          # long-form description shared by all stores
  screenshots/
    01-popup-dark.png
    02-sync-settings.png
    03-privacy-controls.png
    04-history-view.png
  icons/                  # already in public/icon, but stores want specific sizes
  promo/
    chrome-marquee-1400x560.png
    chrome-small-440x280.png
    firefox-feature-1200x870.png
```

Generated artifacts (screenshots) can be Playwright-driven in CI for consistency.

### 5. Beta / canary channel

Two distribution lanes:

- **Stable** — what's on the stores. Tagged `v1.x`.
- **Beta** — pre-release zips attached to GitHub releases. Power users side-load.

Implement via package-version channel:

```ts
// build-time
const channel = process.env.CHANNEL ?? "stable";
manifest.name = channel === "beta" ? "Companion Intelligence (Beta)" : "Companion Intelligence";
```

The beta build has a different `applications.gecko.id` and Chrome extension key so the two can coexist.

### 6. Self-update for self-hosted users

Users running self-hosted CI-Servers may load unpacked. Document an "update flow":

- `npm run build` → diff `.output/` → reload extension in browser.
- Eventually: an `update_url` in the manifest pointing at a JSON file on the user's CI-Server (Chrome's `external_update_url` mechanism — Enterprise only).

### 7. CHANGELOG hygiene

Every release commit has matching CHANGELOG entry. PR template includes a "Changelog entry" checkbox.

### 8. Signing / SBOM

For supply-chain transparency:

- Sign release artifacts with [Sigstore cosign](https://docs.sigstore.dev) so users can verify.
- Generate an SBOM (CycloneDX) per release.

Optional for v1 but worth planning.

## Migration / sequencing

1. Adopt Changesets, write the first `CHANGELOG.md`, tag `v1.4.0`.
2. CI matrix build (no store upload yet) — artifacts attached to PRs and releases.
3. Chrome Web Store submission first — it's the largest audience and the most documented.
4. Firefox AMO next (signing required for distribution outside AMO too).
5. Edge after Chrome (same packaging).
6. Safari and Opera last.
7. Beta channel separately once stable is healthy.

## Risks & open questions

- **Store review delays** — Chrome can take days; AMO can take weeks. Plan release cadence around the slowest reviewer.
- **Privacy disclosure scrutiny** — Chrome's "data usage" form is strict. The data inventory from [12 — privacy](12-privacy.md) is the input.
- **Manifest V3 lock-in** — Chrome enforces MV3 from June 2025; Firefox MV2 deprecation has a different timeline. Manage two manifests gracefully.
- **Extension ID stability** — once on the store, the ID is fixed. Beta channel needs a separate ID; document the dev workflow.
- **Code signing requirements differ** per store. Safari requires Apple Developer Program ($99/yr). Microsoft Partner Center is free but slow. Budget accordingly.
- **Auto-update behavior** — stores push updates within hours of approval; we need a feature-flag system so we can ship code without forcing UX changes immediately (see [04 — logging / config](04-logging-observability.md) for groundwork).

## Acceptance criteria

- [ ] `CHANGELOG.md` exists with at least three real entries.
- [ ] Tagging `vX.Y.Z` on GitHub produces an artifact bundle in CI with builds for all 7 targets.
- [ ] Chrome Web Store listing live, "Publishable" status.
- [ ] AMO listing live and signed.
- [ ] Edge listing live.
- [ ] At least one beta release available for side-loading with a separate extension ID.
- [ ] `store-assets/` directory contains screenshots, promo art, and long-form description.
- [ ] PR template enforces changelog entries.
