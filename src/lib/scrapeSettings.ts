/**
 * Opt-in gate for sensitive scrape profiles.
 *
 * Some profiles read data a user would not expect to be captured just because
 * the extension is installed — Robinhood's portfolio holdings and order history
 * being the clear case. Those profiles are marked `sensitive` and do not run
 * unless the user turns this on.
 *
 * The check lives in the content script, before scraping, rather than in the
 * background as a filter after the fact: the point is not to read brokerage
 * data at all, not to read it and then discard it.
 */

export const SENSITIVE_SCRAPING_KEY = "sensitiveScrapingEnabled";

/** Off unless explicitly enabled — a missing key means "not opted in". */
export async function isSensitiveScrapingEnabled(): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(SENSITIVE_SCRAPING_KEY);

    return stored[SENSITIVE_SCRAPING_KEY] === true;
  } catch {
    return false;
  }
}
