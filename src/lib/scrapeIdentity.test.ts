import { scrapeSourceId } from "./scrapeIdentity";

const D = "netflix.com";
const S = "viewingHistory";

describe("scrapeSourceId", () => {
  it("prefers a URL that identifies the item itself", () => {
    expect(
      scrapeSourceId(D, S, {
        title: "Stranger Things",
        titleUrl: "https://netflix.com/title/1",
      }),
    ).toBe("netflix.com:viewingHistory:https://netflix.com/title/1");
  });

  it("falls back to a hash of the item's own values", () => {
    const id = scrapeSourceId(D, S, { title: "The Crown", date: "2026-03-04" });

    expect(id).toMatch(/^netflix\.com:viewingHistory:[0-9a-f]{8}$/);
  });

  it("is stable across calls and independent of field order", () => {
    const a = scrapeSourceId(D, S, { title: "A", date: "d" });
    const b = scrapeSourceId(D, S, { date: "d", title: "A" });

    expect(a).toBe(b);
  });

  it("distinguishes different items", () => {
    expect(scrapeSourceId(D, S, { title: "A" })).not.toBe(
      scrapeSourceId(D, S, { title: "B" }),
    );
  });

  it("scopes ids by domain and selector", () => {
    expect(scrapeSourceId(D, S, { title: "A" })).not.toBe(
      scrapeSourceId("max.com", S, { title: "A" }),
    );
    expect(scrapeSourceId(D, S, { title: "A" })).not.toBe(
      scrapeSourceId(D, "watchlist", { title: "A" }),
    );
  });

  // THE regression this module exists for. With a positional key, a newly
  // watched title shifts every row down: the new item collides with the old
  // row at index 0 and the server — which never refreshes an existing row —
  // discards it, while the shifted rows re-insert as duplicates.
  it("keeps an item's id when the list re-orders around it", () => {
    const showA = { title: "Show A", titleUrl: "https://n/1" };
    const showB = { title: "Show B", titleUrl: "https://n/2" };
    const showC = { title: "Show C", titleUrl: "https://n/3" };

    const before = [showA, showB].map((f) => scrapeSourceId(D, S, f));
    const after = [showC, showA, showB].map((f) => scrapeSourceId(D, S, f));

    // A and B keep the ids they already had — so they dedup, not duplicate…
    expect(after).toContain(before[0]);
    expect(after).toContain(before[1]);
    // …and C is genuinely new rather than colliding with A's old slot.
    expect(before).not.toContain(scrapeSourceId(D, S, showC));
  });

  it("holds even for items with no identifying URL", () => {
    const rows = [{ title: "A" }, { title: "B" }];
    const before = rows.map((f) => scrapeSourceId(D, S, f));
    const after = [{ title: "C" }, ...rows].map((f) => scrapeSourceId(D, S, f));

    expect(after.slice(1)).toEqual(before);
  });
});
