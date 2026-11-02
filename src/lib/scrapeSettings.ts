/**
 * Consent for scrape profiles that read sensitive data.
 *
 * A profile declares the categories it reads (`dataCategories`). A profile that
 * declares any category runs only once the user has granted every one of them.
 * Consent is per category and off by default: granting `location` does not
 * grant `financial`, and a missing key grants nothing.
 *
 * The check lives in the content script, before the page is read, rather than
 * in the background as a filter after the fact: the point is not to read the
 * data at all, not to read it and then discard it.
 */

import type { DataCategory, ScrapeProfile } from "@/scrape/types";

export const SCRAPE_CONSENT_KEY = "scrapeConsent";

/** The categories the user has granted. Anything absent is not granted. */
export type ScrapeConsent = Partial<Record<DataCategory, boolean>>;

/**
 * Whether a profile may run under these grants. A profile that declares no
 * categories may always run, which is how every profile behaved before consent
 * existed.
 */
export function mayRunProfile(
  profile: Pick<ScrapeProfile, "dataCategories">,
  consent: ScrapeConsent,
): boolean {
  return (profile.dataCategories ?? []).every(
    (category) => consent[category] === true,
  );
}

/** The stored grants. Off unless explicitly granted: a failed read grants nothing. */
export async function readScrapeConsent(): Promise<ScrapeConsent> {
  try {
    const stored = await browser.storage.local.get(SCRAPE_CONSENT_KEY);
    const value = stored[SCRAPE_CONSENT_KEY];

    return value !== null && typeof value === "object"
      ? (value as ScrapeConsent)
      : {};
  } catch {
    return {};
  }
}
