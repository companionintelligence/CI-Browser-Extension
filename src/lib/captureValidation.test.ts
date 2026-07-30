import { isIsoInstant, isValidBookmarkEvent } from "./captureValidation";
import type { BrowserActivity } from "@/services/browserActivity";

const DEVICE_ID = "11111111-2222-4333-8444-555555555555";

function bookmark(overrides: Partial<BrowserActivity> = {}): BrowserActivity {
  return {
    time: "2026-07-29T00:00:00.000Z",
    device_id: DEVICE_ID,
    url: "https://example.test/page",
    title: "Example",
    action_type: "bookmark",
    properties: { bookmark_id: "42" },
    ...overrides,
  };
}

describe("isIsoInstant", () => {
  it("accepts the Z form the server's datetime() requires", () => {
    expect(isIsoInstant("2026-07-29T00:00:00.000Z")).toBe(true);
    expect(isIsoInstant("2026-07-29T00:00:00Z")).toBe(true);
  });

  it("rejects offsets, bare dates, and empty values", () => {
    // Valid ISO-8601, but not the Z form — the server's zod .datetime() is strict
    expect(isIsoInstant("2026-07-29T00:00:00+02:00")).toBe(false);
    expect(isIsoInstant("2026-07-29")).toBe(false);
    expect(isIsoInstant("")).toBe(false);
    expect(isIsoInstant(undefined)).toBe(false);
    expect(isIsoInstant(null)).toBe(false);
  });

  it("rejects a Z-shaped string that is not a real date", () => {
    expect(isIsoInstant("not-a-dateTZ")).toBe(false);
  });
});

describe("isValidBookmarkEvent", () => {
  it("accepts a fully-formed bookmark capture", () => {
    expect(isValidBookmarkEvent(bookmark())).toBe(true);
  });

  it("rejects a missing or empty url", () => {
    expect(isValidBookmarkEvent(bookmark({ url: "" }))).toBe(false);
  });

  it("rejects a bad timestamp", () => {
    expect(isValidBookmarkEvent(bookmark({ time: "yesterday" }))).toBe(false);
  });

  it("rejects a non-UUID device id rather than filing it under no device", () => {
    expect(isValidBookmarkEvent(bookmark({ device_id: "browser-1" }))).toBe(
      false,
    );
    expect(isValidBookmarkEvent(bookmark({ device_id: "" }))).toBe(false);
  });

  it("rejects a capture with no action_type", () => {
    expect(
      isValidBookmarkEvent(
        bookmark({ action_type: undefined as unknown as "bookmark" }),
      ),
    ).toBe(false);
  });
});
