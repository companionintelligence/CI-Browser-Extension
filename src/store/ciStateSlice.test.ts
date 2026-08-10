import { configureStore } from "@reduxjs/toolkit";
import ciStateReducer, {
  setState,
  saveUserSettings,
  loadUserSettings,
} from "./ciStateSlice";

// Mock browser storage API
const mockBrowserStorage = {
  local: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
};

(global as { browser?: { storage?: unknown } }).browser = {
  storage: mockBrowserStorage,
};

describe("ciStateSlice", () => {
  let store: { dispatch: unknown; getState: () => unknown };

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ciState: ciStateReducer,
      },
    });
    jest.clearAllMocks();
  });

  describe("initialState", () => {
    it("should have correct initial state", () => {
      const state = (store.getState() as { ciState: unknown }).ciState;
      expect(state).toEqual({
        accessToken: null,
        url: null,
        domain: null,
        lastUrl: null,
        historySyncInProgress: false,
        historySyncStatus: null,
        historySyncProgress: null,
        lastHistorySync: null,
        syncHistoryLogs: [],
        refreshing: false,
        serverURL: "",
        serverURLSource: null,
        portalUrl: "https://hub.ci.computer",
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
        historySyncEnabled: true,
        // Financial scrape profiles are never captured without an explicit opt-in
        sensitiveScrapingEnabled: false,
      });
    });
  });

  describe("setState", () => {
    it("should update state with provided values", () => {
      const newState = {
        domain: "example.com",
        url: "https://example.com",
        accessToken: "test-token",
      };

      (store.dispatch as (action: unknown) => unknown)(setState(newState));
      const state = (store.getState() as { ciState: unknown }).ciState as {
        domain: string | null;
        url: string | null;
        accessToken: string | null;
      };

      expect(state.domain).toBe("example.com");
      expect(state.url).toBe("https://example.com");
      expect(state.accessToken).toBe("test-token");
    });

    it("should preserve existing state when updating partial state", () => {
      // Set initial state
      (store.dispatch as (action: unknown) => unknown)(
        setState({ domain: "initial.com", accessToken: "token1" }),
      );

      // Update only domain
      (store.dispatch as (action: unknown) => unknown)(
        setState({ domain: "updated.com" }),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        domain: string | null;
        accessToken: string | null;
      };
      expect(state.domain).toBe("updated.com");
      expect(state.accessToken).toBe("token1"); // Should be preserved
    });
  });

  describe("saveUserSettings", () => {
    it("should persist settings to browser.storage.local", () => {
      const testState = {
        siteBlacklist: ["example.com"],
        pageBlacklist: ["https://example.com"],
        serverURL: "https://ci.example.com",
      };

      (store.dispatch as (action: unknown) => unknown)(setState(testState));
      (store.dispatch as (action: unknown) => unknown)(saveUserSettings());

      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          siteBlacklist: ["example.com"],
          pageBlacklist: ["https://example.com"],
          serverURL: "https://ci.example.com",
        }),
      );
    });

    it("should not persist the access token", () => {
      (store.dispatch as (action: unknown) => unknown)(
        setState({ accessToken: "test-token" }),
      );
      (store.dispatch as (action: unknown) => unknown)(saveUserSettings());

      const persisted = mockBrowserStorage.local.set.mock.calls[0][0];
      expect(persisted).not.toHaveProperty("accessToken");
    });

    it("persists portalUrl and serverURLSource but not the legacy portalIssuer", () => {
      (store.dispatch as (action: unknown) => unknown)(
        setState({
          portalUrl: "https://hub.companionintel.com",
          serverURLSource: "auto",
          portalIssuer: "https://legacy.example.com/api/auth",
        }),
      );
      (store.dispatch as (action: unknown) => unknown)(saveUserSettings());

      const persisted = mockBrowserStorage.local.set.mock.calls[0][0];
      expect(persisted.portalUrl).toBe("https://hub.companionintel.com");
      expect(persisted.serverURLSource).toBe("auto");
      expect(persisted).not.toHaveProperty("portalIssuer");
      expect(persisted).not.toHaveProperty("discoveryHint");
      expect(persisted).not.toHaveProperty("memoryAppChoices");
    });
  });

  describe("loadUserSettings", () => {
    it("should load settings from browser storage", async () => {
      const mockStorageData = {
        accessToken: "stored-token",
        siteBlacklist: ["stored-domain.com"],
        pageBlacklist: ["https://stored-page.com"],
      };

      mockBrowserStorage.local.get.mockResolvedValue(mockStorageData);

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );
      const state = (store.getState() as { ciState: unknown }).ciState as {
        accessToken: string | null;
        siteBlacklist: string[];
        pageBlacklist: string[];
      };

      expect(state.accessToken).toBe("stored-token");
      expect(state.siteBlacklist).toEqual(["stored-domain.com"]);
      expect(state.pageBlacklist).toEqual(["https://stored-page.com"]);
    });

    it("should call browser.storage.local.get with correct keys", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({});

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      expect(mockBrowserStorage.local.get).toHaveBeenCalledWith([
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
    });

    it("migrates a legacy serverDomain (bare host) to serverURL", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        serverDomain: "ci.example.com",
      });

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        serverURL: string;
      };
      expect(state.serverURL).toBe("https://ci.example.com");
      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith({
        serverURL: "https://ci.example.com",
      });
      expect(mockBrowserStorage.local.remove).toHaveBeenCalledWith(
        "serverDomain",
      );
    });

    it("migrates a legacy portalIssuer to portalUrl", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        portalIssuer: "https://portal.example.com/api/auth",
      });

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        portalUrl: string;
        portalIssuer: string | null;
      };
      expect(state.portalUrl).toBe("https://portal.example.com");
      expect(state.portalIssuer).toBeNull();
      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith({
        portalUrl: "https://portal.example.com",
      });
      expect(mockBrowserStorage.local.remove).toHaveBeenCalledWith(
        "portalIssuer",
      );
    });

    it("keeps a non-standard portalIssuer as a legacy override", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        portalIssuer: "https://portal.example.com/custom-issuer",
      });

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        portalUrl: string;
        portalIssuer: string | null;
      };
      expect(state.portalUrl).toBe("https://hub.ci.computer");
      expect(state.portalIssuer).toBe(
        "https://portal.example.com/custom-issuer",
      );
      expect(mockBrowserStorage.local.remove).not.toHaveBeenCalledWith(
        "portalIssuer",
      );
    });

    it("derives portalUrl from serverURL for a live pre-portalUrl session", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        serverURL: "https://dev.ci.computer",
        oidcTokens: { access_token: "at", id_token: "it" },
      });

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        portalUrl: string;
        serverURLSource: string | null;
      };
      expect(state.portalUrl).toBe("https://dev.ci.computer");
      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith({
        portalUrl: "https://dev.ci.computer",
      });
      // The stored token blob must never be copied into Redux
      expect(state).not.toHaveProperty("oidcTokens");
    });

    it("defaults portalUrl to prod when there is no prior session", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        serverURL: "https://dev.ci.computer",
      });

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        portalUrl: string;
      };
      expect(state.portalUrl).toBe("https://hub.ci.computer");
    });

    it("marks a pre-existing serverURL as manually configured", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        serverURL: "https://ci.example.com",
      });

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        serverURLSource: string | null;
      };
      expect(state.serverURLSource).toBe("manual");
      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith({
        serverURLSource: "manual",
      });
    });

    it("removes the obsolete serverEnvironmentId key", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({});

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      expect(mockBrowserStorage.local.remove).toHaveBeenCalledWith(
        "serverEnvironmentId",
      );
    });

    it("force-off bookmark/download sync when those APIs are missing", async () => {
      // Test browser mock has no bookmarks/downloads namespaces (Safari-like).
      mockBrowserStorage.local.get.mockResolvedValue({
        bookmarkSyncEnabled: true,
        downloadSyncEnabled: true,
      });

      await (store.dispatch as (action: unknown) => unknown)(
        loadUserSettings(),
      );

      const state = (store.getState() as { ciState: unknown }).ciState as {
        bookmarkSyncEnabled: boolean;
        downloadSyncEnabled: boolean;
      };
      expect(state.bookmarkSyncEnabled).toBe(false);
      expect(state.downloadSyncEnabled).toBe(false);
      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith({
        bookmarkSyncEnabled: false,
        downloadSyncEnabled: false,
      });
    });
  });
});
