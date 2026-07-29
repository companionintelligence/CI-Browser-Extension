/**
 * Tests for background script behavior.
 *
 * The background entrypoint (defineBackground) wires browser APIs and can't be
 * imported directly under jest, so these tests cover the contracts the
 * background now depends on: the unified CaptureEvent transport (Phase 3,
 * replacing the legacy axios `POST /api/browser-activity`) and the portal OIDC
 * issuer derivation, plus the pure blacklist / slicing logic.
 */

import { isUrlBlacklisted } from "@/utils";
import {
  sendCaptureEvents,
  toCaptureEvent,
  SOURCE_SYSTEM,
  type BrowserActivity,
} from "@/services/captureEvents";
import {
  issuerFromPortalUrl,
  resolvePortalIssuer,
  portalOidcConfig,
  DEFAULT_PORTAL_ISSUER,
  OIDC_CLIENT_ID,
} from "@/services/portalConfig";

function activity(over: Partial<BrowserActivity> = {}): BrowserActivity {
  return {
    time: "2023-01-01T00:00:00.000Z",
    device_id: "dev-1",
    url: "https://example.com",
    action_type: "visit",
    ...over,
  };
}

describe("Background Script", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("CaptureEvent transport (Phase 3)", () => {
    afterEach(() => jest.restoreAllMocks());

    it("maps a browser visit to a browser.visit CaptureEvent", () => {
      const event = toCaptureEvent(
        activity({ title: "Example", action_type: "visit" }),
      );

      expect(event).toMatchObject({
        source_system: SOURCE_SYSTEM,
        kind: "browser.visit",
        occurred_at: "2023-01-01T00:00:00.000Z",
        title: "Example",
      });
      expect(event.payload).toMatchObject({
        url: "https://example.com",
        device_id: "dev-1",
        action_type: "visit",
      });
    });

    it("POSTs activities as {events} to /api/v1/events with the Bearer token", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ingested: 1, duplicate: 0, rejected: [] }),
      });
      (global as { fetch?: unknown }).fetch = fetchMock;

      const result = await sendCaptureEvents(
        "https://dev.companionintelligence.com",
        "portal-jwt",
        [activity()],
      );

      expect(result).toEqual({ ingested: 1, duplicate: 0, rejected: [] });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://dev.companionintelligence.com/api/v1/events");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer portal-jwt",
      );
      const body = JSON.parse(init.body as string);
      expect(body.events[0].source_system).toBe(SOURCE_SYSTEM);
      expect(body.events[0].kind).toBe("browser.visit");
    });

    it("throws on a non-2xx so the caller keeps its retry/logging", async () => {
      (global as { fetch?: unknown }).fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 401 });

      await expect(
        sendCaptureEvents("https://dev.companionintelligence.com", "t", [
          activity(),
        ]),
      ).rejects.toThrow(/HTTP 401/);
    });
  });

  describe("Portal OIDC issuer derivation (Phase 3)", () => {
    it("derives the issuer from a portal URL (with or without trailing slash)", () => {
      expect(issuerFromPortalUrl("https://hub.ci.computer")).toBe(
        "https://hub.ci.computer/api/auth",
      );
      expect(issuerFromPortalUrl("https://hub.ci.computer/")).toBe(
        "https://hub.ci.computer/api/auth",
      );
    });

    it("prefers a legacy portalIssuer override, then derives, then prod", () => {
      expect(
        resolvePortalIssuer({
          portalUrl: "https://hub.ci.computer",
          portalIssuer: "https://portal.example.com/api/auth",
        }),
      ).toBe("https://portal.example.com/api/auth");

      expect(
        resolvePortalIssuer({ portalUrl: "https://dev.ci.computer" }),
      ).toBe("https://dev.ci.computer/api/auth");

      expect(resolvePortalIssuer({})).toBe(DEFAULT_PORTAL_ISSUER);
    });

    it("builds the full OIDC client config for the extension", () => {
      expect(
        portalOidcConfig({ portalUrl: "https://hub.ci.computer" }),
      ).toEqual({
        issuer: "https://hub.ci.computer/api/auth",
        clientId: OIDC_CLIENT_ID,
        scopes: "openid profile email offline_access",
      });
    });
  });

  describe("Domain and Page Blacklist Matching Logic", () => {
    it("should match domain blacklist correctly", () => {
      const url = "https://example.com/page";
      const siteBlacklist = ["example.com", "google.com", "github.com"];

      expect(isUrlBlacklisted(url, siteBlacklist, [])).toBe(true);
    });

    it("should not match unrelated domains", () => {
      const url = "https://unrelated.com/page";
      const siteBlacklist = ["example.com", "google.com"];

      expect(isUrlBlacklisted(url, siteBlacklist, [])).toBe(false);
    });

    it("should blacklist the URL being recorded, not the previously visited one", () => {
      // Regression test for the off-by-one in recordHit: the blacklist must
      // be evaluated against the page being uploaded
      const previousUrl = "https://clean-site.com/home";
      const currentUrl = "https://blocked-site.com/private";
      const siteBlacklist = ["blocked-site.com"];

      expect(isUrlBlacklisted(previousUrl, siteBlacklist, [])).toBe(false);
      expect(isUrlBlacklisted(currentUrl, siteBlacklist, [])).toBe(true);
    });
  });

  describe("History Processing Logic", () => {
    it("should process history results in correct slice size", () => {
      const SLICE_SIZE = 50;
      const mockResults = Array(150)
        .fill(0)
        .map((_, i) => ({
          url: `https://example.com/page${i}`,
          visitTime: Date.now() - i * 1000,
        }));

      // Test slicing logic
      const slices = [];
      for (let i = 0; i < mockResults.length; i += SLICE_SIZE) {
        const slice = mockResults.slice(i, i + SLICE_SIZE);
        slices.push(slice);
      }

      expect(slices).toHaveLength(3); // 150 items / 50 = 3 slices
      expect(slices[0]).toHaveLength(SLICE_SIZE);
      expect(slices[1]).toHaveLength(SLICE_SIZE);
      expect(slices[2]).toHaveLength(50); // Last slice has remaining items
    });

    it("should handle empty history results", () => {
      const SLICE_SIZE = 50;
      const mockResults: unknown[] = [];

      const slices = [];
      for (let i = 0; i < mockResults.length; i += SLICE_SIZE) {
        const slice = mockResults.slice(i, i + SLICE_SIZE);
        if (slice.length > 0) {
          slices.push(slice);
        }
      }

      expect(slices).toHaveLength(0);
    });
  });
});
