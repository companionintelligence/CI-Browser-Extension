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
import type { SurfingRecord } from "@/indexeddb";
import { database } from "@/indexeddb";
import { locationService } from "@/locationService";

const SLICE_SIZE = 50;
const BOOKMARK_SYNC_KEY = "lastBookmarkSync";

let deviceSetupInProgress = false;

const browser_info = bowser.getParser(navigator.userAgent);
const isMobile = browser_info.getPlatformType() === "mobile";
const MOBILE_SLICE_SIZE = isMobile ? 25 : SLICE_SIZE;

interface AuthResponse {
  accessToken: string;
  sessionToken: string;
}

const recordHit = async function (e: any) {
  const { accessToken } = store.getState().ciState;
  const accessDecoded = accessToken ? jwtDecode(accessToken) : null;
  const isAuthExpired =
    accessDecoded && accessDecoded.exp
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

  let domainWhitelistHit = false,
    pageWhitelistHit = false;
  const state = store.getState().ciState;

  state.domainWhitelist.forEach((item) => {
    const domainRegex = new RegExp(item);

    if (state.domain && domainRegex.test(state.domain)) {
      domainWhitelistHit = true;

      return;
    }
  });

  state.pageWhitelist.forEach((item) => {
    const siteRegex = new RegExp(item.replace("?", "\\?"));

    if (state.url) {
      const parsedUrl = URL.parse(state.url);
      if (parsedUrl) {
        parsedUrl.hash = "";

        if (siteRegex.test(parsedUrl.toString())) {
          pageWhitelistHit = true;

          return;
        }
      }
    }
  });

  if (
    !isAuthExpired &&
    (domainWhitelistHit || pageWhitelistHit) &&
    state.lastUrl !== state.url
  ) {
    store.dispatch(setState({ lastUrl: state.url }));

    store.dispatch(saveUserSettings());

    const newEvent = await assembleContentAndEvents(state.url!);

    try {
      if (state.url && state.domain) {
        const surfingRecord: SurfingRecord = {
          url: state.url,
          domain: state.domain,
          title: newEvent.content?.[0]?.title || undefined,
          description: newEvent.content?.[0]?.text || undefined,
          visitTime: newEvent.start_time,
          synced: false,
        };

        await database.insertSurfingRecord(surfingRecord);
      }
    } catch (dbError) {
      console.error("Failed to store surfing record:", dbError);
    }

    try {
      const { accessToken } = store.getState().ciState;
      await axios.post(
        // TODO: update to use env var
        `https://${state.serverDomain}/api/events`,
        newEvent,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      try {
        const unsyncedRecords = await database.getUnsyncedSurfingRecords();
        const latestRecord = unsyncedRecords.find(
          (record) =>
            record.url === state.url &&
            record.visitTime === newEvent.start_time,
        );
        if (latestRecord && latestRecord.id) {
          await database.markSurfingRecordAsSynced(latestRecord.id);
        }
      } catch (syncError) {
        console.error("Failed to mark record as synced:", syncError);
      }
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

  const state = store.getState().ciState;
  Object.entries(state.domainWhitelistPending).forEach(
    async ([domainWhitelistItemKey, domainWhitelistItemValue]: [
      string,
      any,
    ]) => {
      if (
        state.domainWhitelist.indexOf(domainWhitelistItemKey) !== -1 &&
        domainWhitelistItemValue &&
        new Date(new Date().getTime() - 600000).getTime() >
          domainWhitelistItemValue
      ) {
        const omitted = { ...state.domainWhitelistPending };
        delete (omitted as any)[domainWhitelistItemKey];
        store.dispatch(
          setState({
            domainWhitelistPending: omitted,
          }),
        );

        store.dispatch(saveUserSettings());
      }

      if (
        state.domainWhitelist.indexOf(domainWhitelistItemKey) > -1 &&
        state.domainWhitelistHistory.indexOf(domainWhitelistItemKey) === -1
      ) {
        store.dispatch(
          setState({
            domainWhitelistPending: {
              ...state.domainWhitelistPending,
              [domainWhitelistItemKey]: new Date().getTime(),
            },
          }),
        );

        store.dispatch(saveUserSettings());

        const baseResults = await browser.history.search({
          text: domainWhitelistItemKey,
          startTime: 0,
          maxResults: 1000000,
        });

        const hydratedAndFilteredResults: any[] = [];
        const regex = new RegExp(`^https://${domainWhitelistItemKey}`);
        await Promise.all(
          baseResults.map((item) => {
            return new Promise<void>((resolve, reject) => {
              if (item.url && regex.test(item.url)) {
                try {
                  browser.history
                    .getVisits({
                      url: item.url,
                    })
                    .then((hydratedResults) => {
                      for (const hydratedResult of hydratedResults) {
                        hydratedAndFilteredResults.push({
                          ...hydratedResult,
                          url: item.url,
                        });
                      }

                      resolve();
                    });
                } catch (err) {
                  console.log("error", err);
                  reject(err);
                }
              } else {
                resolve();
              }
            });
          }),
        );

        let failed = false;
        for (
          let i = 0;
          i < hydratedAndFilteredResults.length;
          i = i + MOBILE_SLICE_SIZE
        ) {
          const slice = hydratedAndFilteredResults.slice(
            i,
            i + MOBILE_SLICE_SIZE,
          );
          const sliceEvents = await Promise.all(
            slice.map(async (result) => {
              return assembleContentAndEvents(
                result.url,
                new Date(result.visitTime).toJSON(),
              );
            }),
          );
          try {
            const { accessToken } = store.getState().ciState;
            await axios.post(
              // TODO: update to use env var
              `https://${state.serverDomain}/api/events`,
              sliceEvents,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
              },
            );
          } catch (err) {
            console.error("Error posting events:", err);
            failed = true;
            break;
          }
        }

        if (!failed) {
          const omitted = { ...state.domainWhitelistPending };
          delete omitted[domainWhitelistItemKey];

          store.dispatch(
            setState({
              domainWhitelistPending: omitted,
              domainWhitelistHistory: state.domainWhitelistHistory.concat([
                domainWhitelistItemKey,
              ]),
            }),
          );

          store.dispatch(saveUserSettings());
        }
      }
    },
  );

  Object.entries(state.pageWhitelistPending).forEach(
    async ([pageWhitelistItemKey, pageWhitelistItemValue]) => {
      if (
        state.pageWhitelist.indexOf(pageWhitelistItemKey) &&
        new Date(new Date().getTime() - 300000).getTime() >
          pageWhitelistItemValue
      ) {
        const omitted = { ...state.pageWhitelistPending };
        delete omitted[pageWhitelistItemKey];
        store.dispatch(
          setState({
            pageWhitelistPending: omitted,
          }),
        );

        store.dispatch(saveUserSettings());
      }

      if (
        state.pageWhitelist.indexOf(pageWhitelistItemKey) > -1 &&
        state.pageWhitelistHistory.indexOf(pageWhitelistItemKey) === -1
      ) {
        store.dispatch(
          setState({
            pageWhitelistPending: {
              ...state.pageWhitelistPending,
              [pageWhitelistItemKey]: new Date().getTime(),
            },
          }),
        );

        store.dispatch(saveUserSettings());

        const baseResults = await browser.history.search({
          text: pageWhitelistItemKey,
          startTime: 0,
          maxResults: 1000000,
        });

        const hydratedAndFilteredResults: any[] = [];
        const regex = new RegExp(pageWhitelistItemKey);
        await Promise.all(
          baseResults.map((item) => {
            return new Promise<void>((resolve, reject) => {
              if (item.url && regex.test(item.url)) {
                try {
                  browser.history
                    .getVisits({
                      url: item.url,
                    })
                    .then((hydratedResults) => {
                      for (const hydratedResult of hydratedResults) {
                        hydratedAndFilteredResults.push({
                          ...hydratedResult,
                          url: item.url,
                        });
                      }

                      resolve();
                    });
                } catch (err) {
                  console.log("error", err);
                  reject(err);
                }
              } else {
                resolve();
              }
            });
          }),
        );

        const events = await Promise.all(
          hydratedAndFilteredResults.map(async (result) => {
            return assembleContentAndEvents(
              result.url,
              new Date(result.visitTime).toJSON(),
            );
          }),
        );

        let finished = false;
        let failed = false;
        let startIndex = 0;

        while (!finished) {
          const slice = events.slice(
            startIndex,
            startIndex + MOBILE_SLICE_SIZE,
          );
          if (slice.length > 0) {
            try {
              const { accessToken } = store.getState().ciState;
              await axios.post(
                // TODO: update to use env var
                `https://${state.serverDomain}/api/events`,
                slice,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                  },
                },
              );
            } catch (err) {
              console.log("error posting events", err);
              failed = true;

              break;
            }
          }

          startIndex += MOBILE_SLICE_SIZE;

          if (slice.length < MOBILE_SLICE_SIZE) {
            finished = true;
          }
        }

        if (!failed) {
          const omitted = { ...state.pageWhitelistPending };
          delete omitted[pageWhitelistItemKey];

          store.dispatch(
            setState({
              pageWhitelistPending: omitted,
              pageWhitelistHistory: state.pageWhitelistHistory.concat([
                pageWhitelistItemKey,
              ]),
            }),
          );

          store.dispatch(saveUserSettings());
        }
      }
    },
  );
}

async function getDeviceId(): Promise<string> {
  const storage = await browser.storage.local.get('deviceId');
  if (storage.deviceId) {
    return storage.deviceId;
  }
  
  throw new Error("No device_id found. Please wait for device setup to complete.");
}

async function fetchDeviceFromServer(): Promise<string | null> {
  try {
    const state = store.getState().ciState;
    const { accessToken, serverDomain } = state;
    
    if (!accessToken) {
      return null;
    }
    
    const accessDecoded = jwtDecode(accessToken) as any;
    const isAuthExpired = accessDecoded && accessDecoded.exp
      ? Date.now() >= accessDecoded.exp * 1000
      : true;
    
    if (isAuthExpired) {
      return null;
    }
    
    const response = await axios.get(
      `https://${serverDomain}/api/devices`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      },
    );
    
    const devices = response.data;
    
    const storage = await browser.storage.local.get('deviceId');
    if (storage.deviceId) {
      const matchingDevice = devices.find((d: any) => d.device_id === storage.deviceId);
      if (matchingDevice) {
        return storage.deviceId;
      }
    }
    
    const deviceInfo = getDeviceInfo();
    const matchingDevice = devices.find((d: any) => 
      d.device_name === deviceInfo.device_name &&
      d.platform === deviceInfo.platform
    );
    
    if (matchingDevice) {
      await browser.storage.local.set({ 
        deviceId: matchingDevice.device_id,
        deviceName: matchingDevice.device_name,
        deviceType: matchingDevice.device_type,
        devicePlatform: matchingDevice.platform
      });
      store.dispatch(setState({ 
        deviceId: matchingDevice.device_id,
        deviceName: matchingDevice.device_name,
        deviceType: matchingDevice.device_type,
        devicePlatform: matchingDevice.platform
      }));
      return matchingDevice.device_id;
    }
    
    return null;
  } catch (error: any) {
    console.error("Failed to fetch devices from server:", error?.response?.data || error?.message);
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
  const isAuthExpired = accessDecoded && accessDecoded.exp
    ? Date.now() >= accessDecoded.exp * 1000
    : true;
  
  if (isAuthExpired) {
    throw new Error("Cannot create device: Access token expired. Please log in again.");
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
      devicePlatform
    });
    store.dispatch(setState({ 
      deviceId,
      deviceName,
      deviceType,
      devicePlatform
    }));
    
    deviceSetupInProgress = false;
    return deviceId;
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || 
                        error?.response?.data?.error || 
                        error?.message || 
                        'Unknown error occurred';
    
    throw new Error(`Failed to create device: ${errorMessage}`);
  }
}

async function authenticateWithCredentials(username: string, password: string): Promise<{ accessToken: string; sessionToken: string }> {
  const state = store.getState().ciState;
  const { serverDomain } = state;
  
  try {
    const requestData = {
      username: username,
      password: password
    };
    
    const response = await axios.post(
      `https://${serverDomain}/api/authenticate`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );
    
    const { accessToken, sessionToken } = response.data;
    
    if (!accessToken || !sessionToken) {
      throw new Error("Invalid response from server - missing tokens");
    }
    
    store.dispatch(setState({ accessToken, sessionToken }));
    await browser.storage.local.set({ accessToken, sessionToken });
    
    return { accessToken, sessionToken };
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || 
                        error?.response?.data?.error || 
                        error?.message || 
                        'Unknown error occurred';
    
    throw new Error(`Authentication failed: ${errorMessage}`);
  }
}

function checkAuthStatus() {
  const state = store.getState().ciState;
  const { accessToken, sessionToken } = state;
  
  return { accessToken, sessionToken };
}

async function setupDevice(): Promise<string> {
  if (deviceSetupInProgress) {
    throw new Error("Device setup already in progress");
  }
  
  deviceSetupInProgress = true;
  
  try {
    let { accessToken } = checkAuthStatus();
    
    if (!accessToken) {
      throw new Error("No access token available. Please log in first.");
    }
    
    const accessDecoded = jwtDecode(accessToken) as any;
    const isAuthExpired = accessDecoded && accessDecoded.exp
      ? Date.now() >= accessDecoded.exp * 1000
      : true;
    
    if (isAuthExpired) {
      const storedCredentials = await browser.storage.local.get(['username', 'password']);
      if (storedCredentials.username && storedCredentials.password) {
        try {
          const { accessToken: newAccessToken, sessionToken: newSessionToken } = await authenticateWithCredentials(
            storedCredentials.username,
            storedCredentials.password
          );
          accessToken = newAccessToken;
        } catch (authError: any) {
          throw new Error(`Authentication failed: ${authError.message}. Please log in again.`);
        }
      } else {
        throw new Error("Access token expired and no stored credentials found. Please log in again.");
      }
    }
    
    const existingDeviceId = await fetchDeviceFromServer();
    
    if (existingDeviceId) {
      return existingDeviceId;
    }
    
    const newDeviceId = await createDeviceOnServer();
    return newDeviceId;
    
  } catch (error: any) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
    deviceSetupInProgress = false;
    throw new Error(errorMessage);
  }
}

function getDeviceInfo() {
  const browser_info = bowser.getParser(navigator.userAgent);
  const platform = browser_info.getOSName() || 'unknown';
  const browserName = browser_info.getBrowserName() || 'Chrome';
  
  let device_type = 'desktop';
  const platformType = browser_info.getPlatformType();
  if (platformType === 'mobile') {
    device_type = 'mobile';
  } else if (platformType === 'tablet') {
    device_type = 'tablet';
  }
  
  const device_name = `${browserName} on ${platform}`;
  const model = browser_info.getOSVersion() ? `${platform} ${browser_info.getOSVersion()}` : platform;
  
  return {
    device_name: device_name,
    device_type: device_type,
    platform: platform.toLowerCase(),
    model: model,
  };
}

function isUrlBlacklisted(url: string, siteBlacklist: string[], pageBlacklist: string[]): boolean {
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
  description?: string;
  duration_seconds?: number;
  scroll_depth?: number;
  action_type: string;
}> {
  let title: string | undefined = undefined;
  let description: string | undefined = undefined;
  let duration_seconds: number | undefined = undefined;
  let scroll_depth: number | undefined = undefined;
  
  try {
    const historyItems = await browser.history.search({
      text: url,
      startTime: visitTime - 1000,
      endTime: visitTime + 1000,
      maxResults: 1
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
            const nextVisit = visits.find(v => v.visitTime! > closestVisit.visitTime!);
            if (nextVisit && nextVisit.visitTime) {
              duration_seconds = Math.round((nextVisit.visitTime - closestVisit.visitTime) / 1000);
            } else {
              duration_seconds = 30;
            }
          }
        }
      } catch (visitError) {
        // Continue without duration
      }
    } else {
      try {
        const tabs = await browser.tabs.query({ url: url });
        if (tabs.length > 0 && tabs[0].title) {
          title = tabs[0].title;
        }
      } catch (tabError) {
        // Continue without title
      }
    }
  } catch (error) {
    // Continue without title
  }
  
  try {
    const tabs = await browser.tabs.query({ url: url });
    if (tabs.length > 0) {
      try {
        const results = await browser.tabs.sendMessage(tabs[0].id!, {
          action: 'getMetaDescription'
        });
        if (results && results.description) {
          description = results.description;
        }
      } catch (contentError) {
        // Continue without description
      }
      
      try {
        const scrollResults = await browser.tabs.sendMessage(tabs[0].id!, {
          action: 'getScrollDepth'
        });
        if (scrollResults && scrollResults.scrollDepth !== undefined) {
          scroll_depth = scrollResults.scrollDepth;
        }
      } catch (scrollError) {
        // Continue without scroll depth
      }
    }
  } catch (error) {
    // Continue without description or scroll depth
  }
  
  return {
    time: new Date(visitTime).toISOString(),
    device_id: deviceId,
    url: url,
    title: title,
    description: description,
    duration_seconds: duration_seconds,
    scroll_depth: scroll_depth,
    action_type: 'visit',
  };
}

async function triggerManualHistorySync(options: { timeRange?: number } = {}) {
  await store.dispatch({
    type: "loadUserSettings",
  });

  const state = store.getState().ciState;

  // Check if already syncing
  if (state.historySyncInProgress) {
    console.log("History sync already in progress");

    return;
  }

  // Check authentication
  const { accessToken } = state;
  const accessDecoded = accessToken ? (jwtDecode(accessToken) as any) : null;
  const isAuthExpired = accessDecoded && accessDecoded.exp
    ? Date.now() >= accessDecoded.exp * 1000
    : true;

  if (isAuthExpired) {
    store.dispatch(
      setState({
        historySyncStatus: "Authentication expired. Please log in again.",
      }),
    );

    return;
  }

  try {
    await getDeviceId();
  } catch (error) {
    store.dispatch(
      setState({
        historySyncStatus: "Device setup failed due to SSL certificate issues. Please run Chrome with --ignore-certificate-errors flag.",
      }),
    );
    return;
  }

  const startTime = Date.now();
  const timeRange = options.timeRange || 7 * 24 * 60 * 60 * 1000; // Default to last 7 days
  const searchStartTime = Date.now() - timeRange;


  try {
    // Set sync in progress
    store.dispatch(
      setState({
        historySyncInProgress: true,
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

    // Get detailed visit information for all history entries
    const hydratedResults: Array<{ visitTime: number; url: string }> = [];
    let processed = 0;
    let blacklistedCount = 0;
    const { siteBlacklist = [], pageBlacklist = [] } = state;

    await Promise.all(
      allHistoryResults.map((item) => {
        return (async () => {
          try {
            // Check if this URL is blacklisted
            if (item.url && isUrlBlacklisted(item.url, siteBlacklist, pageBlacklist)) {
              blacklistedCount++;
              processed++;
              return true;
            }

            if (!item.url) {
              processed++;
              return true;
            }

            const visits = await browser.history.getVisits({
              url: item.url,
            });

            for (const visit of visits) {
              if (visit.visitTime && visit.visitTime >= searchStartTime) {
                hydratedResults.push({
                  visitTime: visit.visitTime,
                  url: item.url,
                });
              }
            }

            processed++;
            if (processed % 100 === 0) {
              const statusMessage = blacklistedCount > 0
                ? `Processed ${processed}/${allHistoryResults.length} entries (${blacklistedCount} blacklisted)...`
                : `Processed ${processed}/${allHistoryResults.length} entries...`;
              store.dispatch(
                setState({
                  historySyncStatus: statusMessage,
                }),
              );
            }

            return true;
          } catch (err) {
            console.log("Error processing history item:", err);

            return false;
          }
        })();
      }),
    );

    if (hydratedResults.length === 0) {
      const duration = Date.now() - startTime;
      const statusMessage = blacklistedCount > 0
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

    const statusMessage = blacklistedCount > 0
      ? `Uploading ${hydratedResults.length} visits to CI-Server (${blacklistedCount} blacklisted entries excluded)...`
      : `Uploading ${hydratedResults.length} visits to CI-Server...`;
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

    for (let i = 0; i < hydratedResults.length; i += SLICE_SIZE) {
      const slice = hydratedResults.slice(i, i + SLICE_SIZE);

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

        for (const activity of browserActivities) {
          await axios.post(
            `https://${state.serverDomain}/api/browser-activity`,
            activity,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              timeout: 30000,
            },
          );
          uploaded++;
        }
        store.dispatch(
          setState({
            historySyncStatus: `Uploaded ${uploaded}/${hydratedResults.length} visits...`,
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
      : uploaded < hydratedResults.length
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
      const failureMessage = blacklistedCount > 0
        ? `History sync failed after uploading ${uploaded} visits (${blacklistedCount} blacklisted entries excluded). Please try again.`
        : `History sync failed after uploading ${uploaded} visits. Please try again.`;
      store.dispatch(
        setState({
          historySyncInProgress: false,
          historySyncStatus: failureMessage,
        }),
      );
    } else {
      const successMessage = blacklistedCount > 0
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
      const event = {
        name: `Scraped ${scrapeResult.profileName} - ${item.title || "Data"}`,
        start_time: scrapeResult.timestamp,
        type: "Scraped Data",
        content: [
          {
            type: "Personal Data",
            mimetype: "application/json",
            url: scrapeResult.url,
            title: item.title || `${scrapeResult.profileName} Data`,
            text: JSON.stringify(item),
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
    await axios.post(`https://${serverDomain}/api/people`, events, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error uploading scraped data:", error);
  }
}

async function assembleContentAndEvents(url: string, time?: string) {
  let newThumbnailContent: any;
  let newPageContent: any;
  let newMediaContent: any;
  const newContent: any[] = [];
  const state = store.getState().ciState;
  const { serverDomain } = state;

  await new Promise<void>(function (resolve) {
    try {
      axios
        .get(
          `https://${serverDomain}/embed/iframely?url=` +
            encodeURIComponent(url),
        )
        .then((result) => {
          const data = result.data;

          newPageContent = {
            type: "Web Page",
            mimetype: "text/html",
            url: data.meta.canonical || url,
            title: undefined as string | undefined,
          };

          if (data.meta.description) {
            newPageContent.text = data.meta.description;

            // let tags = newContent.text.match(tagRegex);

            // if (tags != null) {
            //   for (let j = 0; j < tags.length; j++) {
            // newContent.tagMasks.source.push(tags[j].slice(1));
            // }
            // }
          }

          if (data.meta.title) {
            newPageContent.title = data.meta.title;

            // let tags = newContent.title.match(tagRegex);
            //
            // if (tags != null) {
            //   for (let j = 0; j < tags.length; j++) {
            //     newContent.tagMasks.source.push(tags[j].slice(1));
            //   }
            // }
          }

          const links = data.links || [];

          // newContent.tagMasks.source = _.uniq(newContent.tagMasks.source);

          const thumbnailLink = links.thumbnail?.find((link: any) => {
            return link.rel.indexOf("thumbnail") >= 0;
          });

          if (thumbnailLink != null) {
            newThumbnailContent = {
              type: "Image",
              mimetype: thumbnailLink.type,
              title: data.meta.title || "Thumbnail for " + data.meta.canonical,
              text: data.meta.description,
              url: thumbnailLink.href,
            };
          }

          if (links.player) {
            const playerLink = links.player[0];
            newMediaContent = {
              type: playerLink.rel.indexOf("audio") >= 0 ? "Audio" : "Video",
              mimetype: playerLink.type,
              title: data.meta.title,
              text: data.meta.description,
              url: playerLink.href,
            };
          }

          // if (data.html) {
          //   newEmbedContent = {
          //     type: 'Embed',
          //   }
          //   newEmbedContent.embed_content = data.html;
          //   newContent.embed_format = 'iframe';
          // }
          newContent.push(newPageContent);
          if (newThumbnailContent) {
            newContent.push(newThumbnailContent);
          }

          if (newMediaContent) {
            newContent.push(newMediaContent);
          }

          resolve();
        })
        .catch((error) => {
          console.error("Error hitting iframely:", error);
          newPageContent = {
            type: "web-page",
            mimetype: "text/html",
            url: url,
          };
          newContent.push(newPageContent);
          resolve();
        });
    } catch (error) {
      console.error("Error hitting iframely:", error);
      newPageContent = {
        type: "web-page",
        url: url,
      };
      newContent.push(newPageContent);
      resolve();
    }
  });

  return {
    name: "Visited " + url,
    start_time: time || new Date().toJSON(),
    type: "View",
    content: newContent,
  };
}

async function getAllBookmarks(): Promise<any[]> {
  const bookmarkTree = await browser.bookmarks.getTree();
  const allBookmarks: any[] = [];

  function collectBookmarks(nodes: any[]) {
    for (const node of nodes) {
      if (node.url && /^(http(s)?:\/\/)/.test(node.url)) {
        // This is an actual bookmark (not a folder)
        allBookmarks.push(node);
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
  name: string;
  start_time: string;
  type: string;
  content: {
    type: string;
    mimetype?: string;
    url?: string;
    title?: string;
    text?: string;
  }[];
  bookmark_id: string;
}> {
  let newThumbnailContent: any;
  let newPageContent: any;
  let newMediaContent: any;
  const newContent: any[] = [];
  const state = store.getState().ciState;
  const { serverDomain } = state;

  // Try to get page metadata for the bookmark URL
  await new Promise<void>(function (resolve) {
    try {
      axios
        .get(
          `https://${serverDomain}/embed/iframely?url=` +
            encodeURIComponent(bookmark.url!),
        )
        .then((result) => {
          const data = result.data;

          newPageContent = {
            type: "Bookmark",
            mimetype: "text/html",
            url: data.meta.canonical || bookmark.url,
          };

          if (data.meta.description) {
            newPageContent.text = data.meta.description;
          }

          if (data.meta.title || bookmark.title) {
            newPageContent.title = data.meta.title || bookmark.title;
          }

          const links = data.links || [];

          const thumbnailLink = links.thumbnail?.find((link: any) => {
            return link.rel.indexOf("thumbnail") >= 0;
          });

          if (thumbnailLink != null) {
            newThumbnailContent = {
              type: "Image",
              mimetype: thumbnailLink.type,
              title: (data.meta.title || bookmark.title) + " - Thumbnail",
              text: data.meta.description,
              url: thumbnailLink.href,
            };
          }

          if (links.player) {
            const playerLink = links.player[0];
            newMediaContent = {
              type: playerLink.rel.indexOf("audio") >= 0 ? "Audio" : "Video",
              mimetype: playerLink.type,
              title: data.meta.title || bookmark.title,
              text: data.meta.description,
              url: playerLink.href,
            };
          }

          newContent.push(newPageContent);
          if (newThumbnailContent) {
            newContent.push(newThumbnailContent);
          }

          if (newMediaContent) {
            newContent.push(newMediaContent);
          }

          resolve();
        })
        .catch((error) => {
          console.error("Error hitting iframely for bookmark:", error);
          newPageContent = {
            type: "Bookmark",
            mimetype: "text/html",
            url: bookmark.url,
            title: bookmark.title,
          };
          newContent.push(newPageContent);
          resolve();
        });
    } catch (error) {
      console.error("Error processing bookmark metadata:", error);
      newPageContent = {
        type: "Bookmark",
        mimetype: "text/html",
        url: bookmark.url,
        title: bookmark.title,
      };
      newContent.push(newPageContent);
      resolve();
    }
  });

  return {
    name: `${eventType === "create" ? "Created" : eventType === "update" ? "Updated" : "Synced"} Bookmark: ${bookmark.title || bookmark.url}`,
    start_time: new Date(bookmark.dateAdded || Date.now()).toJSON(),
    type:
      eventType === "create"
        ? "Create"
        : eventType === "update"
          ? "Update"
          : "Bookmark",
    content: newContent,
    bookmark_id: bookmark.id,
  };
}

async function syncBookmarksToServer() {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken) {
    return;
  }

  try {
    const allBookmarks = await getAllBookmarks();

    // Process bookmarks in batches
    for (let i = 0; i < allBookmarks.length; i += SLICE_SIZE) {
      const slice = allBookmarks.slice(i, i + SLICE_SIZE);
      const bookmarkEvents = await Promise.all(
        slice.map((bookmark) => createBookmarkEvent(bookmark, "sync")),
      );

      const { accessToken: currentAccessToken } = store.getState().ciState;
      try {
        await axios.post(`https://${serverDomain}/api/events`, bookmarkEvents, {
          headers: {
            Authorization: `Bearer ${currentAccessToken}`,
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        console.error("Error posting bookmark events:", err);
        throw err; // Re-throw to stop processing if there's an error
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

async function handleBookmarkCreated(
  id: string,
  bookmark: any,
) {
  const state = store.getState().ciState;
  const { accessToken, serverDomain } = state;

  if (!accessToken || !bookmark.url) {
    return; // Skip folders or if not authenticated
  }

  try {
    const bookmarkEvent = await createBookmarkEvent(bookmark, "create");
    await axios.post(`https://${serverDomain}/api/events`, bookmarkEvent, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
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
    await axios.post(`https://${serverDomain}/api/events`, bookmarkEvent, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error syncing updated bookmark:", error);
  }
}

async function handleBookmarkRemoved(
  id: string,
  removeInfo: any,
) {
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

    await axios.post(`https://${serverDomain}/api/events`, bookmarkEvent, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error syncing removed bookmark:", error);
  }
}

export default defineBackground({
  main() {
    const initServices = async () => {
      try {
        await database.init();
        await locationService.startLocationTracking();
      } catch (error) {
        console.error("Failed to initialize services:", error);
      }
    };

    initServices();

    const wrapStore = createWrapStore();
    wrapStore(store);
    const ACCESS_TOKEN_KEY = "accessToken";
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
      serverDomain: "dev.companionintelligence.com",
    };
    const state = store.getState().ciState;
    const { serverDomain, refreshing } = state;

    const refreshAccessToken = async () => {
      if (refreshing) {
        return;
      }

      store.dispatch(setState({ refreshing: true }));
      const sessionToken = (await browser.storage.local.get("sessionToken"))
        .sessionToken;
      try {
        const data: AuthResponse = await fetchJson(
          `https://${serverDomain}/api/authenticate/refresh`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionToken}`,
            },
          },
        );

        store.dispatch(setState({ accessToken: data.accessToken }));
        store.dispatch(setState({ sessionToken: data.sessionToken }));
        const decoded = jwtDecode(data.accessToken);
        browser.cookies.set({
          url: `https://${serverDomain}`,
          expirationDate: decoded.exp,
          name: `CI_${ACCESS_TOKEN_KEY}`,
          value: data.accessToken,
          sameSite: "no_restriction",
          secure: true,
        });
        store.dispatch(setState({ refreshing: false }));
        
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

    setInterval(async () => {
      browser.cookies
        .getAll({ url: `https://${serverDomain}` })
        .then(async (result) => {
          const accessTokenCookie = result.find(
            (cookie) => cookie.name === "CI_accessToken",
          );
          const sessionTokenCookie = result.find(
            (cookie) => cookie.name === "CI_sessionToken",
          );
          let { accessToken, sessionToken } = store.getState().ciState;
          if (accessTokenCookie && accessTokenCookie.value !== accessToken) {
            store.dispatch(setState({ accessToken: accessTokenCookie.value }));
          }

          if (sessionTokenCookie && sessionTokenCookie.value !== sessionToken) {
            const cookieDecoded = jwtDecode(sessionTokenCookie.value) as any;
            const cookieExpires = new Date(cookieDecoded.exp * 1000);
            const stateDecoded = sessionToken
              ? (jwtDecode(sessionToken) as any)
              : null;
            const stateExpired = stateDecoded
              ? new Date(stateDecoded.exp * 1000)
              : null;
            if (
              !stateExpired ||
              cookieExpires.getTime() > stateExpired.getTime()
            ) {
              store.dispatch(
                setState({ sessionToken: sessionTokenCookie.value }),
              );
            }
          }

          ({ accessToken, sessionToken } = store.getState().ciState);
          const accessDecoded = accessToken
            ? (jwtDecode(accessToken) as any)
            : null;
          // We want to refresh the access token before it actually expires.
          // Otherwise, it can expire in the middle of a batch of upload requests
          const isAuthExpired = accessDecoded
            ? Date.now() >= (accessDecoded.exp - 5) * 1000
            : true;
          const sessionDecoded = sessionToken
            ? (jwtDecode(sessionToken) as any)
            : null;
          const isSessionExpired = sessionDecoded
            ? Date.now() >= sessionDecoded.exp * 1000
            : true;
          if (
            (!accessTokenCookie && sessionTokenCookie) ||
            (isAuthExpired && !isSessionExpired)
          ) {
            await refreshAccessToken();
          }

          store.dispatch(saveUserSettings());

          // Sync location data periodically
          try {
            await locationService.syncLocationData();
          } catch (error) {
            console.error("Error syncing location data:", error);
          }
        });
    }, 1000);

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

    browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      try {
        if (message && message.type === 'SETUP_DEVICE') {
          try {
            await setupDevice();
            sendResponse({ success: true });
          } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
            sendResponse({ success: false, error: errorMessage });
          }
          return true;
        }
      } catch (error) {
        sendResponse({ success: false, error: 'Message listener error' });
        return true;
      }
    });

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
      if (message.action === "triggerManualHistorySync") {
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
    });

    const AUTO_SYNC_INTERVAL = 60 * 60 * 1000;
    const AUTO_SYNC_TIME_RANGE = 24 * 60 * 60 * 1000;

    setInterval(async () => {
      try {
        await store.dispatch({
          type: "loadUserSettings",
        });

        const state = store.getState().ciState;
        
        if (state.autoSyncEnabled && !state.historySyncInProgress) {
          const { accessToken } = state;
          const accessDecoded = accessToken ? (jwtDecode(accessToken) as any) : null;
          const isAuthExpired = accessDecoded && accessDecoded.exp
            ? Date.now() >= accessDecoded.exp * 1000
            : true;

          if (!isAuthExpired) {
            await triggerManualHistorySync({
              timeRange: AUTO_SYNC_TIME_RANGE,
            });
          }
        }
      } catch (error) {
        console.error("Auto-sync error:", error);
      }
    }, AUTO_SYNC_INTERVAL);

    browser.bookmarks.onCreated.addListener(handleBookmarkCreated);
    browser.bookmarks.onChanged.addListener(handleBookmarkChanged);
    browser.bookmarks.onRemoved.addListener(handleBookmarkRemoved);

    setTimeout(async () => {
      const lastSync = await browser.storage.local.get(BOOKMARK_SYNC_KEY);
      if (!lastSync[BOOKMARK_SYNC_KEY]) {
        await syncBookmarksToServer();
      }
    }, 5000);

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "DOMAIN_SCRAPE_DATA") {
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
    });
  },
});
