/**
 * Feature-detect which browser.* APIs this host actually implements.
 *
 * Safari accepts the `history` / `bookmarks` / `downloads` manifest permissions
 * but never implements the APIs (https://developer.apple.com/forums/thread/711080).
 * Retroactive sync cannot exist there — pages are captured live as the user
 * browses instead. Feature-detect rather than UA-sniff so any future Safari
 * support just works, and so Chrome/Firefox stay on the full sync path.
 */

type BrowserLike = {
  history?: { search?: unknown };
  bookmarks?: { getTree?: unknown };
  downloads?: { search?: unknown };
};

function browserApi(): BrowserLike | undefined {
  try {
    return typeof browser !== "undefined"
      ? (browser as unknown as BrowserLike)
      : undefined;
  } catch {
    return undefined;
  }
}

/** True when `browser.history.search` exists (Chrome / Firefox). */
export function hasHistoryApi(): boolean {
  return typeof browserApi()?.history?.search === "function";
}

/** True when `browser.bookmarks.getTree` exists (Chrome / Firefox). */
export function hasBookmarksApi(): boolean {
  return typeof browserApi()?.bookmarks?.getTree === "function";
}

/** True when `browser.downloads.search` exists (Chrome / Firefox). */
export function hasDownloadsApi(): boolean {
  return typeof browserApi()?.downloads?.search === "function";
}
