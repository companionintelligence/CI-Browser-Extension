import { logger, errMessage } from "@/lib/log";

describe("logger", () => {
  beforeEach(async () => {
    await logger.clear();
  });

  it("redacts known sensitive keys", () => {
    logger.warn("auth.failed", {
      accessToken: "abc.def.ghi",
      sessionToken: "xyz",
      reason: "expired",
    });

    const [entry] = logger.snapshot();
    expect(entry.fields.accessToken).toBe("<redacted>");
    expect(entry.fields.sessionToken).toBe("<redacted>");
    expect(entry.fields.reason).toBe("expired");
  });

  it("strips query strings from url-shaped fields", () => {
    logger.info("activity.recorded", {
      url: "https://example.com/path?token=secret&u=foo",
    });

    const [entry] = logger.snapshot();
    expect(entry.fields.url).toBe("https://example.com/path");
  });

  it("redacts nested objects recursively", () => {
    logger.info("api.response", {
      payload: { accessToken: "nested-secret", id: 7 },
    });

    const entry = logger.snapshot()[0];
    const payload = entry.fields.payload as Record<string, unknown>;
    expect(payload.accessToken).toBe("<redacted>");
    expect(payload.id).toBe(7);
  });

  it("keeps the ring bounded", () => {
    for (let i = 0; i < 520; i++) {
      logger.info("loop.tick", { i });
    }

    expect(logger.snapshot()).toHaveLength(500);
  });

  it("errMessage converts unknowns to strings", () => {
    expect(errMessage(new Error("boom"))).toBe("boom");
    expect(errMessage("hi")).toBe("hi");
    expect(errMessage({ code: 7 })).toBe('{"code":7}');
  });
});
