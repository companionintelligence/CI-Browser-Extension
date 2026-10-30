import {
  browserActivityUrl,
  contentsUrl,
  finishIngest,
  ingestFinishUrl,
  isContentCapture,
  toBrowserActivityRecord,
  toBookmarkContentRecord,
  toHighlightContentRecord,
  toScrapeContentRecord,
  sendBrowserCaptures,
  sourceIdFor,
  toInstant,
  unixMsOf,
  browserSourceSystem,
  browserBrand,
  browserBrandLabel,
  rememberBrowserBrand,
  EXTENSION_SOURCE_SYSTEM,
  type BrowserActivity,
} from "./browserActivity";

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BRAVE_UA = CHROME_UA; // Brave ships Chrome's UA verbatim.
const EDGE_UA = `${CHROME_UA} Edg/128.0.0.0`;
const FIREFOX_UA =
  "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

function setUserAgent(ua: string) {
  Object.defineProperty(globalThis.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

// The record builders read the engine from navigator.userAgent; jsdom's own UA
// is nothing a user runs, so every suite below speaks as Chrome unless it says
// otherwise.
beforeEach(() => {
  setUserAgent(CHROME_UA);
  rememberBrowserBrand(undefined);
  // jsdom has no Client Hints; each brand test installs what it needs.
  Object.defineProperty(globalThis.navigator, "userAgentData", {
    value: undefined,
    configurable: true,
  });
});

function setBrands(brands: string[] | undefined) {
  Object.defineProperty(globalThis.navigator, "userAgentData", {
    value: brands
      ? { brands: brands.map((brand) => ({ brand, version: "1" })) }
      : undefined,
    configurable: true,
  });
}

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

describe("EXTENSION_SOURCE_SYSTEM", () => {
  // Pinned deliberately: this string is part of the server-side dedup key for
  // highlights and scrapes, so it has to match the platform event-ingest spec
  // exactly. Changing it re-uploads everything.
  it("matches the platform spec's name for this capture source", () => {
    expect(EXTENSION_SOURCE_SYSTEM).toBe("ci-browser-extension");
  });
});

describe("browserSourceSystem", () => {
  // The importer's names, by ENGINE: CI-Server files Chrome, Brave, Edge, Arc
  // and Opera history under one `chromium` system, so a Brave user running the
  // Chrome build must not get a system of their own.
  it("names every Chromium-family browser chromium", () => {
    expect(browserSourceSystem(CHROME_UA)).toBe("chromium");
    expect(browserSourceSystem(BRAVE_UA)).toBe("chromium");
    expect(browserSourceSystem(EDGE_UA)).toBe("chromium");
  });

  it("names Firefox firefox — the places.sqlite importer's name", () => {
    expect(browserSourceSystem(FIREFOX_UA)).toBe("firefox");
  });

  it("names Safari safari, and falls back to the extension's own name otherwise", () => {
    expect(browserSourceSystem(SAFARI_UA)).toBe("safari");
    expect(browserSourceSystem("curl/8.0")).toBe(EXTENSION_SOURCE_SYSTEM);
    expect(browserSourceSystem("")).toBe(EXTENSION_SOURCE_SYSTEM);
  });

  it("reads navigator.userAgent by default", () => {
    setUserAgent(FIREFOX_UA);
    expect(browserSourceSystem()).toBe("firefox");
  });
});

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
  it("routes bookmarks, highlights and scrapes to content", () => {
    expect(isContentCapture(activity({ action_type: "bookmark" }))).toBe(true);
    expect(isContentCapture(activity({ action_type: "highlight" }))).toBe(true);
    // Scrapes moved here: the browser-activity enum has no `scrape`, so they
    // used to arrive as anonymous web.page_view rows.
    expect(isContentCapture(activity({ action_type: "scrape" }))).toBe(true);
  });

  it("leaves actual page activity on browser-activity", () => {
    expect(isContentCapture(activity({ action_type: "visit" }))).toBe(false);
    expect(isContentCapture(activity({ action_type: "search" }))).toBe(false);
    expect(isContentCapture(activity({ action_type: "download" }))).toBe(false);
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

describe("browserBrand", () => {
  // Brave ships Chrome's UA string verbatim; only Client Hints name it.
  it("names Brave from the Client Hints brands, which the UA string cannot", () => {
    setBrands(["Not A;Brand", "Chromium", "Brave"]);
    expect(browserBrand()).toBe("brave");
    setBrands(undefined);
    expect(browserBrand()).toBe("chrome"); // the UA lies, and that is all there is
  });

  it("names Chrome, Edge and Opera from brands, skipping GREASE and the engine", () => {
    setBrands(["Chromium", "Google Chrome", "Not(A:Brand"]);
    expect(browserBrand()).toBe("chrome");
    setBrands(["Not/A)Brand", "Microsoft Edge", "Chromium"]);
    expect(browserBrand()).toBe("edge");
    setBrands(["Opera", "Chromium", "Not_A Brand"]);
    expect(browserBrand()).toBe("opera");
  });

  it("falls back to UA tokens, then the UA parser", () => {
    expect(browserBrand({ userAgent: EDGE_UA })).toBe("edge");
    expect(browserBrand({ userAgent: `${CHROME_UA} OPR/110.0.0.0` })).toBe(
      "opera",
    );
    expect(browserBrand({ userAgent: FIREFOX_UA })).toBe("firefox");
    expect(browserBrand({ userAgent: SAFARI_UA })).toBe("safari");
    expect(browserBrand({ userAgent: "" })).toBeUndefined();
  });

  it("honors a brand learned asynchronously (the Brave probe)", () => {
    rememberBrowserBrand("brave");
    expect(browserBrand({ userAgent: CHROME_UA })).toBe("brave");
  });

  it("labels a brand for the device record", () => {
    expect(browserBrandLabel("brave")).toBe("Brave");
    expect(browserBrandLabel("edge")).toBe("Microsoft Edge");
    expect(browserBrandLabel("arc")).toBe("Arc");
    expect(browserBrandLabel(undefined)).toBeUndefined();
  });
});

describe("properties.browser", () => {
  // The brand is an ARRIVAL fact: it rides in the properties bag, under the
  // key CI-Server's History-file importer writes when a filename or profile
  // folder tells it the brand, and it stays off source_system so both
  // arrivals of a Brave visit are one row.
  it("stamps the brand on browser-native records without touching the identity", () => {
    setBrands(["Chromium", "Brave", "Not A;Brand"]);
    const r = toBrowserActivityRecord(activity());
    expect(r?.properties).toMatchObject({ browser: "brave" });
    expect(r?.source_system).toBe("chromium");
    expect(
      toBookmarkContentRecord(activity({ action_type: "bookmark" }))
        ?.source_data,
    ).toMatchObject({ browser: "brave" });
  });

  it("does not invent a brand when none can be told, and never overrides one already set", () => {
    expect(
      toBrowserActivityRecord(activity({ properties: { browser: "arc" } }))
        ?.properties,
    ).toMatchObject({ browser: "arc" });
    rememberBrowserBrand(undefined);
    setUserAgent("curl/8.0");
    expect(
      toBrowserActivityRecord(activity())?.properties?.browser,
    ).toBeUndefined();
  });
});

describe("sourceIdFor", () => {
  const MS = Date.parse("2024-01-02T03:04:05.000Z");

  it("keys a visit on visit:<unix ms>:<url> — CI-Server's browser identity format", () => {
    expect(sourceIdFor(activity())).toBe(
      `visit:${MS}:https://example.com/page`,
    );
    expect(sourceIdFor(activity({ action_type: "reload" }))).toBe(
      `reload:${MS}:https://example.com/page`,
    );
  });

  // Per-profile browser ids are NOT the key: the importer never sees them and
  // Brave's bookmark 42 is not Chrome's bookmark 42. They stay in properties.
  it("keys a bookmark on whole seconds, ignoring bookmark_id", () => {
    expect(
      sourceIdFor(
        activity({
          action_type: "bookmark",
          properties: { bookmark_id: "b1" },
        }),
      ),
    ).toBe(`bookmark:${MS / 1000}:https://example.com/page`);
  });

  it("keys a download on (start ms, url), ignoring download_id", () => {
    expect(
      sourceIdFor(
        activity({
          action_type: "download",
          properties: { download_id: "d3" },
        }),
      ),
    ).toBe(`download:${MS}:https://example.com/page`);
  });

  it("trims the url so the key matches the record's url", () => {
    expect(sourceIdFor(activity({ url: "  https://example.com/page " }))).toBe(
      `visit:${MS}:https://example.com/page`,
    );
  });

  it("keeps the extension-only scheme for highlights", () => {
    expect(sourceIdFor(activity({ action_type: "highlight" }))).toBe(
      "highlight:2024-01-02T03:04:05.000Z:https://example.com/page",
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
      source_system: "chromium",
      source_id: `visit:${Date.parse("2024-01-02T03:04:05.000Z")}:https://example.com/page`,
    });
  });

  it("stamps the Firefox build's records firefox", () => {
    setUserAgent(FIREFOX_UA);
    expect(toBrowserActivityRecord(activity())?.source_system).toBe("firefox");
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
      source_system: "chromium",
      source_id: `bookmark:${Date.parse("2024-01-02T03:04:05.000Z") / 1000}:https://example.com/page`,
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
      source_system: EXTENSION_SOURCE_SYSTEM,
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

describe("toScrapeContentRecord", () => {
  function scraped(over: Partial<BrowserActivity> = {}): BrowserActivity {
    return activity({
      action_type: "scrape",
      title: "Stranger Things",
      url: "https://www.netflix.com/settings/viewed/x",
      properties: {
        source_id: "netflix.com:viewingHistory:0",
        personal_data_type: "entertainment_preferences",
        scrape_profile: "Netflix Data Scraper",
        domain: "netflix.com",
        data_type: "viewingHistory",
        data: {
          title: "Stranger Things",
          date: "2026-03-04",
          titleUrl: "https://www.netflix.com/title/1",
        },
      },
      ...over,
    });
  }

  // The whole point of moving scrapes off the browser-activity lane: the row is
  // typed by what it is, not flattened into an anonymous page view.
  it("types the record by the profile's personalDataType", () => {
    expect(toScrapeContentRecord(scraped())?.type).toBe(
      "entertainment_preferences",
    );
  });

  it("points url at the item and source_url at the page it came from", () => {
    const r = toScrapeContentRecord(scraped());
    expect(r?.url).toBe("https://www.netflix.com/title/1");
    expect(r?.source_url).toBe("https://www.netflix.com/settings/viewed/x");
  });

  it("falls back to the page url when the item has none of its own", () => {
    const r = toScrapeContentRecord(
      scraped({
        properties: {
          personal_data_type: "professional_activity",
          data: { name: "some-repo" },
        },
      }),
    );
    expect(r?.url).toBe("https://www.netflix.com/settings/viewed/x");
  });

  // source_data is not search-indexed; text (weight 5) and title (10) are.
  it("joins the item's own values into searchable text, minus url fields", () => {
    const r = toScrapeContentRecord(scraped());
    expect(r?.text).toBe("Stranger Things · 2026-03-04");
    expect(r?.text).not.toContain("netflix.com/title/1");
  });

  it("carries provenance and the capture time", () => {
    const r = toScrapeContentRecord(scraped());
    expect(r).toMatchObject({
      source_type: "capture",
      source_system: EXTENSION_SOURCE_SYSTEM,
      source_id: "scrape:netflix.com:viewingHistory:0",
    });
    expect(r?.source_data).toMatchObject({
      obtained_at: "2024-01-02T03:04:05.000Z",
      scrape_profile: "Netflix Data Scraper",
    });
  });

  it("skips an item with no classification or no page", () => {
    expect(
      toScrapeContentRecord(scraped({ properties: { data: {} } })),
    ).toBeNull();
    expect(toScrapeContentRecord(scraped({ url: "  " }))).toBeNull();
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

  it("splits bookmarks + highlights + scrapes to /contents, page activity to /browser-activity", async () => {
    const fetchMock = okFetch();
    (global as { fetch?: unknown }).fetch = fetchMock;

    const result = await sendBrowserCaptures(
      "https://hub.ci.computer",
      "portal-jwt",
      [
        activity(),
        activity({
          action_type: "download",
          properties: { download_id: "d1" },
        }),
        activity({
          action_type: "scrape",
          properties: {
            source_id: "s1",
            personal_data_type: "entertainment_preferences",
            data: { title: "Some Show" },
          },
        }),
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
    // visit + download stay on browser-activity; the rest are content, each
    // typed by what it is rather than collapsing into one bucket.
    expect((ba?.records as unknown[]).length).toBe(2);
    expect(
      (contents?.records as { type: string }[]).map((r) => r.type).sort(),
    ).toEqual(["bookmark", "entertainment_preferences", "highlight"]);

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

describe("finishIngest", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("derives the finish URL behind the same /api gateway prefix", () => {
    expect(ingestFinishUrl("https://hub.ci.computer")).toBe(
      "https://hub.ci.computer/api/v1/ingest/finish",
    );
    expect(ingestFinishUrl("https://hub.ci.computer/")).toBe(
      "https://hub.ci.computer/api/v1/ingest/finish",
    );
  });

  it("takes the cheap search-index path scoped to the two types written", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as { fetch?: unknown }).fetch = fetchMock;

    expect(await finishIngest("https://hub.ci.computer", "portal-jwt")).toBe(
      true,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hub.ci.computer/api/v1/ingest/finish");
    expect(
      (init as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer portal-jwt");

    const body = JSON.parse((init as { body: string }).body);
    // searchIndexOnly avoids the full orchestration chain, which is one-per-user
    // and 409s on concurrent runs — far too heavy for a 10-minute sync alarm.
    expect(body.searchIndexOnly).toBe(true);
    // Server spelling is hyphenated here, unlike the browser_activity destination
    expect(body.entityTypes).toEqual(["browser-activity", "content"]);
  });

  it("reports failure without throwing — indexing is best-effort", async () => {
    (global as { fetch?: unknown }).fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 409 });

    expect(await finishIngest("https://hub.ci.computer", "t")).toBe(false);
  });

  it("swallows a network error rather than failing the sync", async () => {
    (global as { fetch?: unknown }).fetch = jest
      .fn()
      .mockRejectedValue(new Error("offline"));

    expect(await finishIngest("https://hub.ci.computer", "t")).toBe(false);
  });
});

/**
 * CROSS-REPO CONFORMANCE. These fixtures are the same ones CI-Server pins in
 * `backend/apps/api/src/domains/memory/identity/__tests__/identity.test.ts`:
 * one Chrome visit as Takeout's Unix microseconds, as the History SQLite's
 * 1601-epoch microseconds, and as the history API's double of milliseconds.
 * The server derives `visit:1749556800123:<url>` from the first two; this
 * extension must derive it from the third, or the row never converges.
 */
describe("conformance with CI-Server's identity/browser.ts", () => {
  const URL = "https://example.com/path?q=1#frag";
  const UNIX_MS = 1749556800123; // 2025-06-10T12:00:00.123Z
  const API_MS = UNIX_MS + 0.456; // what chrome.history hands out

  // What background.ts does with a visitTime: chromeTimeToISO → new Date(ms).
  function fromHistoryApi(
    visitTime: number,
    over: Partial<BrowserActivity> = {},
  ): BrowserActivity {
    return activity({
      time: new Date(visitTime).toISOString(),
      url: URL,
      ...over,
    });
  }

  it("truncates the history API's sub-millisecond visitTime, never rounds", () => {
    expect(unixMsOf(fromHistoryApi(API_MS))).toBe(UNIX_MS);
    expect(unixMsOf(fromHistoryApi(UNIX_MS + 0.999))).toBe(UNIX_MS);
  });

  it("mints the server's visit identity for the shared fixture", () => {
    expect(toBrowserActivityRecord(fromHistoryApi(API_MS))).toMatchObject({
      source_system: "chromium",
      source_id: `visit:${UNIX_MS}:${URL}`,
    });
  });

  it("mints the server's bookmark identity (whole seconds) for the shared fixture", () => {
    expect(
      toBookmarkContentRecord(
        fromHistoryApi(API_MS, {
          action_type: "bookmark",
          properties: { bookmark_id: "7" },
        }),
      ),
    ).toMatchObject({
      source_system: "chromium",
      source_id: `bookmark:1749556800:${URL}`,
    });
  });

  it("mints the server's download identity for the shared fixture", () => {
    expect(
      toBrowserActivityRecord(
        fromHistoryApi(API_MS, {
          action_type: "download",
          properties: { download_id: "9" },
        }),
      ),
    ).toMatchObject({
      source_system: "chromium",
      source_id: `download:${UNIX_MS}:${URL}`,
    });
  });
});
