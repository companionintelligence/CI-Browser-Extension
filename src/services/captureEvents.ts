/**
 * Unified capture ingest — CI-Server's G1 `POST /v1/events` CaptureEvent path.
 *
 * Phase 3 of the unified identity pipeline: browser activity is sent as
 * CaptureEvents on the same envelope every capture source writes through
 * (importer, extension, …), instead of the legacy `POST /api/browser-activity`.
 * The server appends to `ci.capture_events` (idempotent on
 * (user_id, source_system, source_id)), so re-sending the same activity dedups
 * rather than duplicating. Auth is a CI-Portal OIDC Bearer token (see oidcAuth).
 */

/** The browser-activity record the background builders already produce. */
export interface BrowserActivity {
  /** When the user actually visited / bookmarked / downloaded (domain time). */
  time: string;
  /**
   * When the extension observed or synced the activity. Distinct from `time`
   * so a Wednesday history import does not rewrite Monday page views as
   * Wednesday visits in Memory (`occurred_at` stays `time`).
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
    // Phase 3: highlight + domain-scrape captures converged onto this envelope
    // from the legacy `/api/browser-activity` event shape.
    | "highlight"
    | "scrape";
  properties?: Record<string, unknown>;
  duration_seconds?: number;
  scroll_depth_percent?: number;
  is_incognito?: boolean;
  contains_sensitive?: boolean;
}

/** The CaptureEvent envelope CI-Server's `/v1/events` accepts. */
export interface CaptureEvent {
  source_system: string;
  source_id: string;
  kind: string;
  occurred_at: string;
  observed_at?: string;
  title?: string;
  description?: string;
  payload: Record<string, unknown>;
}

export interface IngestResult {
  ingested: number;
  duplicate: number;
  rejected: { index: number; reason: string }[];
}

/** Every browser activity shares one source so dedup is keyed per-activity below. */
export const SOURCE_SYSTEM = "browser-extension";

/** Derive the `/v1/events` URL from the stored server URL (always has a protocol). */
export function eventsUrl(serverURL: string): string {
  return `${serverURL.replace(/\/+$/, "")}/v1/events`;
}

// occurred_at must satisfy the server's strict Zod `.datetime()` (Z form). A
// bare "YYYY-MM-DD HH:MM:SS" (no zone) is treated as UTC rather than local time;
// an unparseable value falls back to the epoch instead of an invalid string.
const SPACE_DT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
function toInstant(s: string): string {
  const d = new Date(SPACE_DT.test(s) ? `${s.replace(" ", "T")}Z` : s);

  return Number.isNaN(d.getTime())
    ? new Date(0).toISOString()
    : d.toISOString();
}

/**
 * Stable per-activity id (the dedup key with SOURCE_SYSTEM). Prefer an explicit
 * browser id (bookmark/download) when present; otherwise derive a deterministic
 * key from the action, instant, and URL so a re-sent activity dedups.
 */
export function sourceIdFor(a: BrowserActivity): string {
  const explicit =
    a.properties?.source_id ??
    a.properties?.bookmark_id ??
    a.properties?.download_id;
  if (typeof explicit === "string" && explicit) {
    return `${a.action_type}:${explicit}`;
  }

  return `${a.action_type}:${toInstant(a.time)}:${a.url}`;
}

/** Map a browser-activity record to a CaptureEvent. */
export function toCaptureEvent(a: BrowserActivity): CaptureEvent {
  const payload: Record<string, unknown> = {
    url: a.url,
    device_id: a.device_id,
    action_type: a.action_type,
    ...(a.properties ?? {}),
  };
  if (a.duration_seconds != null) {
    payload.duration_seconds = a.duration_seconds;
  }

  if (a.scroll_depth_percent != null) {
    payload.scroll_depth_percent = a.scroll_depth_percent;
  }

  if (a.is_incognito != null) {
    payload.is_incognito = a.is_incognito;
  }

  if (a.contains_sensitive != null) {
    payload.contains_sensitive = a.contains_sensitive;
  }

  const event: CaptureEvent = {
    source_system: SOURCE_SYSTEM,
    source_id: sourceIdFor(a),
    kind: `browser.${a.action_type}`,
    occurred_at: toInstant(a.time),
    payload,
  };
  if (a.observed_at) {
    event.observed_at = toInstant(a.observed_at);
  }

  if (a.title) {
    event.title = a.title;
  }

  const description = a.properties?.description;
  if (typeof description === "string" && description) {
    event.description = description;
  }

  return event;
}

/**
 * POST a batch of browser activities as CaptureEvents to `/v1/events`, returning
 * the server's `{ ingested, duplicate, rejected }`. Throws on a non-2xx so the
 * caller can retry. An empty batch is a no-op.
 */
export async function sendCaptureEvents(
  serverURL: string,
  accessToken: string,
  activities: BrowserActivity[],
): Promise<IngestResult> {
  if (activities.length === 0) {
    return { ingested: 0, duplicate: 0, rejected: [] };
  }

  const events = activities.map(toCaptureEvent);
  const res = await fetch(eventsUrl(serverURL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    throw new Error(`CI-Server /v1/events failed: HTTP ${res.status}`);
  }

  return (await res.json()) as IngestResult;
}
