/**
 * Feature-detect which browser.* APIs this host actually implements.
 *
 * Safari accepts some `history` / `bookmarks` / `downloads` manifest
 * permissions but does not implement those APIs. It also exposes only part of
 * `webNavigation`; register each event independently so an absent event cannot
 * abort background startup. Feature-detect instead of UA-sniffing.
 */

type BrowserLike = {
  history?: { search?: unknown };
  bookmarks?: { getTree?: unknown };
  downloads?: { search?: unknown };
  webNavigation?: {
    onCompleted?: { addListener?: unknown };
    onHistoryStateUpdated?: { addListener?: unknown };
  };
};

type NavigationListener = (details: { url: string }) => void;

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

/** Register only the webNavigation events implemented by this browser. */
export function registerWebNavigationListeners(
  listener: NavigationListener,
): void {
  const navigation = browserApi()?.webNavigation;

  if (typeof navigation?.onCompleted?.addListener === "function") {
    navigation.onCompleted.addListener(listener);
  }

  if (typeof navigation?.onHistoryStateUpdated?.addListener === "function") {
    navigation.onHistoryStateUpdated.addListener(listener);
  }
}
