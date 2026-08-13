import type { ErrorEvent } from "@sentry/browser";
import type { TelemetryEnv } from "./settings";

const DSN = "https://abc123@o1.ingest.us.sentry.io/9999999";

const storage = browser.storage.local as unknown as { get: jest.Mock };

type Telemetry = typeof import("./index");

/**
 * Each case gets a fresh module registry: `initTelemetry` is a singleton and
 * `Sentry.init` binds a client to the global carrier.
 */
async function load(userEnabled = true): Promise<Telemetry> {
  jest.resetModules();
  storage.get.mockResolvedValue(
    userEnabled ? {} : { errorReportingEnabled: false },
  );

  return import("./index");
}

async function start(
  mod: Telemetry,
  env: TelemetryEnv,
  contextSupported = true,
) {
  return mod.initTelemetry({
    component: "background",
    env,
    extensionVersion: "1.5.0",
    contextSupported,
  });
}

describe("isReportableHref — the content-script refusal", () => {
  it.each([
    "chrome-extension://abcdefghijklmnop/popup.html",
    "moz-extension://3f2b1c4d-9a8e-4f10-b2c3-d4e5f6a7b8c9/background.html",
    "safari-web-extension://ABCD-1234/popup.html",
    "ms-browser-extension://abc/popup.html",
  ])("allows the dedicated extension page %p", async (href) => {
    const mod = await load();

    expect(mod.isReportableHref(href)).toBe(true);
  });

  it.each([
    "https://mail.google.com/mail/u/0",
    "https://secure.chase.com/dashboard",
    "https://robinhood.com/account/positions",
    "https://hub.ci.computer/extension/oidc-callback?code=live",
    "http://localhost:3000/",
    "about:blank",
    "file:///Users/liam/page.html",
  ])("refuses the page context %p", async (href) => {
    const mod = await load();

    expect(mod.isReportableHref(href)).toBe(false);
  });

  it("refuses a missing href rather than assuming", async () => {
    const mod = await load();

    expect(mod.isReportableHref(null)).toBe(false);
    expect(mod.isReportableHref(undefined)).toBe(false);
  });

  it("refuses a page that merely mentions an extension URL", async () => {
    const mod = await load();

    expect(
      mod.isReportableHref("https://evil.example/?u=chrome-extension://abc/x"),
    ).toBe(false);
  });
});

describe("initTelemetry", () => {
  it("starts a client when a DSN is configured", async () => {
    const mod = await load();

    await expect(start(mod, { SENTRY_DSN: DSN })).resolves.toBeDefined();
    expect(mod.telemetryDisabledReason()).toBeNull();
    expect(mod.isTelemetryActive()).toBe(true);
  });

  it.each([
    ["no DSN", {}, true, "no-dsn"],
    [
      "CI_TELEMETRY=off",
      { SENTRY_DSN: DSN, CI_TELEMETRY: "off" },
      true,
      "opt-out",
    ],
    [
      "CI_LOCAL_ONLY=true",
      { SENTRY_DSN: DSN, CI_LOCAL_ONLY: "true" },
      true,
      "local-only",
    ],
    ["a content script", { SENTRY_DSN: DSN }, false, "unsupported-context"],
  ] as const)(
    "starts nothing for %s",
    async (_label, env, contextSupported, reason) => {
      const mod = await load();

      await expect(start(mod, env, contextSupported)).resolves.toBeUndefined();
      expect(mod.telemetryDisabledReason()).toBe(reason);
      expect(mod.isTelemetryActive()).toBe(false);
    },
  );

  it("starts nothing when the user turned reporting off", async () => {
    const mod = await load(false);

    await expect(start(mod, { SENTRY_DSN: DSN })).resolves.toBeUndefined();
    expect(mod.telemetryDisabledReason()).toBe("user-disabled");
  });

  it("reports 'uninitialised' before it has run — distinct from 'no-dsn'", async () => {
    const mod = await load();

    expect(mod.telemetryDisabledReason()).toBe("uninitialised");
  });

  it("is idempotent", async () => {
    const mod = await load();
    const first = await start(mod, { SENTRY_DSN: DSN });

    await expect(start(mod, { SENTRY_DSN: DSN })).resolves.toBe(first);
  });

  it("never throws when storage is broken — it just does not report", async () => {
    jest.resetModules();
    storage.get.mockRejectedValue(new Error("storage gone"));
    const mod: Telemetry = await import("./index");

    await expect(start(mod, { SENTRY_DSN: DSN })).resolves.toBeUndefined();
    expect(mod.telemetryDisabledReason()).toBe("user-disabled");
  });
});

describe("the configured client", () => {
  it("carries no tracing and no PII", async () => {
    const mod = await load();
    const options = (await start(mod, { SENTRY_DSN: DSN }))!.getOptions();

    expect(options.tracesSampleRate).toBe(0);
    expect(options.sendDefaultPii).toBe(false);
  });

  it("installs none of the collecting integrations", async () => {
    const mod = await load();
    const client = (await start(mod, { SENTRY_DSN: DSN }))!;
    const names = (client.getOptions().integrations ?? []).map((i) => i.name);

    // Every one of these reads something that belongs to the user or the page.
    for (const banned of [
      "Breadcrumbs",
      "HttpContext",
      "CultureContext",
      "BrowserSession",
      "BrowserApiErrors",
    ]) {
      expect(names).not.toContain(banned);
    }

    expect(names).toContain("GlobalHandlers");
  });

  it("drops every breadcrumb before it can be recorded", async () => {
    const mod = await load();
    const options = (await start(mod, { SENTRY_DSN: DSN }))!.getOptions();

    expect(
      options.beforeBreadcrumb!(
        { category: "console", message: "Failed activities:" },
        {},
      ),
    ).toBeNull();
  });

  it("scrubs through beforeSend", async () => {
    const mod = await load();
    const options = (await start(mod, { SENTRY_DSN: DSN }))!.getOptions();
    const event = { message: "boom at https://bank.example/x" } as ErrorEvent;

    expect((options.beforeSend!(event, {}) as ErrorEvent).message).toBe(
      "boom at [url]",
    );
  });
});

describe("the live kill switch", () => {
  const original = browser.storage;

  afterEach(() => {
    (browser as unknown as { storage: unknown }).storage = original;
  });

  function armOnChanged() {
    const handlers: ((c: Record<string, { newValue?: unknown }>) => void)[] =
      [];

    (browser as unknown as { storage: unknown }).storage = {
      ...original,
      onChanged: {
        addListener: (h: (c: Record<string, { newValue?: unknown }>) => void) =>
          handlers.push(h),
        removeListener: () => undefined,
      },
    };

    return handlers;
  }

  it("drops events the moment the toggle flips, with no restart", async () => {
    const handlers = armOnChanged();
    const mod = await load();
    const options = (await start(mod, { SENTRY_DSN: DSN }))!.getOptions();
    const event = () => ({ message: "boom" }) as ErrorEvent;

    expect(options.beforeSend!(event(), {})).not.toBeNull();

    handlers[0]!({ errorReportingEnabled: { newValue: false } });

    expect(options.beforeSend!(event(), {})).toBeNull();
    expect(mod.isTelemetryActive()).toBe(false);
  });

  it("brings the client up when the user turns reporting back on", async () => {
    const handlers = armOnChanged();
    const mod = await load(false);

    expect(await start(mod, { SENTRY_DSN: DSN })).toBeUndefined();

    storage.get.mockResolvedValue({});
    handlers[0]!({ errorReportingEnabled: { newValue: true } });
    await Promise.resolve();
    await Promise.resolve();

    expect(mod.isTelemetryActive()).toBe(true);
  });
});

describe("captureException and flushTelemetry never disturb the caller", () => {
  it("are no-ops with no client", async () => {
    const mod = await load();

    expect(() =>
      mod.captureException(new Error("x"), { scope: "test" }),
    ).not.toThrow();
    await expect(mod.flushTelemetry()).resolves.toBe(true);
  });

  it("accepts context without throwing once started", async () => {
    const mod = await load();

    await start(mod, { SENTRY_DSN: DSN });

    expect(() =>
      mod.captureException(new Error("x"), { scope: "auto-sync", count: 3 }),
    ).not.toThrow();
  });
});
