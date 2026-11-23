/**
 * Runtime validation for scrape profiles.
 *
 * Profiles are JSON, imported and cast (`as unknown as ScrapeProfile[]`), so
 * TypeScript checks nothing about them. A misspelled `atribute`, a missing
 * `personalDataType`, or `type: "txt"` compiles, ships, and then silently
 * yields nothing at runtime — indistinguishable from a site that changed its
 * markup. This turns all three into a test failure.
 *
 * Hand-rolled rather than zod/ajv: the schema is small and closed, and the
 * extension ships every dependency to the user's browser.
 */

import {
  DATA_CATEGORIES,
  type DataCategory,
  type ScrapeProfile,
} from "./types";

export const FIELD_TYPES = ["text", "attribute", "html"] as const;
export const TRANSFORMS = [
  "trim",
  "absoluteUrl",
  "parseDate",
  "money",
] as const;

/** Keys a DOM selector may carry. Anything else is a typo, or a retired key. */
const DOM_SELECTOR_KEYS = [
  "personalDataType",
  "contentType",
  "occurredAtField",
  "container",
  "fields",
];

/** Keys a JSON selector may carry. */
const JSON_SELECTOR_KEYS = [
  "personalDataType",
  "contentType",
  "occurredAtField",
  "from",
  "script",
  "rootPath",
  "fields",
];

/** Longest `readyTimeoutMs` a profile may set: a page that takes longer is not ready. */
const MAX_READY_TIMEOUT_MS = 60_000;

/** `schema` names such as `media.watch`: lowercase segments joined by dots. */
const CONTENT_TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/**
 * One path segment: a key, optionally followed by `[*]` to fan out over an
 * array. Nothing else, so `items[0]` or `a..b` is rejected rather than read as
 * a key that never matches.
 */
const PATH_SEGMENT_RE = /^[A-Za-z0-9_$-]+(\[\*\])?$/;

export interface ValidationIssue {
  /** Dotted path to the offending value, e.g. `dataSelectors.trips.fields.city.type`. */
  path: string;
  message: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** A JSON path such as `payment.grandTotal` or `sections[*].items`. */
export function isValidPath(path: string): boolean {
  return path.split(".").every((segment) => PATH_SEGMENT_RE.test(segment));
}

function validateField(
  path: string,
  raw: unknown,
  issues: ValidationIssue[],
): void {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: "field must be an object" });

    return;
  }

  if (!nonEmptyString(raw.selector)) {
    issues.push({ path: `${path}.selector`, message: "missing selector" });
  }

  if (!FIELD_TYPES.includes(raw.type as (typeof FIELD_TYPES)[number])) {
    issues.push({
      path: `${path}.type`,
      message: `type must be one of ${FIELD_TYPES.join(" | ")}, got ${JSON.stringify(raw.type)}`,
    });
  }

  // `attribute` is what an attribute field reads; without it the field can only
  // ever produce "".
  if (raw.type === "attribute" && !nonEmptyString(raw.attribute)) {
    issues.push({
      path: `${path}.attribute`,
      message: 'type "attribute" requires a non-empty `attribute`',
    });
  }

  if (
    raw.transform !== undefined &&
    !TRANSFORMS.includes(raw.transform as (typeof TRANSFORMS)[number])
  ) {
    issues.push({
      path: `${path}.transform`,
      message: `unknown transform ${JSON.stringify(raw.transform)} — the engine passes unknown transforms through silently, so this would be a no-op`,
    });
  }

  for (const key of Object.keys(raw)) {
    if (!["selector", "type", "attribute", "transform"].includes(key)) {
      issues.push({
        path: `${path}.${key}`,
        message: "unknown key (typo?) — the engine ignores it",
      });
    }
  }
}

/**
 * The selector-level keys shared by both source kinds: the classification, the
 * optional envelope declarations, and the unknown-key check.
 */
function validateSelectorCommon(
  at: string,
  selector: Record<string, unknown>,
  allowedKeys: string[],
  issues: ValidationIssue[],
): void {
  // The whole point of the schema: an unclassified selector produces rows the
  // server cannot type.
  if (!nonEmptyString(selector.personalDataType)) {
    issues.push({
      path: `${at}.personalDataType`,
      message: "missing personalDataType — scraped rows would be untyped",
    });
  }

  if (
    selector.contentType !== undefined &&
    !(
      typeof selector.contentType === "string" &&
      CONTENT_TYPE_RE.test(selector.contentType)
    )
  ) {
    issues.push({
      path: `${at}.contentType`,
      message: `must be a dotted lowercase name such as "media.watch", got ${JSON.stringify(selector.contentType)}`,
    });
  }

  for (const key of Object.keys(selector)) {
    if (!allowedKeys.includes(key)) {
      issues.push({
        path: `${at}.${key}`,
        message: "unknown key (typo?) — the engine ignores it",
      });
    }
  }
}

/** `occurredAtField` must name one of this selector's own fields. */
function validateOccurredAtField(
  at: string,
  selector: Record<string, unknown>,
  fieldNames: string[],
  issues: ValidationIssue[],
): void {
  if (selector.occurredAtField === undefined) {
    return;
  }

  if (
    !nonEmptyString(selector.occurredAtField) ||
    !fieldNames.includes(selector.occurredAtField)
  ) {
    issues.push({
      path: `${at}.occurredAtField`,
      message: `must name one of this selector's fields (${fieldNames.join(", ") || "none"}), got ${JSON.stringify(selector.occurredAtField)}`,
    });
  }
}

function validateDomSelector(
  at: string,
  selector: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  validateSelectorCommon(at, selector, DOM_SELECTOR_KEYS, issues);

  if (!nonEmptyString(selector.container)) {
    issues.push({ path: `${at}.container`, message: "missing container" });
  }

  if (
    !isPlainObject(selector.fields) ||
    Object.keys(selector.fields).length === 0
  ) {
    issues.push({
      path: `${at}.fields`,
      message: "must be a non-empty object",
    });

    return;
  }

  for (const [fieldName, field] of Object.entries(selector.fields)) {
    validateField(`${at}.fields.${fieldName}`, field, issues);
  }

  validateOccurredAtField(at, selector, Object.keys(selector.fields), issues);
}

function validateJsonSelector(
  at: string,
  selector: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  validateSelectorCommon(at, selector, JSON_SELECTOR_KEYS, issues);

  // Both are required: a `script` with no `rootPath` names no items, and a
  // `rootPath` with no `script` reads nothing.
  if (!nonEmptyString(selector.script)) {
    issues.push({
      path: `${at}.script`,
      message: "from: json requires a non-empty `script` selector",
    });
  }

  if (!nonEmptyString(selector.rootPath) || !isValidPath(selector.rootPath)) {
    issues.push({
      path: `${at}.rootPath`,
      message: `from: json requires a \`rootPath\` such as "props.pageProps.orders" (keys joined by dots; \`[*]\` fans out over an array), got ${JSON.stringify(selector.rootPath)}`,
    });
  }

  if (
    !isPlainObject(selector.fields) ||
    Object.keys(selector.fields).length === 0
  ) {
    issues.push({
      path: `${at}.fields`,
      message: "must be a non-empty object of paths",
    });

    return;
  }

  for (const [fieldName, fieldPath] of Object.entries(selector.fields)) {
    if (!nonEmptyString(fieldPath) || !isValidPath(fieldPath)) {
      issues.push({
        path: `${at}.fields.${fieldName}`,
        message: `must be a path such as "payment.grandTotal", got ${JSON.stringify(fieldPath)}`,
      });
    }
  }

  validateOccurredAtField(at, selector, Object.keys(selector.fields), issues);
}

/** Every problem with a profile, or [] when it is well-formed. */
export function validateProfile(raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isPlainObject(raw)) {
    return [{ path: "", message: "profile must be an object" }];
  }

  for (const key of ["domain", "name", "description"] as const) {
    if (!nonEmptyString(raw[key])) {
      issues.push({ path: key, message: `missing ${key}` });
    }
  }

  if (
    !Array.isArray(raw.matchPatterns) ||
    raw.matchPatterns.length === 0 ||
    !raw.matchPatterns.every(nonEmptyString)
  ) {
    issues.push({
      path: "matchPatterns",
      message: "must be a non-empty array of strings",
    });
  }

  const targets = Array.isArray(raw.targetUrl)
    ? raw.targetUrl
    : [raw.targetUrl];
  if (targets.length === 0 || !targets.every(nonEmptyString)) {
    issues.push({
      path: "targetUrl",
      message: "must be a non-empty string or array of strings",
    });
  }

  // Retired in favour of `dataCategories`. The engine no longer reads this key,
  // so a profile that still sets it would run ungated: reject it instead.
  if ("sensitive" in raw) {
    issues.push({
      path: "sensitive",
      message:
        "retired: declare what the profile reads in dataCategories instead",
    });
  }

  if (raw.dataCategories !== undefined) {
    const categories = raw.dataCategories;
    const known =
      Array.isArray(categories) &&
      categories.every((c) => DATA_CATEGORIES.includes(c as DataCategory));
    if (!known) {
      issues.push({
        path: "dataCategories",
        message: `must be an array of ${DATA_CATEGORIES.join(" | ")}, got ${JSON.stringify(categories)}`,
      });
    }
  }

  if (raw.readySelector !== undefined && !nonEmptyString(raw.readySelector)) {
    issues.push({
      path: "readySelector",
      message: "must be a non-empty CSS selector",
    });
  }

  if (
    raw.readyTimeoutMs !== undefined &&
    !(
      Number.isInteger(raw.readyTimeoutMs) &&
      (raw.readyTimeoutMs as number) > 0 &&
      (raw.readyTimeoutMs as number) <= MAX_READY_TIMEOUT_MS
    )
  ) {
    issues.push({
      path: "readyTimeoutMs",
      message: `must be a whole number of milliseconds from 1 to ${MAX_READY_TIMEOUT_MS}`,
    });
  }

  if (
    !isPlainObject(raw.dataSelectors) ||
    Object.keys(raw.dataSelectors).length === 0
  ) {
    issues.push({
      path: "dataSelectors",
      message: "must be a non-empty object",
    });

    return issues;
  }

  for (const [name, selector] of Object.entries(raw.dataSelectors)) {
    const at = `dataSelectors.${name}`;

    if (!isPlainObject(selector)) {
      issues.push({ path: at, message: "selector config must be an object" });
      continue;
    }

    if (selector.from === undefined) {
      validateDomSelector(at, selector, issues);
    } else if (selector.from === "json") {
      validateJsonSelector(at, selector, issues);
    } else {
      issues.push({
        path: `${at}.from`,
        message: `unknown source ${JSON.stringify(selector.from)} — use "json", or omit it for DOM containers`,
      });
    }
  }

  return issues;
}

/** Throwing form, for load-time use. */
export function assertValidProfile(raw: unknown, label: string): ScrapeProfile {
  const issues = validateProfile(raw);
  if (issues.length > 0) {
    const detail = issues.map((i) => `  ${i.path || "<root>"}: ${i.message}`);
    throw new Error(`Invalid scrape profile "${label}":\n${detail.join("\n")}`);
  }

  return raw as ScrapeProfile;
}
