import { buildHighlightActivity, MAX_HIGHLIGHT_LENGTH } from "./highlight";

describe("buildHighlightActivity", () => {
  it("builds a highlight activity with the page title in the description", () => {
    const activity = buildHighlightActivity(
      "selected words",
      "https://example.com/article",
      "dev-1",
      "An Article",
    );

    expect(activity).toMatchObject({
      device_id: "dev-1",
      url: "https://example.com/article",
      title: "An Article",
      action_type: "highlight",
    });
    expect(activity.properties).toMatchObject({
      description: "Highlight from An Article",
      text: "selected words",
    });
    // ISO timestamp
    expect(new Date(activity.time).toISOString()).toBe(activity.time);
  });

  it("falls back to the hostname when there is no title", () => {
    const activity = buildHighlightActivity(
      "text",
      "https://example.com/page",
      "dev-1",
    );
    expect(activity.properties?.description).toBe("Highlight from example.com");
  });

  it("falls back to the raw url when it cannot be parsed", () => {
    const activity = buildHighlightActivity("text", "not-a-url", "dev-1");
    expect(activity.properties?.description).toBe("Highlight from not-a-url");
  });

  it("truncates very long selections", () => {
    const long = "x".repeat(MAX_HIGHLIGHT_LENGTH + 500);
    const activity = buildHighlightActivity(
      long,
      "https://example.com",
      "dev-1",
    );
    expect(activity.properties?.text).toHaveLength(MAX_HIGHLIGHT_LENGTH);
  });
});
