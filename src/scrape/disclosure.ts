/**
 * The Firefox data-collection disclosure for scrape profiles, derived from the
 * registry.
 *
 * AMO makes an add-on declare the kinds of data it collects. A hand-written list
 * drifts from the profiles that ship, so the optional categories are computed
 * from each profile's `dataCategories` at build time (wxt.config.ts), the same
 * way the content script's `matches` is derived from `matchPatterns`.
 *
 * The mapping below is a legal classification, so it is not guessed. A category
 * with no mapping is an error: a profile that declares one fails the Firefox
 * build until the owner decides which AMO category it falls under.
 */

import type { DataCategory, ScrapeProfile } from "./types";

/** The AMO data-collection keys this module can produce. */
export type FirefoxDisclosure =
  | "financialAndPaymentInfo"
  | "healthInfo"
  | "locationInfo";

const FIREFOX_DISCLOSURE: Partial<Record<DataCategory, FirefoxDisclosure>> = {
  financial: "financialAndPaymentInfo",
  health: "healthInfo",
  location: "locationInfo",
};

/**
 * The optional Firefox disclosure keys the given profiles need, sorted and
 * deduplicated. Throws when a profile declares a category that has no mapping.
 */
export function firefoxOptionalDisclosures(
  profiles: readonly Pick<ScrapeProfile, "domain" | "dataCategories">[],
): FirefoxDisclosure[] {
  const keys = new Set<FirefoxDisclosure>();

  for (const profile of profiles) {
    for (const category of profile.dataCategories ?? []) {
      const key = FIREFOX_DISCLOSURE[category];
      if (!key) {
        throw new Error(
          `No Firefox disclosure category for "${category}" (declared by ${profile.domain}). Classify it in src/scrape/disclosure.ts before this profile ships.`,
        );
      }

      keys.add(key);
    }
  }

  return [...keys].sort();
}
