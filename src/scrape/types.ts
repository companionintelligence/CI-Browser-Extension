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
   * Data a user would not expect to be captured by default (brokerage
   * holdings, trade history). Gated behind an explicit opt-in — see
   * `sensitiveScrapingEnabled`.
   */
  sensitive?: boolean;
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
