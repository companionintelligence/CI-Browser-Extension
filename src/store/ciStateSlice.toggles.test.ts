import { configureStore } from "@reduxjs/toolkit";

import ciStateReducer, {
  loadUserSettings,
  saveUserSettings,
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
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

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const simpleToggles: {
  name: string;
  action: () => { type: string };
  field: string;
}[] = [
  { name: "toggleAutoSync", action: toggleAutoSync, field: "autoSyncEnabled" },
  {
    name: "toggleBookmarkSync",
    action: toggleBookmarkSync,
    field: "bookmarkSyncEnabled",
  },
  {
    name: "toggleDownloadSync",
    action: toggleDownloadSync,
    field: "downloadSyncEnabled",
  },
];

describe("ciStateSlice toggles", () => {
  let store: { dispatch: unknown; getState: () => unknown };

  const dispatch = (action: unknown) =>
    (store.dispatch as (action: unknown) => unknown)(action);
  const ciState = (): Record<string, unknown> =>
    (store.getState() as { ciState: Record<string, unknown> }).ciState;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ciState: ciStateReducer,
      },
    });
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(NOW);

    // toggleHistorySync chains .catch() onto these calls, so they must return promises.
    mockBrowserStorage.local.get.mockResolvedValue({});
    mockBrowserStorage.local.set.mockResolvedValue(undefined);
    mockBrowserStorage.local.remove.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe.each(simpleToggles)("$name", ({ action, field }) => {
    it("flips only its own flag, in both directions", () => {
      const before = ciState();
      expect(before[field]).toBe(false);

      dispatch(action());
      expect(ciState()).toEqual({ ...before, [field]: true });

      dispatch(action());
      expect(ciState()).toEqual(before);
    });

    it("writes nothing to storage on its own", () => {
      dispatch(action());

      expect(mockBrowserStorage.local.set).not.toHaveBeenCalled();
      expect(mockBrowserStorage.local.remove).not.toHaveBeenCalled();
    });

    it("is persisted under its own key once saveUserSettings runs", () => {
      dispatch(action());
      dispatch(saveUserSettings());

      expect(mockBrowserStorage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ [field]: true }),
      );
    });
  });

  describe("toggleHistorySync", () => {
    it("turning history off changes only the flag and touches no storage", () => {
      const before = ciState();
      expect(before.historySyncEnabled).toBe(true);

      dispatch(toggleHistorySync());

      expect(ciState()).toEqual({ ...before, historySyncEnabled: false });
      expect(mockBrowserStorage.local.remove).not.toHaveBeenCalled();
      expect(mockBrowserStorage.local.set).not.toHaveBeenCalled();
    });

    it("turning history back on clears the synced-history cache and stamps the time", () => {
      dispatch(toggleHistorySync()); // off
      dispatch(toggleHistorySync()); // on

      expect(ciState().historySyncEnabled).toBe(true);
      // "syncedHistory" must match SYNCED_HISTORY_KEY in background.ts. The
      // manual sync skips that cache whenever historySyncReEnabledAt is set.
      expect(mockBrowserStorage.local.remove.mock.calls).toEqual([
        ["syncedHistory"],
      ]);
      expect(mockBrowserStorage.local.set.mock.calls).toEqual([
        [{ historySyncReEnabledAt: NOW }],
      ]);
    });

    it("each re-enable clears the cache again and stamps its own time", () => {
      dispatch(toggleHistorySync()); // off
      dispatch(toggleHistorySync()); // on

      jest.spyOn(Date, "now").mockReturnValue(NOW + 60_000);
      dispatch(toggleHistorySync()); // off
      dispatch(toggleHistorySync()); // on

      expect(mockBrowserStorage.local.remove.mock.calls).toEqual([
        ["syncedHistory"],
        ["syncedHistory"],
      ]);
      expect(mockBrowserStorage.local.set.mock.calls).toEqual([
        [{ historySyncReEnabledAt: NOW }],
        [{ historySyncReEnabledAt: NOW + 60_000 }],
      ]);
    });

    it("re-enabling a switch loaded as off from storage clears the cache too", async () => {
      mockBrowserStorage.local.get.mockResolvedValue({
        historySyncEnabled: false,
      });
      await dispatch(loadUserSettings());
      expect(ciState().historySyncEnabled).toBe(false);

      // loadUserSettings also touches storage; count only the toggle's writes.
      jest.clearAllMocks();
      dispatch(toggleHistorySync());

      expect(ciState().historySyncEnabled).toBe(true);
      expect(mockBrowserStorage.local.remove.mock.calls).toEqual([
        ["syncedHistory"],
      ]);
      expect(mockBrowserStorage.local.set.mock.calls).toEqual([
        [{ historySyncReEnabledAt: NOW }],
      ]);
    });

    it("logs rejected storage writes instead of throwing, and still flips", async () => {
      const removeError = new Error("remove failed");
      const setError = new Error("set failed");
      mockBrowserStorage.local.remove.mockRejectedValueOnce(removeError);
      mockBrowserStorage.local.set.mockRejectedValueOnce(setError);

      dispatch(toggleHistorySync()); // off
      expect(() => dispatch(toggleHistorySync())).not.toThrow(); // on
      await flushPromises();

      expect(ciState().historySyncEnabled).toBe(true);
      expect(console.error).toHaveBeenCalledWith(removeError);
      expect(console.error).toHaveBeenCalledWith(setError);
    });

    it("saving after turning off persists historySyncEnabled as false", () => {
      dispatch(toggleHistorySync()); // off
      dispatch(saveUserSettings());

      expect(mockBrowserStorage.local.set).toHaveBeenCalledTimes(1);
      expect(mockBrowserStorage.local.set.mock.calls[0][0]).toMatchObject({
        historySyncEnabled: false,
      });
    });

    it("saving after turning back on persists the switch but never the stamp or the cache", () => {
      dispatch(toggleHistorySync()); // off
      dispatch(toggleHistorySync()); // on
      jest.clearAllMocks();

      dispatch(saveUserSettings());

      expect(mockBrowserStorage.local.set).toHaveBeenCalledTimes(1);
      const persisted = mockBrowserStorage.local.set.mock.calls[0][0];
      expect(persisted.historySyncEnabled).toBe(true);
      expect(persisted).not.toHaveProperty("historySyncReEnabledAt");
      expect(persisted).not.toHaveProperty("syncedHistory");
    });
  });
});
