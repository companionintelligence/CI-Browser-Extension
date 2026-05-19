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
      const state = (store.getState() as { ciState: unknown }).ciState as {
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
      };
      expect(state).toEqual({
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
        serverEnvironmentId: null,
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
    it("should call browser.storage.local.set with current state", () => {
      const testState = {
        accessToken: "test-token",
        siteBlacklist: ["example.com"],
        pageBlacklist: ["https://example.com"],
      };

      (store.dispatch as (action: unknown) => unknown)(setState(testState));
      (store.dispatch as (action: unknown) => unknown)(saveUserSettings());

      // `saveUserSettings` does not persist accessToken (it's session-scoped via cookie refresh).
      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          siteBlacklist: ["example.com"],
          pageBlacklist: ["https://example.com"],
        }),
      );
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
        "serverDomain",
        "serverEnvironmentId",
      ]);
    });
  });
});
