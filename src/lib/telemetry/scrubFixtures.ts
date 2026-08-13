/**
 * Redaction cases every copy of the scrubber must handle identically.
 *
 * `SCRUB_CASES` is a COPY of
 * CI-Server `backend/apps/api/src/common/telemetry/scrubFixtures.ts`, kept
 * byte-identical so the fleet's scrubbers cannot drift. A parity test in each
 * suite runs it through that repo's own `scrubString`. Duplicated rather than
 * shared because the implementations live in separate build graphs.
 *
 * `EXTENSION_SCRUB_CASES` holds the rules that exist ONLY here, because they
 * describe leaks only a browser extension has: page URLs, and the extension
 * origin (which on Firefox is a per-install random UUID).
 *
 * Deliberately expressed as string→string so it can be consumed by any copy
 * without importing an SDK type.
 */
export interface ScrubCase {
  readonly name: string;
  readonly input: string;
  /** Substrings that must NOT survive. */
  readonly mustNotContain?: readonly string[];
  /** Exact expected output, where the rule is fully deterministic. */
  readonly expected?: string;
}

export const SCRUB_CASES: readonly ScrubCase[] = [
  {
    name: "bearer token",
    input: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def",
    mustNotContain: ["eyJhbGciOiJIUzI1NiJ9"],
  },
  {
    name: "labelled api key",
    input: "api_key=sk-live-1234567890",
    mustNotContain: ["sk-live-1234567890"],
  },
  {
    name: "hyphenated api key",
    input: "api-key: sk-live-0987654321",
    mustNotContain: ["sk-live-0987654321"],
  },
  {
    name: "labelled password",
    input: "password: hunter2",
    mustNotContain: ["hunter2"],
  },
  {
    name: "tailscale auth key",
    input: "tskey-auth-abc123-def456",
    expected: "[Filtered]",
  },
  {
    name: "credentials in a connection URL",
    input: "postgres://ci:pgadmin_s3cure@db:5432/companion",
    mustNotContain: ["pgadmin_s3cure"],
  },
  {
    name: "macOS home path",
    input: "/Users/liam/devel/ci/file.ts",
    expected: "~/devel/ci/file.ts",
  },
  {
    name: "Linux home path",
    input: "/home/ci/data/timeline.db",
    expected: "~/data/timeline.db",
  },
  {
    name: "Windows home path, backslash",
    input: "C:\\Users\\liam\\app.log",
    expected: "~\\app.log",
  },
  {
    // Regression: the macOS rule used to match inside this and leave `C:~/…`.
    name: "Windows home path, forward slash",
    input: "C:/Users/liam/AppData/ci",
    expected: "~/AppData/ci",
  },
  {
    name: "ordinary text is untouched",
    input: 'Cannot read properties of undefined (reading "id")',
    expected: 'Cannot read properties of undefined (reading "id")',
  },
];

/**
 * Extension-only rules. Every one of these is a leak the appliance scrubbers do
 * not have to think about, because nothing on the appliance runs beside the
 * user's open tabs.
 */
export const EXTENSION_SCRUB_CASES: readonly ScrubCase[] = [
  {
    // Firefox errors quote the offending URL in the message text.
    name: "URL inside an exception message",
    input:
      "URL constructor: https://mail.google.com/mail/u/0/#inbox/FMfcgz is not a valid URL.",
    expected: "URL constructor: [url] is not a valid URL.",
  },
  {
    name: "bank origin, no query string in sight",
    input: "Failed to fetch https://secure.chase.com/web/auth/dashboard",
    expected: "Failed to fetch [url]",
  },
  {
    name: "a health portal path is the diagnosis",
    input: "TypeError at https://mychart.example.org/results/oncology/2026",
    expected: "TypeError at [url]",
  },
  {
    name: "the brokerage the financial opt-in unlocks",
    input: "scrape failed on https://robinhood.com/account/positions",
    expected: "scrape failed on [url]",
  },
  {
    // The self-hosted Memory server is the user's own machine — a tailnet name,
    // a LAN hostname, or a home IP. Not first-party, so not kept.
    name: "self-hosted Memory server host",
    input: "POST https://companion.liam-home.ts.net/api/v1/contents failed",
    expected: "POST [url] failed",
  },
  {
    // First-party Lifescope hosts survive, path and all: the failing route is
    // the single most useful fact in an API error and the host is shared by
    // every user, so it identifies nobody.
    name: "first-party Portal URL keeps its path",
    input: "401 from https://hub.ci.computer/api/auth/token",
    expected: "401 from https://hub.ci.computer/api/auth/token",
  },
  {
    name: "first-party Portal URL still loses its query string",
    input: "https://hub.ci.computer/extension/oidc-callback?code=abc&state=xyz",
    expected: "https://hub.ci.computer/extension/oidc-callback",
    mustNotContain: ["abc", "state"],
  },
  {
    // moz-extension origins are a per-PROFILE random UUID: a stable unique
    // identifier for this install, in every stack frame of every event.
    name: "Firefox extension UUID origin",
    input:
      "at handleSync (moz-extension://3f2b1c4d-9a8e-4f10-b2c3-d4e5f6a7b8c9/background.js:42:9)",
    expected: "at handleSync (extension://background.js:42:9)",
    mustNotContain: ["3f2b1c4d"],
  },
  {
    name: "Chrome extension id origin",
    input: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html",
    expected: "extension://popup.html",
  },
  {
    name: "Safari extension origin",
    input: "safari-web-extension://ABCD-1234/background.js",
    expected: "extension://background.js",
  },
  {
    name: "bare extension origin with no path",
    input: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    expected: "extension://",
  },
];

/** Strings longer than this must be truncated by every copy. */
export const MAX_STRING_LENGTH = 8000;
