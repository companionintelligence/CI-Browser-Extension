/**
 * The ignore list, enforced over outgoing captures.
 *
 * This exists because enforcing it per-capture-path failed. `isUrlBlacklisted`
 * was called in exactly two places — live page-view capture and the history
 * backfill loop — so saved highlights, scraped site data, bookmarks and
 * downloads all bypassed it. Adding netflix.com to the ignore list still
 * uploaded your Netflix viewing history, while the README, PRIVACY.md,
 * CAPTURE.md and the store listing all promised the opposite.
 *
 * The filter now runs at the single transport choke point, so a capture path
 * added later cannot forget to apply it.
 */

import type { BrowserActivity } from "@/services/browserActivity";
import { isUrlBlacklisted } from "@/utils";

/**
 * Keep only captures the user has not ignored.
 *
 * A capture with no URL is kept: there is nothing to match an ignore rule
 * against, and dropping it would silently discard data the rules never
 * mentioned.
 */
export function dropIgnoredCaptures(
  activities: BrowserActivity[],
  siteBlacklist: string[] = [],
  pageBlacklist: string[] = [],
): BrowserActivity[] {
  if (siteBlacklist.length === 0 && pageBlacklist.length === 0) {
    return activities;
  }

  return activities.filter(
    (a) => !a.url || !isUrlBlacklisted(a.url, siteBlacklist, pageBlacklist),
  );
}
