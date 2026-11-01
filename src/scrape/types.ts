/**
 * Scrape profile schema.
 *
 * A profile is the single source of truth for one site: where it may run
 * (`matchPatterns` + `targetUrl`), what to pull (`dataSelectors`), and — the
 * part that was previously missing — what each thing *is* (`personalDataType`).
 *
 * The old schema kept a separate top-level `dataTypes[]` array whose `name`
 * values were supposed to correspond to `dataSelectors` keys but frequently did
 * not (`viewingHistory` vs `viewing_history`, `continueWatching` vs
 * `viewing_progress`). Nothing ever read it, so every scrape reached the server
 * as an untyped row. The classification now lives on the selector it describes,
 * where it cannot drift.
 */

/**
 * Kinds of personal data a profile can declare it reads. Each one is consent-
 * gated: a profile that declares it does not run until the user grants it.
 *
 * `purchases`, `reading` and `media` have no Firefox disclosure category yet
 * (see `./disclosure`), so a profile declaring one fails the Firefox build until
 * that classification is made.
 */
export const DATA_CATEGORIES = [
  "financial",
  "health",
  "location",
  "purchases",
  "reading",
  "media",
] as const;

export type DataCategory = (typeof DATA_CATEGORIES)[number];

export interface ScrapeFieldConfig {
  selector: string;
  type: "text" | "attribute" | "html";
  attribute?: string;
  transform?: string;
}

export interface ScrapeSelectorConfig {
  /**
   * What this data *is* — becomes the `type` of the CI-Server content record,
   * e.g. `entertainment_preferences`, `professional_activity`, `financial_data`.
   */
  personalDataType: string;
  container: string;
  fields: Record<string, ScrapeFieldConfig>;
}

export interface ScrapeProfile {
  /** Registrable domain, e.g. `netflix.com`. Subdomains match automatically. */
  domain: string;
  name: string;
  description: string;
  /**
   * Manifest match patterns for the content script. Declaring them here is what
   * lets the content script derive its own `matches` from the registry; the old
   * hand-maintained parallel list is why five profiles were registered but
   * could never run.
   */
  matchPatterns: string[];
  /** URL glob(s) within the domain where the selectors actually apply. */
  targetUrl: string | string[];
  /**
   * Categories of personal data this profile reads that the user has to consent
   * to. Declared per profile, so a profile with one gated selector is gated as a
   * whole. Absent or empty: the profile runs as it always has. Otherwise it runs
   * only once every listed category is granted (default off). See
   * `@/lib/scrapeSettings`.
   */
  dataCategories?: DataCategory[];
  dataSelectors: Record<string, ScrapeSelectorConfig>;
}

/** One scraped row, with the classification carried through from its selector. */
export interface ScrapedItem {
  /** The `dataSelectors` key this came from, e.g. `viewingHistory`. */
  selector: string;
  personalDataType: string;
  fields: Record<string, unknown>;
}

export interface ScrapeResult {
  profileName: string;
  domain: string;
  url: string;
  timestamp: string;
  /** Flat list — each item knows its own selector and type. */
  items: ScrapedItem[];
}
