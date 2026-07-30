/**
 * Stable identity for a scraped item.
 *
 * This must be derived from the item's CONTENT, never from its position on the
 * page. The previous key was `${domain}:${selector}:${index}` using the array
 * index, which fails badly on any list that changes order — which is every list
 * worth scraping:
 *
 *   visit 1  [ShowA, ShowB]         -> :0=ShowA  :1=ShowB
 *   visit 2  [ShowC, ShowA, ShowB]  -> :0=ShowC  :1=ShowA  :2=ShowB
 *
 * The server dedups on the provenance triple and never refreshes an existing
 * row, so on visit 2 `:0` already exists and **ShowC — the newest item, the
 * whole reason to re-scrape — is discarded as a duplicate**, while ShowB
 * reappears under a fresh `:2` as a duplicate row. Position-keyed ids lose
 * precisely the data the capture exists to collect.
 */

/** Fields that identify the item itself rather than the page it was listed on. */
const IDENTITY_FIELDS = [
  "titleUrl",
  "url",
  "link",
  "href",
  "articleUrl",
  "orderId",
  "id",
];

/**
 * FNV-1a, as a stable hex string. Not cryptographic — this only needs to be
 * deterministic across sessions and well-distributed enough that two different
 * items in the same selector don't collide.
 */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  return h.toString(16).padStart(8, "0");
}

/** Canonical form of the item's values: key-sorted, so field order can't shift the id. */
function canonicalize(fields: Record<string, unknown>): string {
  return Object.keys(fields)
    .sort()
    .map((k) => `${k}=${String(fields[k] ?? "").trim()}`)
    .join("");
}

/**
 * A deterministic per-item source id. Prefers a URL that identifies the item —
 * a title link, an order id — because those survive the page being re-rendered,
 * re-sorted, or paginated differently. Falls back to a hash of the item's own
 * values.
 */
export function scrapeSourceId(
  domain: string,
  selector: string,
  fields: Record<string, unknown>,
): string {
  for (const key of IDENTITY_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) {
      return `${domain}:${selector}:${value.trim()}`;
    }
  }

  return `${domain}:${selector}:${hash(canonicalize(fields))}`;
}
