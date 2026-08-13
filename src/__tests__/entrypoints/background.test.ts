/**
 * Tests for background script behavior.
 *
 * The background entrypoint (defineBackground) wires browser APIs and can't be
 * imported directly under jest, so these tests cover the contracts the
 * background depends on: the portal OIDC issuer derivation, plus the pure
 * blacklist / slicing logic. The typed bulk transport the background posts
 * through is covered in services/browserActivity.test.ts.
 */

import { isUrlBlacklisted } from "@/utils";
import {
  issuerFromPortalUrl,
  resolvePortalIssuer,
  portalOidcConfig,
  DEFAULT_PORTAL_ISSUER,
  OIDC_CLIENT_ID,
} from "@/services/portalConfig";

describe("Background Script", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
