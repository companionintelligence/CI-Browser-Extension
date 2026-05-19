import { runSync, type SyncResult } from "./run";
import { store } from "@/store";

// Re-derived locally; @types/wxt doesn't re-export Bookmarks.* in the version
// we pin. The shape mirrors chrome.bookmarks.BookmarkTreeNode.
interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: BookmarkNode[];
}

const SYNCED_BOOKMARKS_KEY = "syncedBookmarks";
const BOOKMARK_SYNC_KEY = "lastBookmarkSync";

function ensureISOTimeFormat(timestamp?: number | string): string {
  if (timestamp === undefined || timestamp === null) {
    return new Date().toISOString();
  }

  const ms =
    typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;

  return new Date(isNaN(ms) ? Date.now() : ms).toISOString();
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);

    return /^(http(s)?:)$/.test(u.protocol);
  } catch {
    return false;
  }
}

export interface BookmarkEvent {
  time: string;
  device_id: string;
  url: string;
  title: string;
  action_type: "bookmark";
  properties: Record<string, unknown>;
  is_incognito: boolean;
  contains_sensitive: boolean;
}

export async function createBookmarkEvent(
  bookmark: BookmarkNode,
  eventType: "create" | "update" | "sync" = "sync",
): Promise<BookmarkEvent> {
  const { deviceId } = store.getState().ciState;
  if (!bookmark.id || !bookmark.url) {
    throw new Error(`Invalid bookmark data: ${JSON.stringify(bookmark)}`);
  }

  if (!deviceId) {
    throw new Error("Device ID is required for bookmark sync");
  }

  try {
    new URL(bookmark.url);
  } catch {
    throw new Error(`Invalid bookmark URL: ${bookmark.url}`);
  }

  return {
    time: ensureISOTimeFormat(bookmark.dateAdded),
    device_id: deviceId,
    url: bookmark.url,
    title: bookmark.title || "Untitled Bookmark",
    action_type: "bookmark",
    properties: {
      bookmark_id: bookmark.id,
      event_type: eventType,
    },
    is_incognito: false,
    contains_sensitive: false,
  };
}

async function listAllBookmarks(): Promise<BookmarkNode[]> {
  const tree = await browser.bookmarks.getTree();
  const out: BookmarkNode[] = [];
  function walk(nodes: BookmarkNode[]) {
    for (const node of nodes) {
      if (node.url && node.id && node.title) {
        out.push(node);
      }

      if (node.children) {
        walk(node.children);
      }
    }
  }

  walk(tree);

  return out;
}

export async function syncBookmarks(): Promise<SyncResult> {
  const result = await runSync<BookmarkNode, BookmarkEvent>({
    kind: "bookmarks",
    syncedKey: SYNCED_BOOKMARKS_KEY,
    endpoint: "/api/browser-activity",
    loadItems: listAllBookmarks,
    shouldInclude: (b) => !!b.url && isValidUrl(b.url),
    itemKey: (b) => b.id,
    toPayload: (b) => createBookmarkEvent(b, "sync"),
  });
  await browser.storage.local.set({ [BOOKMARK_SYNC_KEY]: Date.now() });

  return result;
}
