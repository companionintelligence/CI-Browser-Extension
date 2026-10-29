# Store Publishing Guide

## Prerequisites

1. **Prepare Release**
   ```bash
   npm run prepare:store
   ```
   This will clean, lint, compile, and create ZIP packages for both stores.

2. **Verify Packages**
   - Chrome: `.output/ci-browser-extension-*-chrome.zip`
   - Edge: `.output/ci-browser-extension-*-edge.zip`
   - Firefox: `.output/ci-browser-extension-*-firefox.zip`
   - Firefox Sources: `.output/ci-browser-extension-*-sources.zip`
   - Safari (desktop): `.output/ci-browser-extension-*-safari.zip`
   - Safari (iOS/mobile): `.output/ci-browser-extension-*-safari-mobile.zip`

## Chrome Web Store

### Initial Submission

1. **Developer Account**
   - Create a [Chrome Web Store Developer Account](https://chrome.google.com/webstore/devconsole/)
   - Pay one-time $5 registration fee

2. **Upload Extension**
   - Click "New Item"
   - Upload `ci-browser-extension-*-chrome.zip`
   - Fill out store listing details

3. **Store Listing Requirements**
   - **Name**: Companion Intelligence
   - **Summary**: Brief description (132 characters max)
   - **Description**: Detailed description with features
   - **Category**: Choose appropriate category
   - **Icons**: 128x128px icon (included in package)
   - **Screenshots**: At least 1 screenshot (1280x800 or 640x400)
   - **Promotional images**: Optional but recommended

4. **Privacy & Permissions**
   - Review and justify all requested permissions
   - Provide privacy policy if collecting user data
   - Single purpose compliance statement

### Updates

1. Upload new ZIP file
2. Update version number in manifest
3. Add changelog in "What's new" section
4. Submit for review

## Firefox Add-ons (AMO)

### Initial Submission

1. **Developer Account**
   - Create a [Firefox Add-ons Developer Account](https://addons.mozilla.org/developers/)
   - No registration fee

2. **Upload Add-on**
   - Go to "Submit a New Add-on"
   - Upload `ci-browser-extension-*-firefox.zip`
   - Upload `ci-browser-extension-*-sources.zip` (source code required)

3. **Add-on Details**
   - **Name**: Companion Intelligence
   - **Summary**: Brief description
   - **Description**: Detailed description
   - **Categories**: Select appropriate categories
   - **Tags**: Relevant keywords
   - **Icons**: Included in package

4. **Source Code Review**
   - Firefox requires source code for review
   - Include build instructions in sources
   - Explain any minified/compiled code

### Updates

1. Upload new XPI file and sources
2. Increment version number
3. Add version notes
4. Submit for review

## Apple App Store (Safari)

Unlike Chrome and Firefox, **Safari has no unpacked-extension mode and no
zip-upload API.** A Safari Web Extension only runs wrapped inside a native
macOS/iOS app built with Xcode, and that app is what you submit to App Store
Connect. This repo builds the web-extension bundle (`yarn build:safari` /
`yarn zip:safari`); turning that into a signed, submittable app is a manual,
macOS-only step done outside this repo.

### Prerequisites

- **Apple Developer Program** membership ($99/yr) with access to App Store
  Connect for the Lifescope Inc. team.
- **Xcode** installed (Safari's `safari-web-extension-converter` ships with
  the Xcode command line tools: `xcrun --find safari-web-extension-converter`
  should resolve once Xcode is installed).
- A decided **bundle identifier** for the wrapper app (e.g.
  `com.companionintel.extension` — confirm the real one with whoever owns App
  Store Connect access before generating the project, since it's effectively
  permanent once submitted).

### 1. Build the web-extension bundle

```bash
yarn build:safari          # desktop → .output/safari-mv2
yarn build:safari-mobile   # iOS     → .output/safari-mv3
```

(`yarn zip:safari` / `yarn zip:safari-mobile` produce the same output already
zipped — the converter in the next step wants the unzipped folder, so use the
`build:*` output directly, or unzip first if you started from a release asset.)

### 2. Generate the Xcode wrapper

```bash
xcrun safari-web-extension-converter \
  --no-prompt \
  --bundle-identifier com.companionintel.extension \
  --copy-resources \
  --force \
  .output/safari-mv2
```

This scaffolds a new Xcode project (a container app + a Safari Web Extension
target) alongside the web-extension source it copied in. It is **not**
committed to this repo — regenerate it per release, or keep a separate
companion project once the team decides to maintain one long-term.

### 3. Configure signing and metadata in Xcode

- Open the generated `.xcodeproj`, select your Apple Developer **Team** under
  Signing & Capabilities for both the container app and extension targets.
- Set the app version / build number to match `package.json`'s `version`.
- Verify the app icon (`store-assets/safari/app-icon-1024.png`, 1024×1024, no
  alpha) and the extension's `Info.plist` permissions look right.

### 4. Archive, validate, and upload

- **Product → Archive** in Xcode, then use the Organizer to **Distribute App**
  (App Store Connect → Upload), or drive it headlessly with `xcodebuild
  -exportArchive` and `xcrun notarytool submit` / `altool` if scripting this
  later.

### 5. App Store Connect listing

Use the **Apple App Store** section of
[`store-assets/STORE-LISTING.md`](store-assets/STORE-LISTING.md) for listing
copy, the privacy manifest (`PrivacyInfo.xcprivacy`) fields, and the App Store
privacy questionnaire answers. Screenshots: `store-assets/shared/screenshot-1..4.png`.

### Updates

1. Repeat steps 1–4 with the bumped `package.json` version.
2. Increment the Xcode project's build number (App Store Connect rejects a
   re-used build number even if the marketing version is unchanged).
3. Add "What's New" text (mirror the CHANGELOG entry).
4. Submit for review.

## Store Requirements Checklist

### Chrome Web Store
- [ ] Extension follows [Chrome Extension Quality Guidelines](https://developer.chrome.com/docs/webstore/quality_guidelines/)
- [ ] All permissions are justified and minimal
- [ ] Privacy policy provided (if applicable)
- [ ] Screenshots and promotional images ready
- [ ] Single purpose compliance verified

### Firefox Add-ons
- [ ] Extension follows [Firefox Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [ ] Source code and build instructions included
- [ ] All code is explained and documented
- [ ] No obfuscated or minified code without justification

### Apple App Store (Safari)
- [ ] Apple Developer Program membership active for the Lifescope Inc. team
- [ ] Bundle identifier confirmed with whoever owns App Store Connect access
- [ ] Extension follows [Safari Web Extension guidelines](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [ ] `PrivacyInfo.xcprivacy` fields filled in (see STORE-LISTING.md)
- [ ] App icon (1024×1024, no alpha) and screenshots ready
- [ ] Signing team selected and build number incremented in Xcode

## Review Process

### Chrome Web Store
- **Timeline**: 1-7 days for new submissions, 24-48 hours for updates
- **Review Focus**: Functionality, privacy, single purpose
- **Common Issues**: Excessive permissions, unclear purpose, policy violations

### Firefox Add-ons
- **Timeline**: 1-10 days depending on complexity
- **Review Focus**: Code quality, security, user experience
- **Common Issues**: Unclear source code, unnecessary permissions, UX problems

### Apple App Store (Safari)
- **Timeline**: Typically 1-3 days, but first-time app submissions and any App
  Review escalation can take longer
- **Review Focus**: App Review guidelines (not just the extension review),
  privacy manifest accuracy, permission justification
- **Common Issues**: Missing/incorrect `PrivacyInfo.xcprivacy`, container app
  feeling like a bare wrapper with no standalone value, signing/provisioning
  mistakes

## Post-Publishing

### Monitor Performance
- Check extension analytics in developer dashboards
- Monitor user reviews and ratings
- Track installation/usage metrics

### User Support
- Respond to user reviews
- Provide support documentation
- Handle bug reports and feature requests

### Updates and Maintenance
- Regular security updates
- Browser API compatibility updates
- Feature improvements based on user feedback

## Automation

The repository includes manually dispatched GitHub Actions workflows:
- **CI/CD** (`build-and-test.yml`): lint/type-check/test, then builds Chrome,
  Firefox, and Safari (both desktop and iOS/mobile) as a smoke test that all
  four targets still compile.
- **Release** (`release.yml`): after pushing a `v*` tag, dispatch the workflow
  on `master` with `release_tag` set to that tag. It verifies the tag matches
  the `package.json` version, runs `yarn prepare:store`,
  attaches the Chrome, Edge, Firefox (+ sources), and Safari (desktop +
  mobile) zips to the GitHub Release, then **auto-publishes to Chrome Web
  Store, Firefox AMO, and Microsoft Edge Add-ons** if the store credentials
  below are configured as repo secrets. See "CI/CD Auto-Publish Setup" below.
- For example, push `v1.6.1`, then run the **Release** workflow on `master`
  with `release_tag=v1.6.1` to build and publish that version.

CI only produces the raw Safari web-extension bundle — it does **not** run
`safari-web-extension-converter` or touch Xcode. The Xcode wrapper, signing,
archiving, and App Store Connect submission stay a manual, macOS-only step
(see [Apple App Store (Safari)](#apple-app-store-safari) above); there's no
GitHub-hosted way to fully automate an Apple code-signing identity without
committing signing secrets, so this is deliberately out of CI for now.

## CI/CD Auto-Publish Setup

`release.yml` has one publish step per auto-publishable store. Each step
checks its own secrets first (`if: env.<SOMETHING> != ''`) and is skipped
entirely if they're absent — so this is safe to merge before any secrets
exist; releases just keep attaching zips for manual upload like before. **A
store's first submission has to happen manually** (as described earlier in
this doc) before its API credentials exist to automate updates.

Add secrets with `gh secret set NAME --repo companionintelligence/CI-Browser-Extension`
(it prompts for the value — nothing gets typed on the command line or pasted
into chat/logs) or via the repo's Settings → Secrets and variables → Actions
in the GitHub UI. Whoever holds each store's developer account should be the
one generating and adding these, since they require access to the
manually-submitted listing.

### Firefox AMO
| Secret | Where to get it |
|---|---|
| `AMO_JWT_ISSUER` | addons.mozilla.org/developers → Manage API Keys → generates an issuer (JWT `iss`) + secret pair |
| `AMO_JWT_SECRET` | Same page, shown once at generation time |

Publish step runs `web-ext sign --channel listed`, which both signs and
submits the already-listed add-on as a new version.

To retry AMO publication for a release that already exists, run the
**Publish Existing Firefox Release** workflow with that release tag. It
downloads the existing Firefox zip and submits it without rebuilding packages
or recreating GitHub release assets. Run **Verify Store Credentials** first;
the configured AMO account must be an author of the existing listing.

### Chrome Web Store
| Secret | Where to get it |
|---|---|
| `CHROME_EXTENSION_ID` | The ID shown on the item's Chrome Web Store Developer Dashboard page (also in its URL) |
| `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` | Google Cloud Console → OAuth client (Desktop app type), with the Chrome Web Store API enabled on the project |
| `CHROME_REFRESH_TOKEN` | Generated once via the OAuth2 flow against that client (see [chrome-webstore-upload-cli's README](https://github.com/fregante/chrome-webstore-upload-cli) for the one-time `curl`/browser steps) |

Publish step uploads the zip then calls `publish`, matching the two-call
[`chrome-webstore-upload`](https://github.com/fregante/chrome-webstore-upload)
API.

### Microsoft Edge Add-ons
| Secret | Where to get it |
|---|---|
| `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_CLIENT_SECRET`, `EDGE_ACCESS_TOKEN_URL` | Partner Center → the extension's listing → **API access** page, which displays all four values directly (Partner Center generates the client secret and access-token URL for you; no separate Azure AD app registration needed) |

**This step is unverified** — no Edge submission has happened yet (unlike
Chrome/Firefox/Safari), so the request shapes in `release.yml` are written
from Microsoft's documented [Add-ons API](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api)
but haven't been exercised against a live Partner Center account. Before
relying on it: do the first Edge submission manually, generate the API
credentials from the listing's API access page, add the secrets above, then
watch the first automated run closely (or dry-run the `curl` calls locally
against the real API) and fix up the request shape if Microsoft's current API
has drifted from the doc.
