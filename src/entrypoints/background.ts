import axios from "axios";
import { fetchJson } from "../hooks/fetchJson";
import { jwtDecode } from "jwt-decode";
import { createWrapStore } from "webext-redux";
import { store } from "@/store";
import {
  setState,
  loadUserSettings,
  saveUserSettings,
  addSyncHistoryLog,
} from "@/store/ciStateSlice";
import { siteRegex } from "@/utils.ts";
import bowser from "bowser";
import type { ScrapeResult } from "@/domainScraper";
import { database } from "@/indexeddb";
import { logger, errMessage } from "@/lib/log";

const SLICE_SIZE = 100;
const BOOKMARK_SYNC_KEY = "lastBookmarkSync";
const DOWNLOAD_SYNC_KEY = "lastDownloadSync";
const AUTO_SYNC_TIME_RANGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

const SESSION_TOKEN_KEY = "sessionToken";
const CSRF_COOKIE_NAME = "csrfToken";

// Helper function to ensure proper ISO time format with milliseconds
function ensureISOTimeFormat(
  timestamp: number | string | undefined,
  fallbackTo1970 = false,
): string {
  let time: number;

  if (timestamp === undefined || timestamp === null) {
    time = fallbackTo1970 ? 0 : Date.now(); // 1970-01-01T00:00:00.000Z or current time
  } else if (typeof timestamp === "string") {
    time = new Date(timestamp).getTime();
  } else {
    time = timestamp;
  }

  // Ensure we have a valid time
  if (isNaN(time)) {
    time = fallbackTo1970 ? 0 : Date.now();
  }

  return new Date(time).toISOString();
}

// Keys for tracking synced items
const SYNCED_BOOKMARKS_KEY = "syncedBookmarks";
const SYNCED_DOWNLOADS_KEY = "syncedDownloads";
const SYNCED_HISTORY_KEY = "syncedHistory";

let deviceSetupInProgress = false;

// Helper functions for managing synced items
async function getSyncedItems(key: string): Promise<Set<string>> {
  const result = await browser.storage.local.get(key);
  const items = (result[key] as string[] | undefined) ?? [];

  return new Set(items);
}

// Helper function to validate URLs
function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    // Filter out invalid URLs
    return !(
      urlObj.protocol === "chrome:" ||
      urlObj.protocol === "chrome-extension:" ||
      urlObj.protocol === "moz-extension:" ||
      urlObj.protocol === "about:" ||
      urlObj.protocol === "file:" ||
      urlObj.protocol === "data:" ||
      urlObj.protocol === "javascript:" ||
      urlObj.protocol === "blob:" ||
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("moz-extension://") ||
      url.startsWith("about:") ||
      url.startsWith("file://") ||
      url.startsWith("data:") ||
      url.startsWith("javascript:") ||
      url.startsWith("blob:")
    );
  } catch {
    return false;
  }
}

async function addSyncedItem(key: string, itemId: string): Promise<void> {
  const syncedItems = await getSyncedItems(key);
  syncedItems.add(itemId);
  await browser.storage.local.set({ [key]: Array.from(syncedItems) });
}

async function isItemSynced(key: string, itemId: string): Promise<boolean> {
  const syncedItems = await getSyncedItems(key);

  return syncedItems.has(itemId);
}

interface AuthResponse {
  accessToken: string;
  sessionToken: string;
}

const recordHit = async function (e: any) {
  const state = store.getState().ciState;
  const { accessToken } = state;

  // Don't make API calls if user is not authenticated
  if (!accessToken) {
    return;
  }

  const accessDecoded = jwtDecode(accessToken);
  const isAuthExpired = accessDecoded.exp
    ? Date.now() >= accessDecoded.exp * 1000
    : true;
  if (e.frameId !== 0) {
    return;
  }

  const tabInfo = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const active = tabInfo[0];

  if (!active?.url) {
    return;
  }

  const parsed = URL.parse(active.url);
  if (!parsed) {
    return;
  }

  store.dispatch(setState({ domain: parsed.hostname, url: active.url }));

  // Check if URL is blacklisted
  const isBlacklisted = state.url
    ? isUrlBlacklisted(state.url, state.siteBlacklist, state.pageBlacklist)
    : true;

  if (!isAuthExpired && !isBlacklisted && state.lastUrl !== state.url) {
    store.dispatch(setState({ lastUrl: state.url }));

    store.dispatch(saveUserSettings());

    const deviceId = await getDeviceId();
    const date = new Date().getTime();
    const newActivity = await convertToBrowserActivity(
      active.url,
      date,
      deviceId,
    );

    try {
      const { accessToken } = store.getState().ciState;
      await axios.post(
        // TODO: update to use env var
        `https://${state.serverDomain}/api/browser-activity`,
        newActivity,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const historyId = `${state.url}_${date}`;
      await addSyncedItem(SYNCED_HISTORY_KEY, historyId);
    } catch (err) {
      console.error("Error posting event:", err);
    }

    triggerHistoryCrawl();
  }
};

async function triggerHistoryCrawl() {
  await store.dispatch({
    type: "loadUserSettings",
  });
}

async function getDeviceId(): Promise<string> {
  const storage = await browser.storage.local.get("deviceId");
  if (typeof storage.deviceId === "string" && storage.deviceId.length > 0) {
    return storage.deviceId;
  }

  throw new Error(
    "No device_id found. Please wait for device setup to complete.",
  );
}

/**
 * Fire-and-forget heartbeat informing CI-Server that this device is alive.
 * Sends `PATCH /api/devices/:id/last-seen`. Failure is logged but never thrown
 * since the heartbeat must not block any other work.
 */
/**
 * Capture a PNG snapshot of the active tab via `browser.tabs.captureVisibleTab`
 * and POST it to CI-Server's content API. The endpoint isn't live yet
 * (see planning/08-highlight-capture.md and planning/15-oauth-integration.md);
 * until then the screenshot is cached in storage.local so users can audit
 * what we'd send.
 */
async function captureActiveTab(): Promise<{
  url: string | undefined;
  title: string | undefined;
  size: number;
}> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab || typeof tab.windowId !== "number") {
    throw new Error("No active tab");
  }

  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const body = dataUrl.replace(/^data:image\/png;base64,/, "");
  const size = body.length;

  const state = store.getState().ciState;
  const { accessToken, serverDomain, deviceId } = state;
  const capturedAt = new Date().toISOString();

  const payload = {
    device_id: deviceId,
    source_url: tab.url,
    source_title: tab.title,
    kind: "screenshot" as const,
    mime_type: "image/png" as const,
    body,
    captured_at: capturedAt,
  };

  if (accessToken && serverDomain && deviceId) {
    try {
      await axios.post(`https://${serverDomain}/api/content`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });
      logger.info("capture.uploaded", {
        url: tab.url,
        size,
      });
    } catch (err) {
      // /api/content isn't live yet. Cache locally and log; the outbox
      // refactor (planning/06) will drain pending captures once the
      // endpoint exists.
      const pending =
        ((await browser.storage.local.get("pendingCaptures"))
          .pendingCaptures as Array<typeof payload> | undefined) ?? [];
      pending.push(payload);
      if (pending.length > 20) {
        pending.splice(0, pending.length - 20);
      }

      await browser.storage.local.set({ pendingCaptures: pending });
      logger.warn("capture.uploadDeferred", {
        url: tab.url,
        size,
        pending: pending.length,
        err: errMessage(err),
      });
    }
  } else {
    logger.info("capture.cachedLocal", { url: tab.url, size });
    const pending =
      ((await browser.storage.local.get("pendingCaptures")).pendingCaptures as
        | Array<typeof payload>
        | undefined) ?? [];
    pending.push(payload);
    if (pending.length > 20) {
      pending.splice(0, pending.length - 20);
    }

    await browser.storage.local.set({ pendingCaptures: pending });
  }

  return { url: tab.url, title: tab.title, size };
}

async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  try {
    const state = store.getState().ciState;
    const { accessToken, serverDomain } = state;
    if (!accessToken || !serverDomain) {
      return;
    }

    const accessDecoded = jwtDecode<{ exp?: number }>(accessToken);
    const isAuthExpired = accessDecoded?.exp
      ? Date.now() >= accessDecoded.exp * 1000
      : true;
    if (isAuthExpired) {
      return;
    }

    await axios.patch(
      `https://${serverDomain}/api/devices/${deviceId}/last-seen`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      },
    );
    logger.debug("device.lastSeen.updated", { deviceId });
  } catch (err) {
    // last_seen updates are non-critical — never block on them.
    logger.debug("device.lastSeen.failed", { deviceId, err: errMessage(err) });
  }
}

async function fetchDeviceFromServer(): Promise<string | null> {
  try {
    const state = store.getState().ciState;
    const { accessToken, serverDomain } = state;

    if (!accessToken) {
      return null;
    }

    const accessDecoded = jwtDecode(accessToken) as any;
    const isAuthExpired =
      accessDecoded && accessDecoded.exp
        ? Date.now() >= accessDecoded.exp * 1000
        : true;

    if (isAuthExpired) {
      return null;
    }

    const response = await axios.get(`https://${serverDomain}/api/devices`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 10000, // 10 second timeout
    });

    const devices = response.data;

    const storage = await browser.storage.local.get("deviceId");
    const storedDeviceId =
      typeof storage.deviceId === "string" ? storage.deviceId : undefined;
    if (storedDeviceId) {
      const matchingDevice = devices.find(
        (d: any) => d.device_id === storedDeviceId,
      );
      if (matchingDevice) {
        return storedDeviceId;
      }
    }

    // Tiered fingerprint match — server-side schema treats browser extensions
    // as `device_type=browser`, `platform=web`. Match by name first, then by
    // model as a fallback so OS version bumps don't fork the device row.
    const deviceInfo = getDeviceInfo();
    const matchingDevice = devices.find(
      (d: any) =>
        d.device_type === "browser" &&
        d.platform === "web" &&
        (d.device_name === deviceInfo.device_name ||
          (deviceInfo.model && d.model === deviceInfo.model)),
    );

    if (matchingDevice) {
      await browser.storage.local.set({
        deviceId: matchingDevice.device_id,
        deviceName: matchingDevice.device_name,
        deviceType: matchingDevice.device_type,
        devicePlatform: matchingDevice.platform,
      });
      store.dispatch(
        setState({
          deviceId: matchingDevice.device_id,
          deviceName: matchingDevice.device_name,
          deviceType: matchingDevice.device_type,
          devicePlatform: matchingDevice.platform,
        }),
      );

      return matchingDevice.device_id;
    }

    return null;
  } catch (error: any) {
    console.error(
      "Failed to fetch devices from server:",
      error?.response?.data || error?.message,
    );

    return null;
  }
}

async function createDeviceOnServer(): Promise<string> {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken) {
    throw new Error("Cannot create device: No access token available");
  }

  const accessDecoded = jwtDecode(accessToken) as any;
  const isAuthExpired =
    accessDecoded && accessDecoded.exp
      ? Date.now() >= accessDecoded.exp * 1000
      : true;

  if (isAuthExpired) {
    throw new Error(
      "Cannot create device: Access token expired. Please log in again.",
    );
  }

  const deviceInfo = getDeviceInfo();

  try {
    const response = await axios.post(
      `https://${serverDomain}/api/devices`,
      deviceInfo,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      },
    );

    const deviceId = response.data.device_id;
    const deviceName = response.data.device_name;
    const deviceType = response.data.device_type;
    const devicePlatform = response.data.platform;

    await browser.storage.local.set({
      deviceId,
      deviceName,
      deviceType,
      devicePlatform,
    });
    store.dispatch(
      setState({
        deviceId,
        deviceName,
        deviceType,
        devicePlatform,
      }),
    );

    deviceSetupInProgress = false;

    return deviceId;
  } catch (error: any) {
    const errorMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unknown error occurred";

    throw new Error(`Failed to create device: ${errorMessage}`);
  }
}

function checkAuthStatus() {
  const state = store.getState().ciState;
  const { accessToken } = state;

  return { accessToken };
}

async function setupDevice(): Promise<string> {
  if (deviceSetupInProgress) {
    throw new Error("Device setup already in progress");
  }

  deviceSetupInProgress = true;

  try {
    const { accessToken } = checkAuthStatus();

    if (!accessToken) {
      throw new Error("No access token available. Please log in first.");
    }

    const existingDeviceId = await fetchDeviceFromServer();

    if (existingDeviceId) {
      return existingDeviceId;
    }

    return await createDeviceOnServer();
  } catch (error: any) {
    const errorMessage =
      error?.message || error?.toString() || "Unknown error occurred";
    deviceSetupInProgress = false;
    throw new Error(errorMessage);
  }
}

function getDeviceInfo() {
  const browser_info = bowser.getParser(navigator.userAgent);
  const osName = browser_info.getOSName() || "unknown";
  const browserName = browser_info.getBrowserName() || "Chrome";
  const browserVersion = browser_info.getBrowserVersion() || undefined;
  const osVersion = browser_info.getOSVersion() || undefined;

  const platformType = browser_info.getPlatformType();
  const formFactor =
    platformType === "mobile"
      ? "mobile"
      : platformType === "tablet"
        ? "tablet"
        : "desktop";

  const device_name = `${browserName} on ${osName}`;
  const model = osVersion ? `${osName} ${osVersion}` : osName;

  const lower = osName.toLowerCase();
  let manufacturer: string | undefined;
  if (lower.includes("mac") || lower.includes("ios")) {
    manufacturer = "Apple";
  } else if (lower.includes("windows")) {
    manufacturer = "Microsoft";
  } else if (lower.includes("android")) {
    manufacturer = "Google";
  } else if (lower.includes("linux")) {
    manufacturer = "Linux Foundation";
  }

  // device_type/platform are pinned to "browser"/"web" so that CI-Server's
  // ensureDeviceExists treats every install as one logical browser device.
  // The user's form factor lives in `form_factor` as supplementary metadata.
  return {
    device_name,
    device_type: "browser" as const,
    platform: "web" as const,
    model,
    manufacturer,
    os_version: osVersion,
    app_version: browserVersion,
    form_factor: formFactor,
  };
}

function isUrlBlacklisted(
  url: string,
  siteBlacklist: string[],
  pageBlacklist: string[],
): boolean {
  try {
    const parsedUrl = URL.parse(url);
    if (!parsedUrl || !parsedUrl.hostname) {
      return false;
    }

    for (const site of siteBlacklist) {
      const siteRegex = new RegExp(site);
      if (siteRegex.test(parsedUrl.hostname)) {
        return true;
      }
    }

    parsedUrl.hash = "";
    const urlWithoutHash = parsedUrl.toString();
    for (const page of pageBlacklist) {
      const pageRegex = new RegExp(page.replace("?", "\\?"));
      if (pageRegex.test(urlWithoutHash)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking if URL is blacklisted:", error);

    return false;
  }
}

async function convertToBrowserActivity(
  url: string,
  visitTime: number,
  deviceId: string,
): Promise<{
  time: string;
  device_id: string;
  url: string;
  title?: string;
  action_type:
    | "visit"
    | "reload"
    | "bookmark"
    | "search"
    | "download"
    | "form_submit";
  properties?: Record<string, any>;
  duration_seconds?: number;
  scroll_depth_percent?: number;
  is_incognito?: boolean;
  contains_sensitive?: boolean;
}> {
  // Skip invalid URLs
  if (!isValidUrl(url)) {
    throw new Error(`Invalid URL: ${url}`);
  }

  let title: string | undefined = undefined;
  let description: string | undefined = undefined;
  let duration_seconds: number | undefined = undefined;
  let scroll_depth: number | undefined = undefined;

  try {
    const historyItems = await browser.history.search({
      text: url,
      startTime: visitTime - 1000,
      endTime: visitTime + 1000,
      maxResults: 1,
    });

    if (historyItems.length > 0 && historyItems[0].title) {
      title = historyItems[0].title;

      try {
        const visits = await browser.history.getVisits({ url: url });
        if (visits.length > 0) {
          const closestVisit = visits.reduce((closest, visit) => {
            const currentDiff = Math.abs(visit.visitTime! - visitTime);
            const closestDiff = Math.abs(closest.visitTime! - visitTime);

            return currentDiff < closestDiff ? visit : closest;
          });

          if (closestVisit.visitTime && closestVisit.transition) {
            const nextVisit = visits.find(
              (v) => v.visitTime! > closestVisit.visitTime!,
            );
            if (nextVisit && nextVisit.visitTime) {
              duration_seconds = Math.round(
                (nextVisit.visitTime - closestVisit.visitTime) / 1000,
              );
            } else {
              duration_seconds = 30;
            }
          }
        }
      } catch {
        // Continue without duration
      }
    } else {
      try {
        const tabs = await browser.tabs.query({ url: url });
        if (tabs.length > 0 && tabs[0].title) {
          title = tabs[0].title;
        }
      } catch {
        // Continue without title
      }
    }
  } catch {
    // Continue without title
  }

  try {
    const tabs = await browser.tabs.query({ url: url });
    if (tabs.length > 0) {
      try {
        const results = await browser.tabs.sendMessage(tabs[0].id!, {
          action: "getMetaDescription",
        });
        if (results && results.description) {
          description = results.description;
        }
      } catch {
        // Continue without description
      }

      try {
        const scrollResults = await browser.tabs.sendMessage(tabs[0].id!, {
          action: "getScrollDepth",
        });
        if (scrollResults && scrollResults.scrollDepth !== undefined) {
          scroll_depth = scrollResults.scrollDepth;
        }
      } catch {
        // Continue without scroll depth
      }
    }
  } catch {
    // Continue without description or scroll depth
  }

  return {
    time: ensureISOTimeFormat(visitTime),
    device_id: deviceId,
    url: url,
    title: title,
    action_type: "visit" as const,
    properties: {
      description: description,
    },
    duration_seconds: duration_seconds,
    scroll_depth_percent: scroll_depth,
    is_incognito: false,
    contains_sensitive: false,
  };
}

// Main sync function that coordinates all sync types based on toggles
async function triggerManualSync(options: { timeRange?: number } = {}) {
  await store.dispatch({
    type: "loadUserSettings",
  });

  const state = store.getState().ciState;
  const {
    accessToken,
    historySyncEnabled,
    bookmarkSyncEnabled,
    downloadSyncEnabled,
  } = state;

  // Don't sync if user is not authenticated
  if (!accessToken) {
    store.dispatch(
      setState({
        historySyncInProgress: false,
        historySyncStatus: "Please log in to sync data.",
      }),
    );

    return;
  }

  // Check if any sync is enabled
  if (!historySyncEnabled && !bookmarkSyncEnabled && !downloadSyncEnabled) {
    store.dispatch(
      setState({
        historySyncInProgress: false,
        historySyncStatus:
          "No sync types enabled. Please enable at least one sync option.",
      }),
    );

    return;
  }

  // Set sync in progress
  store.dispatch(
    setState({
      historySyncInProgress: true,
      historySyncStatus: "Starting sync...",
    }),
  );

  const successMessage = "Sync completed successfully";
  const hasErrors = false;

  try {
    // Sync history if enabled
    if (historySyncEnabled) {
      console.log(
        "History sync is enabled, calling syncHistory with options:",
        options,
      );
      await syncHistory(options);
    } else {
      console.log("History sync is disabled, skipping");
    }

    // Sync bookmarks if enabled
    if (bookmarkSyncEnabled) {
      await syncBookmarks();
    }

    // Sync downloads if enabled
    if (downloadSyncEnabled) {
      await syncDownloads();
    }

    // Final success message
    store.dispatch(
      setState({
        historySyncInProgress: false,
        historySyncStatus: hasErrors
          ? `${successMessage} (with some errors)`
          : successMessage,
        lastHistorySync: new Date().toISOString(),
      }),
    );

    store.dispatch(saveUserSettings());
  } catch (error) {
    console.error("Manual sync error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    store.dispatch(
      setState({
        historySyncInProgress: false,
        historySyncStatus: `Sync failed: ${errorMessage}`,
      }),
    );
  }
}

// Individual sync functions
async function syncHistory(options: { timeRange?: number } = {}) {
  console.log("syncHistory called with options:", options);

  await store.dispatch({
    type: "loadUserSettings",
  });

  const state = store.getState().ciState;
  console.log("History sync state:", {
    historySyncEnabled: state.historySyncEnabled,
    historySyncInProgress: state.historySyncInProgress,
    hasAccessToken: !!state.accessToken,
  });

  // Note: Sync state is managed by the main triggerManualSync function
  // No need to check historySyncInProgress here as it's already set by the caller

  // Check authentication
  const { accessToken } = state;
  const accessDecoded = accessToken ? (jwtDecode(accessToken) as any) : null;
  const isAuthExpired =
    accessDecoded && accessDecoded.exp
      ? Date.now() >= accessDecoded.exp * 1000
      : true;

  console.log("Authentication check:", {
    hasAccessToken: !!accessToken,
    isAuthExpired,
    tokenExp: accessDecoded?.exp,
    currentTime: Date.now(),
  });

  if (isAuthExpired) {
    console.log("Authentication expired, stopping history sync");
    store.dispatch(
      setState({
        historySyncStatus: "Authentication expired. Please log in again.",
      }),
    );

    return;
  }

  try {
    console.log("Getting device ID...");
    const deviceId = await getDeviceId();
    console.log("Device ID obtained:", deviceId);
  } catch (error) {
    console.log("Device ID error:", error);
    store.dispatch(
      setState({
        historySyncStatus:
          "Device setup failed due to SSL certificate issues. Please run Chrome with --ignore-certificate-errors flag.",
      }),
    );

    return;
  }

  const startTime = Date.now();
  const timeRange = options.timeRange || 7 * 24 * 60 * 60 * 1000; // Default to last 7 days
  const searchStartTime = Date.now() - timeRange;

  console.log("Time range calculation:", {
    timeRange: timeRange,
    timeRangeDays: timeRange / (24 * 60 * 60 * 1000),
    searchStartTime: searchStartTime,
    searchStartDate: new Date(searchStartTime).toISOString(),
    currentTime: Date.now(),
    currentDate: new Date().toISOString(),
  });

  try {
    // Check if history sync is enabled
    if (!state.historySyncEnabled) {
      store.dispatch(
        setState({
          historySyncInProgress: false,
          historySyncStatus: "History sync is disabled",
        }),
      );

      return;
    }

    // Update status (sync in progress is already set by main function)
    store.dispatch(
      setState({
        historySyncStatus: "Starting history sync...",
      }),
    );

    store.dispatch(saveUserSettings());

    // Get all history (not just whitelisted domains/pages)
    store.dispatch(
      setState({
        historySyncStatus: "Searching browser history...",
      }),
    );

    const allHistoryResults = await browser.history.search({
      text: "",
      startTime: searchStartTime,
      maxResults: 1000000,
    });

    console.log("History search results:", {
      totalResults: allHistoryResults.length,
      searchStartTime,
      timeRange: timeRange,
      firstResult: allHistoryResults[0],
      lastResult: allHistoryResults[allHistoryResults.length - 1],
      sampleResult: allHistoryResults[0]
        ? Object.keys(allHistoryResults[0])
        : [],
    });

    if (allHistoryResults.length === 0) {
      const duration = Date.now() - startTime;
      store.dispatch(
        setState({
          historySyncInProgress: false,
          historySyncStatus: "No history found for the selected time range.",
          lastHistorySync: new Date().toISOString(),
        }),
      );

      // Log the sync operation
      store.dispatch(
        addSyncHistoryLog({
          timestamp: new Date().toISOString(),
          timeRange: Math.floor(timeRange / (24 * 60 * 60 * 1000)), // Convert to days
          totalEntries: 0,
          processedEntries: 0,
          uploadedEntries: 0,
          status: "success",
          error: null,
          duration: duration,
        }),
      );

      store.dispatch(saveUserSettings());

      return;
    }

    store.dispatch(
      setState({
        historySyncStatus: `Processing ${allHistoryResults.length} history entries...`,
      }),
    );

    // Process history entries directly (no need for getVisits - it's deprecated)
    const hydratedResults: Array<{ visitTime: number; url: string }> = [];
    let processed = 0;
    let blacklistedCount = 0;
    const { siteBlacklist = [], pageBlacklist = [] } = state;

    for (const item of allHistoryResults) {
      try {
        // Check if this URL is blacklisted
        if (
          item.url &&
          isUrlBlacklisted(item.url, siteBlacklist, pageBlacklist)
        ) {
          blacklistedCount++;
          processed++;
          continue;
        }

        if (!item.url) {
          processed++;
          continue;
        }

        // Use the lastVisitTime from the search result directly, or fallback to current time
        const visitTime = item.lastVisitTime || Date.now();

        console.log("Processing item:", {
          url: item.url,
          lastVisitTime: item.lastVisitTime,
          hasLastVisitTime: !!item.lastVisitTime,
          usingVisitTime: visitTime,
          visitTimeInRange: visitTime >= searchStartTime,
          searchStartTime: searchStartTime,
        });

        if (visitTime >= searchStartTime) {
          hydratedResults.push({
            visitTime: visitTime,
            url: item.url,
          });
        }

        processed++;
        if (processed % 100 === 0) {
          const statusMessage =
            blacklistedCount > 0
              ? `Processed ${processed}/${allHistoryResults.length} entries (${blacklistedCount} blacklisted)...`
              : `Processed ${processed}/${allHistoryResults.length} entries...`;
          store.dispatch(
            setState({
              historySyncStatus: statusMessage,
            }),
          );
        }
      } catch (err) {
        console.log("Error processing history item:", err);
      }
    }

    if (hydratedResults.length === 0) {
      const duration = Date.now() - startTime;
      const statusMessage =
        blacklistedCount > 0
          ? `No visits to sync (${blacklistedCount} blacklisted entries excluded).`
          : "No visits found for the selected time range.";
      store.dispatch(
        setState({
          historySyncInProgress: false,
          historySyncStatus: statusMessage,
          lastHistorySync: new Date().toISOString(),
        }),
      );

      // Log the sync operation
      store.dispatch(
        addSyncHistoryLog({
          timestamp: new Date().toISOString(),
          timeRange: Math.floor(timeRange / (24 * 60 * 60 * 1000)), // Convert to days
          totalEntries: allHistoryResults.length,
          processedEntries: processed,
          uploadedEntries: 0,
          status: "success",
          error: null,
          duration: duration,
        }),
      );

      store.dispatch(saveUserSettings());

      return;
    }

    // Check if history sync was recently re-enabled
    const syncReEnabledData = await browser.storage.local.get(
      "historySyncReEnabledAt",
    );
    const historySyncReEnabledAt = syncReEnabledData.historySyncReEnabledAt;

    // Filter out already synced history entries and invalid URLs
    const unsyncedResults = [];
    for (const result of hydratedResults) {
      // Skip invalid URLs
      if (!isValidUrl(result.url)) {
        continue;
      }

      // If history sync was recently re-enabled, ignore the cache completely
      if (historySyncReEnabledAt) {
        unsyncedResults.push(result);
      } else {
        // Normal sync - check cache
        const historyId = `${result.url}_${result.visitTime}`;
        const isAlreadySynced = await isItemSynced(
          SYNCED_HISTORY_KEY,
          historyId,
        );
        if (!isAlreadySynced) {
          unsyncedResults.push(result);
        }
      }
    }

    console.log("Unsynced results:", {
      totalHydrated: hydratedResults.length,
      unsyncedCount: unsyncedResults.length,
      blacklistedCount,
      historySyncReEnabledAt,
      cacheIgnored: !!historySyncReEnabledAt,
    });

    if (unsyncedResults.length === 0) {
      const duration = Date.now() - startTime;
      const statusMessage =
        blacklistedCount > 0
          ? `No new visits to sync (${blacklistedCount} blacklisted entries excluded).`
          : "No new history entries to sync.";
      console.log("No unsynced results found:", statusMessage);
      store.dispatch(
        setState({
          historySyncInProgress: false,
          historySyncStatus: statusMessage,
          lastHistorySync: new Date().toISOString(),
        }),
      );

      // Log the sync operation
      store.dispatch(
        addSyncHistoryLog({
          timestamp: new Date().toISOString(),
          timeRange: Math.floor(timeRange / (24 * 60 * 60 * 1000)), // Convert to days
          totalEntries: allHistoryResults.length,
          processedEntries: hydratedResults.length,
          uploadedEntries: 0,
          status: "success",
          error: null,
          duration: duration,
        }),
      );

      store.dispatch(saveUserSettings());

      return;
    }

    console.log(`Syncing ${unsyncedResults.length} new history entries`);

    const statusMessage =
      blacklistedCount > 0
        ? `Uploading ${unsyncedResults.length} new visits to CI-Server (${blacklistedCount} blacklisted entries excluded)...`
        : `Uploading ${unsyncedResults.length} new visits to CI-Server...`;
    store.dispatch(
      setState({
        historySyncStatus: statusMessage,
      }),
    );

    // Get device ID for browser activity
    const deviceId = await getDeviceId();

    // Process and upload in batches
    let uploaded = 0;
    let failed = false;
    let lastError = null;

    for (let i = 0; i < unsyncedResults.length; i += SLICE_SIZE) {
      const slice = unsyncedResults.slice(i, i + SLICE_SIZE);

      try {
        // Convert to BrowserActivity format
        const browserActivities = await Promise.all(
          slice.map(async (result) => {
            return convertToBrowserActivity(
              result.url,
              result.visitTime,
              deviceId,
            );
          }),
        );

        const { accessToken } = store.getState().ciState;

        if (!accessToken) {
          throw new Error("No access token available for authentication");
        }

        try {
          // Log the data being sent for debugging
          // console.log(
          //   "Sending history activity:",
          //   JSON.stringify(browserActivities, null, 2),
          // );

          await axios.post(
            `https://${state.serverDomain}/api/browser-activity`,
            browserActivities,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              timeout: 300000,
            },
          );
          uploaded = uploaded + browserActivities.length;

          for (let j = 0; j < browserActivities.length; j++) {
            const result = slice[j];
            // Mark this specific history entry as synced only after successful upload
            const historyId = `${result.url}_${result.visitTime}`;
            await addSyncedItem(SYNCED_HISTORY_KEY, historyId);
          }
        } catch (error: any) {
          console.error("Error uploading history entry:", error);
          console.error("Failed activities:", browserActivities);
          console.error("Server response:", error.response?.data);

          // Log detailed validation errors if available
          if (error.response?.data?.errors) {
            console.error(
              "Server validation errors:",
              JSON.stringify(error.response.data.errors, null, 2),
            );
          }

          // Continue with other entries even if one fails
          // Don't mark as synced if upload failed
        }

        store.dispatch(
          setState({
            historySyncStatus: `Uploaded ${uploaded}/${unsyncedResults.length} visits...`,
          }),
        );
      } catch (err: any) {
        console.error("Error uploading history batch:", err?.message);
        lastError = err?.response?.data?.message || err?.message || String(err);
        failed = true;
        break;
      }
    }

    const duration = Date.now() - startTime;

    // Log the sync operation
    const logStatus = failed
      ? "failed"
      : uploaded < unsyncedResults.length
        ? "partial"
        : "success";
    store.dispatch(
      addSyncHistoryLog({
        timestamp: new Date().toISOString(),
        timeRange: Math.floor(timeRange / (24 * 60 * 60 * 1000)), // Convert to days
        totalEntries: allHistoryResults.length,
        processedEntries: hydratedResults.length,
        uploadedEntries: uploaded,
        status: logStatus,
        error: lastError,
        duration: duration,
      }),
    );

    // Update final status
    if (failed) {
      const failureMessage =
        blacklistedCount > 0
          ? `History sync failed after uploading ${uploaded} visits (${blacklistedCount} blacklisted entries excluded). Please try again.`
          : `History sync failed after uploading ${uploaded} visits. Please try again.`;
      store.dispatch(
        setState({
          historySyncInProgress: false,
          historySyncStatus: failureMessage,
        }),
      );
    } else {
      const successMessage =
        blacklistedCount > 0
          ? `Successfully synced ${uploaded} visits to CI-Server (${blacklistedCount} blacklisted entries excluded).`
          : `Successfully synced ${uploaded} visits to CI-Server.`;
      store.dispatch(
        setState({
          historySyncInProgress: false,
          historySyncStatus: successMessage,
          lastHistorySync: new Date().toISOString(),
        }),
      );
    }

    store.dispatch(saveUserSettings());

    // Clear the re-enabled flag after sync (successful or not)
    if (historySyncReEnabledAt) {
      await browser.storage.local.remove("historySyncReEnabledAt");
      console.log("Cleared historySyncReEnabledAt flag");
    }
  } catch (error) {
    console.error("Manual history sync error:", error);
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log the sync operation as failed
    store.dispatch(
      addSyncHistoryLog({
        timestamp: new Date().toISOString(),
        timeRange: Math.floor(timeRange / (24 * 60 * 60 * 1000)), // Convert to days
        totalEntries: 0,
        processedEntries: 0,
        uploadedEntries: 0,
        status: "failed",
        error: errorMessage,
        duration: duration,
      }),
    );

    store.dispatch(
      setState({
        historySyncInProgress: false,
        historySyncStatus: `History sync failed: ${errorMessage}`,
      }),
    );
    store.dispatch(saveUserSettings());
  }
}

async function syncBookmarks() {
  store.dispatch(
    setState({
      historySyncStatus: "Syncing bookmarks...",
    }),
  );

  try {
    await syncBookmarksToServer();
    console.log("Bookmark sync completed successfully");
  } catch (error) {
    console.error("Bookmark sync failed:", error);
    throw error;
  }
}

async function syncDownloads() {
  store.dispatch(
    setState({
      historySyncStatus: "Syncing downloads...",
    }),
  );

  try {
    await syncDownloadsToServer();
    console.log("Download sync completed successfully");
  } catch (error) {
    console.error("Download sync failed:", error);
    throw error;
  }
}

// Legacy function for backward compatibility
async function triggerManualHistorySync(options: { timeRange?: number } = {}) {
  await triggerManualSync(options);
}

// Background sync function - triggers the same logic as the periodic auto-sync
async function triggerBackgroundSync() {
  // Simply trigger the normal manual sync with auto-sync time range
  await triggerManualSync({
    timeRange: AUTO_SYNC_TIME_RANGE,
  });
}

// Download sync functions
async function createDownloadEvent(
  download: any,
  eventType: "create" | "update" | "sync" = "sync",
): Promise<{
  time: string;
  device_id: string;
  url: string;
  title?: string;
  action_type:
    | "visit"
    | "reload"
    | "bookmark"
    | "search"
    | "download"
    | "form_submit";
  properties?: Record<string, any>;
  duration_seconds?: number;
  scroll_depth_percent?: number;
  is_incognito?: boolean;
  contains_sensitive?: boolean;
}> {
  const state = store.getState().ciState;
  const { deviceId } = state;

  // Validate required fields and provide defaults
  if (!deviceId) {
    throw new Error("Device ID is required for download sync");
  }

  if (!download.url) {
    throw new Error("Download URL is required");
  }

  return {
    time: ensureISOTimeFormat(download.startTime),
    device_id: deviceId || "",
    url: download.url,
    title: download.filename || "Unknown Download",
    action_type: "download" as const,
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

async function syncDownloadsToServer() {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken) {
    return;
  }

  try {
    const downloads = await browser.downloads.search({});

    // Filter out already synced downloads and invalid URLs
    const unsyncedDownloads = [];
    for (const download of downloads) {
      // Skip downloads with invalid URLs
      if (!download.url || !isValidUrl(download.url)) {
        continue;
      }

      const isAlreadySynced = await isItemSynced(
        SYNCED_DOWNLOADS_KEY,
        download.id.toString(),
      );
      if (!isAlreadySynced) {
        unsyncedDownloads.push(download);
      }
    }

    if (unsyncedDownloads.length === 0) {
      console.log("No new downloads to sync");

      return;
    }

    console.log(`Syncing ${unsyncedDownloads.length} new downloads`);

    // Process unsynced downloads in batches
    for (let i = 0; i < unsyncedDownloads.length; i += SLICE_SIZE) {
      const slice = unsyncedDownloads.slice(i, i + SLICE_SIZE);
      const downloadEvents = await Promise.all(
        slice.map((download) => createDownloadEvent(download, "sync")),
      );

      // Send each download event individually (server expects single object, not array)
      for (let j = 0; j < downloadEvents.length; j++) {
        const event = downloadEvents[j];
        const download = slice[j];

        try {
          // Log the data being sent for debugging
          console.log(
            "Sending download event:",
            JSON.stringify(event, null, 2),
          );

          await axios.post(
            `https://${serverDomain}/api/browser-activity`,
            event, // Send individual object, not array
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            },
          );
          console.log("Successfully sent download event:", event.url);

          // Mark this specific download as synced only after successful upload
          await addSyncedItem(SYNCED_DOWNLOADS_KEY, download.id.toString());
        } catch (eventError: any) {
          console.error("Error sending individual download event:", eventError);
          console.error("Failed event:", event);
          console.error("Server response:", eventError.response?.data);

          // Log detailed validation errors if available
          if (eventError.response?.data?.errors) {
            console.error(
              "Server validation errors:",
              JSON.stringify(eventError.response.data.errors, null, 2),
            );
          }

          // Continue with other events even if one fails
          // Don't mark as synced if upload failed
        }
      }
    }

    // Update last sync time
    await browser.storage.local.set({
      [DOWNLOAD_SYNC_KEY]: Date.now(),
    });
  } catch (error) {
    console.error("Error syncing downloads:", error);
  }
}

async function handleDownloadCreated(download: any) {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken || !state.downloadSyncEnabled) {
    return;
  }

  try {
    const downloadEvent = await createDownloadEvent(download, "create");
    await axios.post(
      `https://${serverDomain}/api/browser-activity`,
      downloadEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error syncing created download:", error);
  }
}

// Handle scraped data from domain scraper content scripts
async function handleScrapedData(scrapeResult: ScrapeResult) {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken) {
    return;
  }

  // Convert scraped data to events format
  const events = [];

  for (const [dataType, items] of Object.entries(scrapeResult.data)) {
    if (!Array.isArray(items)) {
      continue;
    }

    for (const item of items) {
      const itemData = item as any;
      const event = {
        name: `Scraped ${scrapeResult.profileName} - ${itemData.title || "Data"}`,
        start_time: scrapeResult.timestamp,
        type: "Scraped Data",
        content: [
          {
            type: "Personal Data",
            mimetype: "application/json",
            url: scrapeResult.url,
            title: itemData.title || `${scrapeResult.profileName} Data`,
            text: JSON.stringify(itemData),
            scrapeProfile: scrapeResult.profileName,
            domain: scrapeResult.domain,
            dataType: dataType,
          },
        ],
      };
      events.push(event);
    }
  }

  if (events.length === 0) {
    return;
  }

  try {
    await axios.post(`https://${serverDomain}/api/browser-activity`, events, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error uploading scraped data:", error);
  }
}

async function getAllBookmarks(): Promise<any[]> {
  const bookmarkTree = await browser.bookmarks.getTree();
  const allBookmarks: any[] = [];

  function collectBookmarks(nodes: any[]) {
    for (const node of nodes) {
      if (node.url && /^(http(s)?:\/\/)/.test(node.url)) {
        // This is an actual bookmark (not a folder)
        // Validate bookmark data before adding
        if (node.id && node.url && node.title) {
          allBookmarks.push(node);
        } else {
          console.warn("Skipping invalid bookmark:", node);
        }
      }

      if (node.children) {
        collectBookmarks(node.children);
      }
    }
  }

  collectBookmarks(bookmarkTree);

  return allBookmarks;
}

async function createBookmarkEvent(
  bookmark: any,
  eventType: "create" | "update" | "sync" = "sync",
): Promise<{
  time: string;
  device_id: string;
  url: string;
  title?: string;
  action_type:
    | "visit"
    | "reload"
    | "bookmark"
    | "search"
    | "download"
    | "form_submit";
  properties?: Record<string, any>;
  duration_seconds?: number;
  scroll_depth_percent?: number;
  is_incognito?: boolean;
  contains_sensitive?: boolean;
}> {
  const state = store.getState().ciState;
  const { deviceId } = state;

  // Validate bookmark data
  if (!bookmark.id || !bookmark.url) {
    throw new Error(`Invalid bookmark data: ${JSON.stringify(bookmark)}`);
  }

  // Ensure URL is valid
  try {
    new URL(bookmark.url);
  } catch {
    throw new Error(`Invalid bookmark URL: ${bookmark.url}`);
  }

  // Validate device ID
  if (!deviceId) {
    throw new Error("Device ID is required for bookmark sync");
  }

  return {
    time: ensureISOTimeFormat(bookmark.dateAdded),
    device_id: deviceId || "",
    url: bookmark.url,
    title: bookmark.title || "Untitled Bookmark",
    action_type: "bookmark" as const,
    properties: {
      bookmark_id: bookmark.id,
      event_type: eventType,
    },
    is_incognito: false,
    contains_sensitive: false,
  };
}

async function syncBookmarksToServer() {
  const state = store.getState().ciState;
  const { accessToken, serverDomain, deviceId } = state;

  if (!accessToken) {
    console.log("No access token available for bookmark sync");

    return;
  }

  if (!deviceId) {
    console.log("No device ID available for bookmark sync");

    return;
  }

  try {
    const allBookmarks = await getAllBookmarks();

    // Filter out already synced bookmarks and invalid URLs
    const unsyncedBookmarks = [];
    for (const bookmark of allBookmarks) {
      // Skip bookmarks with invalid URLs
      if (!bookmark.url || !isValidUrl(bookmark.url)) {
        continue;
      }

      const isAlreadySynced = await isItemSynced(
        SYNCED_BOOKMARKS_KEY,
        bookmark.id,
      );
      if (!isAlreadySynced) {
        unsyncedBookmarks.push(bookmark);
      }
    }

    if (unsyncedBookmarks.length === 0) {
      console.log("No new bookmarks to sync");

      return;
    }

    console.log(`Syncing ${unsyncedBookmarks.length} new bookmarks`);

    // Process unsynced bookmarks in batches
    for (let i = 0; i < unsyncedBookmarks.length; i += SLICE_SIZE) {
      const slice = unsyncedBookmarks.slice(i, i + SLICE_SIZE);

      // Create bookmark events with error handling
      const bookmarkEvents = [];
      for (const bookmark of slice) {
        try {
          const event = await createBookmarkEvent(bookmark, "sync");
          bookmarkEvents.push(event);
        } catch (error) {
          console.error("Error creating bookmark event:", error);
          console.error("Problematic bookmark:", bookmark);
          // Skip this bookmark and continue with others
          continue;
        }
      }

      if (bookmarkEvents.length === 0) {
        console.log("No valid bookmark events to send for this batch");
        continue;
      }

      // Additional validation: ensure all events have required fields
      const validEvents = bookmarkEvents.filter((event) => {
        const isValid =
          event.time && event.device_id && event.url && event.action_type;
        if (!isValid) {
          console.warn("Filtering out invalid bookmark event:", event);
        }

        return isValid;
      });

      if (validEvents.length === 0) {
        console.log("No valid bookmark events after filtering");
        continue;
      }

      const { accessToken: currentAccessToken } = store.getState().ciState;
      try {
        console.log(
          "Sending bookmark events:",
          JSON.stringify(validEvents, null, 2),
        );

        // Additional validation: ensure all required fields are present
        for (const event of validEvents) {
          if (
            !event.time ||
            !event.device_id ||
            !event.url ||
            !event.action_type
          ) {
            console.error("Invalid event missing required fields:", event);
            throw new Error("Invalid event data");
          }

          // Ensure time is in ISO format
          if (!event.time.includes("T") || !event.time.includes("Z")) {
            console.error("Invalid time format:", event.time);
            throw new Error("Invalid time format");
          }

          // Ensure device_id is a valid UUID format
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(event.device_id)) {
            console.error("Invalid device_id format:", event.device_id);
            throw new Error("Invalid device_id format");
          }
        }

        // Validate that we have valid bookmark events
        if (validEvents.length === 0) {
          console.log("No bookmark events to send");
          continue;
        }

        // Send each event individually (server expects single object, not array)
        for (let j = 0; j < validEvents.length; j++) {
          const event = validEvents[j];
          const bookmark = slice[j];

          try {
            // Log the data being sent for debugging
            console.log(
              "Sending bookmark event:",
              JSON.stringify(event, null, 2),
            );

            await axios.post(
              `https://${serverDomain}/api/browser-activity`,
              event, // Send individual object, not array
              {
                headers: {
                  Authorization: `Bearer ${currentAccessToken}`,
                  "Content-Type": "application/json",
                },
              },
            );
            console.log("Successfully sent bookmark event:", event.url);

            // Mark this specific bookmark as synced only after successful upload
            await addSyncedItem(SYNCED_BOOKMARKS_KEY, bookmark.id);
          } catch (eventError: any) {
            console.error(
              "Error sending individual bookmark event:",
              eventError,
            );
            console.error("Failed event:", event);
            console.error("Server response:", eventError.response?.data);

            // Log detailed validation errors if available
            if (eventError.response?.data?.errors) {
              console.error(
                "Server validation errors:",
                JSON.stringify(eventError.response.data.errors, null, 2),
              );
            }

            // Continue with other events even if one fails
            // Don't mark as synced if upload failed
          }
        }
      } catch (batchError) {
        console.error("Error processing bookmark batch:", batchError);
        // Continue with next batch even if this one fails
      }
    }

    // Update last sync timestamp
    await browser.storage.local.set({
      [BOOKMARK_SYNC_KEY]: Date.now(),
    });
  } catch (error) {
    console.error("Error syncing bookmarks:", error);
  }
}

async function handleBookmarkCreated(id: string, bookmark: any) {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken || !bookmark.url) {
    return; // Skip folders or if not authenticated
  }

  try {
    const bookmarkEvent = await createBookmarkEvent(bookmark, "create");
    await axios.post(
      `https://${serverDomain}/api/browser-activity`,
      bookmarkEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error syncing created bookmark:", error);
  }
}

async function handleBookmarkChanged(id: string) {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken) {
    return;
  }

  try {
    const bookmarks = await browser.bookmarks.get(id);
    const bookmark = bookmarks[0];

    if (!bookmark.url) {
      return; // Skip folders
    }

    const bookmarkEvent = await createBookmarkEvent(bookmark, "update");
    await axios.post(
      `https://${serverDomain}/api/browser-activity`,
      bookmarkEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error syncing updated bookmark:", error);
  }
}

async function handleBookmarkRemoved(id: string, removeInfo: any) {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken) {
    return;
  }

  try {
    const bookmarkEvent = {
      name: `Removed Bookmark: ${removeInfo.node.title || removeInfo.node.url}`,
      start_time: new Date().toJSON(),
      type: "Remove",
      content: [
        {
          type: "Bookmark",
          mimetype: "text/html",
          url: removeInfo.node.url,
          title: removeInfo.node.title,
        },
      ],
      bookmark_id: id,
    };

    await axios.post(
      `https://${serverDomain}/api/browser-activity`,
      bookmarkEvent,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error syncing removed bookmark:", error);
  }
}

export default defineBackground({
  main() {
    const initServices = async () => {
      try {
        await database.init();
        // Location tracking is now handled by content script
      } catch (error) {
        console.error("Failed to initialize services:", error);
      }
    };

    initServices();

    const wrapStore = createWrapStore();
    wrapStore(store);
    const storageDefaults = {
      domainWhitelist: [],
      domainWhitelistPending: {},
      domainWhitelistHistory: [],
      pageWhitelist: [],
      pageWhitelistPending: {},
      pageWhitelistHistory: [],
      url: null,
      domain: null,
      lastUrl: null,
      accessToken: null,
      sessionToken: null,
      refreshing: false,
      serverDomain: "",
    };

    const refreshAccessToken = async () => {
      const state = store.getState().ciState;
      const { serverDomain, refreshing } = state;
      if (refreshing) {
        return;
      }

      // Check for session token cookie first (most reliable source)
      const cookies = await browser.cookies.getAll({
        url: `https://${serverDomain}`,
      });
      const sessionTokenCookie = cookies.find(
        (cookie) => cookie.name === SESSION_TOKEN_KEY,
      );
      const csrfTokenCookie = cookies.find(
        (cookie) => cookie.name === CSRF_COOKIE_NAME,
      );

      // Use cookie if available, otherwise fall back to storage
      const sessionToken = sessionTokenCookie?.value;

      // Validate session token exists and is not expired
      if (!sessionToken) {
        console.log("No session token available, skipping refresh");

        return;
      }

      // Check if session token is expired
      try {
        const sessionDecoded = jwtDecode(sessionToken) as any;
        const isSessionExpired = sessionDecoded?.exp
          ? Date.now() >= sessionDecoded.exp * 1000
          : true;

        if (isSessionExpired) {
          console.log("Session token expired, skipping refresh");

          return;
        }
      } catch (err) {
        console.error("Error decoding session token:", err);

        return;
      }

      if (!csrfTokenCookie) {
        console.log("No CSRF token cookie available, skipping refresh");

        return;
      }

      store.dispatch(setState({ refreshing: true }));
      try {
        const data: AuthResponse = await fetchJson(
          `https://${serverDomain}/api/authenticate/refresh`,
          {
            method: "POST",
            headers: {
              "X-CSRF-Token": csrfTokenCookie.value,
            },
            credentials: "include",
          },
        );

        store.dispatch(
          setState({ refreshing: false, accessToken: data.accessToken }),
        );

        // Setup device after successful authentication
        try {
          await setupDevice();
        } catch (error) {
          console.error("Failed to setup device after token refresh:", error);
        }
      } catch (err) {
        console.error("Error refreshing token", err);
        store.dispatch(setState({ refreshing: false }));
      }
    };

    // Authentication state listener - checks cookies and manages auth state
    async function checkAuthenticationState() {
      try {
        const currentState = store.getState().ciState;
        const { serverDomain } = currentState;
        console.log("Checking authentication for server domain:", serverDomain);

        const result = await browser.cookies.getAll({
          url: `https://${serverDomain}`,
        });

        const sessionToken = result.find(
          (cookie) => cookie.name === SESSION_TOKEN_KEY,
        );

        let authStateChanged = false;

        //If the user has logged out, or switches domains, and no cookies are found,
        //then clear state so that they aren't shown as logged in, and to avoid
        //making requests with an invalid token
        if (!sessionToken) {
          store.dispatch(setState({ accessToken: null }));
        }

        // Get updated state after potential changes
        let { accessToken, deviceId } = store.getState().ciState;

        // Check if authentication is valid
        const accessDecoded = accessToken
          ? jwtDecode<{ exp: number }>(accessToken)
          : null;
        const isAuthExpired = accessDecoded
          ? Date.now() >= (accessDecoded.exp - 5) * 1000
          : true;
        const sessionDecoded = sessionToken?.value
          ? jwtDecode<{ exp: number }>(sessionToken.value)
          : null;
        const isSessionExpired = sessionDecoded
          ? Date.now() >= sessionDecoded.exp * 1000
          : true;

        const isAuthenticated = !isAuthExpired && !isSessionExpired;

        // Handle token refresh if needed
        // Only refresh if:
        // 1. We have a valid session token cookie (not expired)
        // 2. Either we don't have an access token cookie OR the access token is expired
        if (sessionToken) {
          const sessionTokenDecoded = jwtDecode(sessionToken.value) as any;
          const isSessionTokenExpired = sessionTokenDecoded?.exp
            ? Date.now() >= sessionTokenDecoded.exp * 1000
            : true;

          if (!isSessionTokenExpired && (!accessToken || isAuthExpired)) {
            console.log("Refreshing access token...");
            await refreshAccessToken();
            authStateChanged = true;
          } else if (isSessionTokenExpired) {
            console.log("Session token expired, not attempting refresh");
            browser.runtime
              .sendMessage({
                action: "AUTH_STATE_UPDATED",
                payload: {
                  accessToken,
                  deviceId,
                },
              })
              .catch((error) => {
                console.log(
                  "No receiver for message, probably because popup not open",
                );
                console.log(error);
              });
          }
        } else {
          console.log("No session token found, not attempting refresh");
          browser.runtime
            .sendMessage({
              action: "AUTH_STATE_UPDATED",
              payload: {
                accessToken,
                deviceId,
              },
            })
            .catch((error) => {
              console.log(
                "No receiver for message, probably because popup not open",
              );
              console.log(error);
            });
        }

        // Check if we have valid authentication but no device ID
        if (isAuthenticated && !deviceId) {
          console.log(
            "Authentication detected but no device ID, setting up device...",
          );
          try {
            await setupDevice();
            authStateChanged = true;
            console.log("Device setup completed");

            // Get updated state after device setup
            const updatedState = store.getState().ciState;
            deviceId = updatedState.deviceId;
          } catch (error) {
            console.error(
              "Failed to setup device after authentication:",
              error,
            );
          }
        }

        // Save settings if auth state changed
        if (authStateChanged) {
          store.dispatch(saveUserSettings());
          console.log("Authentication state updated");

          // Get updated state after potential changes
          ({ accessToken } = store.getState().ciState);
          browser.runtime
            .sendMessage({
              action: "AUTH_STATE_UPDATED",
              payload: {
                accessToken,
                deviceId,
              },
            })
            .catch((error) => {
              console.log(
                "No receiver for message, probably because popup not open",
              );
              console.log(error);
            });
        }
      } catch (error) {
        console.error("Error checking authentication state:", error);
      }
    }

    // Set up periodic authentication checking
    setInterval(checkAuthenticationState, 1000);

    store.dispatch(loadUserSettings());

    const existingKeys = Object.keys(store.getState().ciState);
    const toSet = Object.keys(storageDefaults)
      .filter((key) => existingKeys.indexOf(key) < 0)
      .reduce((obj: any, key) => {
        obj[key] = (storageDefaults as any)[key];

        return obj;
      }, {});

    store.dispatch(setState(toSet));

    setTimeout(async () => {
      try {
        await setupDevice();
      } catch (error: any) {
        if (error?.message?.includes("Network Error")) {
          console.log("Device setup failed due to SSL certificate issues");
        }
      }
    }, 2000);

    browser.tabs.onActivated.addListener(async () => {
      const tabInfo = await browser.tabs.query({
        active: true,
      });
      const active = tabInfo[0];

      if (active?.url) {
        const parsed = URL.parse(active.url);
        if (parsed) {
          store.dispatch(setState({ domain: parsed.hostname }));
          store.dispatch(setState({ url: active.url }));
        }
      }
    });

    browser.webNavigation.onCompleted.addListener((e) => {
      if (siteRegex.test(e.url)) {
        recordHit(e);
      }
    });
    browser.webNavigation.onHistoryStateUpdated.addListener(recordHit);

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("Background received message:", message);

      try {
        if (message && message.action === "SETUP_DEVICE") {
          try {
            setupDevice().then(() => {
              sendResponse({ success: true });
            });
          } catch (error: any) {
            const errorMessage =
              error?.message || error?.toString() || "Unknown error occurred";
            sendResponse({ success: false, error: errorMessage });
          }

          return true;
        }

        if (message.action === "triggerManualSync") {
          console.log("Triggering manual sync with options:", message.options);
          triggerManualSync(message.options || {})
            .then(() => {
              console.log("Manual sync completed successfully");
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Manual sync failed:", error);
              sendResponse({ success: false, error: error.message });
            });

          return true;
        }

        if (message.action === "TRIGGER_MANUAL_HISTORY_SYNC") {
          triggerManualHistorySync(message.options || {})
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Manual history sync failed:", error);
              sendResponse({ success: false, error: error.message });
            });

          return true;
        }

        if (message.action === "triggerBackgroundSync") {
          // Trigger the background periodic sync logic
          triggerBackgroundSync()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Background sync failed:", error);
              sendResponse({ success: false, error: error.message });
            });

          return true;
        }

        if (message.action === "CHECK_AUTH_STATUS") {
          checkAuthenticationState()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Error checking auth status:", error);
              sendResponse({ success: false, error: error.message });
            });

          return true;
        }

        if (message.action === "DOMAIN_SCRAPE_DATA") {
          handleScrapedData(message.data)
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Error handling scraped data:", error);
              sendResponse({ success: false, error: error.message });
            });

          return true;
        }

        if (message.action === "CAPTURE_ACTIVE_TAB") {
          captureActiveTab()
            .then((result) => sendResponse({ success: true, ...result }))
            .catch((err) =>
              sendResponse({ success: false, error: errMessage(err) }),
            );

          return true;
        }
      } catch (error) {
        console.error("Error checking authentication state:", error);
      }
    });

    // Alt+Shift+C — capture the active tab. The command is declared in
    // wxt.config.ts so users can rebind it via chrome://extensions/shortcuts.
    if (browser.commands?.onCommand) {
      browser.commands.onCommand.addListener((command) => {
        if (command === "capture-active-tab") {
          void captureActiveTab().catch((err) =>
            logger.warn("capture.command.failed", { err: errMessage(err) }),
          );
        }
      });
    }

    const AUTO_SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes
    const AUTO_SYNC_TIME_RANGE = 24 * 60 * 60 * 1000;

    setInterval(async () => {
      try {
        await store.dispatch({
          type: "loadUserSettings",
        });

        const state = store.getState().ciState;

        if (state.autoSyncEnabled && !state.historySyncInProgress) {
          const { accessToken } = state;
          const accessDecoded = accessToken
            ? (jwtDecode(accessToken) as any)
            : null;
          const isAuthExpired =
            accessDecoded && accessDecoded.exp
              ? Date.now() >= accessDecoded.exp * 1000
              : true;

          if (!isAuthExpired) {
            await triggerManualSync({
              timeRange: AUTO_SYNC_TIME_RANGE,
            });
          }
        }
      } catch (error) {
        console.error("Auto-sync error:", error);
      }
    }, AUTO_SYNC_INTERVAL);

    // Periodic device last_seen heartbeat. CI-Server uses this to drive
    // device-presence UI without us having to record activity to do it.
    const LAST_SEEN_INTERVAL = 5 * 60 * 1000; // 5 minutes
    setInterval(async () => {
      const { deviceId } = store.getState().ciState;
      if (deviceId) {
        await updateDeviceLastSeen(deviceId);
      }
    }, LAST_SEEN_INTERVAL);

    // Set up bookmark listeners based on settings
    const setupBookmarkListeners = () => {
      const state = store.getState().ciState;
      if (state.bookmarkSyncEnabled) {
        browser.bookmarks.onCreated.addListener(handleBookmarkCreated);
        browser.bookmarks.onChanged.addListener(handleBookmarkChanged);
        browser.bookmarks.onRemoved.addListener(handleBookmarkRemoved);
      } else {
        browser.bookmarks.onCreated.removeListener(handleBookmarkCreated);
        browser.bookmarks.onChanged.removeListener(handleBookmarkChanged);
        browser.bookmarks.onRemoved.removeListener(handleBookmarkRemoved);
      }
    };

    // Initial setup
    setupBookmarkListeners();

    // Set up download listeners based on settings
    const setupDownloadListeners = () => {
      const state = store.getState().ciState;
      if (state.downloadSyncEnabled) {
        browser.downloads.onCreated.addListener(handleDownloadCreated);
      } else {
        browser.downloads.onCreated.removeListener(handleDownloadCreated);
      }
    };

    // Initial setup
    setupDownloadListeners();

    // Listen for setting changes
    browser.storage.onChanged.addListener((changes) => {
      if (changes.bookmarkSyncEnabled) {
        setupBookmarkListeners();
      }

      if (changes.downloadSyncEnabled) {
        setupDownloadListeners();
      }
    });

    setTimeout(async () => {
      const state = store.getState().ciState;
      if (state.bookmarkSyncEnabled) {
        const lastSync = await browser.storage.local.get(BOOKMARK_SYNC_KEY);
        if (!lastSync[BOOKMARK_SYNC_KEY]) {
          await syncBookmarksToServer();
        }
      }
    }, 5000);
  },
});
