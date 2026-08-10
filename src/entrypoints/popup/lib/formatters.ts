import { parseUrl } from "@/utils";

/** "5 min ago" — coarse on purpose; the exact datetime goes in `title`. */
export function relativeTime(iso: string | number | null): string | null {
  if (!iso) {
    return null;
  }

  const then = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(then)) {
    return null;
  }

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} d ago`;
  }

  return new Date(then).toLocaleDateString();
}

export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  return parseUrl(url)?.host ?? null;
}

export function durationSeconds(ms: number | undefined): string | null {
  if (typeof ms !== "number" || Number.isNaN(ms)) {
    return null;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Ignore-list entries are regexes (see isUrlBlacklisted). Quick-add paths
 * escape what they insert so "github.com" can't accidentally match
 * "githubXcom"; hand-typed patterns are stored verbatim.
 */
export function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether `entry` is exactly this hostname (escaped or literal) rather than a
 * broader pattern that happens to match it — drives the pattern-aware
 * "Stop ignoring" behavior.
 */
export function isExactHostEntry(entry: string, hostname: string): boolean {
  return entry === hostname || entry === escapeRegex(hostname);
}

/**
 * Typed site patterns are restricted to literals plus `\.` and `.*` — no
 * groups, classes, alternation, or explicit quantifiers. isUrlBlacklisted
 * compiles entries on EVERY navigation (and per history row during sync), so
 * a catastrophic-backtracking pattern like `(a+)+$` would wedge the
 * background and the popup with no UI path to recovery. Exponential blowup
 * needs nested groups; this charset makes that structurally impossible.
 */
const SAFE_SITE_PATTERN = /^[a-zA-Z0-9.*\\_-]+$/;

export function isSafeSitePattern(value: string): boolean {
  if (value.length > 200 || !SAFE_SITE_PATTERN.test(value)) {
    return false;
  }

  try {
    new RegExp(value);

    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a page entry will compile inside isUrlBlacklisted (which escapes
 * the first `?` itself). Entries are stored raw for back-compat, and one
 * throwing entry silently disables every entry after it — fail-open — so
 * anything that can't compile must be rejected before it is stored.
 */
export function compilesAsPageEntry(value: string): boolean {
  try {
    new RegExp(value.replace("?", "\\?"));

    return true;
  } catch {
    return false;
  }
}

/** URL with its hash stripped, matching the page-ignore storage format. */
export function urlWithoutHash(url: string): string | null {
  const parsed = parseUrl(url);
  if (!parsed) {
    return null;
  }

  parsed.hash = "";

  return parsed.toString();
}

/** Pages the browser will never let a content script see. */
export function isCapturableUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  return /^https?:\/\//i.test(url);
}
