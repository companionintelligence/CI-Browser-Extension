/** @jest-environment jsdom */
import {
  extractProfile,
  parseCalendarDate,
  parseMoney,
  resolvePath,
} from "./scraper";
import type { ScrapeProfile } from "./types";

const base = {
  domain: "example.test",
  name: "Example",
  description: "test profile",
  matchPatterns: ["https://example.test/*"],
  targetUrl: "https://example.test/*",
};

const URL_UNDER_TEST = "https://example.test/orders";

function docWith(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("parseCalendarDate", () => {
  it.each([
    ["2026-03-04", "2026-03-04"],
    ["3/4/2026", "2026-03-04"],
    ["03/04/2026", "2026-03-04"],
    ["March 3, 2026", "2026-03-03"],
    ["Mar 3 2026", "2026-03-03"],
    ["05 Mar 2026", "2026-03-05"],
    ["5 March, 2026", "2026-03-05"],
    ["Sept 3 2026", "2026-09-03"],
    ["2024-02-29", "2024-02-29"],
    ["1/1/00", "2000-01-01"],
  ])("reads %s as %s", (raw, expected) => {
    expect(parseCalendarDate(raw)).toBe(expected);
  });

  it.each([
    "2/30/2026",
    "2026-02-29",
    "13/03/2026",
    "Smarch 3, 2026",
    "March 3",
    "",
    "not a date",
  ])("refuses %j rather than guessing", (raw) => {
    expect(parseCalendarDate(raw)).toBeNull();
  });
});

describe("parseMoney", () => {
  it("reads a bare dollar sign as an amount with no code", () => {
    expect(parseMoney("$42.19")).toEqual({ amount: 42.19, currency: null });
  });

  it("reads an unambiguous prefix as its code", () => {
    expect(parseMoney("US$12.00")).toEqual({ amount: 12, currency: "USD" });
    expect(parseMoney("CHF 12")).toEqual({ amount: 12, currency: "CHF" });
  });

  it("reads European grouping, where the comma is the decimal mark", () => {
    expect(parseMoney("€1.234,50")).toEqual({
      amount: 1234.5,
      currency: "EUR",
    });
    expect(parseMoney("42,19 €")).toEqual({ amount: 42.19, currency: "EUR" });
  });

  it("reads US grouping, where the dot is the decimal mark", () => {
    expect(parseMoney("1,234.50 USD")).toEqual({
      amount: 1234.5,
      currency: "USD",
    });
  });

  it("treats a lone comma before three digits as grouping", () => {
    expect(parseMoney("1,234")).toEqual({ amount: 1234, currency: null });
  });

  it("returns the raw text for anything that is not a price", () => {
    expect(parseMoney("2 nights")).toBe("2 nights");
    expect(parseMoney("Free")).toBe("Free");
    expect(parseMoney("Total: $42")).toBe("Total: $42");
  });
});

describe("resolvePath", () => {
  const root = {
    props: { pageProps: { orders: [{ title: "a" }, { title: "b" }] } },
    sections: [{ items: [1, 2] }, { items: [3] }],
    scalar: "text",
  };

  it("follows dotted keys", () => {
    expect(resolvePath(root, "props.pageProps.orders")).toEqual([
      [{ title: "a" }, { title: "b" }],
    ]);
  });

  it("fans out over an array with [*]", () => {
    expect(resolvePath(root, "sections[*].items")).toEqual([[1, 2], [3]]);
    expect(resolvePath(root, "sections[*].items[*]")).toEqual([1, 2, 3]);
  });

  it("reaches nothing for a missing key, a wrong type, or an index", () => {
    expect(resolvePath(root, "props.missing")).toEqual([]);
    expect(resolvePath(root, "scalar.length")).toEqual([]);
    expect(resolvePath(root, "sections[0]")).toEqual([]);
    expect(resolvePath(null, "a.b")).toEqual([]);
  });
});

describe("extractProfile: JSON source", () => {
  const profile: ScrapeProfile = {
    ...base,
    dataSelectors: {
      orders: {
        personalDataType: "commerce_orders",
        contentType: "commerce.order",
        occurredAtField: "placed",
        from: "json",
        script: "#__NEXT_DATA__",
        rootPath: "props.pageProps.orders",
        fields: {
          title: "title",
          total: "payment.grandTotal",
          placed: "placedOn",
        },
      },
    },
  };

  it("reads items from embedded JSON with no CSS container", () => {
    const doc = docWith(`
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"orders":[
          {"title":"Desk lamp","payment":{"grandTotal":42.19},"placedOn":"March 3, 2026"},
          {"title":"Kettle","payment":{"grandTotal":18},"placedOn":"not a date"}
        ]}}}
      </script>`);

    const { result, diagnostics } = extractProfile(
      profile,
      doc,
      URL_UNDER_TEST,
    );

    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]).toEqual({
      selector: "orders",
      personalDataType: "commerce_orders",
      contentType: "commerce.order",
      occurredAt: "2026-03-03",
      fields: { title: "Desk lamp", total: "42.19", placed: "March 3, 2026" },
    });
    // Unparseable, so absent: never defaulted to the scrape time.
    expect(result?.items[1].occurredAt).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({
      containersMatched: 2,
      itemsProduced: 2,
    });
  });

  it("skips a script that is not JSON and keeps reading the others", () => {
    const doc = docWith(`
      <script id="__NEXT_DATA__" type="application/json">{ not json</script>
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"orders":[{"title":"Lamp"}]}}}
      </script>`);

    const { result } = extractProfile(profile, doc, URL_UNDER_TEST);

    expect(result?.items.map((i) => i.fields.title)).toEqual(["Lamp"]);
  });

  it("reads application/ld+json through the same source", () => {
    const structured: ScrapeProfile = {
      ...base,
      dataSelectors: {
        items: {
          personalDataType: "products",
          from: "json",
          script: 'script[type="application/ld+json"]',
          rootPath: "itemListElement",
          fields: { name: "name", url: "url" },
        },
      },
    };
    const doc = docWith(`
      <script type="application/ld+json">
        {"@type":"ItemList","itemListElement":[{"name":"Lamp","url":"https://example.test/lamp"}]}
      </script>`);

    const { result } = extractProfile(structured, doc, URL_UNDER_TEST);

    expect(result?.items[0].fields).toEqual({
      name: "Lamp",
      url: "https://example.test/lamp",
    });
  });

  it("fans out across sections with [*] in the root path", () => {
    const sectioned: ScrapeProfile = {
      ...base,
      dataSelectors: {
        rows: {
          personalDataType: "rows",
          from: "json",
          script: "#data",
          rootPath: "sections[*].items",
          fields: { name: "name" },
        },
      },
    };
    const doc = docWith(`
      <script id="data" type="application/json">
        {"sections":[{"items":[{"name":"a"}]},{"items":[{"name":"b"},{"name":"c"}]}]}
      </script>`);

    const { result } = extractProfile(sectioned, doc, URL_UNDER_TEST);

    expect(result?.items.map((i) => i.fields.name)).toEqual(["a", "b", "c"]);
  });

  it("reports nothing rather than throwing when the path reaches nothing", () => {
    const doc = docWith(
      `<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>`,
    );

    const { result, diagnostics } = extractProfile(
      profile,
      doc,
      URL_UNDER_TEST,
    );

    expect(result).toBeNull();
    expect(diagnostics[0]).toMatchObject({
      containersMatched: 0,
      itemsProduced: 0,
    });
  });
});

describe("extractProfile: consent and money", () => {
  const gated: ScrapeProfile = {
    ...base,
    dataCategories: ["financial"],
    dataSelectors: {
      prices: {
        personalDataType: "financial_data",
        container: ".row",
        fields: {
          title: { selector: ".title", type: "text" },
          price: { selector: ".price", type: "text", transform: "money" },
        },
      },
    },
  };
  const doc = docWith(`
    <div class="row"><span class="title">Lamp</span><span class="price">€1.234,50</span></div>`);

  it("reads nothing for a gated profile the user has not granted", () => {
    const { result, diagnostics } = extractProfile(
      gated,
      doc,
      URL_UNDER_TEST,
      {},
    );

    expect(result).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("reads a gated profile once its category is granted, with money as a structure", () => {
    const { result } = extractProfile(gated, doc, URL_UNDER_TEST, {
      financial: true,
    });

    expect(result?.items[0].fields).toEqual({
      title: "Lamp",
      price: { amount: 1234.5, currency: "EUR" },
    });
  });
});
