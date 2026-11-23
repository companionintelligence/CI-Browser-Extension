/**
 * The scrape engine: run a profile's selectors against a document.
 *
 * Pure and DOM-only — it takes a `Document` and a URL and returns data. No
 * browser APIs, no storage, no network, so it unit-tests against jsdom. The one
 * exception is the consent type, which is a plain map and imports no API.
 */

import { mayRunProfile, type ScrapeConsent } from "@/lib/scrapeSettings";
import { profileForDomain } from "./profiles";
import type {
  Money,
  ScrapeDomSelectorConfig,
  ScrapeFieldConfig,
  ScrapeJsonSelectorConfig,
  ScrapedItem,
  ScrapeProfile,
  ScrapeResult,
  ScrapeSelectorConfig,
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

// ---------------------------------------------------------------------------
// Value normalization
// ---------------------------------------------------------------------------

const MONTH_INDEX = new Map<string, number>();
[
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
].forEach((name, index) => {
  MONTH_INDEX.set(name, index);
  MONTH_INDEX.set(name.slice(0, 3), index);
});
MONTH_INDEX.set("sept", 8);

/** A real calendar day as YYYY-MM-DD, or null when it does not exist. */
function calendarDate(
  year: number,
  monthIndex: number,
  day: number,
): string | null {
  const parsed = new Date(Date.UTC(year, monthIndex, day));

  // Date.UTC rolls 2/30 over into March and reads year 0026 as 1926, so anything
  // that moved was invalid.
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === monthIndex &&
    parsed.getUTCDate() === day
    ? parsed.toISOString().slice(0, 10)
    : null;
}

/**
 * Read a date as a calendar day (YYYY-MM-DD), or null when it is not one.
 *
 * Accepted: M/D/Y (US numeric, as Netflix writes it), ISO `2026-03-04`,
 * `March 3, 2026` and `05 Mar 2026`. A day carries no time zone, so none is
 * attached: any instant would read as the previous day somewhere in the world.
 */
export function parseCalendarDate(raw: string): string | null {
  const value = raw.trim();

  const numeric = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(
    value,
  );
  if (numeric) {
    const [, month, day, rawYear] = numeric;
    let year = Number(rawYear);
    if (rawYear.length === 2) {
      // UTC so the century can't depend on the browser's zone. One year ahead
      // because a row dated 1/1 can appear before New Year reaches UTC.
      const latestYear = (new Date().getUTCFullYear() % 100) + 1;
      year += year <= latestYear ? 2000 : 1900;
    }

    return calendarDate(year, Number(month) - 1, Number(day));
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    return calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  // "March 3, 2026", "Mar 3 2026"
  const monthFirst = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(value);
  if (monthFirst) {
    const monthIndex = MONTH_INDEX.get(monthFirst[1].toLowerCase());

    return monthIndex === undefined
      ? null
      : calendarDate(Number(monthFirst[3]), monthIndex, Number(monthFirst[2]));
  }

  // "05 Mar 2026", "5 March, 2026"
  const dayFirst = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(value);
  if (dayFirst) {
    const monthIndex = MONTH_INDEX.get(dayFirst[2].toLowerCase());

    return monthIndex === undefined
      ? null
      : calendarDate(Number(dayFirst[3]), monthIndex, Number(dayFirst[1]));
  }

  return null;
}

/**
 * Symbols that name a currency. A bare `$` is deliberately absent from the
 * useful ones: it is USD, CAD, AUD, NZD and more, so it yields an amount with
 * no code rather than a guess.
 */
const CURRENCY_SYMBOLS = new Map<string, string | null>([
  ["€", "EUR"],
  ["£", "GBP"],
  ["₹", "INR"],
  ["₩", "KRW"],
  ["US$", "USD"],
  ["CA$", "CAD"],
  ["C$", "CAD"],
  ["A$", "AUD"],
  ["AU$", "AUD"],
  ["NZ$", "NZD"],
  ["HK$", "HKD"],
  ["$", null],
]);

/** A currency code (`CHF`) or a symbol (`€`, `R$`), and nothing else. */
function isCurrencyToken(token: string): boolean {
  return (
    CURRENCY_SYMBOLS.has(token) ||
    /^[A-Z]{3}$/.test(token) ||
    /^[A-Z]{0,2}\$$/.test(token)
  );
}

function currencyFor(token: string): string | null {
  if (CURRENCY_SYMBOLS.has(token)) {
    return CURRENCY_SYMBOLS.get(token) ?? null;
  }

  return /^[A-Z]{3}$/.test(token) ? token : null;
}

/**
 * The number in a price string, with the separators read by position: the last
 * of `,` and `.` is the decimal mark, and the other one groups thousands. A lone
 * comma followed by exactly three digits is grouping (`1,234`); any other lone
 * comma is a decimal mark (`42,19`).
 */
function parseAmount(core: string): number | null {
  let body = core;
  const negative = body.startsWith("-");
  if (negative) {
    body = body.slice(1);
  }

  // Spaces and apostrophes group thousands in some locales; they are never a
  // decimal mark.
  body = body.replace(/[ \u00a0']/g, "");

  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    body =
      lastComma > lastDot
        ? body.replace(/\./g, "").replace(",", ".")
        : body.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const digitsAfter = body.length - lastComma - 1;
    body =
      body.indexOf(",") === lastComma && digitsAfter !== 3
        ? body.replace(",", ".")
        : body.replace(/,/g, "");
  } else if (lastDot !== -1 && body.indexOf(".") !== lastDot) {
    body = body.replace(/\./g, "");
  }

  const amount = Number(body);

  return Number.isFinite(amount) ? (negative ? -amount : amount) : null;
}

/**
 * A price as a structured amount, or the raw text when it is not one. A number
 * with a sentence around it (`2 nights`) is not money, so it stays raw.
 */
export function parseMoney(raw: string): Money | string {
  const value = raw.trim();

  const core = /-?\d+(?:[.,'\u00a0 ]\d+)*/.exec(value);
  if (!core) {
    return raw;
  }

  const before = value.slice(0, core.index).trim();
  const after = value.slice(core.index + core[0].length).trim();

  // The currency goes on one side of the number, never both.
  if (before && after) {
    return raw;
  }

  const token = before || after;
  if (token && !isCurrencyToken(token)) {
    return raw;
  }

  const amount = parseAmount(core[0]);
  if (amount === null) {
    return raw;
  }

  return { amount, currency: token ? currencyFor(token) : null };
}

/** `applyTransform`'s string transforms. `money` returns a structure, see readField. */
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

    case "parseDate":
      return parseCalendarDate(value) ?? value;

    default:
      return value;
  }
}

// ---------------------------------------------------------------------------
// Source readers
// ---------------------------------------------------------------------------

function readField(
  container: Element,
  config: ScrapeFieldConfig,
  baseUrl: string,
): unknown {
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

  if (config.transform === "money") {
    return parseMoney(value);
  }

  return config.transform
    ? applyTransform(value, config.transform, baseUrl)
    : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every value a path reaches from `root`, or [] when nothing does. Never throws:
 * a missing key, a value of the wrong type, or an array indexed as an object
 * all simply reach nothing.
 *
 * `key[*]` fans out over an array, so `sections[*].items` reaches the `items` of
 * every section.
 */
export function resolvePath(root: unknown, path: string): unknown[] {
  let nodes: unknown[] = [root];

  for (const segment of path.split(".")) {
    const fansOut = segment.endsWith("[*]");
    const key = fansOut ? segment.slice(0, -3) : segment;
    const next: unknown[] = [];

    for (const node of nodes) {
      if (!isRecord(node) || !Object.prototype.hasOwnProperty.call(node, key)) {
        continue;
      }

      const value = node[key];
      if (!fansOut) {
        next.push(value);
      } else if (Array.isArray(value)) {
        for (const element of value) {
          next.push(element);
        }
      }
    }

    nodes = next;
  }

  return nodes;
}

/** The first value that reads as text, number or boolean, as text. */
function firstScalar(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "boolean") {
      return String(value);
    }
  }

  return undefined;
}

/**
 * The records a JSON selector reads: for each script that matches, parse it and
 * collect the arrays `rootPath` reaches. A script that is not JSON is skipped,
 * not fatal, because one broken block on a page should not hide the others.
 */
function jsonRecords(
  document: Document,
  config: ScrapeJsonSelectorConfig,
): unknown[] {
  const records: unknown[] = [];

  for (const script of Array.from(document.querySelectorAll(config.script))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }

    for (const found of resolvePath(parsed, config.rootPath)) {
      if (Array.isArray(found)) {
        for (const record of found) {
          records.push(record);
        }
      }
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extraction diagnostics. Each one is a pure count with the selector name:
 * never page content, so it is safe to log.
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
  /** Containers for a DOM selector, JSON records for a `from: "json"` one. */
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

/** What one selector found, before it is turned into scraped items. */
interface SelectorRun {
  matched: number;
  /** One field map per matched item that produced at least one field. */
  rows: Record<string, unknown>[];
  /** How many matched items each field yielded a value for. */
  hits: Record<string, number>;
}

/** A selector that reads embedded JSON rather than DOM containers. */
function isJsonSelector(
  config: ScrapeSelectorConfig,
): config is ScrapeJsonSelectorConfig {
  return (config as { from?: unknown }).from === "json";
}

function runDomSelector(
  document: Document,
  config: ScrapeDomSelectorConfig,
  url: string,
): SelectorRun {
  const containers = Array.from(document.querySelectorAll(config.container));
  const hits: Record<string, number> = Object.fromEntries(
    Object.keys(config.fields).map((f) => [f, 0]),
  );
  const rows: Record<string, unknown>[] = [];

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
    // site changed its markup), not data — recording it would create rows with
    // nothing in them.
    if (Object.keys(fields).length > 0) {
      rows.push(fields);
    }
  }

  return { matched: containers.length, rows, hits };
}

function runJsonSelector(
  document: Document,
  config: ScrapeJsonSelectorConfig,
): SelectorRun {
  const records = jsonRecords(document, config);
  const hits: Record<string, number> = Object.fromEntries(
    Object.keys(config.fields).map((f) => [f, 0]),
  );
  const rows: Record<string, unknown>[] = [];

  for (const record of records) {
    const fields: Record<string, unknown> = {};

    for (const [fieldName, path] of Object.entries(config.fields)) {
      const value = firstScalar(resolvePath(record, path));
      if (value !== undefined) {
        fields[fieldName] = value;
        hits[fieldName] += 1;
      }
    }

    if (Object.keys(fields).length > 0) {
      rows.push(fields);
    }
  }

  return { matched: records.length, rows, hits };
}

/** The item's event date, when its `occurredAtField` names a value that parses. */
function occurredAtOf(
  fields: Record<string, unknown>,
  occurredAtField: string | undefined,
): string | undefined {
  if (!occurredAtField) {
    return undefined;
  }

  const value = fields[occurredAtField];

  return typeof value === "string"
    ? (parseCalendarDate(value) ?? undefined)
    : undefined;
}

/**
 * Run one profile over `document`, with a per-selector account of what
 * happened. Pure, so a profile under test needs no registry entry.
 *
 * Nothing runs unless `consent` grants every category the profile declares. The
 * check is here as well as in the content script, so a future caller cannot read
 * gated data by forgetting it.
 */
export function extractProfile(
  profile: ScrapeProfile,
  document: Document,
  url: string,
  consent: ScrapeConsent = {},
): ExtractionReport {
  if (!mayRunProfile(profile, consent)) {
    return { result: null, diagnostics: [] };
  }

  const items: ScrapedItem[] = [];
  const diagnostics: SelectorDiagnostic[] = [];

  for (const [selector, config] of Object.entries(profile.dataSelectors)) {
    const run = isJsonSelector(config)
      ? runJsonSelector(document, config)
      : runDomSelector(document, config, url);

    diagnostics.push({
      selector,
      personalDataType: config.personalDataType,
      containersMatched: run.matched,
      itemsProduced: run.rows.length,
      perFieldHitRate: Object.fromEntries(
        Object.keys(run.hits).map((f) => [
          f,
          run.matched === 0 ? 0 : run.hits[f] / run.matched,
        ]),
      ),
    });

    for (const fields of run.rows) {
      const occurredAt = occurredAtOf(fields, config.occurredAtField);

      items.push({
        selector,
        personalDataType: config.personalDataType,
        ...(config.contentType ? { contentType: config.contentType } : {}),
        ...(occurredAt ? { occurredAt } : {}),
        fields,
      });
    }
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
 * Extract a URL's data from a document, or an empty report when no profile covers
 * the URL.
 */
export function extract(
  document: Document,
  url: string,
  consent: ScrapeConsent = {},
): ExtractionReport {
  const profile = profileForUrl(url);
  if (!profile) {
    return { result: null, diagnostics: [] };
  }

  return extractProfile(profile, document, url, consent);
}

/**
 * Run the matching profile over `document`, or return null when this URL has no
 * profile, the user has not granted what it reads, or it produced nothing.
 *
 * Every item carries its selector name and `personalDataType`, so the caller
 * can route each row to a typed destination rather than flattening the whole
 * page into one anonymous blob.
 */
export function scrape(
  document: Document,
  url: string,
  consent: ScrapeConsent = {},
): ScrapeResult | null {
  return extract(document, url, consent).result;
}
