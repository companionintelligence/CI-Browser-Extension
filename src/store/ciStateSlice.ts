import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const loadUserSettings = createAsyncThunk(
  "ciState/loadUserSettings",
  async () => {
    const localData = await browser.storage.local.get([
      "accessToken",
      "sessionToken",
      "domainWhitelist",
      "domainWhitelistPending",
      "domainWhitelistHistory",
      "pageWhitelist",
      "pageWhitelistPending",
      "pageWhitelistHistory",
      "lastHistorySync",
      "syncHistoryLogs",
      "autoSyncEnabled",
      "siteBlacklist",
      "pageBlacklist",
      "deviceId",
      "deviceName",
      "deviceType", 
      "devicePlatform",
      "includeBookmarks",
      "bookmarkSyncEnabled",
      "includeDownloads",
      "downloadSyncEnabled",
      "includeFormSubmissions",
      "formSyncEnabled",
    ]);

    return localData;
  },
);

interface CiState {
  accessToken: string | null;
  sessionToken: string | null;
  domainWhitelist: string[];
  domainWhitelistPending: Record<string, any>;
  domainWhitelistHistory: string[];
  pageWhitelist: string[];
  pageWhitelistPending: Record<string, any>;
  pageWhitelistHistory: string[];
  url: string | null;
  domain: string | null;
  lastUrl: string | null;
  historySyncInProgress: boolean;
  historySyncStatus: string | null;
  lastHistorySync: string | null;
  syncHistoryLogs: any[];
  refreshing: boolean;
  serverDomain: string;
  autoSyncEnabled: boolean;
  siteBlacklist: string[];
  pageBlacklist: string[];
  deviceId: string | null;
  deviceName: string | null;
  deviceType: string | null;
  devicePlatform: string | null;
  includeBookmarks: boolean;
  bookmarkSyncEnabled: boolean;
  includeDownloads: boolean;
  downloadSyncEnabled: boolean;
  includeFormSubmissions: boolean;
  formSyncEnabled: boolean;
}

export const ciStateSlice = createSlice({
  name: "ciState",
  initialState: {
    accessToken: null,
    sessionToken: null,
    domainWhitelist: [],
    domainWhitelistPending: {},
    domainWhitelistHistory: [],
    pageWhitelist: [],
    pageWhitelistPending: {},
    pageWhitelistHistory: [],
    url: null,
    domain: null,
    lastUrl: null,
    historySyncInProgress: false,
    historySyncStatus: null,
    lastHistorySync: null,
    syncHistoryLogs: [],
    refreshing: false,
    serverDomain: "dev.companionintelligence.com",
    autoSyncEnabled: false,
    siteBlacklist: [],
    pageBlacklist: [],
    deviceId: null,
    deviceName: null,
    deviceType: null,
    devicePlatform: null,
    includeBookmarks: false,
    bookmarkSyncEnabled: false,
    includeDownloads: false,
    downloadSyncEnabled: false,
    includeFormSubmissions: false,
    formSyncEnabled: false,
  } as CiState,
  reducers: {
    setState: (state, action) => {
      const payload = action.payload as Partial<CiState>;

      return { ...state, ...payload };
    },
    addDomainWhitelistEntry(state, action) {
      let newDomainWhitelist = state.domainWhitelist;
      if (newDomainWhitelist.indexOf(action.payload) === -1) {
        newDomainWhitelist = newDomainWhitelist.concat(action.payload);
      }

      const returned = { ...state, domainWhitelist: newDomainWhitelist };

      if (state.domainWhitelistHistory.indexOf(action.payload) === -1) {
        returned.domainWhitelistPending = {
          ...state.domainWhitelistPending,
          [action.payload]: new Date().getTime(),
        };
      }

      return returned;
    },
    removeDomainWhitelistEntry(state, action) {
      const newDomainWhitelist = state.domainWhitelist.filter(
        (entry) => entry != null && entry !== action.payload,
      );

      const domainWhitelistPendingCopy = { ...state.domainWhitelistPending };
      delete domainWhitelistPendingCopy[action.payload];

      return {
        ...state,
        domainWhitelist: newDomainWhitelist,
        domainWhitelistPending: domainWhitelistPendingCopy,
      };
    },
    addPageWhitelistEntry(state, action) {
      let newPageWhitelist = state.pageWhitelist;
      let parsed = URL.parse(action.payload);
      if (!parsed) {
        parsed = URL.parse(`https://${action.payload}`);
        action.payload = `https://${action.payload}`;
      }

      if (!parsed) {
        return;
      }

      parsed.hash = "";
      const parsedToString = parsed.toString();
      if (newPageWhitelist.indexOf(parsedToString) === -1) {
        newPageWhitelist = newPageWhitelist.concat(parsedToString);
      }

      const returned = { ...state, pageWhitelist: newPageWhitelist };

      if (state.pageWhitelistHistory.indexOf(parsedToString) === -1) {
        returned.pageWhitelistPending = {
          ...state.pageWhitelistPending,
          [parsedToString]: new Date().getTime(),
        };
      }

      return returned;
    },
    removePageWhitelistEntry(state, action) {
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

      const newPageWhitelist = state.pageWhitelist.filter(
        (entry) => entry != null && entry !== strippedUrl,
      );

      const pageWhitelistPendingCopy = { ...state.pageWhitelistPending };
      delete pageWhitelistPendingCopy[strippedUrl];

      return {
        ...state,
        pageWhitelist: newPageWhitelist,
        pageWhitelistPending: pageWhitelistPendingCopy,
      };
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
    toggleIncludeBookmarks(state) {
      return {
        ...state,
        includeBookmarks: !state.includeBookmarks,
      };
    },
    toggleDownloadSync(state) {
      return {
        ...state,
        downloadSyncEnabled: !state.downloadSyncEnabled,
      };
    },
    toggleIncludeDownloads(state) {
      return {
        ...state,
        includeDownloads: !state.includeDownloads,
      };
    },
    toggleFormSync(state) {
      return {
        ...state,
        formSyncEnabled: !state.formSyncEnabled,
      };
    },
    toggleIncludeFormSubmissions(state) {
      return {
        ...state,
        includeFormSubmissions: !state.includeFormSubmissions,
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
          accessToken: state.accessToken,
          sessionToken: state.sessionToken,
          domainWhitelist: state.domainWhitelist,
          domainWhitelistPending: state.domainWhitelistPending,
          domainWhitelistHistory: state.domainWhitelistHistory,
          pageWhitelist: state.pageWhitelist,
          pageWhitelistPending: state.pageWhitelistPending,
          pageWhitelistHistory: state.pageWhitelistHistory,
          lastHistorySync: state.lastHistorySync,
          syncHistoryLogs: state.syncHistoryLogs,
          autoSyncEnabled: state.autoSyncEnabled,
          siteBlacklist: state.siteBlacklist,
          pageBlacklist: state.pageBlacklist,
          deviceId: state.deviceId,
          deviceName: state.deviceName,
          deviceType: state.deviceType,
          devicePlatform: state.devicePlatform,
          includeBookmarks: state.includeBookmarks,
          bookmarkSyncEnabled: state.bookmarkSyncEnabled,
          includeDownloads: state.includeDownloads,
          downloadSyncEnabled: state.downloadSyncEnabled,
          includeFormSubmissions: state.includeFormSubmissions,
          formSyncEnabled: state.formSyncEnabled,
        }),
      );
      browser.storage.local.set(parsed);

      return state;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(loadUserSettings.fulfilled, (state, action) => {
      for (const [key, value] of Object.entries(
        action.payload as Record<string, any>,
      )) {
        if (key in state) {
          (state as any)[key] = value;
        }
      }
    });
  },
});

// Action creators are generated for each case reducer function
export const {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry,
  setState,
  addSyncHistoryLog,
  clearSyncHistoryLogs,
  toggleAutoSync,
  toggleBookmarkSync,
  toggleIncludeBookmarks,
  toggleDownloadSync,
  toggleIncludeDownloads,
  toggleFormSync,
  toggleIncludeFormSubmissions,
  addSiteBlacklist,
  removeSiteBlacklist,
  addPageBlacklist,
  removePageBlacklist,
  saveUserSettings,
} = ciStateSlice.actions;

export default ciStateSlice.reducer;
