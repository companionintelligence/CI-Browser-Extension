/**
 * Error reporting for the browser extension.
 *
 * ## Where this runs, and where it deliberately does not
 *
 * **Background (service worker / Firefox background page): yes.** This is where
 * the bugs worth fixing live — sync, OIDC, ingest — and it has no page attached
 * to it.
 *
 * **Popup: yes.** A dedicated extension page. Its own URL is not the user's
 * business, though the extension origin still identifies the install, which is
 * why `httpContextIntegration` is off and `request` is deleted in the scrubber.
 *
 * **Content scripts (`content.ts`, `domainScraper.content.ts`,
 * `oidcCallback.content.ts`): NO — and this is a deliberate refusal, not an
 * oversight.** A content script runs inside the user's page, and every automatic
 * enrichment the SDK performs there reports on the page rather than on us:
 *
 *   - `httpContextIntegration` sets `request.url` from `location.href`. That is
 *     the page the user is reading. `content.ts` matches `<all_urls>`, so that
 *     is their bank, their mail, their medical portal. Stripping the query
 *     string — the appliance's rule — redacts nothing when the origin and path
 *     are the secret.
 *   - `oidcCallback.content.ts` runs on a URL carrying a live OAuth
 *     authorization `code` and `state`.
 *   - `breadcrumbsIntegration`'s `dom` crumbs record the target of every click
 *     and keypress on the page, including element text.
 *   - `content.ts` reads `<meta name="description">` and
 *     `domainScraper.content.ts` reads viewing history, GitHub activity and —
 *     behind the financial opt-in — Robinhood holdings and order history. Any
 *     throw while handling those values can quote them.
 *
 * Some of that is scrubbable and some of it is not, and the part that is not
 * (the page's own identity) is the part that matters. So content scripts do not
 * link the SDK at all: no bytes injected into every page the user opens, and
 * nothing to get wrong later. Their failures already reach the background by
 * message, where they can be reported with context we chose.
 *
 * Sentry agrees, independently: `@sentry/browser`'s own
 * `checkAndWarnIfIsEmbeddedBrowserExtension()` disables `init()` in any
 * extension context that is not a dedicated extension page. `isReportableContext`
 * below is the same test, made explicit so the decision is ours and is tested.
 *
 * ## What is sent
 *
 * Errors only. No tracing, no replay, no profiling, no sessions, no PII, no
 * breadcrumbs of any kind, no request context, no locale or timezone. The
 * default integration list is replaced rather than filtered, so a future SDK
 * release cannot add a collector we never opted into. Everything that survives
 * goes through `scrubExtensionEvent`.
 */

import * as Sentry from "@sentry/browser";
import type { ErrorEvent } from "@sentry/browser";
import { scrubExtensionEvent, scrubValue } from "./scrubEvent";
import {
  resolveTelemetrySettings,
  type TelemetryEnv,
  type TelemetrySettings,
} from "./settings";
import { isErrorReportingEnabled, watchErrorReporting } from "./userSetting";

/** `Sentry.init`'s return type, without importing from a deep SDK path. */
export type TelemetryClient = NonNullable<ReturnType<typeof Sentry.init>>;

export type TelemetryComponent = "background" | "popup";

export interface InitTelemetryOptions {
  component: TelemetryComponent;
  /** Build-time configuration. Entry points pass `BUILD_TELEMETRY_ENV`. */
  env: TelemetryEnv;
  /** Override for tests and for the gate probe. */
  extensionVersion?: string | null;
  /** Override for tests; defaults to `isReportableContext()`. */
  contextSupported?: boolean;
}

const EXTENSION_PAGE = /^(?:chrome|moz|safari-web|ms-browser)-extension:\/\//;

let client: TelemetryClient | undefined;
let settings: TelemetrySettings | null = null;
/**
 * The live kill switch, consulted on every event.
 *
 * Checked in `beforeSend` rather than only at init: `Sentry.init` has already
 * run by the time a user flips the toggle, and re-initialising is not a thing
 * the SDK supports. Returning null here disables reporting in the same tick, in
 * whichever context is holding the client, with no restart.
 */
let reportingAllowed = false;
let unwatch: (() => void) | undefined;

/**
 * The rule, separated from how the context is read so every shape of URL can be
 * tested — jsdom will not let `window.location` be reassigned.
 *
 * A content script's href is the user's page. That is the whole decision.
 */
export function isReportableHref(href: string | null | undefined): boolean {
  return typeof href === "string" && EXTENSION_PAGE.test(href);
}

/**
 * True only in a dedicated extension context: an MV3 service worker (no
 * `window`) or an extension page (popup, options, MV2 background page).
 * False in a content script, whose `window.location` belongs to the user.
 */
export function isReportableContext(): boolean {
  // ServiceWorkerGlobalScope — MV3 background.
  if (typeof window === "undefined") {
    return true;
  }

  // A page. Only ours qualifies, and only as the top frame: an extension page
  // iframed into a web page can read the embedder's context.
  if (window !== window.top) {
    return false;
  }

  try {
    return isReportableHref(window.location.href);
  } catch {
    return false;
  }
}

/**
 * Why reporting is off. `null` once it is on, `"uninitialised"` before
 * `initTelemetry` has resolved — deliberately distinct from `"no-dsn"`, which is
 * a decision rather than an absence of one.
 */
export function telemetryDisabledReason(): string | null {
  return settings ? settings.disabledReason : "uninitialised";
}

export function isTelemetryActive(): boolean {
  return client !== undefined && reportingAllowed;
}

/**
 * Start error reporting if every gate allows it.
 *
 * Never throws and never rejects: a reporting failure must not change how the
 * extension behaves. Returns the client so the probe and tests can assert on it
 * — `undefined` means nothing was initialised and no request can be made.
 */
export async function initTelemetry(
  options: InitTelemetryOptions,
): Promise<TelemetryClient | undefined> {
  if (client) {
    return client;
  }

  try {
    const userEnabled = await isErrorReportingEnabled();

    settings = resolveTelemetrySettings(options.env, {
      component: options.component,
      userEnabled,
      extensionVersion: options.extensionVersion ?? readExtensionVersion(),
      contextSupported: options.contextSupported ?? isReportableContext(),
    });

    if (!settings.enabled || !settings.dsn) {
      // Still watch the switch: a user who turns reporting back on should not
      // have to restart the browser. Only worth doing where a DSN exists.
      if (settings.dsn && settings.disabledReason === "user-disabled") {
        armSwitchWatcher(options);
      }

      return undefined;
    }

    reportingAllowed = true;

    client = Sentry.init({
      dsn: settings.dsn,
      environment: settings.environment,
      release: settings.release,
      enabled: true,
      // Errors only.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      // The extension check in `Sentry.init` would disable the SDK on a Firefox
      // MV2 background PAGE, which is a legitimate dedicated context. We do the
      // equivalent check ourselves in `isReportableContext`, above, and it is
      // stricter — it also refuses iframed extension pages.
      skipBrowserExtensionCheck: true,
      // `defaultIntegrations: false` is LOAD-BEARING, not tidiness. Passing an
      // `integrations` ARRAY does not replace the SDK's defaults, it MERGES
      // with them (`getIntegrationsToSetup`:
      // `integrations = [...defaultIntegrations, ...userIntegrations]`), so the
      // list below on its own left breadcrumbs, httpContext, cultureContext,
      // browserSession and browserApiErrors all installed and collecting. The
      // scrubber still stripped what they produced, but the collectors were
      // live — a DOM listener in the popup, console patching in the worker —
      // and one beforeSend regression away from shipping it. Caught by
      // "installs none of the collecting integrations" in index.test.ts; do not
      // remove either the flag or that test.
      //
      // Dropped on purpose:
      //   breadcrumbs      — console crumbs carry `data.arguments`, and this
      //                      codebase logs whole browsing records into
      //                      console.error; dom crumbs record clicks/keystrokes.
      //   httpContext      — fills `request.url`/referrer from location.
      //   cultureContext   — locale + timezone: coarse location, a fingerprint.
      //   browserSession   — session pings we have no use for.
      //   browserApiErrors — monkey-patches setTimeout/addEventListener; a
      //                      behaviour change for no signal we lack.
      defaultIntegrations: false,
      integrations: [
        Sentry.inboundFiltersIntegration(),
        Sentry.functionToStringIntegration(),
        Sentry.globalHandlersIntegration(),
        Sentry.linkedErrorsIntegration(),
        Sentry.dedupeIntegration(),
      ],
      // Third lock on breadcrumbs, after "integration not installed" and
      // "deleted in the scrubber". Cheap, and the failure mode it guards
      // against — someone adding an integration that emits crumbs — is exactly
      // the kind of change that gets made without re-reading this file.
      beforeBreadcrumb: () => null,
      beforeSend: (event: ErrorEvent) =>
        reportingAllowed ? scrubExtensionEvent(event) : null,
    });

    Sentry.setTag("component", `ci-browser-extension-${settings.component}`);

    armSwitchWatcher(options);

    return client;
  } catch {
    // Reporting must never break the extension.
    return undefined;
  }
}

function armSwitchWatcher(options: InitTelemetryOptions): void {
  if (unwatch) {
    return;
  }

  unwatch = watchErrorReporting((enabled) => {
    reportingAllowed = enabled;

    // Turned on after starting disabled: bring the client up now.
    if (enabled && !client) {
      void initTelemetry(options);
    }
  });
}

/**
 * `browser.runtime.getManifest().version`, or null where the API is absent
 * (tests). Read defensively — a manifest read must not be able to abort init.
 */
function readExtensionVersion(): string | null {
  try {
    return browser.runtime?.getManifest?.()?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Report an error.
 *
 * `context` is for small, code-authored facts — a phase name, a count, a
 * boolean. Never pass a URL, a page title, a captured record, a scrape result or
 * an axios config: the scrubber will redact what it recognises, but the way to
 * not leak something is to not send it. It is scrubbed here anyway, because
 * "never" is a convention and conventions decay.
 */
export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!client || !reportingAllowed) {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      if (context) {
        for (const [key, value] of Object.entries(context)) {
          if (value !== undefined) {
            scope.setExtra(key, scrubValue(value));
          }
        }
      }

      Sentry.captureException(error);
    });
  } catch {
    // Never let reporting throw into a caller's catch block.
  }
}

/**
 * Best-effort flush.
 *
 * An MV3 service worker is killed roughly 30s after its last event, and Sentry's
 * transport is asynchronous, so an event captured just before termination can
 * die in the queue. Awaiting this inside an alarm or message handler keeps the
 * in-flight `fetch` — and therefore the worker — alive long enough for the
 * common case.
 *
 * We deliberately do NOT use `makeBrowserOfflineTransport`. It would persist
 * un-sent error payloads to IndexedDB and replay them later, which means an
 * event could be delivered AFTER the user turned reporting off. Losing some
 * reports on worker shutdown is the better failure.
 */
export async function flushTelemetry(timeoutMs = 2000): Promise<boolean> {
  if (!client) {
    return true;
  }

  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}

/** Test seam. Not exported from the extension's runtime paths. */
export function __resetTelemetryForTests(): void {
  unwatch?.();
  unwatch = undefined;
  client = undefined;
  settings = null;
  reportingAllowed = false;
}
