import {
  toCaptureEvent,
  sourceIdFor,
  eventsUrl,
  sendCaptureEvents,
  SOURCE_SYSTEM,
  type BrowserActivity,
} from "./captureEvents";

function activity(over: Partial<BrowserActivity> = {}): BrowserActivity {
  return {
    time: "2024-01-02T03:04:05.000Z",
    device_id: "dev-1",
    url: "https://example.com/page",
    action_type: "visit",
    ...over,
  };
}

describe("eventsUrl", () => {
  it("builds /v1/events from a server URL, with or without a trailing slash", () => {
    expect(eventsUrl("https://hub.ci.computer")).toBe(
      "https://hub.ci.computer/v1/events",
    );
    expect(eventsUrl("https://hub.ci.computer/")).toBe(
      "https://hub.ci.computer/v1/events",
    );
    expect(eventsUrl("http://localhost:8080")).toBe(
      "http://localhost:8080/v1/events",
    );
  });
});

describe("sourceIdFor", () => {
  it("prefers an explicit bookmark/download id, else derives a deterministic key", () => {
    expect(
      sourceIdFor(
        activity({
          action_type: "bookmark",
          properties: { bookmark_id: "b9" },
        }),
      ),
    ).toBe("bookmark:b9");
    expect(
      sourceIdFor(
        activity({
          action_type: "download",
          properties: { download_id: "d3" },
        }),
      ),
    ).toBe("download:d3");
    expect(sourceIdFor(activity())).toBe(
      "visit:2024-01-02T03:04:05.000Z:https://example.com/page",
    );
  });

  it("honors an explicit source_id (e.g. distinct scrape items on one page)", () => {
    expect(
      sourceIdFor(
        activity({ action_type: "scrape", properties: { source_id: "s7" } }),
      ),
    ).toBe("scrape:s7");
  });

  it("is stable across calls (idempotency key)", () => {
    expect(sourceIdFor(activity())).toBe(sourceIdFor(activity()));
  });
});

describe("toCaptureEvent", () => {
  it("maps a browser activity to the CaptureEvent envelope", () => {
    const e = toCaptureEvent(
      activity({
        title: "Example",
        action_type: "visit",
        properties: { description: "a page", referrer: "https://x.com" },
        duration_seconds: 12,
        scroll_depth_percent: 80,
        is_incognito: false,
      }),
    );
    expect(e).toMatchObject({
      source_system: SOURCE_SYSTEM,
      kind: "browser.visit",
      occurred_at: "2024-01-02T03:04:05.000Z",
      title: "Example",
      description: "a page",
    });
    expect(e.payload).toMatchObject({
      url: "https://example.com/page",
      device_id: "dev-1",
      action_type: "visit",
      referrer: "https://x.com",
      duration_seconds: 12,
      scroll_depth_percent: 80,
      is_incognito: false,
    });
  });

  it("derives kind from action_type and omits title/description when absent", () => {
    const e = toCaptureEvent(activity({ action_type: "download" }));
    expect(e.kind).toBe("browser.download");
    expect(e.title).toBeUndefined();
    expect(e.description).toBeUndefined();
  });

  it("normalises a non-Z timestamp to a strict ISO instant", () => {
    expect(
      toCaptureEvent(activity({ time: "2024-03-04 05:06:07" })).occurred_at,
    ).toBe("2024-03-04T05:06:07.000Z");
  });
});

describe("sendCaptureEvents", () => {
  afterEach(() => jest.restoreAllMocks());

  it("POSTs {events} to /v1/events with the Bearer token and returns the counts", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ingested: 1, duplicate: 0, rejected: [] }),
    });
    (global as { fetch?: unknown }).fetch = fetchMock;

    const result = await sendCaptureEvents(
      "https://hub.ci.computer",
      "portal-jwt",
      [activity()],
    );
    expect(result).toEqual({ ingested: 1, duplicate: 0, rejected: [] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hub.ci.computer/v1/events");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer portal-jwt",
    );
    const body = JSON.parse(init.body as string);
    expect(body.events[0].source_system).toBe(SOURCE_SYSTEM);
  });

  it("no-ops (no fetch) for an empty batch", async () => {
    const fetchMock = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchMock;
    expect(await sendCaptureEvents("https://hub.ci.computer", "t", [])).toEqual(
      {
        ingested: 0,
        duplicate: 0,
        rejected: [],
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx so the caller can retry", async () => {
    (global as { fetch?: unknown }).fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401 });
    await expect(
      sendCaptureEvents("https://hub.ci.computer", "t", [activity()]),
    ).rejects.toThrow(/HTTP 401/);
  });
});
