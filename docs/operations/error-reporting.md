# Error reporting (Sentry)

The extension can report its own crashes to Sentry project `ci-browser-extension`.
It is **opt-out**: on wherever a DSN was compiled into the build, and the user
turns it off.

This document is the CI fleet's standard error-reporting contract (see
CI-Server `docs/operations/error-reporting.md`) plus the parts that are specific
to a browser extension — and there are a lot of them, because **a browser
extension observes every page the user visits**. That single fact reshaped
almost every decision below.

---

## 1. What the extension reports

Errors only, from **two contexts**:

| Context | Reports | Why |
|---|---|---|
| Background (MV3 service worker / Firefox MV2 background page) | **yes** | Where the bugs are — sync, OIDC, ingest — and no user page is attached to it |
| Popup (`popup.html`) | **yes** | A dedicated extension page |
| `content.ts` (`<all_urls>`) | **no** | see §2 |
| `domainScraper.content.ts` (14 site patterns) | **no** | see §2 |
| `oidcCallback.content.ts` | **no** | see §2 |

Each event carries: the exception type, message and stack; a `component` tag
(`ci-browser-extension-background` / `-popup`); the release
(`ci-browser-extension@<manifest version>`); and a `scope` extra naming the code
path (`auto-sync`, `history-sync`, `scrape-upload`, …).

It carries **nothing else**. No breadcrumbs, no request context, no user, no
session, no locale or timezone, no tracing, no replay, no profiling, no PII.

## 2. Why content scripts do not report at all

This is the load-bearing decision in this repo, and it is a refusal rather than
an omission.

A content script runs *inside the user's page*, and every automatic enrichment
the Sentry SDK performs there describes the page rather than the extension:

- **`httpContextIntegration` sets `request.url` from `location.href`.** That is
  the page the user is reading. `content.ts` matches `<all_urls>`, so that is
  their bank, their webmail, their medical portal. **The appliance's rule —
  "strip the query string" — redacts nothing here**, because the origin and the
  path *are* the secret: `mail.google.com`, `secure.chase.com`,
  `mychart.example.org/results/oncology`, `robinhood.com/account/positions`,
  `en.wikipedia.org/wiki/<a diagnosis>`, `docs.google.com/document/d/<id>`.
- **`oidcCallback.content.ts` runs on a URL carrying a live OAuth authorization
  `code` and `state`.** Reporting from it would put a usable credential in an
  event.
- **`breadcrumbsIntegration`'s `dom` crumbs record the target of every click and
  keypress**, including element text — on every page, for the `<all_urls>`
  script. That is not diagnostics, it is surveillance.
- **The scripts handle page content.** `content.ts` reads
  `<meta name="description">`; `domainScraper.content.ts` reads viewing history,
  GitHub activity, Airbnb trips and — behind the financial opt-in — Robinhood
  holdings and order history. Any throw while handling those values can quote
  them, and Firefox in particular quotes offending values in error messages
  (`URL constructor: <the url> is not a valid URL.`).

Some of that is scrubbable. The part that is not — the page's own identity — is
the part that matters, and no filter recovers it. So the SDK is **not linked
into the content-script bundles at all**: nothing to get wrong later, and zero
bytes injected into every page the user opens. Verified per build; see §7.

Sentry reaches the same conclusion independently: `@sentry/browser`'s own
`checkAndWarnIfIsEmbeddedBrowserExtension()` disables `init()` in any extension
context that is not a dedicated extension page. We do not rely on that — the
check is ours, in `isReportableHref` / `isReportableContext`, and it is stricter
(it also refuses an extension page iframed into a web page).

Content-script failures are not lost: the scrape path already reports delivery
failures to the background by message, and the background reports them with
context we chose.

## 3. The URL rule

> **Every URL is sensitive here, not just its query string.**

`redactUrl` (`src/lib/telemetry/scrubEvent.ts`) replaces every absolute HTTP(S)
URL in every string on an event with `[url]` — origin, path, query and hash.
One carve-out: the **first-party Portal hosts**, derived from
`src/lib/portalEnvironments.ts`, keep their origin and path (never their query,
which is where an OIDC `code` lives). Those hosts are compiled into every copy
of the extension and shared by every user, so they identify nobody, and the
failing route is the single most useful fact in an API error.

The user's **self-hosted Memory server is deliberately not on that list**. Its
hostname is a tailnet name, a LAN name, or a home IP — that is the user.

### The extension origin is an install identifier

On Firefox, `moz-extension://<uuid>` is a **per-profile random UUID**: a stable
unique id for this install, present in every stack frame of every event. It is
collapsed to `extension://` with the **path preserved**, so Sentry's issue
grouping (which keys on `filename`) still works. Same for `chrome-extension://`
and `safari-web-extension://`.

### Everything else the fleet scrubber does

Bearer tokens, labelled secrets (`api[-_ ]?key`, hyphenated forms included),
`tskey-…`, credentials in connection URLs, home-directory collapse with the
**Windows patterns before macOS** (or `/Users/<name>` matches inside
`C:/Users/<name>` and leaves a stranded `C:~/…`), identity-bearing keys anchored
so `user-agent`/`user_id`/`owner_id` survive as diagnostics, 8 KB truncation, and
a depth-guarded cyclic-safe walk. `src/lib/telemetry/scrubFixtures.ts` holds the
fleet-wide cases byte-identical to CI-Server's copy, with a drift guard in the
test suite.

### Removed wholesale rather than filtered

`request` (URL, referrer, cookies, headers), `breadcrumbs`, `user`,
`server_name`, `contexts.culture`. There is no field in any of them worth the
risk in this codebase.

## 4. Breadcrumbs are off — three times over

`console.error` in `background.ts` logs whole browsing records:
`console.error("Failed activities:", browserActivities)`,
`console.error("Problematic bookmark:", bookmark)`,
`console.error("Server response:", error.response?.data)`. Sentry's console
breadcrumb puts the **raw arguments** into `breadcrumb.data.arguments`, so with
breadcrumbs on, one background error would carry a batch of the user's URLs and
page titles.

So they are disabled at three independent layers:

1. `defaultIntegrations: false` — `breadcrumbsIntegration` is never installed.
2. `beforeBreadcrumb: () => null` — nothing is recorded even if it were.
3. `delete event.breadcrumbs` in the scrubber — nothing ships even if it were.

> **`defaultIntegrations: false` is load-bearing.** Passing an `integrations`
> **array** does **not** replace the SDK's defaults — `getIntegrationsToSetup`
> computes `[...defaultIntegrations, ...userIntegrations]`, so an explicit list
> alone leaves `breadcrumbs`, `httpContext`, `cultureContext`, `browserSession`
> and `browserApiErrors` installed and collecting. This was caught by the
> "installs none of the collecting integrations" test. Do not remove the flag or
> that test.

The installed set is exactly: `InboundFilters`, `FunctionToString`,
`GlobalHandlers`, `LinkedErrors`, `Dedupe`.

## 5. Configuration

### Build-time (decides what ships)

A browser extension has **no runtime environment** — no container, no shell, no
`docker run -e`. The fleet's env vars therefore survive only at build time, read
through `import.meta.env` by `src/lib/telemetry/buildEnv.ts`:

| Variable | Effect |
|---|---|
| `WXT_SENTRY_DSN` | Enables reporting. **Absent ⇒ nothing initialises and the SDK is tree-shaken out of the bundle entirely.** |
| `WXT_CI_TELEMETRY=off\|false\|0\|no\|disabled` | Compile a build that never reports |
| `WXT_CI_LOCAL_ONLY=true\|1\|yes\|on` | Same, for local-only distributions |
| `WXT_SENTRY_ENV` | Sentry environment; defaults to `production` |
| `WXT_SENTRY_RELEASE` | Defaults to `ci-browser-extension@<manifest version>` |

```bash
# A build that provably cannot report, whatever anyone flips later:
WXT_CI_TELEMETRY=off yarn build
# Or simply build without a DSN — the default for local development.
yarn build
```

### Runtime (the switch that actually protects someone)

**A DSN compiled into a published extension cannot be revoked.** Turning
reporting off for everyone would mean a new build through the Chrome, Firefox
and Safari review queues, reaching only users who take the update. There is no
env var to unset, no container to restart, no config file to edit.

**So an extension setting is the only real control**, and it is the one that
outranks a baked-in DSN:

- **Popup → "Send error reports"** (always visible, signed in or not).
- Stored as `errorReportingEnabled` in `browser.storage.local`, shared by every
  extension context. **Missing means ON** — the posture is opt-out.
- Enforced in `beforeSend`, not only at init, so flipping it takes effect **in
  the same tick, in whichever context is holding the client**, with no browser
  restart. Turning it back on brings the client up without a restart too.
- **Reads fail closed.** If storage is unreadable we cannot know whether the
  user opted out, and reporting against a consent decision we could not read is
  the worse failure.
- The control is **hidden when the installed build has no DSN compiled in** —
  offering a switch that governs nothing would be worse than offering none.

Residual: an event already handed to the transport at the instant of the flip
may still complete. There is no SDK API to recall it.

### Precedence

`unsupported-context` > `local-only` > `opt-out` (build) > `user-disabled`
(runtime) > `no-dsn`. `telemetryDisabledReason()` names the winner.

## 6. Manifest V3 and the service worker

- **No remote code.** `@sentry/browser` is bundled by WXT. The built background
  and popup contain no `eval`, `new Function`, `importScripts`, or injected
  `<script>` — verified per build (§7) — so the MV3 `extension_pages` CSP
  (`script-src 'self'`) is satisfied with **no `content_security_policy` key**
  and no Chrome Web Store "remotely hosted code" problem.
- **No new permissions.** Sentry's ingest endpoint answers CORS, so a plain
  `fetch` from the worker reaches it without a host permission. Adding
  `*.ingest.us.sentry.io` to `host_permissions` would inflate the install-time
  warning and invite store-review questions for no functional gain. **The
  manifest is byte-identical to the pre-telemetry build** (§7). If a browser
  ever rejects the request on CORS grounds, adding that host is the fix.
- **Service-worker lifetime is a real limit.** MV3 kills the worker ~30s after
  its last event and Sentry's transport is asynchronous, so **an event captured
  just before termination can be lost**. `reportError()` in `background.ts`
  awaits a bounded `flushTelemetry()` (2s) inside the already-async catch block,
  which holds the worker open across the in-flight request for the common case.
- **`makeBrowserOfflineTransport` is deliberately not used.** It would persist
  un-sent error payloads to IndexedDB and replay them later — meaning an event
  could be delivered **after** the user turned reporting off. Losing some reports
  on worker shutdown is the better failure.

## 7. Verifying a build

```bash
yarn check:types && yarn lint && yarn test:coverage

# The SDK must be absent from every content script, in every build:
grep -c sentry .output/chrome-mv3/content-scripts/*.js        # expect 0 0 0

# No remote-code constructs anywhere (MV3 CSP):
grep -oE "new Function\(|[^a-zA-Z.]eval\(|importScripts\(" \
  .output/chrome-mv3/background.js .output/chrome-mv3/chunks/*.js   # expect no output

# A DSN-less build must contain no SDK at all:
yarn build && grep -c sentry .output/chrome-mv3/background.js  # expect 0
```

## 8. Releasing with a DSN

`release.yml` passes `WXT_SENTRY_DSN` from the `SENTRY_DSN_BROWSER_EXTENSION`
repository secret into `yarn prepare:store`. **If the secret is unset the builds
simply carry no DSN and report nothing** — the same as any local build. Nothing
fails.

The DSN is public by nature (it is in the shipped bundle); it authorises writing
events to the project and nothing else. Treat it as compromised by default and
rely on Sentry-side rate limits and inbound filters, not on secrecy.

## 9. Disclosure obligations

Error reporting is a data flow and the stores require it to be declared:

- **PRIVACY.md** §1/§3/§7 describe it and the toggle.
- **Firefox/AMO** — `browser_specific_settings.gecko.data_collection_permissions`
  declares `technicalAndInteraction` as **optional**, which is exactly Mozilla's
  category for opt-out telemetry.
- **Chrome Web Store / Edge** — the existing "single purpose" and data-use
  disclosures should list crash reporting; it does not add a permission.

## 10. Source map

| File | What it is |
|---|---|
| `src/lib/telemetry/settings.ts` | The gate |
| `src/lib/telemetry/scrubEvent.ts` | The scrubber |
| `src/lib/telemetry/scrubFixtures.ts` | Fleet-wide cases (copied) + extension-only cases |
| `src/lib/telemetry/userSetting.ts` | The kill switch |
| `src/lib/telemetry/buildEnv.ts` | `import.meta.env` reads, isolated so the rest stays testable |
| `src/lib/telemetry/index.ts` | Init, capture, bounded flush, context refusal |
| `src/entrypoints/popup/TelemetrySettings.tsx` | The user-facing toggle |
