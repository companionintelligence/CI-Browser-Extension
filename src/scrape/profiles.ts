/**
 * The scrape profile registry — the single source of truth for which sites the
 * extension can scrape.
 *
 * Adding a site is now ONE edit: drop a JSON profile in `src/scrapeProfiles/`
 * and add it to `PROFILE_MODULES` below. The content script's `matches` and the
 * runtime lookup table are both derived from this list, so it is no longer
 * possible for a profile to be registered but unreachable — which is exactly
 * what had happened to cnn, wsj, quora, robinhood, and airbnb.
 */

import type { ScrapeProfile } from "./types";

import airbnb from "@/scrapeProfiles/airbnb.json";
import cnn from "@/scrapeProfiles/cnn.json";
import disney from "@/scrapeProfiles/disney.json";
import github from "@/scrapeProfiles/github.json";
import hulu from "@/scrapeProfiles/hulu.json";
import max from "@/scrapeProfiles/max.json";
import netflix from "@/scrapeProfiles/netflix.json";
import paramount from "@/scrapeProfiles/paramount.json";
import primevideo from "@/scrapeProfiles/primevideo.json";
import quora from "@/scrapeProfiles/quora.json";
import robinhood from "@/scrapeProfiles/robinhood.json";
import slashdot from "@/scrapeProfiles/slashdot.json";
import wsj from "@/scrapeProfiles/wsj.json";

// `template.json` is documentation, not a profile, and is deliberately absent.
const PROFILE_MODULES = [
  airbnb,
  cnn,
  disney,
  github,
  hulu,
  max,
  netflix,
  paramount,
  primevideo,
  quora,
  robinhood,
  slashdot,
  wsj,
] as unknown as ScrapeProfile[];

export const SCRAPE_PROFILES: readonly ScrapeProfile[] = PROFILE_MODULES;

/**
 * Every match pattern across all profiles, deduped and sorted.
 *
 * The content script spreads this into its `matches`, so the manifest and the
 * registry cannot disagree.
 */
export const SCRAPE_MATCH_PATTERNS: string[] = [
  ...new Set(SCRAPE_PROFILES.flatMap((profile) => profile.matchPatterns)),
].sort();

/** Registrable domain for a URL, or null when it isn't a parseable web URL. */
export function registrableDomain(url: string): string | null {
  try {
    // Anchored, unlike the old `hostname.replace("www.", "")`, which was a bare
    // substring replace and would mangle any host merely containing "www.".
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The profile for a URL's domain, matching subdomains too (`open.max.com`
 * resolves to the `max.com` profile). Does NOT check `targetUrl` — see
 * `profileForUrl` in ./scraper for the full check.
 */
export function profileForDomain(url: string): ScrapeProfile | undefined {
  const host = registrableDomain(url);
  if (!host) {
    return undefined;
  }

  return SCRAPE_PROFILES.find(
    (profile) => host === profile.domain || host.endsWith(`.${profile.domain}`),
  );
}
