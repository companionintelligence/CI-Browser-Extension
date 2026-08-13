/**
 * `beforeSend` payload scrubber for the browser extension.
 *
 * Ported from CI-Server `backend/apps/api/src/common/telemetry/scrubEvent.ts`
 * (post-adversarial-review), then hardened for the one thing no appliance
 * scrubber has to survive: **this code runs beside the user's open tabs.**
 *
 * Two rules exist only here.
 *
 * 1. **Every URL is sensitive, not just its query string.** On the appliance a
 *    URL is `/api/graph/search?query=…`; stripping the query left a harmless
 *    route. In a browser extension the origin and path ARE the private part —
 *    `mail.google.com`, `secure.chase.com`, `mychart.example.org/results/…`,
 *    `robinhood.com/account/positions`, a wiki article title, a document name.
 *    So `redactUrl` deletes the whole URL and leaves `[url]`, with one carve-out:
 *    the handful of **first-party Lifescope Portal hosts**, which are compiled
 *    into the extension, shared by every user, and identify nobody — for those
 *    the origin and path survive (query and hash do not), because the failing
 *    route is the single most useful fact in an API error. The user's own
 *    self-hosted Memory server is NOT on that list: its hostname is a tailnet
 *    name, a LAN name or a home IP, i.e. the user.
 *
 * 2. **The extension origin is an install identifier.** On Firefox
 *    `moz-extension://<uuid>` is a per-profile random UUID — a stable unique id
 *    for this install, present in every stack frame of every event. It is
 *    collapsed to `extension://` while the PATH is kept, so issue grouping
 *    (which keys on `filename`) still works. Same treatment for
 *    `chrome-extension://` and `safari-web-extension://`.
 *
 * Everything the SDK could attach that we cannot make safe is removed outright
 * rather than filtered — see `scrubExtensionEvent` for `request`, `breadcrumbs`
 * and `user`.
 */

import type { Breadcrumb, ErrorEvent, StackFrame } from "@sentry/browser";
import { PORTAL_ENVIRONMENTS } from "@/lib/portalEnvironments";

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(?:api[-_ ]?key|token|password|secret|jwt|auth)[\s=:"']+[^\s"',}\]]+/gi,
  /tskey-[A-Za-z0-9-]+/gi,
  // Non-HTTP connection URLs carry credentials in the authority section.
  // (HTTP(S) URLs never reach this rule — `redactUrl` has already eaten them.)
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/gi,
];

// Windows first: the macOS pattern also matches the `/Users/<name>` inside
// `C:/Users/<name>`, and replacing that leaves a stranded `C:~/…` with the drive
// letter still attached. The longest-prefix forms have to win.
const HOME_PATH_PATTERNS = [
  /[A-Za-z]:\\Users\\[^\\/\s]+/g, // Windows (backslash)
  /[A-Za-z]:\/Users\/[^/\s]+/g, // Windows (forward-slash)
  /\/Users\/[^/\s]+/g, // macOS
  /\/home\/[^/\s]+/g, // Linux
];

/**
 * Extension-scheme origins, with the trailing slash consumed so the result reads
 * `extension://background.js` rather than `extension:///background.js`.
 */
const EXTENSION_ORIGIN_PATTERN =
  /\b(?:chrome|moz|safari-web|ms-browser)-extension:\/\/[^/\s"'`)\]}]*\/?/gi;

/** Absolute HTTP(S) URLs anywhere in free text. */
const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>)\]}]+/gi;

// `api[-_ ]?key` (not the literals `apikey|api_key`) so the hyphenated header
// forms match too — the SDK ships request headers even with sendDefaultPii off.
const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|cookie|jwt|api[-_ ]?key|dsn|pepper|private[-_]?key|signature/i;

// Keys that name a PERSON rather than carrying a credential. No value pattern
// can ever match these — a username is just a word — so the key is the only
// signal, the same reason we drop `server_name`.
//
// Anchored on purpose: `user-agent`, `user_id` and `owner_id` are diagnostic
// signal worth keeping, and a naive /user|owner/ would eat all three.
const IDENTITY_KEY_PATTERN =
  /(?:^|[-_])user$|(?:^|[-_])owner$|username|email|forwarded|^remote-/i;

/** Single predicate so credential and identity coverage cannot diverge. */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || IDENTITY_KEY_PATTERN.test(key);
}

/**
 * Hosts whose URLs may keep their path. Derived from the compiled-in Portal
 * environment list so there is one source of truth: if a host is public enough
 * to ship in the picker, it is public enough to name in a crash report.
 */
export const FIRST_PARTY_HOSTS: ReadonlySet<string> = new Set(
  PORTAL_ENVIRONMENTS.map((env) => {
    try {
      return new URL(env.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }).filter(Boolean),
);

const MAX_STRING_LENGTH = 8000;

/**
 * Reduce one absolute URL to what may leave the machine.
 *
 * Deliberately NOT the appliance's `url.split(/[?#]/)[0]`: dropping the query
 * is meaningless here, because in a browser extension the host and path are the
 * private part. Everything becomes `[url]` unless the host is first-party.
 */
export function redactUrl(raw: string): string {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    return "[url]";
  }

  if (!FIRST_PARTY_HOSTS.has(parsed.hostname.toLowerCase())) {
    return "[url]";
  }

  // Query and hash go even on first-party hosts: the OIDC callback carries a
  // live authorization `code` there.
  return `${parsed.origin}${parsed.pathname}`;
}

export function scrubString(value: string): string {
  let scrubbed = value;

  for (const pattern of HOME_PATH_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "~");
  }

  // Before the HTTP rule (different schemes, no overlap) and before the secret
  // rules, so a stack frame keeps its path but loses the install id.
  scrubbed = scrubbed.replace(EXTENSION_ORIGIN_PATTERN, "extension://");
  scrubbed = scrubbed.replace(HTTP_URL_PATTERN, redactUrl);

  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "[Filtered]");
  }

  if (scrubbed.length > MAX_STRING_LENGTH) {
    return `${scrubbed.slice(0, MAX_STRING_LENGTH)}… [truncated]`;
  }

  return scrubbed;
}

export function scrubValue(value: unknown, depth = 0): unknown {
  // Guard against cyclic/deep structures — a runaway walk in beforeSend would
  // stall the reporting path on every captured error.
  if (depth > 8) {
    return "[Truncated]";
  }

  if (typeof value === "string") {
    return scrubString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      result[key] = isSensitiveKey(key)
        ? "[Filtered]"
        : scrubValue(nested, depth + 1);
    }

    return result;
  }

  return value;
}

function scrubFrame(frame: StackFrame): void {
  // `filename`/`abs_path` carry the extension origin (an install id on Firefox)
  // and, in a dev build, the developer's home directory.
  if (typeof frame.filename === "string") {
    frame.filename = scrubString(frame.filename);
  }

  if (typeof frame.abs_path === "string") {
    frame.abs_path = scrubString(frame.abs_path);
  }

  // Source text around the throw site, if a contextLines integration is ever
  // added. Real source is where hardcoded keys live.
  if (typeof frame.context_line === "string") {
    frame.context_line = scrubString(frame.context_line);
  }

  for (const key of ["pre_context", "post_context"] as const) {
    const lines = frame[key];

    if (Array.isArray(lines)) {
      frame[key] = lines.map((line) =>
        typeof line === "string" ? scrubString(line) : line,
      );
    }
  }

  if (frame.vars) {
    frame.vars = scrubValue(frame.vars) as Record<string, unknown>;
  }
}

/**
 * Scrub one breadcrumb.
 *
 * Nothing produces breadcrumbs today — `beforeBreadcrumb` in ./index drops every
 * one and `breadcrumbsIntegration` is not installed, because the console crumbs
 * this codebase would generate carry entire browsing records (`console.error
 * ("Failed activities:", browserActivities)` puts URLs and page titles straight
 * into `data.arguments`) and the DOM crumbs would record the user's clicks and
 * keystrokes on every page. This exists so that if a future change reinstates
 * any of them, they still land here rather than on the wire.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = scrubString(breadcrumb.message);
  }

  if (breadcrumb.data) {
    // Pass the WHOLE object, not each value: `scrubValue` only applies the
    // sensitive-KEY check while walking an object's own entries, so calling it
    // per-value lets a bare `data.token` through — the value alone matches no
    // secret pattern.
    breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  }

  return breadcrumb;
}

export function scrubExtensionEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.message) {
    event.message = scrubString(event.message);
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = scrubString(exception.value);
    }

    for (const frame of exception.stacktrace?.frames ?? []) {
      scrubFrame(frame);
    }

    if (exception.mechanism?.data) {
      exception.mechanism.data = scrubValue(exception.mechanism.data) as Record<
        string,
        string
      >;
    }
  }

  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>;
  }

  if (event.tags) {
    event.tags = scrubValue(event.tags) as typeof event.tags;
  }

  if (event.contexts) {
    // `culture` (locale + timezone) is coarse location and a fingerprint; the
    // integration is not installed, this is the belt-and-braces half.
    delete event.contexts.culture;
    event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  }

  // Nothing identifies the user. `sendDefaultPii: false` does not stop a scope
  // from carrying one.
  delete event.user;
  delete event.server_name;

  // `request` is removed WHOLESALE rather than filtered. In an extension
  // `httpContextIntegration` fills it from `location.href` — which in a popup is
  // the install-identifying extension origin and in a content script would be
  // the page the user is reading. There is no field in here worth the risk, so
  // the integration is off and this is the second lock.
  delete event.request;

  // Same reasoning: see scrubBreadcrumb. Any crumb that exists at this point
  // arrived from somewhere we did not audit.
  delete event.breadcrumbs;

  return event;
}
