/**
 * @jest-environment node
 */
import {
  hasBookmarksApi,
  hasDownloadsApi,
  hasHistoryApi,
} from "./browserCapabilities";

type BrowserStub = {
  history?: { search?: unknown };
  bookmarks?: { getTree?: unknown };
  downloads?: { search?: unknown };
};

function installBrowser(stub: BrowserStub | undefined) {
  (global as { browser?: unknown }).browser = stub;
}

describe("browserCapabilities", () => {
  afterEach(() => {
    delete (global as { browser?: unknown }).browser;
  });

  it("reports all APIs present on a Chromium-like browser", () => {
    installBrowser({
      history: { search: jest.fn() },
      bookmarks: { getTree: jest.fn() },
      downloads: { search: jest.fn() },
    });

    expect(hasHistoryApi()).toBe(true);
    expect(hasBookmarksApi()).toBe(true);
    expect(hasDownloadsApi()).toBe(true);
  });

  it("reports all APIs missing on a Safari-like stub", () => {
    // Safari accepts the permissions but leaves the namespaces empty / absent.
    installBrowser({
      history: {},
      bookmarks: {},
      downloads: {},
    });

    expect(hasHistoryApi()).toBe(false);
    expect(hasBookmarksApi()).toBe(false);
    expect(hasDownloadsApi()).toBe(false);
  });

  it("is false when browser is undefined", () => {
    installBrowser(undefined);

    expect(hasHistoryApi()).toBe(false);
    expect(hasBookmarksApi()).toBe(false);
    expect(hasDownloadsApi()).toBe(false);
  });
});
