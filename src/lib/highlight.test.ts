import { buildHighlightEvent, MAX_HIGHLIGHT_LENGTH } from "./highlight";

describe("buildHighlightEvent", () => {
  it("builds an event with the page title in the name", () => {
    const event = buildHighlightEvent(
      "selected words",
      "https://example.com/article",
      "An Article",
    );

    expect(event.name).toBe("Highlight from An Article");
    expect(event.type).toBe("Highlight");
    expect(event.content).toHaveLength(1);
    expect(event.content[0]).toMatchObject({
      type: "Highlight",
      mimetype: "text/plain",
      url: "https://example.com/article",
      title: "An Article",
      text: "selected words",
    });
    // ISO timestamp
    expect(new Date(event.start_time).toISOString()).toBe(event.start_time);
  });

  it("falls back to the hostname when there is no title", () => {
    const event = buildHighlightEvent("text", "https://example.com/page");
    expect(event.name).toBe("Highlight from example.com");
  });

  it("falls back to the raw url when it cannot be parsed", () => {
    const event = buildHighlightEvent("text", "not-a-url");
    expect(event.name).toBe("Highlight from not-a-url");
  });

  it("truncates very long selections", () => {
    const long = "x".repeat(MAX_HIGHLIGHT_LENGTH + 500);
    const event = buildHighlightEvent(long, "https://example.com");
    expect(event.content[0].text).toHaveLength(MAX_HIGHLIGHT_LENGTH);
  });
});
