/**
 * Pre-flight checks for captures built from browser data.
 *
 * These guard the *sync* paths, where one malformed row used to be able to
 * abort a whole batch. Bookmarks come from `browser.bookmarks`, whose nodes can
 * be folders, separators, or (on Firefox) entries with no dateAdded, so the
 * builders can produce records the server would reject. Filtering them here
 * keeps the rest of the batch deliverable.
 */

import type { BrowserActivity } from "@/services/browserActivity";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An ISO-8601 instant in the Z form the server's `z.string().datetime()` wants. */
export function isIsoInstant(time: string | undefined | null): boolean {
  if (!time || !time.includes("T") || !time.endsWith("Z")) {
    return false;
  }

  return !Number.isNaN(new Date(time).getTime());
}

/**
 * Whether a bookmark capture is complete enough to send.
 *
 * `device_id` must be a real UUID here even though the transport can degrade a
 * non-UUID into `properties` — a bookmark with a bogus device id is a symptom
 * of setup having gone wrong, and silently filing it under no device is worse
 * than skipping it until device provisioning succeeds.
 */
export function isValidBookmarkEvent(event: BrowserActivity): boolean {
  if (!event.url || !event.action_type) {
    return false;
  }

  if (!isIsoInstant(event.time)) {
    return false;
  }

  return Boolean(event.device_id) && UUID_RE.test(event.device_id);
}
