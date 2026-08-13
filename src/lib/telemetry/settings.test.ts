import {
  isLocalOnly,
  isTelemetryOptedOut,
  resolveTelemetrySettings,
  type TelemetryEnv,
} from "./settings";

const DSN = "https://abc123@o1.ingest.us.sentry.io/9999999";

const opts = (
  over: Partial<Parameters<typeof resolveTelemetrySettings>[1]> = {},
) => ({
  component: "background",
  userEnabled: true,
  ...over,
});

describe("the four gate conditions", () => {
  it("1. no DSN — disabled, reason no-dsn", () => {
    const settings = resolveTelemetrySettings({}, opts());

    expect(settings.enabled).toBe(false);
    expect(settings.disabledReason).toBe("no-dsn");
    expect(settings.dsn).toBeNull();
  });

  it("2. DSN — enabled, no reason", () => {
    const settings = resolveTelemetrySettings({ SENTRY_DSN: DSN }, opts());

    expect(settings.enabled).toBe(true);
    expect(settings.disabledReason).toBeNull();
    expect(settings.dsn).toBe(DSN);
  });

  it("3. DSN + CI_TELEMETRY=off — disabled, reason opt-out", () => {
    const settings = resolveTelemetrySettings(
      { SENTRY_DSN: DSN, CI_TELEMETRY: "off" },
      opts(),
    );

    expect(settings.enabled).toBe(false);
    expect(settings.disabledReason).toBe("opt-out");
  });

  it("4. DSN + CI_LOCAL_ONLY=true — disabled, reason local-only", () => {
    const settings = resolveTelemetrySettings(
      { SENTRY_DSN: DSN, CI_LOCAL_ONLY: "true" },
      opts(),
    );

    expect(settings.enabled).toBe(false);
    expect(settings.disabledReason).toBe("local-only");
  });
});

describe("the extension's own kill switch", () => {
  it("beats a baked-in DSN", () => {
    const settings = resolveTelemetrySettings(
      { SENTRY_DSN: DSN },
      opts({ userEnabled: false }),
    );

    expect(settings.enabled).toBe(false);
    expect(settings.disabledReason).toBe("user-disabled");
  });

  it("is reported ahead of a missing DSN, so the reason names the decision", () => {
    const settings = resolveTelemetrySettings({}, opts({ userEnabled: false }));

    expect(settings.disabledReason).toBe("user-disabled");
  });

  it("is outranked by the build-time switches", () => {
    expect(
      resolveTelemetrySettings(
        { SENTRY_DSN: DSN, CI_TELEMETRY: "off" },
        opts({ userEnabled: true }),
      ).disabledReason,
    ).toBe("opt-out");
  });
});

describe("context support", () => {
  it("refuses a content script whatever else is configured", () => {
    const settings = resolveTelemetrySettings(
      { SENTRY_DSN: DSN },
      opts({ contextSupported: false }),
    );

    expect(settings.enabled).toBe(false);
    expect(settings.disabledReason).toBe("unsupported-context");
  });

  it("outranks even local-only, so the most specific refusal wins", () => {
    expect(
      resolveTelemetrySettings(
        { SENTRY_DSN: DSN, CI_LOCAL_ONLY: "true" },
        opts({ contextSupported: false }),
      ).disabledReason,
    ).toBe("unsupported-context");
  });
});

describe("precedence", () => {
  it("local-only beats opt-out", () => {
    expect(
      resolveTelemetrySettings(
        { SENTRY_DSN: DSN, CI_TELEMETRY: "off", CI_LOCAL_ONLY: "1" },
        opts(),
      ).disabledReason,
    ).toBe("local-only");
  });

  it("local-only beats a missing DSN", () => {
    expect(
      resolveTelemetrySettings({ CI_LOCAL_ONLY: "yes" }, opts()).disabledReason,
    ).toBe("local-only");
  });
});

describe("switch spellings", () => {
  it.each(["off", "false", "0", "no", "disabled", "OFF", " Off "])(
    "CI_TELEMETRY=%p opts out",
    (value) => {
      expect(isTelemetryOptedOut({ CI_TELEMETRY: value })).toBe(true);
    },
  );

  it.each(["on", "true", "1", "yes", "enabled", "", "banana"])(
    "CI_TELEMETRY=%p does not opt out",
    (value) => {
      expect(isTelemetryOptedOut({ CI_TELEMETRY: value })).toBe(false);
    },
  );

  it.each(["on", "true", "1", "yes", "enabled", "TRUE", " 1 "])(
    "CI_LOCAL_ONLY=%p is local-only",
    (value) => {
      expect(isLocalOnly({ CI_LOCAL_ONLY: value })).toBe(true);
    },
  );

  it.each(["off", "false", "0", "no", "", "maybe"])(
    "CI_LOCAL_ONLY=%p is not local-only",
    (value) => {
      expect(isLocalOnly({ CI_LOCAL_ONLY: value })).toBe(false);
    },
  );

  it("treats an unset var as unset", () => {
    expect(isTelemetryOptedOut({})).toBe(false);
    expect(isLocalOnly({})).toBe(false);
  });

  it("treats a whitespace-only DSN as no DSN", () => {
    const settings = resolveTelemetrySettings({ SENTRY_DSN: "   " }, opts());

    expect(settings.dsn).toBeNull();
    expect(settings.disabledReason).toBe("no-dsn");
  });
});

describe("environment and release", () => {
  it("defaults the environment to production — a published extension is", () => {
    expect(resolveTelemetrySettings({}, opts()).environment).toBe("production");
  });

  it("takes SENTRY_ENV when given", () => {
    const env: TelemetryEnv = { SENTRY_ENV: "staging" };

    expect(resolveTelemetrySettings(env, opts()).environment).toBe("staging");
  });

  it("derives a release from the manifest version", () => {
    expect(
      resolveTelemetrySettings({}, opts({ extensionVersion: "1.5.0" })).release,
    ).toBe("ci-browser-extension@1.5.0");
  });

  it("prefers an explicit SENTRY_RELEASE", () => {
    expect(
      resolveTelemetrySettings(
        { SENTRY_RELEASE: "custom@9" },
        opts({ extensionVersion: "1.5.0" }),
      ).release,
    ).toBe("custom@9");
  });

  it("leaves the release undefined with no version to build one from", () => {
    expect(resolveTelemetrySettings({}, opts()).release).toBeUndefined();
  });
});
