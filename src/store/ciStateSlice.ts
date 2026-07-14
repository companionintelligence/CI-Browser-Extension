import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { parseUrl } from "@/utils";

export const loadUserSettings = createAsyncThunk(
  "ciState/loadUserSettings",
  async () => {
    return await browser.storage.local.get<Record<string, unknown>>([
      "accessToken",
      "sessionToken",
      "oauthAccessToken",
      "oauthRefreshToken",
      "oauthTokenExpiry",
      "domainWhitelist",
      "domainWhitelistPending",
      "domainWhitelistHistory",
      "pageWhitelist",
      "pageWhitelistPending",
      "pageWhitelistHistory",
      "captureSettings",
      "lastHistorySync",
      "syncHistoryLogs",
      "autoSyncEnabled",
      "siteBlacklist",
      "pageBlacklist",
      "deviceId",
      "deviceName",
      "deviceType",
      "devicePlatform",
      "bookmarkSyncEnabled",
      "downloadSyncEnabled",
      "historySyncEnabled",
      "serverDomain",
      "serverEnvironmentId",
      "portalIssuer",
    ]);
  },
);

interface CiState {
  accessToken: string | null;
  // Legacy CI-Server session token, predating the portal OIDC flow.
  sessionToken: string | null;
  // Standalone OAuth token pool used by the webcam/desktop capture feature
  // (separate from the portal OIDC accessToken above).
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  oauthTokenExpiry: number | null;
  domainWhitelist: string[];
  domainWhitelistPending: Record<string, unknown>;
  domainWhitelistHistory: string[];
  pageWhitelist: string[];
  pageWhitelistPending: Record<string, unknown>;
  pageWhitelistHistory: string[];
  captureSettings: {
    enableWebcam: boolean;
    enableDesktop: boolean;
    autoCapture: boolean;
    captureInterval: number;
  };
  url: string | null;
  domain: string | null;
  lastUrl: string | null;
  historySyncInProgress: boolean;
  historySyncStatus: string | null;
  lastHistorySync: string | null;
  syncHistoryLogs: { status: string; timestamp: string }[];
  refreshing: boolean;
  serverDomain: string;
  serverEnvironmentId: string | null;
  // Optional OIDC issuer override; when unset the issuer is derived from
  // serverDomain (see services/portalConfig).
  portalIssuer: string | null;
  settingsLoaded: boolean;
  autoSyncEnabled: boolean;
  siteBlacklist: string[];
  pageBlacklist: string[];
  deviceId: string | null;
  deviceName: string | null;
  deviceType: string | null;
  devicePlatform: string | null;
  bookmarkSyncEnabled: boolean;
  downloadSyncEnabled: boolean;
  historySyncEnabled: boolean;
}

export const ciStateSlice = createSlice({
  name: "ciState",
  initialState: {
    accessToken: null,
    sessionToken: null,
    oauthAccessToken: null,
    oauthRefreshToken: null,
    oauthTokenExpiry: null,
    domainWhitelist: [],
    domainWhitelistPending: {},
    domainWhitelistHistory: [],
    pageWhitelist: [],
    pageWhitelistPending: {},
    pageWhitelistHistory: [],
    captureSettings: {
      enableWebcam: true,
      enableDesktop: true,
      autoCapture: false,
      captureInterval: 300000, // 5 minutes default
    },
    url: null,
    domain: null,
    lastUrl: null,
    historySyncInProgress: false,
    historySyncStatus: null,
    lastHistorySync: null,
    syncHistoryLogs: [],
    refreshing: false,
    serverDomain: "",
    serverEnvironmentId: null,
    portalIssuer: null,
    settingsLoaded: false,
    autoSyncEnabled: false,
    siteBlacklist: [],
    pageBlacklist: [],
    deviceId: null,
    deviceName: null,
    deviceType: null,
    devicePlatform: null,
    bookmarkSyncEnabled: false,
    downloadSyncEnabled: false,
    historySyncEnabled: true, // Default to enabled since history is the main feature
  } as CiState,
  reducers: {
    setState: (state, action) => {
      const payload = action.payload as Partial<CiState>;

      return { ...state, ...payload };
    },
    addSyncHistoryLog(state, action) {
      const newLog = {
        id: Date.now(),
        timestamp: action.payload.timestamp,
        timeRange: action.payload.timeRange,
        totalEntries: action.payload.totalEntries,
        processedEntries: action.payload.processedEntries,
        uploadedEntries: action.payload.uploadedEntries,
        status: action.payload.status, // 'success', 'failed', 'partial'
        error: action.payload.error,
        duration: action.payload.duration,
      };

      const updatedLogs = [newLog, ...state.syncHistoryLogs].slice(0, 50); // Keep only last 50 logs

      return {
        ...state,
        syncHistoryLogs: updatedLogs,
      };
    },
    clearSyncHistoryLogs(state) {
      return {
        ...state,
        syncHistoryLogs: [],
      };
    },
    toggleAutoSync(state) {
      return {
        ...state,
        autoSyncEnabled: !state.autoSyncEnabled,
      };
    },
    toggleBookmarkSync(state) {
      return {
        ...state,
        bookmarkSyncEnabled: !state.bookmarkSyncEnabled,
      };
    },
    toggleDownloadSync(state) {
      return {
        ...state,
        downloadSyncEnabled: !state.downloadSyncEnabled,
      };
    },
    toggleHistorySync(state) {
      const newHistorySyncEnabled = !state.historySyncEnabled;

      // If turning history sync back on, clear the cache and set a flag
      if (newHistorySyncEnabled) {
        // Clear the synced history cache
        browser.storage.local.remove("syncedHistory").catch(console.error);

        // Store the current timestamp to track when history sync was re-enabled
        browser.storage.local
          .set({
            historySyncReEnabledAt: Date.now(),
          })
          .catch(console.error);
      }

      return {
        ...state,
        historySyncEnabled: newHistorySyncEnabled,
      };
    },
    addSiteBlacklist(state, action) {
      let newSiteBlacklist = state.siteBlacklist;
      if (newSiteBlacklist.indexOf(action.payload) === -1) {
        newSiteBlacklist = newSiteBlacklist.concat(action.payload);
      }

      return { ...state, siteBlacklist: newSiteBlacklist };
    },
    removeSiteBlacklist(state, action) {
      const newSiteBlacklist = state.siteBlacklist.filter(
        (entry) => entry != null && entry !== action.payload,
      );

      return { ...state, siteBlacklist: newSiteBlacklist };
    },
    addPageBlacklist(state, action) {
      let newPageBlacklist = state.pageBlacklist;
      let parsed = parseUrl(action.payload);
      if (!parsed) {
        parsed = parseUrl(`https://${action.payload}`);
        action.payload = `https://${action.payload}`;
      }

      if (!parsed) {
        return state;
      }

      parsed.hash = "";
      const parsedToString = parsed.toString();
      if (newPageBlacklist.indexOf(parsedToString) === -1) {
        newPageBlacklist = newPageBlacklist.concat(parsedToString);
      }

      return { ...state, pageBlacklist: newPageBlacklist };
    },
    removePageBlacklist(state, action) {
      let parsed = parseUrl(action.payload);
      if (!parsed) {
        parsed = parseUrl(`https://${action.payload}`);
        action.payload = `https://${action.payload}`;
      }

      if (!parsed) {
        return state;
      }

      parsed.hash = "";
      const strippedUrl = parsed.toString();
      const newPageBlacklist = state.pageBlacklist.filter(
        (entry) => entry != null && entry !== strippedUrl,
      );

      return { ...state, pageBlacklist: newPageBlacklist };
    },
    saveUserSettings(state) {
      const parsed = JSON.parse(
        JSON.stringify({
          accessToken: state.accessToken,
          sessionToken: state.sessionToken,
          oauthAccessToken: state.oauthAccessToken,
          oauthRefreshToken: state.oauthRefreshToken,
          oauthTokenExpiry: state.oauthTokenExpiry,
          domainWhitelist: state.domainWhitelist,
          domainWhitelistPending: state.domainWhitelistPending,
          domainWhitelistHistory: state.domainWhitelistHistory,
          pageWhitelist: state.pageWhitelist,
          pageWhitelistPending: state.pageWhitelistPending,
          pageWhitelistHistory: state.pageWhitelistHistory,
          captureSettings: state.captureSettings,
          lastHistorySync: state.lastHistorySync,
          syncHistoryLogs: state.syncHistoryLogs,
          autoSyncEnabled: state.autoSyncEnabled,
          siteBlacklist: state.siteBlacklist,
          pageBlacklist: state.pageBlacklist,
          deviceId: state.deviceId,
          deviceName: state.deviceName,
          deviceType: state.deviceType,
          devicePlatform: state.devicePlatform,
          bookmarkSyncEnabled: state.bookmarkSyncEnabled,
          downloadSyncEnabled: state.downloadSyncEnabled,
          historySyncEnabled: state.historySyncEnabled,
          serverDomain: state.serverDomain,
          serverEnvironmentId: state.serverEnvironmentId,
          portalIssuer: state.portalIssuer,
        }),
      );
      browser.storage.local.set(parsed);

      return state;
    },
    updateCaptureSettings(state, action) {
      return {
        ...state,
        captureSettings: {
          ...state.captureSettings,
          ...action.payload,
        },
      };
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadUserSettings.fulfilled, (state, action) => {
      for (const [key, value] of Object.entries(action.payload)) {
        if (key in state) {
          (state as Record<string, unknown>)[key] = value;
        }
      }

      state.settingsLoaded = true;
    });
  },
});

// Action creators are generated for each case reducer function
export const {
  setState,
  addSyncHistoryLog,
  clearSyncHistoryLogs,
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
  addSiteBlacklist,
  removeSiteBlacklist,
  addPageBlacklist,
  removePageBlacklist,
  saveUserSettings,
  updateCaptureSettings,
} = ciStateSlice.actions;

export default ciStateSlice.reducer;
