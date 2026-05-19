import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

const USER_SETTINGS_KEYS = [
  "accessToken",
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
] as const;

export const loadUserSettings = createAsyncThunk(
  "ciState/loadUserSettings",
  async () => {
    const keys = USER_SETTINGS_KEYS as readonly (keyof CiState)[];

    return (await browser.storage.local.get(
      keys as (keyof CiState)[],
    )) as Partial<CiState>;
  },
);

interface CiState {
  accessToken: string | null;
  url: string | null;
  domain: string | null;
  lastUrl: string | null;
  historySyncInProgress: boolean;
  historySyncStatus: string | null;
  lastHistorySync: string | null;
  syncHistoryLogs: { status: string; timestamp: string }[];
  refreshing: boolean;
  serverDomain: string;
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
    url: null,
    domain: null,
    lastUrl: null,
    historySyncInProgress: false,
    historySyncStatus: null,
    lastHistorySync: null,
    syncHistoryLogs: [],
    refreshing: false,
    serverDomain: "",
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
      let parsed = URL.parse(action.payload);
      if (!parsed) {
        parsed = URL.parse(`https://${action.payload}`);
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
      let parsed = URL.parse(action.payload);
      if (!parsed) {
        parsed = URL.parse(`https://${action.payload}`);
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
        }),
      );
      browser.storage.local.set(parsed);

      return state;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadUserSettings.fulfilled, (state, action) => {
      const payload = (action.payload ?? {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(payload)) {
        if (key in state) {
          (state as Record<string, unknown>)[key] = value;
        }
      }
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
} = ciStateSlice.actions;

export default ciStateSlice.reducer;
