import { configureStore } from "@reduxjs/toolkit";
import ciStateReducer, {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry,
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

(global as any).browser = {
  storage: mockBrowserStorage,
};

describe("ciStateSlice", () => {
  let store: any;

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
      const state = store.getState().ciState;
      expect(state).toEqual({
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

      store.dispatch(setState(newState));
      const state = store.getState().ciState;

      expect(state.domain).toBe("example.com");
      expect(state.url).toBe("https://example.com");
      expect(state.accessToken).toBe("test-token");
    });

    it("should preserve existing state when updating partial state", () => {
      // Set initial state
      store.dispatch(
        setState({ domain: "initial.com", accessToken: "token1" }),
      );

      // Update only domain
      store.dispatch(setState({ domain: "updated.com" }));

      const state = store.getState().ciState;
      expect(state.domain).toBe("updated.com");
      expect(state.accessToken).toBe("token1"); // Should be preserved
    });
  });

  describe("addDomainWhitelistEntry", () => {
    it("should add new domain to whitelist", () => {
      store.dispatch(addDomainWhitelistEntry("example.com"));
      const state = store.getState().ciState;

      expect(state.domainWhitelist).toContain("example.com");
    });

    it("should not add duplicate domains", () => {
      store.dispatch(addDomainWhitelistEntry("example.com"));
      store.dispatch(addDomainWhitelistEntry("example.com"));
      const state = store.getState().ciState;

      expect(
        state.domainWhitelist.filter((d: string) => d === "example.com"),
      ).toHaveLength(1);
    });

    it("should add domain to pending list if not in history", () => {
      store.dispatch(addDomainWhitelistEntry("example.com"));
      const state = store.getState().ciState;

      expect(state.domainWhitelistPending["example.com"]).toBeDefined();
      expect(typeof state.domainWhitelistPending["example.com"]).toBe("number");
    });

    it("should not add to pending if domain is in history", () => {
      // First set up history
      store.dispatch(
        setState({
          domainWhitelistHistory: ["example.com"],
        }),
      );

      store.dispatch(addDomainWhitelistEntry("example.com"));
      const state = store.getState().ciState;

      expect(state.domainWhitelistPending["example.com"]).toBeUndefined();
    });
  });

  describe("removeDomainWhitelistEntry", () => {
    it("should remove domain from whitelist", () => {
      // Add domain first
      store.dispatch(addDomainWhitelistEntry("example.com"));
      store.dispatch(addDomainWhitelistEntry("google.com"));

      // Remove one domain
      store.dispatch(removeDomainWhitelistEntry("example.com"));
      const state = store.getState().ciState;

      expect(state.domainWhitelist).not.toContain("example.com");
      expect(state.domainWhitelist).toContain("google.com");
    });

    it("should remove domain from pending list", () => {
      // Add domain first (which adds to pending)
      store.dispatch(addDomainWhitelistEntry("example.com"));

      // Verify it's in pending
      let state = store.getState().ciState;
      expect(state.domainWhitelistPending["example.com"]).toBeDefined();

      // Remove domain
      store.dispatch(removeDomainWhitelistEntry("example.com"));
      state = store.getState().ciState;

      expect(state.domainWhitelistPending["example.com"]).toBeUndefined();
    });
  });

  describe("addPageWhitelistEntry", () => {
    beforeEach(() => {
      // Mock URL.parse for testing
      (global as any).URL = {
        ...URL,
        parse: jest.fn(),
      };
    });

    it("should add valid URL to page whitelist", () => {
      const mockParsedUrl = {
        hash: "section1",
        toString: () => "https://example.com/page",
      };
      ((global as any).URL.parse as jest.Mock).mockReturnValue(mockParsedUrl);

      store.dispatch(
        addPageWhitelistEntry("https://example.com/page#section1"),
      );
      const state = store.getState().ciState;

      expect(state.pageWhitelist).toContain("https://example.com/page");
      expect(mockParsedUrl.hash).toBe(""); // Should be cleared
    });

    it("should try https:// prefix if URL.parse fails initially", () => {
      const mockParsedUrl = {
        hash: "",
        toString: () => "https://example.com",
      };

      // First call returns null, second call returns parsed URL
      ((global as any).URL.parse as jest.Mock)
        .mockReturnValueOnce(null)
        .mockReturnValue(mockParsedUrl);

      store.dispatch(addPageWhitelistEntry("example.com"));
      const state = store.getState().ciState;

      expect(state.pageWhitelist).toContain("https://example.com");
      expect((global as any).URL.parse).toHaveBeenCalledWith("example.com");
      expect((global as any).URL.parse).toHaveBeenCalledWith(
        "https://example.com",
      );
    });

    it("should not add invalid URLs", () => {
      ((global as any).URL.parse as jest.Mock).mockReturnValue(null);

      store.dispatch(addPageWhitelistEntry("invalid-url"));
      const state = store.getState().ciState;

      expect(state.pageWhitelist).toHaveLength(0);
    });

    it("should not add duplicate pages", () => {
      const mockParsedUrl = {
        hash: "",
        toString: () => "https://example.com",
      };
      ((global as any).URL.parse as jest.Mock).mockReturnValue(mockParsedUrl);

      store.dispatch(addPageWhitelistEntry("https://example.com"));
      store.dispatch(addPageWhitelistEntry("https://example.com"));
      const state = store.getState().ciState;

      expect(
        state.pageWhitelist.filter((p: string) => p === "https://example.com"),
      ).toHaveLength(1);
    });
  });

  describe("removePageWhitelistEntry", () => {
    it("should remove page from whitelist", () => {
      // Mock URL.parse to return different values for different inputs
      const mockParse = jest.fn().mockImplementation((url: string) => {
        if (url === "https://example.com") {
          return {
            hash: "",
            toString: () => "https://example.com",
          };
        } else if (url === "https://google.com") {
          return {
            hash: "",
            toString: () => "https://google.com",
          };
        }

        return null;
      });

      (global as any).URL.parse = mockParse;

      // Add pages first
      store.dispatch(addPageWhitelistEntry("https://example.com"));
      store.dispatch(addPageWhitelistEntry("https://google.com"));

      // Verify both were added
      let state = store.getState().ciState;
      expect(state.pageWhitelist).toContain("https://example.com");
      expect(state.pageWhitelist).toContain("https://google.com");

      // Remove one page
      store.dispatch(removePageWhitelistEntry("https://example.com"));
      state = store.getState().ciState;

      expect(state.pageWhitelist).not.toContain("https://example.com");
      expect(state.pageWhitelist).toContain("https://google.com");
    });
  });

  describe("saveUserSettings", () => {
    it("should call browser.storage.local.set with current state", () => {
      const testState = {
        accessToken: "test-token",
        sessionToken: "test-session",
        domainWhitelist: ["example.com"],
        pageWhitelist: ["https://example.com"],
      };

      store.dispatch(setState(testState));
      store.dispatch(saveUserSettings());

      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "test-token",
          sessionToken: "test-session",
          domainWhitelist: ["example.com"],
          pageWhitelist: ["https://example.com"],
        }),
      );
    });
  });

  describe("loadUserSettings", () => {
    it("should load settings from browser storage", async () => {
      const mockStorageData = {
        accessToken: "stored-token",
        domainWhitelist: ["stored-domain.com"],
        pageWhitelist: ["https://stored-page.com"],
      };

      mockBrowserStorage.local.get.mockResolvedValue(mockStorageData);

      await store.dispatch(loadUserSettings());
      const state = store.getState().ciState;

      expect(state.accessToken).toBe("stored-token");
      expect(state.domainWhitelist).toEqual(["stored-domain.com"]);
      expect(state.pageWhitelist).toEqual(["https://stored-page.com"]);
    });

    it("should call browser.storage.local.get with correct keys", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({});

      await store.dispatch(loadUserSettings());

      expect(mockBrowserStorage.local.get).toHaveBeenCalledWith([
        "accessToken",
        "sessionToken",
        "domainWhitelist",
        "domainWhitelistPending",
        "domainWhitelistHistory",
        "pageWhitelist",
        "pageWhitelistPending",
        "pageWhitelistHistory",
      ]);
    });
  });
});
