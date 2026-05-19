import { runSync, type SyncResult } from "./run";
import { store } from "@/store";

// Local shape; mirrors chrome.downloads.DownloadItem.
interface DownloadItem {
  id: number;
  url: string;
  filename?: string;
  startTime?: string;
  totalBytes?: number;
  state?: string;
}

const SYNCED_DOWNLOADS_KEY = "syncedDownloads";
const DOWNLOAD_SYNC_KEY = "lastDownloadSync";

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

    return !(
      u.protocol === "chrome:" ||
      u.protocol === "chrome-extension:" ||
      u.protocol === "moz-extension:" ||
      u.protocol === "about:" ||
      u.protocol === "file:" ||
      u.protocol === "data:" ||
      u.protocol === "javascript:" ||
      u.protocol === "blob:"
    );
  } catch {
    return false;
  }
}

export interface DownloadEvent {
  time: string;
  device_id: string;
  url: string;
  title?: string;
  action_type: "download";
  properties: Record<string, unknown>;
  is_incognito: boolean;
  contains_sensitive: boolean;
}

export async function createDownloadEvent(
  download: DownloadItem,
  eventType: "create" | "update" | "sync" = "sync",
): Promise<DownloadEvent> {
  const { deviceId } = store.getState().ciState;
  if (!deviceId) {
    throw new Error("Device ID is required for download sync");
  }

  if (!download.url) {
    throw new Error("Download URL is required");
  }

  return {
    time: ensureISOTimeFormat(download.startTime),
    device_id: deviceId,
    url: download.url,
    title: download.filename || "Unknown Download",
    action_type: "download",
    properties: {
      download_id: download.id.toString(),
      event_type: eventType,
      filename: download.filename,
      total_bytes: download.totalBytes,
      state: download.state,
    },
    is_incognito: false,
    contains_sensitive: false,
  };
}

export async function syncDownloads(): Promise<SyncResult> {
  const result = await runSync<DownloadItem, DownloadEvent>({
    kind: "downloads",
    syncedKey: SYNCED_DOWNLOADS_KEY,
    endpoint: "/api/browser-activity",
    loadItems: () => browser.downloads.search({}),
    shouldInclude: (d) => !!d.url && isValidUrl(d.url),
    itemKey: (d) => d.id.toString(),
    toPayload: (d) => createDownloadEvent(d, "sync"),
  });

  await browser.storage.local.set({ [DOWNLOAD_SYNC_KEY]: Date.now() });

  return result;
}
