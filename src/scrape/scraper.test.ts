import { applyTransform, canScrape, profileForUrl, scrape } from "./scraper";

describe("profileForUrl", () => {
  it("requires the URL to be one of the profile's target pages", () => {
    // Right domain, right page
    expect(
      profileForUrl("https://www.netflix.com/settings/viewed/x")?.domain,
    ).toBe("netflix.com");
    // Right domain, but not a page the selectors were written for
    expect(
      profileForUrl("https://www.netflix.com/watch/80100172"),
    ).toBeUndefined();
  });

  it("returns nothing for an unprofiled domain", () => {
    expect(profileForUrl("https://example.org/")).toBeUndefined();
  });

  it("reaches a profile that used to be unreachable", () => {
    // robinhood/cnn/wsj/quora/airbnb were registered but absent from the
    // content script's matches, so they never ran.
    expect(profileForUrl("https://www.robinhood.com/portfolio/x")?.domain).toBe(
      "robinhood.com",
    );
  });

  it("canScrape agrees with profileForUrl", () => {
    expect(canScrape("https://www.netflix.com/settings/viewed/x")).toBe(true);
    expect(canScrape("https://example.org/")).toBe(false);
  });
});

describe("applyTransform", () => {
  it("trims", () => {
    expect(applyTransform("  hi  ", "trim", "https://a.test")).toBe("hi");
  });

  it("resolves a relative href against the page", () => {
    expect(applyTransform("/title/9", "absoluteUrl", "https://a.test/x")).toBe(
      "https://a.test/title/9",
    );
  });

  it("leaves an unresolvable url alone", () => {
    expect(applyTransform("::::", "absoluteUrl", "not a base")).toBe("::::");
  });

  it("parses a M/D/YYYY date to an instant", () => {
    expect(applyTransform("3/4/2026", "parseDate", "https://a.test")).toMatch(
      /^2026-03-04T/,
    );
  });

  it("returns the original when the date can't be parsed", () => {
    expect(applyTransform("whenever", "parseDate", "https://a.test")).toBe(
      "whenever",
    );
    expect(applyTransform("13/45/9999", "parseDate", "https://a.test")).toBe(
      "13/45/9999",
    );
  });

  it("passes an unknown transform through", () => {
    expect(applyTransform("x", "nope", "https://a.test")).toBe("x");
  });
});

describe("scrape", () => {
  // A minimal stand-in for the Netflix viewing-history table.
  function viewingHistoryDoc(): Document {
    const doc = document.implementation.createHTMLDocument("test");
    doc.body.innerHTML = `
      <div class="retableRow">
        <span class="date"> 3/4/2026 </span>
        <div class="title"><a href="/title/1"> Stranger Things </a></div>
      </div>
      <div class="retableRow">
        <span class="date"> 3/5/2026 </span>
        <div class="title"><a href="/title/2"> The Crown </a></div>
      </div>
    `;

    return doc;
  }

  const URL_VIEWED = "https://www.netflix.com/settings/viewed/abc";

  it("returns null for a page with no profile", () => {
    expect(scrape(viewingHistoryDoc(), "https://example.org/")).toBeNull();
  });

  it("returns null when the profile matches but nothing is on the page", () => {
    const empty = document.implementation.createHTMLDocument("test");

    expect(scrape(empty, URL_VIEWED)).toBeNull();
  });

  it("extracts items and tags each with its selector and data type", () => {
    const result = scrape(viewingHistoryDoc(), URL_VIEWED);

    expect(result).not.toBeNull();
    expect(result?.domain).toBe("netflix.com");
    expect(result?.url).toBe(URL_VIEWED);

    const history = result!.items.filter(
      (i) => i.selector === "viewingHistory",
    );
    expect(history.length).toBe(2);

    // The classification rides on the item — this is what lets the background
    // route it to a typed content row.
    for (const item of history) {
      expect(item.personalDataType).toBe("entertainment_preferences");
    }

    expect(history[0].fields.title).toBe("Stranger Things");
    expect(history[1].fields.title).toBe("The Crown");
  });

  it("applies each field's transform", () => {
    const result = scrape(viewingHistoryDoc(), URL_VIEWED);
    const first = result!.items.find((i) => i.selector === "viewingHistory")!;

    // trim on title, absoluteUrl on titleUrl
    expect(first.fields.title).toBe("Stranger Things");
    expect(first.fields.titleUrl).toBe("https://www.netflix.com/title/1");
  });

  it("skips containers that matched but yielded no fields", () => {
    const doc = document.implementation.createHTMLDocument("test");
    // Matches the container selector but has none of the field selectors
    doc.body.innerHTML = `<div class="retableRow"><em>nothing useful</em></div>`;

    expect(scrape(doc, URL_VIEWED)).toBeNull();
  });
});
