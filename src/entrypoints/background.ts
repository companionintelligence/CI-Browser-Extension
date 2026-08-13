import axios from "axios";
import { createWrapStore } from "webext-redux";
import { store } from "@/store";
import {
  setState,
  loadUserSettings,
  saveUserSettings,
  addSyncHistoryLog,
} from "@/store/ciStateSlice";
import { siteRegex, parseUrl, isUrlBlacklisted } from "@/utils.ts";
import { addSyncedItem, addSyncedItems, isItemSynced } from "@/lib/syncedItems";
import { buildHighlightActivity } from "@/lib/highlight";
import {
  sendCaptureEvents,
  type BrowserActivity,
} from "@/services/captureEvents";
import { getIdToken, signIn } from "@/services/oidcAuth";
import { portalOidcConfig } from "@/services/portalConfig";
import bowser from "bowser";
import type { ScrapeResult } from "@/domainScraper";
import { database } from "@/indexeddb";
import { initExtensionSentry } from "@/lib/sentry";

initExtensionSentry("background");

const SLICE_SIZE = 100;
const BOOKMARK_SYNC_KEY = "lastBookmarkSync";
const DOWNLOAD_SYNC_KEY = "lastDownloadSync";
const AUTO_SYNC_TIME_RANGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Alarm names (chrome.alarms survives MV3 service-worker suspension)
const AUTH_CHECK_ALARM = "ci-auth-check";
const AUTO_SYNC_ALARM = "ci-auto-sync";
const LAST_SEEN_ALARM = "ci-last-seen";
const AUTO_SYNC_ALARM_TIME_RANGE = 24 * 60 * 60 * 1000; // sync the last 24h

// Device last_seen heartbeat, driven by the LAST_SEEN_ALARM
async function runLastSeenUpdate() {
  const { deviceId } = store.getState().ciState;
  if (deviceId) {
    await updateDeviceLastSeen(deviceId);
  }
}

// Periodic auto-sync, driven by the AUTO_SYNC_ALARM
async function runAutoSync() {
  try {
    const state = store.getState().ciState;

    if (state.autoSyncEnabled && !state.historySyncInProgress) {
      const token = await resolveServerToken();

      if (token) {
        await triggerManualSync({
          timeRange: AUTO_SYNC_ALARM_TIME_RANGE,
        });
      }
    }
  } catch (error) {
    console.error("Auto-sync error:", error);
  }
}

// ---- Unified identity + capture transport (Phase 3) ----

// The portal OIDC client config, derived from the configured server domain (or
// an explicit portalIssuer override). See services/portalConfig.
function oidcConfig() {
  const { serverDomain, portalIssuer } = store.getState().ciState;

  return portalOidcConfig({ serverDomain, portalIssuer });
}

// Resolve the Bearer for CI-Server: prefer the portal OIDC **id_token** — the
// JWKS-signed JWT CI-Server's `/v1/events` validates. The opaque OAuth
// access_token is NOT usable here (CI-Server's jwtVerify rejects it; this was the
// Phase 3 blocker fixed by getIdToken in #51). Falls back to a legacy CI-Server
// token still mirrored in Redux during the migration. Returns null when there is
// no usable session (or the id_token has expired — the user re-authorizes).
async function resolveServerToken(): Promise<string | null> {
  const idToken = await getIdToken(oidcConfig());
  if (idToken) {
    return idToken;
  }

  return store.getState().ciState.accessToken ?? null;
}

// Central capture transport: every browser-activity write goes through here as
// CaptureEvents on CI-Server's unified `/v1/events` path (replacing the legacy
// `POST /api/browser-activity`). No-ops without a server domain or batch;
// throws on a missing token or non-2xx so callers keep their retry/logging.
async function postCaptureEvents(activities: BrowserActivity[]): Promise<void> {
  if (activities.length === 0) {
    return;
  }

  const { serverDomain } = store.getState().ciState;
  if (!serverDomain) {
    return;
  }

  const token = await resolveServerToken();
  if (!token) {
    throw new Error("No access token available for capture upload");
  }

  await sendCaptureEvents(serverDomain, token, activities);
}

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

const recordHit = async function (e: any) {
  // Don't make API calls if the user has no usable session
  if (!(await resolveServerToken())) {
    return;
  }

  if (e.frameId !== 0) {
    return;
  }

  // Snapshot state before the dispatch below so state.lastUrl still holds the
  // previously recorded page
  const state = store.getState().ciState;

  const tabInfo = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const active = tabInfo[0];

  if (!active?.url) {
    return;
  }

  const parsed = parseUrl(active.url);
  if (!parsed) {
    return;
  }

  store.dispatch(setState({ domain: parsed.hostname, url: active.url }));

  // Check the URL being recorded (active.url) against the blacklist —
  // `state` was snapshotted before the dispatch above, so state.url still
  // holds the previous page and must not be used here
  const isBlacklisted = isUrlBlacklisted(
    active.url,
    state.siteBlacklist,
    state.pageBlacklist,
  );

  if (!isBlacklisted && state.lastUrl !== active.url) {
    store.dispatch(setState({ lastUrl: active.url }));

    store.dispatch(saveUserSettings());

    const deviceId = await getDeviceId();
    const date = new Date().getTime();
    const newActivity = await convertToBrowserActivity(
      active.url,
      date,
      deviceId,
    );

    try {
      await postCaptureEvents([newActivity]);

      const historyId = `${active.url}_${date}`;
      await addSyncedItem(SYNCED_HISTORY_KEY, historyId);
    } catch (err) {
      console.error("Error posting event:", err);
    }
  }
};

async function getDeviceId(): Promise<string> {
  const storage = await browser.storage.local.get("deviceId");
  if (storage.deviceId) {
    return storage.deviceId as string;
  }

  throw new Error(
    "No device_id found. Please wait for device setup to complete.",
  );
}

// Heartbeat so CI-Server can show device freshness; failures are non-critical
async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  try {
    const { serverDomain } = store.getState().ciState;
    const token = await resolveServerToken();

    if (!token || !serverDomain) {
      return;
    }

    await axios.patch(
      `https://${serverDomain}/api/devices/${deviceId}/last-seen`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 5000, // 5 second timeout
      },
    );
  } catch (error: any) {
    console.debug(
      "Failed to update device last_seen:",
      error?.response?.data || error?.message,
    );
  }
}

async function fetchDeviceFromServer(): Promise<string | null> {
  try {
    const { serverDomain } = store.getState().ciState;
    const token = await resolveServerToken();

    if (!token) {
      return null;
    }

    const response = await axios.get(`https://${serverDomain}/api/devices`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000, // 10 second timeout
    });

    const devices = response.data;

    // First, try to match by device_id (primary key) if we have one stored
    const storage = await browser.storage.local.get("deviceId");
    if (storage.deviceId) {
      const matchingDevice = devices.find(
        (d: any) => d.device_id === storage.deviceId,
      );
      if (matchingDevice) {
        // Update stored device info in case server has newer data
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

        return storage.deviceId as string;
      }
    }

    // Fallback: match by the characteristics CI-Server's ensureDeviceExists
    // assigns to browser devices, then by name/model for disambiguation
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
  const { serverDomain } = store.getState().ciState;
  const token = await resolveServerToken();

  if (!token) {
    throw new Error("Cannot create device: No access token available");
  }

  const deviceInfo = getDeviceInfo();

  try {
    const response = await axios.post(
      `https://${serverDomain}/api/devices`,
      deviceInfo,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      },
    );

    // Handle both single device and array response (server supports both)
    const deviceData = Array.isArray(response.data)
      ? response.data[0]
      : response.data;
    const deviceId = deviceData.device_id;
    const deviceName = deviceData.device_name;
    const deviceType = deviceData.device_type;
    const devicePlatform = deviceData.platform;

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

async function setupDevice(): Promise<string> {
  if (deviceSetupInProgress) {
    throw new Error("Device setup already in progress");
  }

  deviceSetupInProgress = true;

  try {
    const token = await resolveServerToken();

    if (!token) {
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
  const browserVersion = browser_info.getBrowserVersion() || "unknown";
  const osVersion = browser_info.getOSVersion() || undefined;

  // Device name includes browser and OS for better identification
  const device_name = `${browserName} on ${osName}`;

  // Model includes OS version if available
  const model = osVersion ? `${osName} ${osVersion}` : osName;

  // Manufacturer derived from OS
  let manufacturer: string | undefined = undefined;
  if (
    osName.toLowerCase().includes("mac") ||
    osName.toLowerCase().includes("ios")
  ) {
    manufacturer = "Apple";
  } else if (osName.toLowerCase().includes("windows")) {
    manufacturer = "Microsoft";
  } else if (osName.toLowerCase().includes("android")) {
    manufacturer = "Google";
  } else if (osName.toLowerCase().includes("linux")) {
    manufacturer = "Linux Foundation";
  }

  return {
    device_name: device_name,
    device_type: "browser", // Must be 'browser' to match server's ensureDeviceExists
    platform: "web", // Must be 'web' to match server's ensureDeviceExists
    model: model,
    manufacturer: manufacturer,
    os_version: osVersion,
    app_version: browserVersion,
  };
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
  const state = store.getState().ciState;
  const { historySyncEnabled, bookmarkSyncEnabled, downloadSyncEnabled } =
    state;

  // Don't sync if user is not authenticated
  if (!(await resolveServerToken())) {
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

  const state = store.getState().ciState;
  console.log("History sync state:", {
    historySyncEnabled: state.historySyncEnabled,
    historySyncInProgress: state.historySyncInProgress,
    hasAccessToken: !!state.accessToken,
  });

  // Note: Sync state is managed by the main triggerManualSync function
  // No need to check historySyncInProgress here as it's already set by the caller

  // Check authentication (portal OIDC session, refreshing if needed)
  const token = await resolveServerToken();

  console.log("Authentication check:", { hasToken: !!token });

  if (!token) {
    console.log("No usable session, stopping history sync");
    store.dispatch(
      setState({
        historySyncStatus: "Authentication required. Please log in again.",
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
              ? `Processed ${processed}/${allHistoryResults.length} entries (${blacklistedCount} ignored)...`
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
          ? `No visits to sync (${blacklistedCount} ignored entries excluded).`
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
          ? `No new visits to sync (${blacklistedCount} ignored entries excluded).`
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
        ? `Uploading ${unsyncedResults.length} new visits to CI-Server (${blacklistedCount} ignored entries excluded)...`
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

        try {
          // Log the data being sent for debugging
          // console.log(
          //   "Sending history activity:",
          //   JSON.stringify(browserActivities, null, 2),
          // );

          await postCaptureEvents(browserActivities);
          uploaded = uploaded + browserActivities.length;

          // Mark the whole slice as synced only after successful upload
          await addSyncedItems(
            SYNCED_HISTORY_KEY,
            slice.map((result) => `${result.url}_${result.visitTime}`),
          );
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
          ? `History sync failed after uploading ${uploaded} visits (${blacklistedCount} ignored entries excluded). Please try again.`
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
          ? `Successfully synced ${uploaded} visits to CI-Server (${blacklistedCount} ignored entries excluded).`
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
  if (!(await resolveServerToken())) {
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
      const syncedDownloadIds: string[] = [];
      for (let j = 0; j < downloadEvents.length; j++) {
        const event = downloadEvents[j];
        const download = slice[j];

        try {
          // Log the data being sent for debugging
          console.log(
            "Sending download event:",
            JSON.stringify(event, null, 2),
          );

          await postCaptureEvents([event]);
          console.log("Successfully sent download event:", event.url);

          // Mark this specific download as synced only after successful upload
          syncedDownloadIds.push(download.id.toString());
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

      await addSyncedItems(SYNCED_DOWNLOADS_KEY, syncedDownloadIds);
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

  if (!state.downloadSyncEnabled || !(await resolveServerToken())) {
    return;
  }

  try {
    const downloadEvent = await createDownloadEvent(download, "create");
    await postCaptureEvents([downloadEvent]);
  } catch (error) {
    console.error("Error syncing created download:", error);
  }
}

// Handle scraped data from domain scraper content scripts
async function handleScrapedData(scrapeResult: ScrapeResult) {
  const { deviceId } = store.getState().ciState;

  if (!(await resolveServerToken())) {
    return;
  }

  // Map each scraped item to a CaptureEvent-ready activity (kind browser.scrape).
  // A per-item source_id keeps distinct items on the same page/timestamp from
  // deduping into a single event server-side.
  const activities: BrowserActivity[] = [];

  for (const [dataType, items] of Object.entries(scrapeResult.data)) {
    if (!Array.isArray(items)) {
      continue;
    }

    items.forEach((item, index) => {
      const itemData = item as Record<string, any>;
      activities.push({
        time: scrapeResult.timestamp,
        device_id: deviceId || "",
        url: scrapeResult.url,
        title: itemData.title || `${scrapeResult.profileName} Data`,
        action_type: "scrape",
        properties: {
          source_id: `${scrapeResult.profileName}:${dataType}:${index}`,
          scrape_profile: scrapeResult.profileName,
          domain: scrapeResult.domain,
          data_type: dataType,
          data: itemData,
        },
      });
    });
  }

  if (activities.length === 0) {
    return;
  }

  try {
    await postCaptureEvents(activities);
  } catch (error) {
    console.error("Error uploading scraped data:", error);
  }
}

export const HIGHLIGHT_MENU_ID = "ci-save-highlight";

// Context-menu "save highlight" → upload the selected text to CI-Server
async function handleSaveHighlight(
  info: {
    menuItemId?: string | number;
    selectionText?: string;
    pageUrl?: string;
  },
  tab?: { url?: string; title?: string },
) {
  const { serverDomain, deviceId } = store.getState().ciState;

  if (!serverDomain || !info.selectionText || !(await resolveServerToken())) {
    return;
  }

  const url = tab?.url || info.pageUrl || "";
  const activity = buildHighlightActivity(
    info.selectionText,
    url,
    deviceId || "",
    tab?.title,
  );

  try {
    await postCaptureEvents([activity]);
    console.log("Saved highlight from", url);
  } catch (error) {
    console.error("Error uploading highlight:", error);
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
  const { deviceId } = store.getState().ciState;

  if (!(await resolveServerToken())) {
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
        const syncedBookmarkIds: string[] = [];
        for (let j = 0; j < validEvents.length; j++) {
          const event = validEvents[j];
          const bookmark = slice[j];

          try {
            // Log the data being sent for debugging
            console.log(
              "Sending bookmark event:",
              JSON.stringify(event, null, 2),
            );

            await postCaptureEvents([event]);
            console.log("Successfully sent bookmark event:", event.url);

            // Mark this specific bookmark as synced only after successful upload
            syncedBookmarkIds.push(bookmark.id);
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

        await addSyncedItems(SYNCED_BOOKMARKS_KEY, syncedBookmarkIds);
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
  if (!bookmark.url || !(await resolveServerToken())) {
    return; // Skip folders or if not authenticated
  }

  try {
    const bookmarkEvent = await createBookmarkEvent(bookmark, "create");
    await postCaptureEvents([bookmarkEvent]);
  } catch (error) {
    console.error("Error syncing created bookmark:", error);
  }
}

async function handleBookmarkChanged(id: string) {
  if (!(await resolveServerToken())) {
    return;
  }

  try {
    const bookmarks = await browser.bookmarks.get(id);
    const bookmark = bookmarks[0];

    if (!bookmark.url) {
      return; // Skip folders
    }

    const bookmarkEvent = await createBookmarkEvent(bookmark, "update");
    await postCaptureEvents([bookmarkEvent]);
  } catch (error) {
    console.error("Error syncing updated bookmark:", error);
  }
}

async function handleBookmarkRemoved(id: string, removeInfo: any) {
  const { deviceId } = store.getState().ciState;

  if (!removeInfo.node?.url || !(await resolveServerToken())) {
    return; // Skip folders or if not authenticated
  }

  try {
    // A bookmark removal is a bookmark activity with event_type "remove",
    // mirroring createBookmarkEvent so it rides the same browser.bookmark kind.
    const removalActivity: BrowserActivity = {
      time: new Date().toISOString(),
      device_id: deviceId || "",
      url: removeInfo.node.url,
      title: removeInfo.node.title,
      action_type: "bookmark",
      properties: {
        bookmark_id: id,
        event_type: "remove",
      },
    };

    await postCaptureEvents([removalActivity]);
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
      serverDomain: "",
    };

    // Reflect the current portal session into Redux + the popup, and provision
    // the device once a session exists. The token itself lives in
    // browser.storage.local (managed by oidcAuth); this mirrors it into
    // ciState.accessToken so the capture guards and popup keep working during
    // migration. Runs on the auth-check alarm, on load, and on popup demand.
    async function checkAuthenticationState() {
      try {
        const { serverDomain } = store.getState().ciState;

        // Nothing to check until the user has configured a server domain
        if (!serverDomain) {
          return;
        }

        // Phase 3: the CI-Server bearer is the portal **id_token** (the opaque
        // OAuth access_token is rejected by CI-Server's JWKS verify). getIdToken
        // returns null when there is no usable session or once the id_token has
        // expired (the refresh grant does not reissue one — the user re-signs in).
        const idToken = await getIdToken(oidcConfig());

        // Mirror a portal id_token into Redux so the capture guards + popup
        // reflect the session. Don't overwrite a legacy CI-Server token (loaded
        // from storage during migration) with null — resolveServerToken still
        // falls back to it until it expires.
        if (idToken && idToken !== store.getState().ciState.accessToken) {
          store.dispatch(setState({ accessToken: idToken }));
        }

        const token = idToken ?? store.getState().ciState.accessToken;
        let { deviceId } = store.getState().ciState;

        // Provision the device once we have a valid session
        if (token && !deviceId) {
          console.log("Authenticated but no device ID, setting up device...");
          try {
            await setupDevice();
            deviceId = store.getState().ciState.deviceId;
            store.dispatch(saveUserSettings());
          } catch (error) {
            console.error(
              "Failed to setup device after authentication:",
              error,
            );
          }
        }

        // Notify any open popup of the current auth state
        browser.runtime
          .sendMessage({
            action: "AUTH_STATE_UPDATED",
            payload: {
              accessToken: store.getState().ciState.accessToken,
              deviceId,
            },
          })
          .catch(() => {
            console.log("No receiver for AUTH_STATE_UPDATED (popup closed)");
          });
      } catch (error) {
        console.error("Error checking authentication state:", error);
      }
    }

    // Interactive sign-in, triggered by the popup's "Authorize with Companion"
    // action. The OIDC Auth-Code + PKCE flow runs here in the background rather
    // than the popup, which is torn down when launchWebAuthFlow takes focus.
    // signIn persists the tokens; checkAuthenticationState then mirrors the
    // id_token into Redux and provisions the device via the shared auth path.
    async function authorizeWithPortal(): Promise<void> {
      await signIn(oidcConfig());
      await checkAuthenticationState();
    }

    browser.alarms.create(AUTH_CHECK_ALARM, { periodInMinutes: 1 });
    browser.alarms.create(AUTO_SYNC_ALARM, { periodInMinutes: 10 });
    browser.alarms.create(LAST_SEEN_ALARM, { periodInMinutes: 5 });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === AUTH_CHECK_ALARM) {
        checkAuthenticationState();
      }

      if (alarm.name === AUTO_SYNC_ALARM) {
        runAutoSync();
      }

      if (alarm.name === LAST_SEEN_ALARM) {
        runLastSeenUpdate();
      }
    });

    // Context-menu entry for saving highlighted text (issue #25)
    browser.runtime.onInstalled.addListener(() => {
      browser.contextMenus.create({
        id: HIGHLIGHT_MENU_ID,
        title: "Save highlight to Companion Intelligence",
        contexts: ["selection"],
      });
    });
    browser.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === HIGHLIGHT_MENU_ID) {
        handleSaveHighlight(info, tab);
      }
    });

    // Check auth once settings (incl. serverDomain) have been loaded
    store.dispatch(loadUserSettings()).then(() => {
      checkAuthenticationState();
    });

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
        const parsed = parseUrl(active.url);
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

        if (message.action === "AUTHORIZE") {
          authorizeWithPortal()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Authorization failed:", error);
              sendResponse({
                success: false,
                error: error?.message || String(error),
              });
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
      } catch (error) {
        console.error("Error checking authentication state:", error);
      }
    });

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
