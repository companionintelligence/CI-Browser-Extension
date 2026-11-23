import { validateProfile } from "./validate";

const base = {
  domain: "example.test",
  name: "Example",
  description: "test profile",
  matchPatterns: ["https://example.test/*"],
  targetUrl: "https://example.test/*",
};

const jsonSelector = {
  personalDataType: "commerce_orders",
  contentType: "commerce.order",
  occurredAtField: "placed",
  from: "json",
  script: "#__NEXT_DATA__",
  rootPath: "props.pageProps.orders",
  fields: { title: "title", placed: "placedOn" },
};

function withSelector(selector: Record<string, unknown>) {
  return { ...base, dataSelectors: { orders: selector } };
}

function pathsOf(raw: unknown): string[] {
  return validateProfile(raw).map((issue) => issue.path);
}

describe("validateProfile: JSON sources", () => {
  it("accepts a well-formed JSON selector", () => {
    expect(validateProfile(withSelector(jsonSelector))).toEqual([]);
  });

  it("requires both a script and a root path", () => {
    expect(
      pathsOf(withSelector({ ...jsonSelector, script: undefined })),
    ).toContain("dataSelectors.orders.script");
    expect(
      pathsOf(withSelector({ ...jsonSelector, rootPath: undefined })),
    ).toContain("dataSelectors.orders.rootPath");
  });

  it("rejects a root path with an index or an empty segment", () => {
    expect(
      pathsOf(withSelector({ ...jsonSelector, rootPath: "items[0]" })),
    ).toContain("dataSelectors.orders.rootPath");
    expect(
      pathsOf(withSelector({ ...jsonSelector, rootPath: "a..b" })),
    ).toContain("dataSelectors.orders.rootPath");
  });

  it("rejects a field path that is not a path", () => {
    expect(
      pathsOf(withSelector({ ...jsonSelector, fields: { title: "title[0]" } })),
    ).toContain("dataSelectors.orders.fields.title");
  });

  it("rejects a DOM-only key on a JSON selector", () => {
    expect(
      pathsOf(withSelector({ ...jsonSelector, container: ".row" })),
    ).toContain("dataSelectors.orders.container");
  });

  it("rejects an unknown source", () => {
    expect(pathsOf(withSelector({ ...jsonSelector, from: "xml" }))).toContain(
      "dataSelectors.orders.from",
    );
  });
});

describe("validateProfile: envelope and readiness", () => {
  it("rejects a contentType that is not a dotted lowercase name", () => {
    expect(
      pathsOf(withSelector({ ...jsonSelector, contentType: "Media Watch" })),
    ).toContain("dataSelectors.orders.contentType");
  });

  it("requires occurredAtField to name one of the selector's fields", () => {
    expect(
      pathsOf(withSelector({ ...jsonSelector, occurredAtField: "watched" })),
    ).toContain("dataSelectors.orders.occurredAtField");
  });

  it("accepts the money transform on a DOM field", () => {
    const dom = {
      personalDataType: "financial_data",
      container: ".row",
      fields: {
        price: { selector: ".price", type: "text", transform: "money" },
      },
    };
    expect(validateProfile(withSelector(dom))).toEqual([]);
  });

  it("rejects an empty readySelector and a timeout out of range", () => {
    const orders = { orders: jsonSelector };
    expect(
      pathsOf({ ...base, readySelector: "", dataSelectors: orders }),
    ).toContain("readySelector");
    expect(
      pathsOf({ ...base, readyTimeoutMs: 0, dataSelectors: orders }),
    ).toContain("readyTimeoutMs");
    expect(
      pathsOf({ ...base, readyTimeoutMs: 90_000, dataSelectors: orders }),
    ).toContain("readyTimeoutMs");
  });

  it("accepts a readySelector and a timeout in range", () => {
    expect(
      validateProfile({
        ...base,
        readySelector: ".item",
        readyTimeoutMs: 5000,
        dataSelectors: { orders: jsonSelector },
      }),
    ).toEqual([]);
  });
});
