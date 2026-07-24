import {
  fetchPortalApps,
  meAppsUrl,
  memoryAppsFrom,
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

  describe("memoryAppsFrom", () => {
    it("returns an empty list when there is no memory app", () => {
      expect(memoryAppsFrom([])).toEqual([]);
      expect(
        memoryAppsFrom([{ slug: "hub", url: "https://hub.example.com" }]),
      ).toEqual([]);
    });

    it("returns memory apps with normalized URLs", () => {
      expect(
        memoryAppsFrom([
          {
            slug: MEMORY_APP_SLUG,
            url: "https://mem.example.com/",
            deviceName: "Den",
          },
        ]),
      ).toEqual([
        {
          slug: MEMORY_APP_SLUG,
          url: "https://mem.example.com",
          deviceName: "Den",
        },
      ]);
    });

    it("keeps one entry per device, deduplicated by URL", () => {
      const apps = memoryAppsFrom([
        { slug: MEMORY_APP_SLUG, url: "https://one.example.com" },
        { slug: MEMORY_APP_SLUG, url: "https://two.example.com" },
        { slug: MEMORY_APP_SLUG, url: "https://one.example.com/" },
        { slug: "hub", url: "https://hub.example.com" },
      ]);

      expect(apps.map((app) => app.url)).toEqual([
        "https://one.example.com",
        "https://two.example.com",
      ]);
    });
  });
});
