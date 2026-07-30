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
import {
  addSyncedItem,
  addSyncedItems,
  getSyncedItems,
} from "@/lib/syncedItems";
import { drainCaptureQueue, enqueueCaptures } from "@/lib/captureQueue";
import { dropIgnoredCaptures } from "@/lib/captureFilter";
import { isValidBookmarkEvent } from "@/lib/captureValidation";
import { buildHighlightActivity } from "@/lib/highlight";
import {
  finishIngest,
  sendBrowserCaptures,
  type BrowserActivity,
} from "@/services/browserActivity";
import {
  getAccessToken,
  getIdToken,
  loadTokens,
  signIn,
  signInSilently,
  signOut,
} from "@/services/oidcAuth";
import { portalOidcConfig } from "@/services/portalConfig";
import { fetchPortalApps, memoryAppsFrom } from "@/services/portalApps";
import bowser from "bowser";
import type { ScrapeResult } from "@/scrape/types";

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
        // triggerManualSync drains the retry queue itself before syncing.
        await triggerManualSync({
          timeRange: AUTO_SYNC_ALARM_TIME_RANGE,
        });
      }
    }
  } catch (error) {
    console.error("Auto-sync error:", error);
  }
}

// Re-send live captures whose upload failed. Bounded and self-trimming; see
// @/lib/captureQueue for the retention policy.
async function retryQueuedCaptures(): Promise<void> {
  try {
    const result = await drainCaptureQueue((activities) =>
      postBrowserCaptures(activities),
    );

    if (result.sent > 0) {
      console.log(`Re-sent ${result.sent} queued capture(s)`);
    }
  } catch (error) {
    console.error("Capture retry failed:", error);
  }
}

// ---- Unified identity + capture transport (Phase 3) ----

// The portal OIDC client config, derived from the configured Portal URL (or
// a legacy explicit portalIssuer override). See services/portalConfig.
function oidcConfig() {
  const { portalUrl, portalIssuer } = store.getState().ciState;

  return portalOidcConfig({ portalUrl, portalIssuer });
}

// Ask the Portal where the user's Memory (ci-memory) app runs and auto-set
// serverURL from it. Never throws and never fails a sign-in: on any miss it
// leaves serverURL alone and, when none is configured, surfaces a hint in the
// popup instead. A manually-set serverURL (serverURLSource "manual") is never
// overwritten. When Memory runs on several devices and there is no valid
// choice yet, the candidates go to memoryAppChoices and the popup asks the
// user which to use.
async function discoverMemoryServer(): Promise<void> {
  try {
    const accessToken = await getAccessToken(oidcConfig());
    if (!accessToken) {
      return;
    }

    const { portalUrl, serverURL, serverURLSource } = store.getState().ciState;
    const result = await fetchPortalApps(portalUrl, accessToken);

    if (result.status === "ok") {
      const memoryApps = memoryAppsFrom(result.apps);

      if (memoryApps.length === 0) {
        store.dispatch(
          setState({
            memoryAppChoices: null,
            discoveryHint: serverURL
              ? null
              : "Signed in, but no Memory app was found on your Companion account. Install Memory from the Portal, or set the Memory server URL under Advanced.",
          }),
        );

        return;
      }

      // A deliberate manual choice is never touched or second-guessed.
      if (serverURL && serverURLSource === "manual") {
        store.dispatch(setState({ memoryAppChoices: null }));

        return;
      }

      // The auto-configured server is still one of the user's Memory apps.
      if (serverURL && memoryApps.some((app) => app.url === serverURL)) {
        store.dispatch(
          setState({ memoryAppChoices: null, discoveryHint: null }),
        );

        return;
      }

      if (memoryApps.length === 1) {
        console.log(
          "[CI] Memory server discovered via portal:",
          memoryApps[0].url,
        );
        store.dispatch(
          setState({
            serverURL: memoryApps[0].url,
            serverURLSource: "auto",
            memoryAppChoices: null,
            discoveryHint: null,
          }),
        );
        store.dispatch(saveUserSettings());

        return;
      }

      // Several devices run Memory and none is configured (or the old auto
      // choice vanished) — let the user pick in the popup.
      console.log(
        "[CI] Multiple Memory apps found; asking the user:",
        memoryApps.map((app) => `${app.url} (${app.deviceName ?? "unknown"})`),
      );
      store.dispatch(
        setState({ memoryAppChoices: memoryApps, discoveryHint: null }),
      );

      return;
    }

    // unsupported / unauthorized / error: keep whatever is configured; only
    // hint when nothing is.
    if (!serverURL) {
      store.dispatch(
        setState({
          discoveryHint:
            result.status === "unsupported"
              ? "Your Portal doesn't support app discovery — set the Memory server URL under Advanced."
              : "Couldn't look up your Memory server from the Portal — set the Memory server URL under Advanced.",
        }),
      );
    }
  } catch (error) {
    console.error("Memory server discovery failed:", error);
  }
}

// Resolve the Bearer for CI-Server: prefer the portal OIDC **id_token** — the
// JWKS-signed JWT CI-Server's `/api/v1/*` routes validate. The opaque OAuth
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

// Central capture transport: every browser-activity write goes through here to
// CI-Server's TYPED bulk routes — `/api/v1/browser-activity`, and
// `/api/v1/contents` for saved bookmarks (see @/services/browserActivity for the
// kind→destination table this follows and why the unified `/api/v1/events` path
// could not produce browser_activity rows). No-ops without a server URL or
// batch; throws on a missing token or non-2xx so callers keep their
// retry/logging.
// Historical sync passes observedAt=now so import time is recorded separately
// from the Chrome visit / bookmark / download time. The browser-activity table
// has no observed_at column, so it rides in `properties` rather than being lost.
async function postBrowserCaptures(
  activities: BrowserActivity[],
  opts?: { observedAt?: string },
): Promise<void> {
  if (activities.length === 0) {
    return;
  }

  const { serverURL } = store.getState().ciState;
  if (!serverURL) {
    return;
  }

  const allowed = applyIgnoreList(activities);
  if (allowed.length === 0) {
    return;
  }

  const token = await resolveServerToken();
  if (!token) {
    throw new Error("No access token available for capture upload");
  }

  const observedAt = opts?.observedAt;
  const batch = observedAt
    ? allowed.map((a) =>
        a.observed_at ? a : { ...a, observed_at: observedAt },
      )
    : allowed;

  await sendBrowserCaptures(serverURL, token, batch);
}

// Apply the ignore list to an outgoing batch. See @/lib/captureFilter for why
// this is enforced at the transport rather than in each capture path.
function applyIgnoreList(activities: BrowserActivity[]): BrowserActivity[] {
  const { siteBlacklist = [], pageBlacklist = [] } = store.getState().ciState;
  const allowed = dropIgnoredCaptures(activities, siteBlacklist, pageBlacklist);

  if (allowed.length !== activities.length) {
    console.log(
      `[CI] Skipped ${activities.length - allowed.length} capture(s) on ignored sites/pages`,
    );
  }

  return allowed;
}

/**
 * Upload a live capture, queueing it for retry if the upload fails.
 *
 * Live captures — a recorded visit, a saved highlight, a scrape, a bookmark or
 * download as it happens — are one-shot: unlike the sync engines, nothing
 * re-derives them later, so a dropped POST is lost data. Every live capture
 * path goes through here rather than calling postBrowserCaptures directly.
 */
async function postLiveCapture(activities: BrowserActivity[]): Promise<void> {
  try {
    await postBrowserCaptures(activities);
    requestIngestFinish();
  } catch (error) {
    await enqueueCaptures(activities);
    throw error;
  }
}

/**
 * Ask CI-Server to index what was just uploaded (see finishIngest for why this
 * is required at all), debounced so a burst of live captures triggers one sweep
 * rather than one per record.
 *
 * A pending debounce is lost if MV3 suspends the worker first; that only delays
 * indexing to the next auto-sync tick, which finishes unconditionally.
 */
let ingestFinishTimer: ReturnType<typeof setTimeout> | null = null;
const INGEST_FINISH_DEBOUNCE_MS = 30_000;

function requestIngestFinish(): void {
  if (ingestFinishTimer) {
    return;
  }

  ingestFinishTimer = setTimeout(() => {
    ingestFinishTimer = null;
    flushIngestFinish();
  }, INGEST_FINISH_DEBOUNCE_MS);
}

// Index immediately — used at the end of a sync run, where the batch is already
// complete and there is nothing to debounce against.
async function flushIngestFinish(): Promise<void> {
  const { serverURL } = store.getState().ciState;
  if (!serverURL) {
    return;
  }

  const token = await resolveServerToken();
  if (!token) {
    return;
  }

  await finishIngest(serverURL, token);
}

/**
 * Chrome/Firefox history, bookmark, and download times → ISO instant.
 * Returns null when the browser did not provide a usable timestamp so callers
 * can skip the item instead of inventing "now" (which made historical sync
 * land on the sync day in Memory).
 */
function chromeTimeToISO(
  timestamp: number | string | undefined | null,
): string | null {
  if (timestamp === undefined || timestamp === null) {
    return null;
  }

  const time =
    typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;

  if (!Number.isFinite(time) || time <= 0 || Number.isNaN(time)) {
    return null;
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

  // The History switch governs live capture too, not just the backfill. It
  // previously gated only syncHistory, so turning History off left this
  // listener recording every page the user visited — the opposite of what the
  // popup and the docs say the switch does.
  if (!state.historySyncEnabled) {
    return;
  }

  // Read the tab the navigation actually happened in. Querying for the *active*
  // tab instead attributed a background-tab navigation to whatever the user
  // happened to be looking at, recording the wrong URL under the wrong page.
  const navigatedUrl = await resolveNavigatedUrl(e);

  if (!navigatedUrl) {
    return;
  }

  const parsed = parseUrl(navigatedUrl);
  if (!parsed) {
    return;
  }

  store.dispatch(setState({ domain: parsed.hostname, url: navigatedUrl }));

  // Check the URL being recorded against the blacklist — `state` was
  // snapshotted before the dispatch above, so state.url still holds the
  // previous page and must not be used here
  const isBlacklisted = isUrlBlacklisted(
    navigatedUrl,
    state.siteBlacklist,
    state.pageBlacklist,
  );

  if (!isBlacklisted && state.lastUrl !== navigatedUrl) {
    store.dispatch(setState({ lastUrl: navigatedUrl }));

    store.dispatch(saveUserSettings());

    const deviceId = await getDeviceId();
    const date = new Date().getTime();
    const newActivity = await convertToBrowserActivity(
      navigatedUrl,
      date,
      deviceId,
    );

    try {
      await postLiveCapture([newActivity]);

      const historyId = `${navigatedUrl}_${date}`;
      await addSyncedItem(SYNCED_HISTORY_KEY, historyId);
    } catch (err) {
      console.error("Error posting event:", err);
    }
  }
};

/**
 * The URL of the tab a webNavigation event fired in. Prefers the event's own
 * url/tabId; falls back to the active tab only when the event carries neither,
 * which is the pre-existing behaviour for synthetic callers.
 */
async function resolveNavigatedUrl(e: any): Promise<string | null> {
  if (typeof e?.url === "string" && e.url) {
    return e.url;
  }

  try {
    if (typeof e?.tabId === "number" && e.tabId >= 0) {
      const tab = await browser.tabs.get(e.tabId);

      return tab?.url ?? null;
    }
  } catch {
    // Tab closed between the navigation and this read — nothing to record.
    return null;
  }

  const tabInfo = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tabInfo[0]?.url ?? null;
}

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
    const { serverURL } = store.getState().ciState;
    const token = await resolveServerToken();

    if (!token || !serverURL) {
      return;
    }

    await axios.patch(
      `${serverURL}/api/devices/${deviceId}/last-seen`,
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
    const { serverURL } = store.getState().ciState;
    const token = await resolveServerToken();

    if (!token) {
      return null;
    }

    const response = await axios.get(`${serverURL}/api/devices`, {
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
  const { serverURL } = store.getState().ciState;
  const token = await resolveServerToken();

  if (!token) {
    throw new Error("Cannot create device: No access token available");
  }

  const deviceInfo = getDeviceInfo();

  try {
    const response = await axios.post(`${serverURL}/api/devices`, deviceInfo, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000, // 10 second timeout
    });

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

  // The latch MUST clear on every exit. When it only cleared on the create and
  // error paths, finding an existing device left it stuck true for the life of
  // the service worker, and every later setupDevice() — the SETUP_DEVICE
  // message, the auth-check provisioning — threw "already in progress".
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
    throw new Error(errorMessage);
  } finally {
    deviceSetupInProgress = false;
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
): Promise<BrowserActivity> {
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

  const time = chromeTimeToISO(visitTime);
  if (!time) {
    throw new Error(`Missing visit timestamp for URL: ${url}`);
  }

  return {
    time,
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

  // Flush anything a live capture failed to deliver, BEFORE the sync-type
  // checks below. Highlights and scrapes queue independently of the History /
  // Bookmarks / Downloads switches, so a user with all three off can still have
  // a backlog — draining only after that early return would strand it forever.
  // (This also has to run outside the auto-sync path: auto-sync is off by
  // default, so draining only there meant most users never retried anything.)
  await retryQueuedCaptures();

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

    // Everything written above went to the bulk lanes, which do not index as
    // they write — without this the sync is invisible to search. See
    // finishIngest.
    await flushIngestFinish();

    // Final success message
    store.dispatch(
      setState({
        historySyncInProgress: false,
        historySyncStatus: successMessage,
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

    // Expand each URL into per-visit rows via history.getVisits so Memory gets
    // the original visitTime, not lastVisitTime-only and never Date.now().
    const hydratedResults: Array<{ visitTime: number; url: string }> = [];
    let processed = 0;
    let blacklistedCount = 0;
    const { siteBlacklist = [], pageBlacklist = [] } = state;

    for (const item of allHistoryResults) {
      try {
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

        let addedForUrl = 0;
        try {
          const visits = await browser.history.getVisits({ url: item.url });
          for (const visit of visits) {
            if (
              typeof visit.visitTime === "number" &&
              visit.visitTime >= searchStartTime
            ) {
              hydratedResults.push({
                visitTime: visit.visitTime,
                url: item.url,
              });
              addedForUrl++;
            }
          }
        } catch (err) {
          console.log("getVisits failed, falling back to lastVisitTime:", err);
        }

        // Fallback only when getVisits is unavailable — still never invent "now".
        if (
          addedForUrl === 0 &&
          typeof item.lastVisitTime === "number" &&
          item.lastVisitTime >= searchStartTime
        ) {
          hydratedResults.push({
            visitTime: item.lastVisitTime,
            url: item.url,
          });
          addedForUrl++;
        }

        if (addedForUrl === 0) {
          console.log("No in-range visit times for history URL:", item.url);
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

    // Filter out already synced history entries and invalid URLs.
    // The synced-ID set is read ONCE here: it holds up to 20k ids, and the
    // previous per-item isItemSynced re-read and re-Set-ified the whole array
    // for every visit — thousands of full storage reads on a large sync.
    const syncedHistoryIds = await getSyncedItems(SYNCED_HISTORY_KEY);
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
        if (!syncedHistoryIds.has(historyId)) {
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
    // Import/observe time only — Memory orders by occurred_at (Chrome visitTime).
    const syncObservedAt = new Date().toISOString();

    // Process and upload in batches
    let uploaded = 0;
    let failed = false;
    let lastError = null;

    for (let i = 0; i < unsyncedResults.length; i += SLICE_SIZE) {
      const slice = unsyncedResults.slice(i, i + SLICE_SIZE);

      try {
        const browserActivities: BrowserActivity[] = [];
        const syncedIds: string[] = [];
        for (const result of slice) {
          try {
            browserActivities.push(
              await convertToBrowserActivity(
                result.url,
                result.visitTime,
                deviceId,
              ),
            );
            syncedIds.push(`${result.url}_${result.visitTime}`);
          } catch (err) {
            console.log("Skipping history row without usable timestamp:", err);
          }
        }

        if (browserActivities.length === 0) {
          continue;
        }

        try {
          await postBrowserCaptures(browserActivities, {
            observedAt: syncObservedAt,
          });
          uploaded = uploaded + browserActivities.length;

          await addSyncedItems(SYNCED_HISTORY_KEY, syncedIds);
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
): Promise<BrowserActivity> {
  const state = store.getState().ciState;
  const { deviceId } = state;

  // Validate required fields and provide defaults
  if (!deviceId) {
    throw new Error("Device ID is required for download sync");
  }

  if (!download.url) {
    throw new Error("Download URL is required");
  }

  const time = chromeTimeToISO(download.startTime);
  if (!time) {
    throw new Error(
      `Missing download startTime for id ${download.id}: ${download.url}`,
    );
  }

  return {
    time,
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

    // Filter out already synced downloads and invalid URLs (one storage read
    // for the whole run — see the note in syncHistory)
    const syncedDownloadKeys = await getSyncedItems(SYNCED_DOWNLOADS_KEY);
    const unsyncedDownloads = [];
    for (const download of downloads) {
      // Skip downloads with invalid URLs
      if (!download.url || !isValidUrl(download.url)) {
        continue;
      }

      if (!syncedDownloadKeys.has(download.id.toString())) {
        unsyncedDownloads.push(download);
      }
    }

    if (unsyncedDownloads.length === 0) {
      console.log("No new downloads to sync");

      return;
    }

    console.log(`Syncing ${unsyncedDownloads.length} new downloads`);
    const syncObservedAt = new Date().toISOString();

    // Process unsynced downloads in batches. The whole slice goes up in ONE
    // request — the bulk lane takes up to 10k records, and posting one at a
    // time made a 300-download backfill 300 round trips.
    for (let i = 0; i < unsyncedDownloads.length; i += SLICE_SIZE) {
      const slice = unsyncedDownloads.slice(i, i + SLICE_SIZE);
      const events: BrowserActivity[] = [];
      const syncedDownloadIds: string[] = [];

      for (const download of slice) {
        try {
          events.push(await createDownloadEvent(download, "sync"));
          syncedDownloadIds.push(download.id.toString());
        } catch (eventError: unknown) {
          console.error("Error building download event:", eventError, download);
          // Skip missing timestamps; do not invent sync-time.
        }
      }

      if (events.length === 0) {
        continue;
      }

      try {
        await postBrowserCaptures(events, { observedAt: syncObservedAt });
        // Mark synced only after the batch lands, so a failure retries next run
        await addSyncedItems(SYNCED_DOWNLOADS_KEY, syncedDownloadIds);
      } catch (uploadError: unknown) {
        console.error("Error uploading download batch:", uploadError);
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

  if (!state.downloadSyncEnabled || !(await resolveServerToken())) {
    return;
  }

  try {
    const downloadEvent = await createDownloadEvent(download, "create");
    await postLiveCapture([downloadEvent]);
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

  // Each item carries its own personalDataType, which becomes the `type` of the
  // content row it lands in — so a watched title files as
  // entertainment_preferences rather than as an anonymous page view. The
  // per-item source_id keeps distinct items on one page/timestamp from
  // deduping into a single row server-side.
  const activities: BrowserActivity[] = scrapeResult.items.map(
    (item, index) => ({
      time: scrapeResult.timestamp,
      device_id: deviceId || "",
      url: scrapeResult.url,
      title:
        typeof item.fields.title === "string" && item.fields.title.trim()
          ? item.fields.title.trim()
          : `${scrapeResult.profileName} — ${item.selector}`,
      action_type: "scrape",
      properties: {
        source_id: `${scrapeResult.domain}:${item.selector}:${index}`,
        personal_data_type: item.personalDataType,
        scrape_profile: scrapeResult.profileName,
        domain: scrapeResult.domain,
        data_type: item.selector,
        data: item.fields,
      },
    }),
  );

  if (activities.length === 0) {
    return;
  }

  try {
    await postLiveCapture(activities);
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
  const { serverURL, deviceId } = store.getState().ciState;

  if (!serverURL || !info.selectionText || !(await resolveServerToken())) {
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
    await postLiveCapture([activity]);
    console.log("Saved highlight from", url);
  } catch (error) {
    // Already queued for retry by postLiveCapture — a highlight the user
    // deliberately saved is the last thing that should be dropped on a blip.
    console.error("Error uploading highlight (queued for retry):", error);
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
): Promise<BrowserActivity> {
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

  const time = chromeTimeToISO(bookmark.dateAdded);
  if (!time) {
    throw new Error(
      `Missing bookmark dateAdded for id ${bookmark.id}: ${bookmark.url}`,
    );
  }

  return {
    time,
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

    // Filter out already synced bookmarks and invalid URLs (one storage read
    // for the whole run — see the note in syncHistory)
    const syncedBookmarkKeys = await getSyncedItems(SYNCED_BOOKMARKS_KEY);
    const unsyncedBookmarks = [];
    for (const bookmark of allBookmarks) {
      // Skip bookmarks with invalid URLs
      if (!bookmark.url || !isValidUrl(bookmark.url)) {
        continue;
      }

      if (!syncedBookmarkKeys.has(bookmark.id)) {
        unsyncedBookmarks.push(bookmark);
      }
    }

    if (unsyncedBookmarks.length === 0) {
      console.log("No new bookmarks to sync");

      return;
    }

    console.log(`Syncing ${unsyncedBookmarks.length} new bookmarks`);
    const syncObservedAt = new Date().toISOString();

    // Process unsynced bookmarks in batches
    for (let i = 0; i < unsyncedBookmarks.length; i += SLICE_SIZE) {
      const slice = unsyncedBookmarks.slice(i, i + SLICE_SIZE);

      // Build the batch, keeping each event paired with the id to mark synced.
      // Pairing here is what fixes the old index bug: the previous code walked
      // the filtered event list with `slice[j]`, but `slice` still contained
      // the bookmarks that had been skipped, so the two lists drifted apart and
      // a failed upload could mark an unrelated bookmark as synced.
      const batch: Array<{ event: BrowserActivity; bookmarkId: string }> = [];
      for (const bookmark of slice) {
        try {
          const event = await createBookmarkEvent(bookmark, "sync");

          if (!isValidBookmarkEvent(event)) {
            continue;
          }

          const bookmarkId =
            typeof event.properties?.bookmark_id === "string"
              ? event.properties.bookmark_id
              : bookmark?.id;

          if (bookmarkId) {
            batch.push({ event, bookmarkId });
          }
        } catch (error) {
          console.error("Error creating bookmark event:", error);
          console.error("Problematic bookmark:", bookmark);
          // Skip this bookmark and continue with others
          continue;
        }
      }

      if (batch.length === 0) {
        console.log("No valid bookmark events to send for this batch");
        continue;
      }

      try {
        await postBrowserCaptures(
          batch.map((entry) => entry.event),
          { observedAt: syncObservedAt },
        );

        // Mark synced only after the batch lands, so a failure retries next run
        await addSyncedItems(
          SYNCED_BOOKMARKS_KEY,
          batch.map((entry) => entry.bookmarkId),
        );
      } catch (batchError: any) {
        console.error("Error uploading bookmark batch:", batchError);
        console.error("Server response:", batchError?.response?.data);

        // Log detailed validation errors if available
        if (batchError?.response?.data?.errors) {
          console.error(
            "Server validation errors:",
            JSON.stringify(batchError.response.data.errors, null, 2),
          );
        }

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
    await postLiveCapture([bookmarkEvent]);
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
    await postLiveCapture([bookmarkEvent]);
  } catch (error) {
    console.error("Error syncing updated bookmark:", error);
  }
}

export default defineBackground({
  main() {
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
      serverURL: "",
    };

    // Reflect the current portal session into Redux + the popup, and provision
    // the device once a session exists. The token itself lives in
    // browser.storage.local (managed by oidcAuth); this mirrors it into
    // ciState.accessToken so the capture guards and popup keep working during
    // migration. Runs on the auth-check alarm, on load, and on popup demand.
    async function checkAuthenticationState() {
      try {
        // Phase 3: the CI-Server bearer is the portal **id_token** (the opaque
        // OAuth access_token is rejected by CI-Server's JWKS verify). getIdToken
        // returns null when there is no usable session or once the id_token has
        // expired (the refresh grant does not reissue one — the user re-signs in).
        let idToken = await getIdToken(oidcConfig());

        // An expired id_token does not necessarily mean the user must sign in
        // again: the refresh grant just doesn't reissue one. If the portal
        // session is still good, a non-interactive auth-code round trip mints a
        // fresh id_token silently. Only when that fails is re-auth genuinely
        // required, and the popup drops to the sign-in view.
        if (!idToken && (await loadTokens())) {
          const renewed = await signInSilently(oidcConfig());

          if (renewed?.id_token) {
            console.log("[CI] Renewed the portal session silently");
            idToken = renewed.id_token;
          }
        }

        // Mirror a portal id_token into Redux so the capture guards + popup
        // reflect the session. For a portal-era user (stored oidcTokens exist)
        // the mirror follows getIdToken exactly — including null on expiry, so
        // the popup drops to the sign-in view as the re-auth CTA. A legacy
        // CI-Server token (no stored oidcTokens) is left for resolveServerToken
        // to fall back to until it expires.
        if (idToken && idToken !== store.getState().ciState.accessToken) {
          store.dispatch(setState({ accessToken: idToken }));
        } else if (!idToken && store.getState().ciState.accessToken) {
          const storedTokens = await loadTokens();

          if (storedTokens) {
            store.dispatch(setState({ accessToken: null }));
          }
        }

        const token = idToken ?? store.getState().ciState.accessToken;

        // A signed-in user without a configured server may have gained a
        // Memory app (or a portal upgrade) since sign-in.
        if (token && !store.getState().ciState.serverURL) {
          await discoverMemoryServer();
        }

        const { serverURL } = store.getState().ciState;
        let { deviceId } = store.getState().ciState;

        // Provision the device once we have a valid session and know where
        // the server is (setupDevice posts to `${serverURL}/api/devices`)
        if (token && serverURL && !deviceId) {
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

    // Interactive sign-in, triggered by the popup's "Sign in with Companion
    // account" action. The OIDC Auth-Code + PKCE flow runs here in the
    // background rather than the popup, which is torn down when
    // launchWebAuthFlow takes focus. signIn persists the tokens; the Portal is
    // then asked where the user's Memory app runs (auto-setting serverURL);
    // checkAuthenticationState mirrors the id_token into Redux and provisions
    // the device via the shared auth path.
    async function authorizeWithPortal(): Promise<void> {
      await signIn(oidcConfig());
      await discoverMemoryServer();
      await checkAuthenticationState();
    }

    // Explicit sign-out, e.g. when the user switches Portal: tokens from the
    // old issuer are useless (and must not be sent) elsewhere.
    async function signOutOfPortal(): Promise<void> {
      await signOut();
      // The device registration lives on the old portal's server; a fresh
      // sign-in provisions a new one where the next serverURL points.
      store.dispatch(
        setState({
          accessToken: null,
          deviceId: null,
          discoveryHint: null,
          memoryAppChoices: null,
        }),
      );
      store.dispatch(saveUserSettings());
      browser.runtime
        .sendMessage({
          action: "AUTH_STATE_UPDATED",
          payload: { accessToken: null, deviceId: null },
        })
        .catch(() => {
          console.log("No receiver for AUTH_STATE_UPDATED (popup closed)");
        });
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

    // Check auth once settings (incl. serverURL) have been loaded, and only
    // then wire the live bookmark/download listeners.
    //
    // Registration MUST wait for the settings load. Both setup functions read
    // the sync toggles out of Redux, and until loadUserSettings resolves those
    // are still their initial `false` — so running them eagerly took the
    // removeListener branch, and the only thing that re-registered was
    // storage.onChanged, which fires on a *change* and not on a rewrite of the
    // same value. The result was that after every MV3 service-worker
    // suspension, live bookmark and download capture stayed off until the user
    // manually toggled the setting off and on again.
    store.dispatch(loadUserSettings()).then(() => {
      checkAuthenticationState();
      setupBookmarkListeners();
      setupDownloadListeners();
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

    // Both navigation events get the same http(s)-only gate. onHistoryStateUpdated
    // was previously unfiltered, so SPA route changes on non-web schemes reached
    // recordHit while ordinary loads on those schemes did not.
    const onNavigation = (e: { url: string }) => {
      if (siteRegex.test(e.url)) {
        recordHit(e);
      }
    };

    browser.webNavigation.onCompleted.addListener(onNavigation);
    browser.webNavigation.onHistoryStateUpdated.addListener(onNavigation);

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("Background received message:", message);

      try {
        if (message && message.action === "SETUP_DEVICE") {
          // .catch, not try/catch: setupDevice is async, so a rejection never
          // reaches the surrounding synchronous handler — the popup was left
          // waiting on a sendResponse that never came, plus an unhandled
          // rejection.
          setupDevice()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error: any) => {
              const errorMessage =
                error?.message || error?.toString() || "Unknown error occurred";
              console.error("Device setup failed:", error);
              sendResponse({ success: false, error: errorMessage });
            });

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

        if (message.action === "SIGN_OUT") {
          signOutOfPortal()
            .then(() => {
              sendResponse({ success: true });
            })
            .catch((error) => {
              console.error("Sign-out failed:", error);
              sendResponse({
                success: false,
                error: error?.message || String(error),
              });
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
      // No onRemoved listener: bookmark removals are not captured. A saved
      // bookmark becomes a content row, and a deletion has nothing to say there.
      if (state.bookmarkSyncEnabled) {
        browser.bookmarks.onCreated.addListener(handleBookmarkCreated);
        browser.bookmarks.onChanged.addListener(handleBookmarkChanged);
      } else {
        browser.bookmarks.onCreated.removeListener(handleBookmarkCreated);
        browser.bookmarks.onChanged.removeListener(handleBookmarkChanged);
      }
    };

    // Set up download listeners based on settings
    const setupDownloadListeners = () => {
      const state = store.getState().ciState;
      if (state.downloadSyncEnabled) {
        browser.downloads.onCreated.addListener(handleDownloadCreated);
      } else {
        browser.downloads.onCreated.removeListener(handleDownloadCreated);
      }
    };

    // Initial registration happens in the loadUserSettings().then() above, once
    // the toggles hold their persisted values rather than their defaults.

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
