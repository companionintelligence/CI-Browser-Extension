import { toScrapeContentRecord, type BrowserActivity } from "./browserActivity";

function scrapeActivity(properties: Record<string, unknown>): BrowserActivity {
  return {
    time: "2026-11-23T10:00:00.000Z",
    url: "https://shop.example.test/orders",
    title: "Desk lamp",
    action_type: "scrape",
    properties: { personal_data_type: "commerce_orders", ...properties },
  } as unknown as BrowserActivity;
}

describe("toScrapeContentRecord", () => {
  it("labels each field in the search text and keeps URL fields out of it", () => {
    const record = toScrapeContentRecord(
      scrapeActivity({
        data: {
          title: "Desk lamp",
          titleUrl: "https://shop.example.test/lamp",
          price: { amount: 42.19, currency: "USD" },
        },
      }),
    );

    expect(record?.text).toBe("title: Desk lamp · price: 42.19 USD");
  });

  it("writes the envelope with the schema and the event date", () => {
    const record = toScrapeContentRecord(
      scrapeActivity({
        content_type: "commerce.order",
        occurred_at: "2026-03-03",
        data: { title: "Desk lamp" },
      }),
    );

    expect(record?.source_data).toMatchObject({
      envelope: { schema: "commerce.order/v1", occurred_at: "2026-03-03" },
    });
    // Moved into the envelope, so they are not stored twice.
    expect(record?.source_data).not.toHaveProperty("content_type");
    expect(record?.source_data).not.toHaveProperty("occurred_at");
  });

  it("omits the envelope when nothing is declared, and never invents an event date", () => {
    const plain = toScrapeContentRecord(
      scrapeActivity({ data: { title: "Desk lamp" } }),
    );
    expect(plain?.source_data).not.toHaveProperty("envelope");

    const schemaOnly = toScrapeContentRecord(
      scrapeActivity({ content_type: "commerce.order", data: { title: "x" } }),
    );
    expect(schemaOnly?.source_data?.envelope).toEqual({
      schema: "commerce.order/v1",
    });
  });
});
