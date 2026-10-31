/**
 * @jest-environment node
 */
import {
  hasBookmarksApi,
  hasDownloadsApi,
  hasHistoryApi,
  registerWebNavigationListeners,
} from "./browserCapabilities";

type BrowserStub = {
  history?: { search?: unknown };
  bookmarks?: { getTree?: unknown };
  downloads?: { search?: unknown };
  webNavigation?: {
    onCompleted?: { addListener?: jest.Mock };
    onHistoryStateUpdated?: { addListener?: jest.Mock };
  };
};

function installBrowser(stub: BrowserStub | undefined) {
  (global as { browser?: unknown }).browser = stub;
}

describe("browserCapabilities", () => {
  afterEach(() => {
    delete (global as { browser?: unknown }).browser;
  });

  it("reports all APIs present on a Chromium-like browser", () => {
    const completed = jest.fn();
    const historyStateUpdated = jest.fn();
    installBrowser({
      history: { search: jest.fn() },
      bookmarks: { getTree: jest.fn() },
      downloads: { search: jest.fn() },
      webNavigation: {
        onCompleted: { addListener: completed },
        onHistoryStateUpdated: { addListener: historyStateUpdated },
      },
    });

    expect(hasHistoryApi()).toBe(true);
    expect(hasBookmarksApi()).toBe(true);
    expect(hasDownloadsApi()).toBe(true);

    const listener = jest.fn();
    registerWebNavigationListeners(listener);
    expect(completed).toHaveBeenCalledWith(listener);
    expect(historyStateUpdated).toHaveBeenCalledWith(listener);
  });

  it("reports all APIs missing on a Safari-like stub", () => {
    // Safari accepts the permissions but leaves the namespaces empty / absent.
    const completed = jest.fn();
    installBrowser({
      history: {},
      bookmarks: {},
      downloads: {},
      webNavigation: { onCompleted: { addListener: completed } },
    });

    expect(hasHistoryApi()).toBe(false);
    expect(hasBookmarksApi()).toBe(false);
    expect(hasDownloadsApi()).toBe(false);

    const listener = jest.fn();
    expect(() => registerWebNavigationListeners(listener)).not.toThrow();
    expect(completed).toHaveBeenCalledWith(listener);
  });

  it("is false when browser is undefined", () => {
    installBrowser(undefined);

    expect(hasHistoryApi()).toBe(false);
    expect(hasBookmarksApi()).toBe(false);
    expect(hasDownloadsApi()).toBe(false);
    expect(() => registerWebNavigationListeners(jest.fn())).not.toThrow();
  });
});
