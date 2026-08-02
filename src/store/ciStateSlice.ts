import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { parseUrl, normalizeServerUrl } from "@/utils";
import { DEFAULT_PORTAL_URL } from "@/services/portalConfig";

export const loadUserSettings = createAsyncThunk(
  "ciState/loadUserSettings",
  async () => {
    const settings = await browser.storage.local.get<Record<string, unknown>>([
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
      "sensitiveScrapingEnabled",
      "serverURL",
      "serverURLSource",
      "serverDomain",
      "portalUrl",
      "portalIssuer",
      "oidcTokens",
    ]);

    // One-time migration: the pre-rename `serverDomain` key held a bare host;
    // `serverURL` always carries a protocol.
    if (
      !settings.serverURL &&
      typeof settings.serverDomain === "string" &&
      settings.serverDomain
    ) {
      settings.serverURL = normalizeServerUrl(settings.serverDomain);
      await browser.storage.local.set({ serverURL: settings.serverURL });
      await browser.storage.local.remove("serverDomain");
    }

    // One-time migration: portalUrl replaces the never-surfaced portalIssuer
    // override (issuer = `${portalUrl}/api/auth`). A non-standard issuer that
    // doesn't end in /api/auth stays as a legacy override.
    if (
      !settings.portalUrl &&
      typeof settings.portalIssuer === "string" &&
      settings.portalIssuer
    ) {
      const stripped = settings.portalIssuer.replace(/\/api\/auth\/?$/, "");

      if (stripped !== settings.portalIssuer) {
        settings.portalUrl = normalizeServerUrl(stripped);
        await browser.storage.local.set({ portalUrl: settings.portalUrl });
        await browser.storage.local.remove("portalIssuer");
        delete settings.portalIssuer;
      }
    }

    // One-time migration: before portalUrl existed the issuer was derived from
    // serverURL, so a user with a live session on a non-prod server must keep
    // that host as their portal — defaulting to prod would orphan their
    // refresh tokens.
    if (
      !settings.portalUrl &&
      settings.oidcTokens &&
      typeof settings.serverURL === "string" &&
      settings.serverURL
    ) {
      const origin = parseUrl(settings.serverURL)?.origin;

      if (origin) {
        settings.portalUrl = origin;
        await browser.storage.local.set({ portalUrl: origin });
      }
    }

    delete settings.oidcTokens;

    // Existing serverURL values were configured by hand or the old wizard;
    // mark them manual so portal app discovery never clobbers them.
    if (settings.serverURL && !settings.serverURLSource) {
      settings.serverURLSource = "manual";
      await browser.storage.local.set({ serverURLSource: "manual" });
    }

    // The curated server-environment picker is gone (portal discovery
    // replaced it).
    await browser.storage.local.remove("serverEnvironmentId");

    return settings;
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
  serverURL: string;
  // How serverURL was set: "auto" (portal app discovery) may be overwritten by
  // a later discovery; "manual" never is.
  serverURLSource: "auto" | "manual" | null;
  // CI-Portal origin the OIDC flow runs against (issuer = `${portalUrl}/api/auth`).
  portalUrl: string;
  // Legacy explicit issuer override; still honored when present in storage but
  // no longer written (see services/portalConfig).
  portalIssuer: string | null;
  // Transient post-sign-in guidance (e.g. "no Memory app found"); not persisted.
  discoveryHint: string | null;
  // Memory candidates needing a user decision (Memory installed on several
  // devices and no valid serverURL); transient, not persisted — discovery
  // repopulates it after a service-worker restart.
  memoryAppChoices:
    | { slug: string; url: string; deviceName?: string; deviceSlug?: string }[]
    | null;
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
  /**
   * Opt-in for scrape profiles marked `sensitive` (brokerage holdings and
   * order history). Off unless the user turns it on — see @/lib/scrapeSettings.
   */
  sensitiveScrapingEnabled: boolean;
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
    serverURL: "",
    serverURLSource: null,
    portalUrl: DEFAULT_PORTAL_URL,
    portalIssuer: null,
    discoveryHint: null,
    memoryAppChoices: null,
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
    sensitiveScrapingEnabled: false, // Financial data is never captured by default
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
    toggleSensitiveScraping(state) {
      return {
        ...state,
        sensitiveScrapingEnabled: !state.sensitiveScrapingEnabled,
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
          sensitiveScrapingEnabled: state.sensitiveScrapingEnabled,
          serverURL: state.serverURL,
          serverURLSource: state.serverURLSource,
          portalUrl: state.portalUrl,
        }),
      );
      browser.storage.local.set(parsed);

      return state;
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
  toggleSensitiveScraping,
  addSiteBlacklist,
  removeSiteBlacklist,
  addPageBlacklist,
  removePageBlacklist,
  saveUserSettings,
} = ciStateSlice.actions;

export default ciStateSlice.reducer;
