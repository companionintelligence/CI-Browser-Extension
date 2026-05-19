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
import type { ScrapeResult } from "@/domainScraper";
import { database } from "@/indexeddb";
import { logger, errMessage } from "@/lib/log";
import { captureActiveTab } from "@/background/capture";
import {
  getDeviceId,
  setupDevice,
  updateDeviceLastSeen,
} from "@/background/device";
import { saveHighlight } from "@/background/highlight";
import {
  syncBookmarks as runBookmarksSync,
  createBookmarkEvent,
} from "@/background/sync/bookmarks";
import {
  syncDownloads as runDownloadsSync,
  createDownloadEvent,
} from "@/background/sync/downloads";
import { schedulePeriodic, watchCookies } from "@/background/schedule";
import { drainContentOutbox } from "@/background/outbox-drain";
import { migrateLegacyPendingCaptures } from "@/background/outbox";

const SLICE_SIZE = 100;
const BOOKMARK_SYNC_KEY = "lastBookmarkSync";
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

// Keys for tracking synced items. Bookmarks/downloads moved into their
// per-module sync engines; only history still uses this in-file path.
const SYNCED_HISTORY_KEY = "syncedHistory";

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
  store.dispatch(setState({ historySyncStatus: "Syncing bookmarks..." }));
  await runBookmarksSync();
}

async function syncDownloads() {
  store.dispatch(setState({ historySyncStatus: "Syncing downloads..." }));
  await runDownloadsSync();
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

    // Event-driven authentication: react to cookie writes on the configured
    // server domain (instant), with a 5-minute alarm as a safety net for
    // any change we miss (e.g. SW was suspended at the moment).
    let authCheckDebounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleAuthCheck = () => {
      if (authCheckDebounce) {
        clearTimeout(authCheckDebounce);
      }

      authCheckDebounce = setTimeout(() => {
        authCheckDebounce = null;
        void checkAuthenticationState();
      }, 250);
    };

    watchCookies((cookie) => {
      const { serverDomain } = store.getState().ciState;
      if (!serverDomain) {
        return false;
      }

      if (
        cookie.name !== SESSION_TOKEN_KEY &&
        cookie.name !== CSRF_COOKIE_NAME
      ) {
        return false;
      }

      return cookie.domain.endsWith(serverDomain.replace(/^\./, ""));
    }, scheduleAuthCheck);
    schedulePeriodic({
      name: "authProbe",
      intervalMs: 5 * 60 * 1000,
      handler: checkAuthenticationState,
    });
    // Kick once on startup so the very first check happens before any
    // cookie event arrives.
    void checkAuthenticationState();

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

        if (message.action === "SAVE_HIGHLIGHT") {
          saveHighlight(message.input)
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
      browser.commands.onCommand.addListener(async (command) => {
        if (command === "capture-active-tab") {
          void captureActiveTab().catch((err) =>
            logger.warn("capture.command.failed", { err: errMessage(err) }),
          );
        }

        if (command === "save-highlight") {
          try {
            const [tab] = await browser.tabs.query({
              active: true,
              currentWindow: true,
            });
            if (tab?.id !== undefined) {
              await browser.tabs.sendMessage(tab.id, {
                action: "TRIGGER_SAVE_HIGHLIGHT",
              });
            }
          } catch (err) {
            logger.warn("highlight.command.failed", { err: errMessage(err) });
          }
        }
      });
    }

    // Periodic tasks driven by browser.alarms (MV3) or setInterval (MV2).
    // See src/background/schedule.ts and planning/02-mv3-lifecycle.md.
    const AUTO_SYNC_TIME_RANGE = 24 * 60 * 60 * 1000;
    schedulePeriodic({
      name: "autoSync",
      intervalMs: 10 * 60 * 1000,
      handler: async () => {
        await store.dispatch({ type: "loadUserSettings" });
        const state = store.getState().ciState;
        if (!state.autoSyncEnabled || state.historySyncInProgress) {
          return;
        }

        const { accessToken } = state;
        const accessDecoded = accessToken
          ? (jwtDecode(accessToken) as any)
          : null;
        const isAuthExpired =
          accessDecoded && accessDecoded.exp
            ? Date.now() >= accessDecoded.exp * 1000
            : true;
        if (!isAuthExpired) {
          await triggerManualSync({ timeRange: AUTO_SYNC_TIME_RANGE });
        }
      },
    });

    schedulePeriodic({
      name: "lastSeen",
      intervalMs: 5 * 60 * 1000,
      handler: async () => {
        const { deviceId } = store.getState().ciState;
        if (deviceId) {
          await updateDeviceLastSeen(deviceId);
        }
      },
    });

    // Drain the IndexedDB outbox. POSTs queued screenshots/highlights to
    // /api/content. While the endpoint is offline these rows accumulate
    // and surface in the Diagnostics tab; no-op safely.
    schedulePeriodic({
      name: "outboxDrain",
      intervalMs: 60 * 1000,
      handler: drainContentOutbox,
    });

    // One-shot migration of the pre-outbox `pendingCaptures` storage key.
    // Safe to call on every cold start — does nothing once the key is gone.
    void migrateLegacyPendingCaptures();

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
          await runBookmarksSync();
        }
      }
    }, 5000);
  },
});
