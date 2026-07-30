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

import type { ScrapeProfile } from "./types";

export const FIELD_TYPES = ["text", "attribute", "html"] as const;
export const TRANSFORMS = ["trim", "absoluteUrl", "parseDate"] as const;

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

  if (raw.sensitive !== undefined && typeof raw.sensitive !== "boolean") {
    issues.push({
      path: "sensitive",
      message: "must be a boolean when present",
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

    // The whole point of the schema: an unclassified selector produces rows the
    // server cannot type.
    if (!nonEmptyString(selector.personalDataType)) {
      issues.push({
        path: `${at}.personalDataType`,
        message: "missing personalDataType — scraped rows would be untyped",
      });
    }

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
      continue;
    }

    for (const [fieldName, field] of Object.entries(selector.fields)) {
      validateField(`${at}.fields.${fieldName}`, field, issues);
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
