import {
  fetchPortalApps,
  meAppsUrl,
  selectMemoryAppUrl,
  MEMORY_APP_SLUG,
} from "./portalApps";

function jsonResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("portalApps", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { fetch?: unknown }).fetch;
  });

  describe("meAppsUrl", () => {
    it("builds the endpoint URL and strips trailing slashes", () => {
      expect(meAppsUrl("https://hub.ci.computer", "ci-memory")).toBe(
        "https://hub.ci.computer/api/users/me/apps?slug=ci-memory",
      );
      expect(meAppsUrl("https://hub.ci.computer///", "ci-memory")).toBe(
        "https://hub.ci.computer/api/users/me/apps?slug=ci-memory",
      );
    });
  });

  describe("fetchPortalApps", () => {
    it("returns ok with the apps list and sends the Bearer token", async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          apps: [{ slug: "ci-memory", url: "https://mem.example.com" }],
        }),
      );
      (global as { fetch?: unknown }).fetch = fetchMock;

      const result = await fetchPortalApps("https://hub.ci.computer", "tok-1");

      expect(result).toEqual({
        status: "ok",
        apps: [{ slug: "ci-memory", url: "https://mem.example.com" }],
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "https://hub.ci.computer/api/users/me/apps?slug=ci-memory",
        expect.objectContaining({
          headers: { Authorization: "Bearer tok-1" },
        }),
      );
    });

    it("returns ok with empty apps for a malformed body", async () => {
      (global as { fetch?: unknown }).fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(200, { nope: true }));

      const result = await fetchPortalApps("https://hub.ci.computer", "t");

      expect(result).toEqual({ status: "ok", apps: [] });
    });

    it("maps 404 to unsupported (older portal)", async () => {
      (global as { fetch?: unknown }).fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(404));

      const result = await fetchPortalApps("https://hub.ci.computer", "t");

      expect(result).toEqual({ status: "unsupported" });
    });

    it("maps 401 to unauthorized", async () => {
      (global as { fetch?: unknown }).fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(401));

      const result = await fetchPortalApps("https://hub.ci.computer", "t");

      expect(result).toEqual({ status: "unauthorized" });
    });

    it("maps other HTTP failures to error", async () => {
      (global as { fetch?: unknown }).fetch = jest
        .fn()
        .mockResolvedValue(jsonResponse(500));

      const result = await fetchPortalApps("https://hub.ci.computer", "t");

      expect(result).toEqual({ status: "error", error: "HTTP 500" });
    });

    it("maps network failures to error", async () => {
      (global as { fetch?: unknown }).fetch = jest
        .fn()
        .mockRejectedValue(new Error("network down"));

      const result = await fetchPortalApps("https://hub.ci.computer", "t");

      expect(result).toEqual({ status: "error", error: "network down" });
    });
  });

  describe("selectMemoryAppUrl", () => {
    it("returns null when there is no memory app", () => {
      expect(selectMemoryAppUrl([])).toBeNull();
      expect(
        selectMemoryAppUrl([{ slug: "hub", url: "https://hub.example.com" }]),
      ).toBeNull();
    });

    it("returns the normalized URL of the memory app", () => {
      expect(
        selectMemoryAppUrl([
          { slug: MEMORY_APP_SLUG, url: "https://mem.example.com/" },
        ]),
      ).toBe("https://mem.example.com");
    });

    it("prefers the first memory app when several devices run one", () => {
      expect(
        selectMemoryAppUrl([
          { slug: MEMORY_APP_SLUG, url: "https://one.example.com" },
          { slug: MEMORY_APP_SLUG, url: "https://two.example.com" },
        ]),
      ).toBe("https://one.example.com");
    });
  });
});
