import type { Breadcrumb, ErrorEvent } from "@sentry/browser";
import {
  redactUrl,
  scrubBreadcrumb,
  scrubExtensionEvent,
  scrubString,
  scrubValue,
} from "./scrubEvent";
import {
  EXTENSION_SCRUB_CASES,
  MAX_STRING_LENGTH,
  SCRUB_CASES,
  type ScrubCase,
} from "./scrubFixtures";

function runCases(cases: readonly ScrubCase[]) {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const output = scrubString(testCase.input);

    if (testCase.expected !== undefined) {
      expect(output).toBe(testCase.expected);
    }

    for (const forbidden of testCase.mustNotContain ?? []) {
      expect(output).not.toContain(forbidden);
    }
  });
}

describe("fleet-wide scrub cases", () => {
  runCases(SCRUB_CASES);
});

describe("extension-only scrub cases", () => {
  runCases(EXTENSION_SCRUB_CASES);
});

describe("drift guard against the canonical fixture list", () => {
  // SCRUB_CASES is a byte-for-byte copy of CI-Server's
  // backend/apps/api/src/common/telemetry/scrubFixtures.ts. If someone edits the
  // copied block, this fails and forces the change to be made in every repo
  // rather than silently in one.
  it("still carries exactly the canonical cases, in order", () => {
    expect(SCRUB_CASES.map((c) => c.name)).toEqual([
      "bearer token",
      "labelled api key",
      "hyphenated api key",
      "labelled password",
      "tailscale auth key",
      "credentials in a connection URL",
      "macOS home path",
      "Linux home path",
      "Windows home path, backslash",
      "Windows home path, forward slash",
      "ordinary text is untouched",
    ]);
  });

  it("agrees with the canonical truncation length", () => {
    expect(MAX_STRING_LENGTH).toBe(8000);
  });
});

describe("redactUrl", () => {
  it("deletes a third-party URL entirely — origin and path included", () => {
    expect(redactUrl("https://mail.google.com/mail/u/0/#inbox")).toBe("[url]");
    expect(redactUrl("http://192.168.1.40:8080/admin")).toBe("[url]");
  });

  it("keeps a first-party Portal origin and path", () => {
    expect(redactUrl("https://hub.ci.computer/api/auth/token")).toBe(
      "https://hub.ci.computer/api/auth/token",
    );
  });

  it("drops the query and hash even on a first-party host", () => {
    expect(
      redactUrl("https://hub.ci.computer/extension/oidc-callback?code=live#x"),
    ).toBe("https://hub.ci.computer/extension/oidc-callback");
  });

  it("does not treat a lookalike host as first-party", () => {
    expect(redactUrl("https://hub.ci.computer.evil.example/a")).toBe("[url]");
    expect(redactUrl("https://evil.example/hub.ci.computer")).toBe("[url]");
  });

  it("never throws on an unparseable value", () => {
    expect(redactUrl("https://")).toBe("[url]");
  });
});

describe("scrubString", () => {
  it("truncates oversized strings", () => {
    const output = scrubString("a".repeat(MAX_STRING_LENGTH + 500));

    expect(output.endsWith("… [truncated]")).toBe(true);
    expect(output.length).toBeLessThan(MAX_STRING_LENGTH + 20);
  });

  it("redacts several URLs in one string", () => {
    expect(scrubString("https://a.example/1 then https://b.example/2")).toBe(
      "[url] then [url]",
    );
  });

  it("leaves a non-HTTP connection URL to the credential rule", () => {
    const output = scrubString("redis://ci:s3cret@cache:6379/0");

    expect(output).not.toContain("s3cret");
  });

  it("collapses a home path and a page URL in the same string", () => {
    expect(
      scrubString(
        "/Users/liam/ext/background.js fetching https://bank.example/x",
      ),
    ).toBe("~/ext/background.js fetching [url]");
  });
});

describe("scrubValue", () => {
  it("filters credential-bearing keys wholesale", () => {
    expect(scrubValue({ authorization: "anything at all" })).toEqual({
      authorization: "[Filtered]",
    });
  });

  it("filters keys that name a person", () => {
    expect(
      scrubValue({
        email: "liam@example.com",
        username: "liam",
        owner: "liam",
      }),
    ).toEqual({
      email: "[Filtered]",
      username: "[Filtered]",
      owner: "[Filtered]",
    });
  });

  it("keeps anchored diagnostic keys that merely contain user/owner", () => {
    expect(
      scrubValue({ "user-agent": "Firefox/1", user_id: "u1", owner_id: "o1" }),
    ).toEqual({ "user-agent": "Firefox/1", user_id: "u1", owner_id: "o1" });
  });

  it("redacts URLs nested in arbitrary values", () => {
    expect(
      scrubValue({ activities: [{ url: "https://secure.chase.com/a", n: 2 }] }),
    ).toEqual({ activities: [{ url: "[url]", n: 2 }] });
  });

  it("survives a cyclic structure", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => scrubValue(cyclic)).not.toThrow();
    expect(JSON.stringify(scrubValue(cyclic))).toContain("[Truncated]");
  });

  it("leaves non-string primitives alone", () => {
    expect(scrubValue({ a: 1, b: true, c: null })).toEqual({
      a: 1,
      b: true,
      c: null,
    });
  });
});

describe("scrubBreadcrumb", () => {
  it("scrubs the message and the whole data object", () => {
    const crumb: Breadcrumb = {
      message: "navigated to https://mychart.example.org/results",
      // A bare `token` value matches no secret pattern — only the KEY check
      // catches it, which is why the whole object is passed to the walker.
      data: { token: "eyJhbGciOi", url: "https://bank.example/accounts" },
    };

    const scrubbed = scrubBreadcrumb(crumb);

    expect(scrubbed.message).toBe("navigated to [url]");
    expect(scrubbed.data).toEqual({ token: "[Filtered]", url: "[url]" });
  });
});

describe("scrubExtensionEvent", () => {
  const baseEvent = (): ErrorEvent =>
    ({
      message: "sync failed for https://mail.google.com/mail/u/0",
      exception: {
        values: [
          {
            type: "TypeError",
            value:
              "Failed to fetch https://companion.home.ts.net/api/v1/contents",
            mechanism: {
              type: "generic",
              handled: false,
              data: { url: "https://x.example/y" },
            },
            stacktrace: {
              frames: [
                {
                  filename:
                    "moz-extension://3f2b1c4d-9a8e-4f10-b2c3-d4e5f6a7b8c9/background.js",
                  abs_path:
                    "moz-extension://3f2b1c4d-9a8e-4f10-b2c3-d4e5f6a7b8c9/background.js",
                  context_line: 'const KEY = "api_key=sk-live-777";',
                  pre_context: ["// /Users/liam/devel/ci"],
                  post_context: ["fetch('https://bank.example/x')"],
                  vars: { title: "Chase — Account summary", token: "abc" },
                },
              ],
            },
          },
        ],
      },
    }) as unknown as ErrorEvent;

  it("redacts URLs in the message and the exception value", () => {
    const event = scrubExtensionEvent(baseEvent())!;

    expect(event.message).toBe("sync failed for [url]");
    expect(event.exception!.values![0]!.value).toBe("Failed to fetch [url]");
  });

  it("strips the install-identifying extension origin but keeps the path", () => {
    const frame =
      scrubExtensionEvent(baseEvent())!.exception!.values![0]!.stacktrace!
        .frames![0]!;

    expect(frame.filename).toBe("extension://background.js");
    expect(frame.abs_path).toBe("extension://background.js");
    expect(frame.filename).not.toContain("3f2b1c4d");
  });

  it("scrubs source context, home paths and captured locals", () => {
    const frame =
      scrubExtensionEvent(baseEvent())!.exception!.values![0]!.stacktrace!
        .frames![0]!;

    expect(frame.context_line).not.toContain("sk-live-777");
    expect(frame.pre_context).toEqual(["// ~/devel/ci"]);
    expect(frame.post_context).toEqual(["fetch('[url]')"]);
    expect(frame.vars).toEqual({
      title: "Chase — Account summary",
      token: "[Filtered]",
    });
  });

  it("scrubs exception mechanism data", () => {
    const mechanism =
      scrubExtensionEvent(baseEvent())!.exception!.values![0]!.mechanism!;

    expect(mechanism.data).toEqual({ url: "[url]" });
  });

  it("deletes request context wholesale — there is no safe field in it", () => {
    const event = {
      ...baseEvent(),
      request: {
        url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html",
        headers: { Referer: "https://mail.google.com/" },
        cookies: { session: "x" },
      },
    } as unknown as ErrorEvent;

    expect(scrubExtensionEvent(event)!.request).toBeUndefined();
  });

  it("deletes breadcrumbs wholesale", () => {
    const event = {
      ...baseEvent(),
      breadcrumbs: [
        {
          category: "console",
          message: "Failed activities:",
          data: {
            arguments: [{ url: "https://bank.example/x", title: "Chase" }],
          },
        },
      ],
    } as unknown as ErrorEvent;

    expect(scrubExtensionEvent(event)!.breadcrumbs).toBeUndefined();
  });

  it("deletes the user and the server name", () => {
    const event = {
      ...baseEvent(),
      user: { id: "u1", email: "liam@example.com" },
      server_name: "liams-macbook.local",
    } as unknown as ErrorEvent;

    const scrubbed = scrubExtensionEvent(event)!;

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.server_name).toBeUndefined();
  });

  it("drops the culture context — locale and timezone are a fingerprint", () => {
    const event = {
      ...baseEvent(),
      contexts: { culture: { locale: "en-GB", timezone: "Europe/London" } },
    } as unknown as ErrorEvent;

    expect(scrubExtensionEvent(event)!.contexts!.culture).toBeUndefined();
  });

  it("scrubs extra and tags", () => {
    const event = {
      ...baseEvent(),
      extra: {
        serverURL: "https://companion.home.ts.net",
        authorization: "Bearer x",
      },
      tags: { component: "ci-browser-extension-background" },
    } as unknown as ErrorEvent;

    const scrubbed = scrubExtensionEvent(event)!;

    expect(scrubbed.extra).toEqual({
      serverURL: "[url]",
      authorization: "[Filtered]",
    });
    expect(scrubbed.tags).toEqual({
      component: "ci-browser-extension-background",
    });
  });

  it("handles an event with nothing on it", () => {
    expect(() => scrubExtensionEvent({} as ErrorEvent)).not.toThrow();
  });
});
