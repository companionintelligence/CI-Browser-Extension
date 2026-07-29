import {
  browserActivityUrl,
  contentsUrl,
  isContentCapture,
  toBrowserActivityRecord,
  toBookmarkContentRecord,
  toHighlightContentRecord,
  sendBrowserCaptures,
  sourceIdFor,
  toInstant,
  SOURCE_SYSTEM,
  type BrowserActivity,
} from "./browserActivity";

function activity(over: Partial<BrowserActivity> = {}): BrowserActivity {
  return {
    time: "2024-01-02T03:04:05.000Z",
    device_id: "dev-1",
    url: "https://example.com/page",
    action_type: "visit",
    ...over,
  };
}

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("url builders", () => {
  // The `/api` prefix is the gateway's — CI-Server mounts the controller at `v1`
  // and the gateway 405s a bare `/v1/...` without ever reaching the API.
  it("build /api/v1 paths, collapsing trailing slashes", () => {
    expect(browserActivityUrl("https://hub.ci.computer")).toBe(
      "https://hub.ci.computer/api/v1/browser-activity",
    );
    expect(browserActivityUrl("http://localhost:8642///")).toBe(
      "http://localhost:8642/api/v1/browser-activity",
    );
    expect(contentsUrl("https://hub.ci.computer/")).toBe(
      "https://hub.ci.computer/api/v1/contents",
    );
  });
});

describe("isContentCapture", () => {
  it("routes bookmarks and highlights to content", () => {
    expect(isContentCapture(activity({ action_type: "bookmark" }))).toBe(true);
    expect(isContentCapture(activity({ action_type: "highlight" }))).toBe(true);
  });

  it("leaves visits, searches, downloads and scrapes on browser-activity", () => {
    expect(isContentCapture(activity({ action_type: "visit" }))).toBe(false);
    expect(isContentCapture(activity({ action_type: "search" }))).toBe(false);
    expect(isContentCapture(activity({ action_type: "download" }))).toBe(false);
    expect(isContentCapture(activity({ action_type: "scrape" }))).toBe(false);
  });
});

describe("toInstant", () => {
  it("passes an ISO instant through", () => {
    expect(toInstant("2024-01-02T03:04:05.000Z")).toBe(
      "2024-01-02T03:04:05.000Z",
    );
  });

  // A zoneless stamp is UTC, not local time — otherwise the same history import
  // lands at a different instant depending on the machine's zone.
  it("treats a zoneless 'YYYY-MM-DD HH:MM:SS' as UTC", () => {
    expect(toInstant("2024-01-02 03:04:05")).toBe("2024-01-02T03:04:05.000Z");
  });

  it("falls back to the epoch rather than emitting an invalid datetime", () => {
    expect(toInstant("not a date")).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("sourceIdFor", () => {
  it("prefers an explicit browser id (bookmark / download)", () => {
    expect(
      sourceIdFor(
        activity({
          action_type: "bookmark",
          properties: { bookmark_id: "b1" },
        }),
      ),
    ).toBe("bookmark:b1");
    expect(
      sourceIdFor(
        activity({
          action_type: "download",
          properties: { download_id: "d3" },
        }),
      ),
    ).toBe("download:d3");
  });

  it("otherwise derives a deterministic action:instant:url key", () => {
    expect(sourceIdFor(activity())).toBe(
      "visit:2024-01-02T03:04:05.000Z:https://example.com/page",
    );
  });

  // Distinct scraped items on one page/timestamp must not collapse into one row.
  it("honors an explicit source_id (e.g. per-item scrape keys)", () => {
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

describe("toBrowserActivityRecord", () => {
  it("maps an activity to the /v1/browser-activity record with provenance", () => {
    const r = toBrowserActivityRecord(
      activity({
        device_id: UUID,
        title: "Example",
        properties: { referrer: "https://x.com" },
        duration_seconds: 12,
        scroll_depth_percent: 80,
        is_incognito: false,
      }),
    );
    expect(r).toMatchObject({
      time: "2024-01-02T03:04:05.000Z",
      url: "https://example.com/page",
      title: "Example",
      action_type: "visit",
      device_id: UUID,
      duration_seconds: 12,
      scroll_depth_percent: 80,
      is_incognito: false,
      source_type: "capture",
      source_system: SOURCE_SYSTEM,
      source_id: "visit:2024-01-02T03:04:05.000Z:https://example.com/page",
    });
  });

  // `time` must satisfy the server's Zod `.datetime()` (Z form).
  it("normalizes a zoneless timestamp to a UTC instant", () => {
    expect(
      toBrowserActivityRecord(activity({ time: "2024-01-02 03:04:05" })),
    ).toMatchObject({ time: "2024-01-02T03:04:05.000Z" });
  });

  it("skips a record with no usable URL rather than letting it reject", () => {
    expect(toBrowserActivityRecord(activity({ url: "   " }))).toBeNull();
  });

  // The identity passes through intact — the server relaxed url to min(1).
  it("keeps a bare search query as the url without synthesizing one", () => {
    expect(
      toBrowserActivityRecord(
        activity({ action_type: "search", url: "how to fix zod" }),
      ),
    ).toMatchObject({ url: "how to fix zod", action_type: "search" });
  });

  // action_type is a strict server enum; scrape is extension-only.
  it("omits an out-of-enum action_type and preserves it in properties", () => {
    const scrape = toBrowserActivityRecord(activity({ action_type: "scrape" }));
    expect(scrape?.action_type).toBeUndefined();
    expect(scrape?.properties).toMatchObject({ action_type: "scrape" });
  });

  // The table has no observed_at column, but the occurred/observed split must
  // survive: a history import must not rewrite old page views as today's.
  it("carries observed_at in properties, leaving time as the visit instant", () => {
    const r = toBrowserActivityRecord(
      activity({ observed_at: "2024-03-04T05:06:07.000Z" }),
    );
    expect(r?.time).toBe("2024-01-02T03:04:05.000Z");
    expect(r?.properties).toMatchObject({
      observed_at: "2024-03-04T05:06:07.000Z",
    });
  });

  // device_id is z.string().uuid() server-side — a non-UUID would reject the row.
  it("degrades a non-UUID device_id to a property", () => {
    const r = toBrowserActivityRecord(activity({ device_id: "dev-1" }));
    expect(r?.device_id).toBeUndefined();
    expect(r?.properties).toMatchObject({ device_id: "dev-1" });
  });
});

describe("toBookmarkContentRecord", () => {
  it("maps a bookmark to the importer's type:'bookmark' content bucket", () => {
    const r = toBookmarkContentRecord(
      activity({
        action_type: "bookmark",
        title: "Saved page",
        properties: { bookmark_id: "b1" },
      }),
    );
    expect(r).toMatchObject({
      type: "bookmark",
      title: "Saved page",
      url: "https://example.com/page",
      source_type: "capture",
      source_system: SOURCE_SYSTEM,
      source_id: "bookmark:b1",
    });
    expect(r?.source_data).toMatchObject({ bookmark_id: "b1" });
  });

  it("skips a bookmark with no usable URL", () => {
    expect(
      toBookmarkContentRecord(activity({ action_type: "bookmark", url: "" })),
    ).toBeNull();
  });
});

describe("toHighlightContentRecord", () => {
  function highlight(over: Partial<BrowserActivity> = {}): BrowserActivity {
    return activity({
      action_type: "highlight",
      title: "Example Page",
      properties: {
        text: "the selected sentence",
        description: "Highlight from Example Page",
      },
      ...over,
    });
  }

  it("maps a selection to a text/plain highlight content row", () => {
    const r = toHighlightContentRecord(highlight());

    expect(r).toMatchObject({
      type: "highlight",
      text: "the selected sentence",
      url: "https://example.com/page",
      mimetype: "text/plain",
      source_type: "capture",
      source_system: SOURCE_SYSTEM,
      source_id: "highlight:2024-01-02T03:04:05.000Z:https://example.com/page",
    });
  });

  // A highlight has no name of its own; the page is already named by `url`.
  it("never sets a title, even when the page has one", () => {
    expect(toHighlightContentRecord(highlight())?.title).toBeUndefined();
  });

  // ci.content's only timestamp is created_at DEFAULT now() (insert time), so a
  // queued or replayed highlight would otherwise be misdated.
  it("records the capture time as source_data.obtained_at", () => {
    expect(toHighlightContentRecord(highlight())?.source_data).toMatchObject({
      obtained_at: "2024-01-02T03:04:05.000Z",
    });
  });

  it("normalizes a zoneless capture time to a UTC instant", () => {
    expect(
      toHighlightContentRecord(highlight({ time: "2024-01-02 03:04:05" }))
        ?.source_data,
    ).toMatchObject({ obtained_at: "2024-01-02T03:04:05.000Z" });
  });

  // The excerpt is the row's `text`; keeping properties.text too would store it
  // twice (and highlights run up to MAX_HIGHLIGHT_LENGTH = 10k chars).
  it("does not duplicate the selection inside source_data", () => {
    const r = toHighlightContentRecord(highlight());
    expect(r?.source_data).not.toHaveProperty("text");
    expect(r?.source_data).toMatchObject({
      description: "Highlight from Example Page",
    });
  });

  it("skips a highlight with no selected text or no URL", () => {
    expect(
      toHighlightContentRecord(highlight({ properties: { text: "   " } })),
    ).toBeNull();
    expect(toHighlightContentRecord(highlight({ properties: {} }))).toBeNull();
    expect(toHighlightContentRecord(highlight({ url: "" }))).toBeNull();
  });
});

describe("sendBrowserCaptures", () => {
  function okFetch() {
    return jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ingested: 1, duplicate: 0, rejected: [] }),
    });
  }

  it("splits bookmarks + highlights to /contents, the rest to /browser-activity", async () => {
    const fetchMock = okFetch();
    (global as { fetch?: unknown }).fetch = fetchMock;

    const result = await sendBrowserCaptures(
      "https://hub.ci.computer",
      "portal-jwt",
      [
        activity(),
        activity({ action_type: "scrape", properties: { source_id: "s1" } }),
        activity({
          action_type: "bookmark",
          properties: { bookmark_id: "b1" },
        }),
        activity({
          action_type: "highlight",
          properties: { text: "a selection" },
        }),
      ],
    );

    // One batch per destination, both counted.
    expect(result).toEqual({ ingested: 2, duplicate: 0, rejected: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const byUrl = new Map<string, Record<string, unknown>>(
      fetchMock.mock.calls.map(([url, init]) => [
        url as string,
        JSON.parse((init as { body: string }).body),
      ]),
    );
    const ba = byUrl.get("https://hub.ci.computer/api/v1/browser-activity");
    const contents = byUrl.get("https://hub.ci.computer/api/v1/contents");
    // visit + scrape stay on browser-activity; bookmark + highlight go to content.
    expect((ba?.records as unknown[]).length).toBe(2);
    expect(
      (contents?.records as { type: string }[]).map((r) => r.type).sort(),
    ).toEqual(["bookmark", "highlight"]);

    const [, init] = fetchMock.mock.calls[0];
    expect(
      (init as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer portal-jwt");
  });

  it("posts only the browser-activity batch when there are no bookmarks", async () => {
    const fetchMock = okFetch();
    (global as { fetch?: unknown }).fetch = fetchMock;

    await sendBrowserCaptures("https://hub.ci.computer", "t", [activity()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://hub.ci.computer/api/v1/browser-activity",
    );
  });

  it("no-ops (no fetch) for an empty batch", async () => {
    const fetchMock = jest.fn();
    (global as { fetch?: unknown }).fetch = fetchMock;

    expect(
      await sendBrowserCaptures("https://hub.ci.computer", "t", []),
    ).toEqual({ ingested: 0, duplicate: 0, rejected: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx so the caller keeps its retry", async () => {
    (global as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await expect(
      sendBrowserCaptures("https://hub.ci.computer", "t", [activity()]),
    ).rejects.toThrow(/HTTP 401/);
  });
});
