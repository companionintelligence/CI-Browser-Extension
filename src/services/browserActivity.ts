/**
 * Typed bulk ingest — CI-Server's `POST /api/v1/browser-activity` and
 * `POST /api/v1/contents`.
 *
 * Replaces the Phase 3 unified `/api/v1/events` transport for browser captures.
 * `/v1/events` has NO per-destination fan-out: `BulkIngestController.ingest()`
 * hardcodes `destination: 'events'` and materializes every record through
 * `EventService.create` with `event_type: kind`, whatever the kind is. So the
 * extension's `browser.*` CaptureEvents all landed in `ci.events` and
 * `ci.browser_activity` stayed empty. That is by design, not a server bug —
 * ci-import-tools' MAPPING.md says of the same endpoint: "Because `/v1/events`
 * is a single surface there is no per-destination fan-out — every kind rides one
 * envelope", which is why the importer keeps the typed `/v1/*` routes as its
 * DEFAULT lane and treats the events transport as an opt-in.
 *
 * The mappers below mirror ci-import-tools' `toV1BrowserActivity` /
 * `toV1Content` (backend/src/ci-server/v1.ts) so both capture sources produce
 * identical rows, and follow its kind→destination table:
 *
 *   web.page_view  → browser_activity   (visit / reload / search / download / form_submit)
 *   web.bookmark   → content, type 'bookmark'
 *
 * Auth is a CI-Portal OIDC Bearer token (see ./oidcAuth); both routes sit behind
 * CI-Server's `JwtOrApiKeyAuthGuard`.
 *
 * NOTE ON DEDUP: capture identity is keyed per destination
 * (`(user_id, destination, triple)`), so activities previously accepted under
 * `destination: 'events'` do NOT dedup against these writes — the first run
 * after this change re-materializes them into `browser_activity` / `content`.
 * That is the point of the migration; the old `ci.events` rows are left alone.
 *
 * IDENTITY IS SHARED WITH THE IMPORTER. A visit, bookmark or download this
 * extension captures is the same datum CI-Server's import tools read from a
 * Google Takeout `Chrome/History.json`, a Chromium `History` SQLite database
 * or a Firefox `places.sqlite` — and CI-Server dedups rows on
 * `(user_id, source_system, source_id)`. So those records carry the SAME
 * `source_system` as the importer (`chromium` for every Chromium-family
 * browser, `firefox` for Firefox) and the SAME `source_id` format, which is
 * CI-Server's `domains/memory/identity/browser.ts`, re-implemented here
 * verbatim because this repo cannot import it:
 *
 *   visit:<unix ms>:<url>       (also reload / search / form_submit)
 *   bookmark:<unix s>:<url>
 *   download:<unix ms>:<final url>
 *
 * Times are TRUNCATED (Math.floor), never rounded, to the coarsest precision
 * every producer can reach exactly. The test suite pins the same fixtures as
 * CI-Server's `identity.test.ts`; change the format in one repo, change both.
 */
import bowser from "bowser";

/** The browser-activity record the background builders produce. */
export interface BrowserActivity {
  /** When the user actually visited / bookmarked / downloaded (domain time). */
  time: string;
  /**
   * When the extension observed or synced the activity. Distinct from `time`
   * so a Wednesday history import does not rewrite Monday page views as
   * Wednesday visits in Memory.
   */
  observed_at?: string;
  device_id: string;
  url: string;
  title?: string;
  action_type:
    | "visit"
    | "reload"
    | "bookmark"
    | "search"
    | "download"
    | "form_submit"
    | "highlight"
    | "scrape";
  properties?: Record<string, unknown>;
  duration_seconds?: number;
  scroll_depth_percent?: number;
  is_incognito?: boolean;
  contains_sensitive?: boolean;
}

/** The bulk-ingest response both routes return (`BulkIngestResponse`). */
export interface IngestResult {
  ingested: number;
  duplicate: number;
  rejected: { index: number; reason: string }[];
}

/**
 * `source_system` for captures that exist ONLY because of this extension —
 * highlights and scrapes. Nothing else produces them, so they stay under the
 * extension's own name (the platform event-ingest spec's name for this source,
 * and the OIDC client id).
 *
 * Browser-native captures (visits, bookmarks, downloads) do NOT use this: they
 * are stamped with the browser's own system name — see browserSourceSystem —
 * so they converge with the same records arriving through CI-Server's import
 * tools. (They used to carry this name too, and a Takeout re-import of the
 * same history then duplicated every visit.)
 */
export const EXTENSION_SOURCE_SYSTEM = "ci-browser-extension";

/**
 * The BRAND, as a lowercase slug (`chrome`, `brave`, `edge`, `opera`,
 * `vivaldi`, `firefox`, `safari`), or undefined when it cannot be told. This
 * is a fact about the arrival and rides in `properties.browser` — it is
 * deliberately NOT the `source_system`, which stays the engine family so a
 * Brave visit delivered by this extension and by CI-Server's History-file
 * importer land on one row. The importer writes the same key when the file's
 * name or path says which brand wrote it.
 *
 * Brave hides itself in the user agent string, so the UA parser reports it as
 * Chrome; the Client Hints `userAgentData.brands` list names it, as it names
 * Edge, Opera and Chrome (Arc and Vivaldi deliberately do not appear and read
 * as Chrome). Older Brave builds without a brand entry are caught by the
 * async `navigator.brave.isBrave()` probe, which background.ts runs at
 * startup and records through rememberBrowserBrand.
 */
export function browserBrand(
  nav: Pick<Navigator, "userAgent"> & {
    userAgentData?: { brands?: Array<{ brand: string }> };
  } = globalThis.navigator,
): string | undefined {
  if (rememberedBrand) {
    return rememberedBrand;
  }

  const brands = nav?.userAgentData?.brands;
  if (Array.isArray(brands)) {
    for (const { brand } of brands) {
      const name = brand.toLowerCase();
      // Chromium's GREASE entries look like "Not A;Brand" / "Not(A:Brand"; the
      // engine itself is not a brand.
      if (
        name === "chromium" ||
        (name.includes("not") && name.includes("brand"))
      ) {
        continue;
      }

      return BRAND_SLUGS[name] ?? name.replace(/\s+/g, "");
    }
  }

  const ua = nav?.userAgent ?? "";
  if (!ua.trim()) {
    return undefined;
  }

  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) {
    return "edge";
  }

  if (/\bOPR\//.test(ua)) {
    return "opera";
  }

  if (/\bVivaldi\//.test(ua)) {
    return "vivaldi";
  }

  const parsed = bowser.getParser(ua).getBrowserName().toLowerCase();

  return parsed
    ? (BRAND_SLUGS[parsed] ?? parsed.replace(/\s+/g, ""))
    : undefined;
}

const BRAND_SLUGS: Readonly<Record<string, string>> = {
  "google chrome": "chrome",
  chrome: "chrome",
  "microsoft edge": "edge",
  brave: "brave",
  opera: "opera",
  vivaldi: "vivaldi",
  firefox: "firefox",
  safari: "safari",
};

let rememberedBrand: string | undefined;

/**
 * Record a brand learned asynchronously (the Brave probe). Overrides UA-based
 * detection from then on; `undefined` clears it (tests).
 */
export function rememberBrowserBrand(brand: string | undefined): void {
  rememberedBrand = brand;
}

/** A display label for a brand slug, for the device record ("Brave on Linux"). */
export function browserBrandLabel(
  brand: string | undefined,
): string | undefined {
  if (!brand) {
    return undefined;
  }

  return BRAND_LABELS[brand] ?? brand.charAt(0).toUpperCase() + brand.slice(1);
}

const BRAND_LABELS: Readonly<Record<string, string>> = {
  chrome: "Chrome",
  brave: "Brave",
  edge: "Microsoft Edge",
  opera: "Opera",
  vivaldi: "Vivaldi",
  firefox: "Firefox",
  safari: "Safari",
};

/** The importer-shared names, plus the extension's own for anything else. */
export type BrowserSourceSystem =
  | "chromium"
  | "firefox"
  | "safari"
  | typeof EXTENSION_SOURCE_SYSTEM;

/**
 * The `source_system` for a browser-native capture: the ENGINE, not the brand.
 * Chrome, Brave, Edge, Arc and Opera all keep the same Chromium `History`
 * database, all run the Chrome Web Store build of this extension, and
 * CI-Server's importer files all of them under `chromium` — so a per-brand
 * name would split the very rows that are supposed to meet. (CI-Server also
 * aliases the brand names to `chromium`, but sending the canonical name is
 * the contract, not a fallback.) Gecko is `firefox`, matching the
 * `places.sqlite` importer. Safari has no importer counterpart; it keeps its
 * own name so a future one has a contract to meet. Anything unrecognized
 * falls back to the extension's name rather than guessing an engine.
 *
 * Read from the user agent at call time, not the build target: a Brave user
 * runs the `chrome` build, and the Firefox build could be sideloaded anywhere.
 */
export function browserSourceSystem(
  userAgent: string = globalThis.navigator?.userAgent ?? "",
): BrowserSourceSystem {
  // bowser throws on an empty string rather than returning "unknown".
  if (!userAgent.trim()) {
    return EXTENSION_SOURCE_SYSTEM;
  }

  switch (bowser.getParser(userAgent).getEngineName()) {
    case "Blink":
      return "chromium";
    case "Gecko":
      return "firefox";
    case "WebKit":
      return "safari";
    default:
      return EXTENSION_SOURCE_SYSTEM;
  }
}

// `time` must satisfy the server's Zod `.datetime()` (Z form). A bare
// "YYYY-MM-DD HH:MM:SS" (no zone) is treated as UTC rather than local time; an
// unparseable value falls back to the epoch instead of an invalid string.
const SPACE_DT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
export function toInstant(s: string): string {
  const d = new Date(SPACE_DT.test(s) ? `${s.replace(" ", "T")}Z` : s);

  return Number.isNaN(d.getTime())
    ? new Date(0).toISOString()
    : d.toISOString();
}

/**
 * Unix milliseconds of a capture's `time`, truncated — the visit instant as
 * the WebExtension history API reports it (a double of ms) floors to the same
 * integer CI-Server derives from Takeout's or the SQLite file's microseconds.
 * `toInstant` already went through a JS Date, which holds whole milliseconds
 * by truncation, so this is exact for anything the builders in
 * background.ts produce.
 */
export function unixMsOf(a: BrowserActivity): number {
  return Math.floor(new Date(toInstant(a.time)).getTime());
}

/**
 * Stable per-record id: the dedup key together with the record's
 * `source_system`.
 *
 * Browser-native captures use CI-Server's shared browser identity format (see
 * the header): `<action>:<unix ms>:<url>`, except bookmarks, which key on
 * whole SECONDS because Takeout's `Bookmarks.html` only carries `ADD_DATE`
 * seconds and the key has to be the coarsest precision every producer has.
 * The browser's own `bookmark_id` / `download_id` are deliberately NOT the
 * key any more: they are per-profile integers the importer never sees (and
 * Brave's `42` is not Chrome's `42`); they still ride in `properties`.
 *
 * Extension-only captures (highlights, scrapes) keep their own scheme: an
 * explicit per-item `source_id` when the producer minted one, else the
 * action, ISO instant and URL.
 */
export function sourceIdFor(a: BrowserActivity): string {
  const url = a.url?.trim() ?? "";
  const explicit = a.properties?.source_id;
  if (typeof explicit === "string" && explicit) {
    return `${a.action_type}:${explicit}`;
  }

  switch (a.action_type) {
    case "highlight":
    case "scrape":
      return `${a.action_type}:${toInstant(a.time)}:${url}`;
    case "bookmark":
      return `bookmark:${Math.floor(unixMsOf(a) / 1000)}:${url}`;
    default:
      return `${a.action_type}:${unixMsOf(a)}:${url}`;
  }
}

/**
 * `action_type` values `createBrowserActivitySchemaRoot` accepts. The enum is
 * strict, so `scrape` — the one remaining capture on this lane that is not in it
 * — rides with `action_type` omitted (the column is optional) and the real value
 * preserved in `properties.action_type`.
 *
 * Consequence to be aware of: the server derives its capture kind as
 * `web.${action_type ?? 'page_view'}`, so scrape captures log as
 * `web.page_view`. Scrapes do not belong on this lane at all — each scrape
 * profile's `data_type` implies a different destination (Netflix
 * `viewingHistory` → media.watch, Robinhood holdings → inventory, …) — so this
 * is a holding position until that fan-out is specified, not the end state.
 */
const SERVER_ACTION_TYPES = new Set([
  "visit",
  "reload",
  "bookmark",
  "search",
  "download",
  "form_submit",
]);

/** The `/v1/browser-activity` record (createBrowserActivitySchemaRoot + id). */
export interface BrowserActivityRecord {
  time: string;
  url: string;
  title?: string;
  action_type?: string;
  device_id?: string;
  properties?: Record<string, unknown>;
  duration_seconds?: number;
  scroll_depth_percent?: number;
  is_incognito?: boolean;
  contains_sensitive?: boolean;
  source_type?: string;
  source_system?: string;
  source_id?: string;
}

/** The `/v1/contents` record (bulkContentRecordSchema). */
export interface ContentRecord {
  type: string;
  title?: string;
  text?: string;
  url?: string;
  mimetype?: string;
  source_url?: string;
  source_data?: Record<string, unknown>;
  source_type?: string;
  source_system?: string;
  source_id?: string;
}

/**
 * `source_type` the events lane stamped on every extension write
 * (`e.source_type ?? 'capture'`). Sent explicitly here so provenance reads the
 * same across both transports.
 */
const SOURCE_TYPE = "capture";

/** `contentTypeFor('web.bookmark')` in the importer's mapping.ts. */
const BOOKMARK_CONTENT_TYPE = "bookmark";

const HIGHLIGHT_CONTENT_TYPE = "highlight";

/**
 * `ci.content` has no `metadata` column — `source_data` (jsonb) IS the metadata
 * bucket, and it is what the importer feeds from `rec.metadata` (`toV1Content`:
 * `sourceData: m`). It is also the only durable home for a capture time: the
 * table's sole timestamp is `created_at DEFAULT now()`, i.e. insert time, which
 * would misdate any highlight that was queued or replayed.
 */
const OBTAINED_AT_KEY = "obtained_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Derive `<serverURL>/api/v1/<path>` — same `/api` gateway prefix as eventsUrl. */
function apiUrl(serverURL: string, path: string): string {
  return `${serverURL.replace(/\/+$/, "")}/api/v1/${path}`;
}

export function browserActivityUrl(serverURL: string): string {
  return apiUrl(serverURL, "browser-activity");
}

export function contentsUrl(serverURL: string): string {
  return apiUrl(serverURL, "contents");
}

export function ingestFinishUrl(serverURL: string): string {
  return apiUrl(serverURL, "ingest/finish");
}

/**
 * Entity types `finishIngest` asks CI-Server to index — exactly the two this
 * transport writes. Names come from the server's `BACKFILLABLE_ENTITIES`
 * (hyphenated `browser-activity`, NOT the `browser_activity` table/destination
 * spelling used elsewhere in the ingest API).
 */
const FINISH_ENTITY_TYPES = ["browser-activity", "content"];

/**
 * Captures that belong in `ci.content` rather than `ci.browser_activity`:
 * bookmarks (the importer's `web.bookmark` → content), highlights (a saved text
 * selection is a reading annotation — it has a body, not a duration), and
 * scrapes.
 *
 * Scrapes moved here because the browser-activity lane could not represent
 * them. Its `action_type` enum has no `scrape`, so every scraped row arrived as
 * `web.page_view` with its real identity buried in `properties` — which nothing
 * server-side reads. A scraped item (a watched title, a repository, a trip) is
 * a *thing the user has a relationship with*, not a page view; `ci.content`
 * models exactly that, its `type` column is free text, and its rows are
 * search-indexed on title/text/url. See toScrapeContentRecord.
 */
export function isContentCapture(a: BrowserActivity): boolean {
  return (
    a.action_type === "bookmark" ||
    a.action_type === "highlight" ||
    a.action_type === "scrape"
  );
}

/**
 * Fold the fields the browser-activity table has no column for into
 * `properties`, so the round-trip stays lossless. `observed_at` matters most:
 * the extension deliberately separates it from `time` (a Wednesday history
 * import must not rewrite Monday page views as Wednesday visits), but
 * `createBrowserActivitySchemaRoot` has no such field and the server reads only
 * `occurredAtOf: (r) => r.time`.
 */
function extraProperties(a: BrowserActivity): Record<string, unknown> {
  const extra: Record<string, unknown> = { ...(a.properties ?? {}) };
  if (a.observed_at) {
    extra.observed_at = toInstant(a.observed_at);
  }

  // Which brand recorded this (see browserBrand) — an arrival fact, kept off
  // the identity. Absent when unknown rather than guessed, so the importer's
  // answer for the same row is not out-voted by a blank.
  const brand = browserBrand();
  if (brand && extra.browser === undefined) {
    extra.browser = brand;
  }

  if (a.action_type && !SERVER_ACTION_TYPES.has(a.action_type)) {
    extra.action_type = a.action_type;
  }

  // device_id is `z.string().uuid()` server-side; a non-UUID device id would
  // reject the record, so it degrades to a property rather than being dropped.
  if (a.device_id && !UUID_RE.test(a.device_id)) {
    extra.device_id = a.device_id;
  }

  return extra;
}

/**
 * Map a browser activity to a `/v1/browser-activity` record, or null when it has
 * no URL-shaped identity to key on (mirrors `toV1BrowserActivity`'s null-skip).
 *
 * Unlike the importer we do NOT synthesize a URL for search rows. That synthesis
 * exists because the /v1 schema once enforced `url: z.string().url()`; it is now
 * `z.string().min(1)` (relaxed in #1673 precisely because strict `.url()`
 * mass-rejected bare-query rows), so the identity passes through intact.
 */
export function toBrowserActivityRecord(
  a: BrowserActivity,
): BrowserActivityRecord | null {
  const url = a.url?.trim();
  if (!url) {
    return null;
  }

  const properties = extraProperties(a);
  const record: BrowserActivityRecord = {
    time: toInstant(a.time),
    url,
    source_type: SOURCE_TYPE,
    // The browser's system, not the extension's: this row must meet the
    // importer's row for the same visit.
    source_system: browserSourceSystem(),
    source_id: sourceIdFor(a),
  };

  if (a.title) {
    record.title = a.title;
  }

  if (a.action_type && SERVER_ACTION_TYPES.has(a.action_type)) {
    record.action_type = a.action_type;
  }

  if (a.device_id && UUID_RE.test(a.device_id)) {
    record.device_id = a.device_id;
  }

  if (Object.keys(properties).length > 0) {
    record.properties = properties;
  }

  if (a.duration_seconds != null) {
    record.duration_seconds = a.duration_seconds;
  }

  if (a.scroll_depth_percent != null) {
    record.scroll_depth_percent = a.scroll_depth_percent;
  }

  if (a.is_incognito != null) {
    record.is_incognito = a.is_incognito;
  }

  if (a.contains_sensitive != null) {
    record.contains_sensitive = a.contains_sensitive;
  }

  return record;
}

/**
 * Map a saved bookmark to a `/v1/contents` record (mirrors `toV1Content`, with
 * the importer's `type: 'bookmark'` bucket). `source_data` carries the raw
 * properties the way the importer passes `sourceData: rec.metadata`.
 */
export function toBookmarkContentRecord(
  a: BrowserActivity,
): ContentRecord | null {
  const url = a.url?.trim();
  if (!url) {
    return null;
  }

  const sourceData = extraProperties(a);
  const record: ContentRecord = {
    type: BOOKMARK_CONTENT_TYPE,
    url,
    source_type: SOURCE_TYPE,
    // Browser-native, like a visit: converges with the importer's bookmark row.
    source_system: browserSourceSystem(),
    source_id: sourceIdFor(a),
  };

  if (a.title) {
    record.title = a.title;
  }

  if (Object.keys(sourceData).length > 0) {
    record.source_data = sourceData;
  }

  return record;
}

/**
 * Map a saved text selection to a `/v1/contents` record.
 *
 * The selection itself is the content body, so it lifts out of
 * `properties.text` (where buildHighlightActivity puts it — BrowserActivity has
 * no text field) into the record's `text`, and is deleted from the metadata so
 * the excerpt is not stored twice. Deliberately NO title: a highlight has no
 * name of its own, and the page it came from is already identified by `url`.
 *
 * The capture time goes to `source_data.obtained_at` — see OBTAINED_AT_KEY for
 * why the table's own `created_at` cannot carry it.
 */
export function toHighlightContentRecord(
  a: BrowserActivity,
): ContentRecord | null {
  const url = a.url?.trim();
  const raw = a.properties?.text;
  const text = typeof raw === "string" ? raw : "";
  // No URL means nothing to attribute the excerpt to; no text means there is no
  // excerpt. Either way the row would carry nothing worth keying on.
  if (!url || !text.trim()) {
    return null;
  }

  const sourceData = extraProperties(a);
  delete sourceData.text;
  sourceData[OBTAINED_AT_KEY] = toInstant(a.time);

  return {
    type: HIGHLIGHT_CONTENT_TYPE,
    text,
    url,
    mimetype: "text/plain",
    source_type: SOURCE_TYPE,
    source_system: EXTENSION_SOURCE_SYSTEM,
    source_id: sourceIdFor(a),
    source_data: sourceData,
  };
}

/**
 * Field names an item may carry that identify the *thing* rather than the page
 * it was scraped from — a Netflix title's own link, a repo's URL. Preferred as
 * the content row's `url` so a scraped item points at itself rather than at the
 * settings page it happened to be listed on.
 */
const ITEM_URL_FIELDS = ["titleUrl", "url", "link", "href", "articleUrl"];

function itemUrl(fields: Record<string, unknown>): string | undefined {
  for (const key of ITEM_URL_FIELDS) {
    const value = fields[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

/**
 * Map a scraped item to a `/v1/contents` record typed by what it *is*.
 *
 * `type` is the profile's `personalDataType` (`entertainment_preferences`,
 * `professional_activity`, …). The server's content schema takes free text
 * there, so this needs no CI-Server change — but unlike the browser-activity
 * lane it preserves the classification instead of flattening it to a page view.
 *
 * `text` is the item's own field values joined, because the content
 * search-index weights `text` (5) and `title` (10) and would otherwise have
 * nothing to match on — the raw fields live only in `source_data`, which is not
 * indexed.
 */
export function toScrapeContentRecord(
  a: BrowserActivity,
): ContentRecord | null {
  const pageUrl = a.url?.trim();
  const props = a.properties ?? {};
  const type = props.personal_data_type;
  const fields = (props.data ?? {}) as Record<string, unknown>;

  // Without a classification there is no meaningful content type to file it
  // under, and without a page there is nothing to attribute it to.
  if (!pageUrl || typeof type !== "string" || !type) {
    return null;
  }

  const sourceData = extraProperties(a);
  sourceData[OBTAINED_AT_KEY] = toInstant(a.time);

  const searchable = Object.entries(fields)
    .filter(
      ([key, value]) =>
        typeof value === "string" &&
        value.trim() &&
        !ITEM_URL_FIELDS.includes(key),
    )
    .map(([, value]) => (value as string).trim());

  const record: ContentRecord = {
    type,
    url: itemUrl(fields) ?? pageUrl,
    source_url: pageUrl,
    source_type: SOURCE_TYPE,
    source_system: EXTENSION_SOURCE_SYSTEM,
    source_id: sourceIdFor(a),
    source_data: sourceData,
  };

  if (a.title) {
    record.title = a.title;
  }

  if (searchable.length > 0) {
    record.text = searchable.join(" · ");
  }

  return record;
}

/** Pick the content mapper for a capture already known to belong on that lane. */
function contentRecordFor(a: BrowserActivity): ContentRecord | null {
  switch (a.action_type) {
    case "highlight":
      return toHighlightContentRecord(a);
    case "scrape":
      return toScrapeContentRecord(a);
    default:
      return toBookmarkContentRecord(a);
  }
}

const EMPTY_RESULT: IngestResult = {
  ingested: 0,
  duplicate: 0,
  rejected: [],
};

/** POST one `{ records: [...] }` batch, or a no-op zero result when empty. */
async function postRecords(
  url: string,
  accessToken: string,
  records: unknown[],
): Promise<IngestResult> {
  if (records.length === 0) {
    return EMPTY_RESULT;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    throw new Error(`CI-Server ${url} failed: HTTP ${res.status}`);
  }

  return (await res.json()) as IngestResult;
}

/**
 * POST a batch of browser captures to their typed destinations: bookmarks and
 * highlights to `/api/v1/contents`, everything else to
 * `/api/v1/browser-activity`. Returns the combined
 * `{ ingested, duplicate, rejected }`. Throws on a non-2xx so the caller keeps
 * its retry/logging. An empty batch is a no-op.
 *
 * Records with no usable identity are skipped rather than sent (no URL, or for a
 * highlight no selected text) — they carry nothing either table could key on,
 * and letting them reject would stall the caller's watermark on them forever
 * (the importer's sender counts these as skipped-but-accepted for the same
 * reason).
 */
export async function sendBrowserCaptures(
  serverURL: string,
  accessToken: string,
  activities: BrowserActivity[],
): Promise<IngestResult> {
  if (activities.length === 0) {
    return EMPTY_RESULT;
  }

  const activityRecords: BrowserActivityRecord[] = [];
  const contentRecords: ContentRecord[] = [];
  for (const a of activities) {
    if (isContentCapture(a)) {
      const content = contentRecordFor(a);
      if (content) {
        contentRecords.push(content);
      }

      continue;
    }

    const record = toBrowserActivityRecord(a);
    if (record) {
      activityRecords.push(record);
    }
  }

  const [activityResult, contentResult] = await Promise.all([
    postRecords(browserActivityUrl(serverURL), accessToken, activityRecords),
    postRecords(contentsUrl(serverURL), accessToken, contentRecords),
  ]);

  return {
    ingested: activityResult.ingested + contentResult.ingested,
    duplicate: activityResult.duplicate + contentResult.duplicate,
    rejected: [...activityResult.rejected, ...contentResult.rejected],
  };
}

/**
 * Make what was just uploaded searchable.
 *
 * The typed `/v1/*` bulk lanes deliberately do NOT index as they write: their
 * services run with `emitCreated: false`, so no `*CreatedEvent` fires and the
 * search-ingress listeners never see the rows. That is a throughput choice for
 * bulk importers — index once at the end, not once per record — but it means an
 * ingest that never says "finished" is an ingest whose data is in Postgres and
 * invisible to search, RAG, and the Memory UI. Nothing sweeps on a timer.
 *
 * `searchIndexOnly: true` takes the cheap path (`SearchIndexBackfillService`
 * directly), scoped by `entityTypes` to the two types written above. The full
 * path — omitting the flag — runs the whole maintenance orchestration chain and
 * allows only one run per user at a time (a concurrent call is a 409), which is
 * far too heavy to hang off a 10-minute sync alarm.
 *
 * Best-effort by design: returns false instead of throwing, because failing to
 * index is not a reason to re-upload data the server already accepted.
 */
export async function finishIngest(
  serverURL: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(ingestFinishUrl(serverURL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        searchIndexOnly: true,
        entityTypes: FINISH_ENTITY_TYPES,
      }),
    });

    if (!res.ok) {
      console.warn(`CI-Server ingest/finish returned HTTP ${res.status}`);
    }

    return res.ok;
  } catch (error) {
    console.warn("CI-Server ingest/finish failed:", error);

    return false;
  }
}
