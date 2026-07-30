/**
 * The scrape engine: run a profile's selectors against a document.
 *
 * Pure and DOM-only — it takes a `Document` and a URL and returns data. No
 * browser APIs, no storage, no network, so it unit-tests against jsdom.
 */

import { profileForDomain } from "./profiles";
import type {
  ScrapeProfile,
  ScrapeResult,
  ScrapedItem,
  ScrapeFieldConfig,
} from "./types";

/** Convert a `targetUrl` glob to an anchored regex. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*/g, ".*");

  return new RegExp(`^${escaped}$`);
}

function matchesTargetUrl(url: string, profile: ScrapeProfile): boolean {
  const targets = Array.isArray(profile.targetUrl)
    ? profile.targetUrl
    : [profile.targetUrl];

  return targets.some((pattern) => globToRegExp(pattern).test(url));
}

/**
 * The profile that should run for this URL: the domain must have one AND the
 * URL must be one of the pages that profile's selectors were written for.
 */
export function profileForUrl(url: string): ScrapeProfile | undefined {
  const profile = profileForDomain(url);

  return profile && matchesTargetUrl(url, profile) ? profile : undefined;
}

export function canScrape(url: string): boolean {
  return profileForUrl(url) !== undefined;
}

function readField(
  container: Element,
  config: ScrapeFieldConfig,
  baseUrl: string,
): string | undefined {
  const element = container.querySelector(config.selector);
  if (!element) {
    return undefined;
  }

  let value: string;
  switch (config.type) {
    case "attribute":
      value = element.getAttribute(config.attribute ?? "") ?? "";
      break;
    case "html":
      value = element.innerHTML || "";
      break;
    case "text":
    default:
      value = element.textContent || "";
  }

  return config.transform
    ? applyTransform(value, config.transform, baseUrl)
    : value;
}

export function applyTransform(
  value: string,
  transform: string,
  baseUrl: string,
): string {
  switch (transform) {
    case "trim":
      return value.trim();

    case "absoluteUrl":
      try {
        return new URL(value, baseUrl).href;
      } catch {
        return value;
      }

    case "parseDate": {
      const parts = value.trim().split("/");
      if (parts.length !== 3) {
        return value;
      }

      const [month, day, year] = parts;
      let fullYear = year;
      if (year.length === 2) {
        const currentYear = new Date().getFullYear() % 100;
        const century = Number.parseInt(year, 10) <= currentYear ? 2000 : 1900;
        fullYear = `${century + Number.parseInt(year, 10)}`;
      }

      const parsed = new Date(`${month}/${day}/${fullYear}`);

      return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
    }

    default:
      return value;
  }
}

/**
 * Extract a profile's data from a document, with a per-selector account of what
 * happened.
 *
 * The diagnostics exist because the two failure modes are otherwise
 * indistinguishable from success-with-no-data:
 *
 *   containersMatched = 0                  the container selector is stale
 *   containersMatched > 0, itemsProduced 0 containers found, but every field
 *                                          selector missed — the classic shape
 *                                          of a site redesign
 *
 * Both currently surface as "returned nothing", which is also what an empty
 * page looks like. `perFieldHitRate` narrows it further: one field at 0.0 while
 * the rest are 1.0 is a single renamed class, not a rewrite.
 *
 * This is the same signal the runtime drift detection will consume, so it lives
 * here rather than in the test harness.
 */
export interface SelectorDiagnostic {
  selector: string;
  personalDataType: string;
  containersMatched: number;
  itemsProduced: number;
  /** Fraction of containers in which each field selector found something, 0..1. */
  perFieldHitRate: Record<string, number>;
}

export interface ExtractionReport {
  result: ScrapeResult | null;
  diagnostics: SelectorDiagnostic[];
}

/** True when a selector matched containers but produced no usable rows. */
export function looksBroken(d: SelectorDiagnostic): boolean {
  return d.containersMatched > 0 && d.itemsProduced === 0;
}

/**
 * Run the matching profile over `document`. Pure and DOM-only, so it is
 * testable against a saved fixture with no browser APIs in play.
 */
export function extract(document: Document, url: string): ExtractionReport {
  const profile = profileForUrl(url);
  if (!profile) {
    return { result: null, diagnostics: [] };
  }

  const items: ScrapedItem[] = [];
  const diagnostics: SelectorDiagnostic[] = [];

  for (const [selector, config] of Object.entries(profile.dataSelectors)) {
    const containers = [...document.querySelectorAll(config.container)];
    const fieldNames = Object.keys(config.fields);
    const hits: Record<string, number> = Object.fromEntries(
      fieldNames.map((f) => [f, 0]),
    );
    let produced = 0;

    for (const container of containers) {
      const fields: Record<string, unknown> = {};

      for (const [fieldName, fieldConfig] of Object.entries(config.fields)) {
        const value = readField(container, fieldConfig, url);
        if (value !== undefined) {
          fields[fieldName] = value;
          hits[fieldName] += 1;
        }
      }

      // A container that matched but yielded no fields is a selector miss (the
      // site changed its markup), not data — recording it would create rows
      // with nothing in them.
      if (Object.keys(fields).length > 0) {
        items.push({
          selector,
          personalDataType: config.personalDataType,
          fields,
        });
        produced += 1;
      }
    }

    diagnostics.push({
      selector,
      personalDataType: config.personalDataType,
      containersMatched: containers.length,
      itemsProduced: produced,
      perFieldHitRate: Object.fromEntries(
        fieldNames.map((f) => [
          f,
          containers.length === 0 ? 0 : hits[f] / containers.length,
        ]),
      ),
    });
  }

  if (items.length === 0) {
    return { result: null, diagnostics };
  }

  return {
    result: {
      profileName: profile.name,
      domain: profile.domain,
      url,
      timestamp: new Date().toISOString(),
      items,
    },
    diagnostics,
  };
}

/**
 * Run the matching profile over `document`, or return null when this URL has no
 * profile or produced nothing.
 *
 * Every item carries its selector name and `personalDataType`, so the caller
 * can route each row to a typed destination rather than flattening the whole
 * page into one anonymous blob.
 */
export function scrape(document: Document, url: string): ScrapeResult | null {
  return extract(document, url).result;
}
