import { dropIgnoredCaptures } from "./captureFilter";
import type { BrowserActivity } from "@/services/browserActivity";

function capture(
  url: string,
  action_type: BrowserActivity["action_type"] = "visit",
): BrowserActivity {
  return {
    time: "2026-07-29T00:00:00.000Z",
    device_id: "11111111-2222-4333-8444-555555555555",
    url,
    action_type,
  };
}

describe("dropIgnoredCaptures", () => {
  it("passes everything through when no rules are set", () => {
    const batch = [capture("https://a.test"), capture("https://b.test")];

    expect(dropIgnoredCaptures(batch)).toBe(batch);
    expect(dropIgnoredCaptures(batch, [], [])).toBe(batch);
  });

  it("drops captures on an ignored site", () => {
    const kept = dropIgnoredCaptures(
      [capture("https://netflix.com/browse"), capture("https://other.test/x")],
      ["netflix\\.com"],
      [],
    );

    expect(kept.map((c) => c.url)).toEqual(["https://other.test/x"]);
  });

  it("drops captures on an ignored page", () => {
    const kept = dropIgnoredCaptures(
      [capture("https://a.test/private"), capture("https://a.test/public")],
      [],
      ["https://a\\.test/private"],
    );

    expect(kept.map((c) => c.url)).toEqual(["https://a.test/public"]);
  });

  // The regression this whole module exists for: before the filter moved to the
  // transport, only live page views and history backfill were checked, so these
  // four capture kinds ignored the ignore list entirely.
  it.each(["scrape", "highlight", "bookmark", "download"] as const)(
    "applies to %s captures, not just page views",
    (action_type) => {
      const kept = dropIgnoredCaptures(
        [capture("https://netflix.com/viewed", action_type)],
        ["netflix\\.com"],
        [],
      );

      expect(kept).toEqual([]);
    },
  );

  it("keeps a capture that has no URL to match against", () => {
    const kept = dropIgnoredCaptures([capture("")], ["netflix\\.com"], []);

    expect(kept).toHaveLength(1);
  });

  it("matches subdomains of an ignored site", () => {
    const kept = dropIgnoredCaptures(
      [capture("https://www.netflix.com/browse")],
      ["netflix\\.com"],
      [],
    );

    expect(kept).toEqual([]);
  });
});
