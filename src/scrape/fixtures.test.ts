/**
 * Runs every shipped profile against its saved fixture.
 *
 * Before this existed, twelve of thirteen profiles had never had a selector
 * executed against markup of any kind: `scraper.test.ts` proved the engine
 * worked using a hand-written stand-in, and `profiles.test.ts` checked registry
 * invariants without ever calling `extract`. A profile could be committed with a
 * container that matched nothing and every test would pass.
 *
 * On what this does and does not prove — especially for `synthetic` fixtures —
 * see `src/scrapeProfiles/__fixtures__/README.md`. The short version: a
 * synthetic fixture proves the engine and the profile's internal consistency,
 * not that the selectors match the live site.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SCRAPE_PROFILES } from "./profiles";
import { extract, looksBroken } from "./scraper";
import { validateProfile } from "./validate";

const FIXTURE_DIR = join(__dirname, "..", "scrapeProfiles", "__fixtures__");

interface FixtureMeta {
  url: string;
  provenance: "captured" | "synthetic";
  capturedAt?: string;
  expect: Record<string, number>;
}

/** Profile file slug, e.g. `netflix` for netflix.com. */
function slugFor(domain: string): string {
  const known: Record<string, string> = {
    "disneyplus.com": "disney",
    "paramountplus.com": "paramount",
    "primevideo.com": "primevideo",
    "slashdot.org": "slashdot",
    "wsj.com": "wsj",
  };

  return known[domain] ?? domain.replace(/\.(com|org|net|tv)$/, "");
}

function loadFixture(slug: string): { html: string; meta: FixtureMeta } | null {
  const html = join(FIXTURE_DIR, `${slug}.html`);
  const meta = join(FIXTURE_DIR, `${slug}.json`);
  if (!existsSync(html) || !existsSync(meta)) {
    return null;
  }

  return {
    html: readFileSync(html, "utf8"),
    meta: JSON.parse(readFileSync(meta, "utf8")) as FixtureMeta,
  };
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("every profile has a fixture", () => {
  // The gate. A new profile without a fixture fails here rather than shipping
  // unverified — which is how five unreachable profiles survived before.
  it.each(SCRAPE_PROFILES.map((p) => [p.domain] as const))(
    "%s has a fixture and metadata",
    (domain) => {
      expect(loadFixture(slugFor(domain))).not.toBeNull();
    },
  );

  it("has no orphaned fixtures for profiles that no longer exist", () => {
    const slugs = new Set(SCRAPE_PROFILES.map((p) => slugFor(p.domain)));
    const orphans = readdirSync(FIXTURE_DIR)
      .filter((f) => f.endsWith(".html"))
      .map((f) => f.replace(/\.html$/, ""))
      .filter((s) => !slugs.has(s));

    expect(orphans).toEqual([]);
  });
});

describe.each(SCRAPE_PROFILES.map((p) => [p.domain, p] as const))(
  "%s",
  (domain, profile) => {
    const fixture = loadFixture(slugFor(domain));

    // The "has a fixture" suite above already fails loudly; skip the body
    // rather than throwing a confusing second error for the same cause.
    if (!fixture) {
      it.skip("extracts from its fixture (no fixture found)", () => {});

      return;
    }

    const { html, meta } = fixture;

    it("is a schema-valid profile", () => {
      expect(validateProfile(profile)).toEqual([]);
    });

    it("actually runs on the fixture's URL", () => {
      // A fixture URL the profile doesn't match means the test would silently
      // assert nothing at all.
      const { diagnostics } = extract(parse(html), meta.url);
      expect(diagnostics.length).toBeGreaterThan(0);
    });

    it("names only real selectors in `expect`", () => {
      const real = Object.keys(profile.dataSelectors);
      expect(real).toEqual(expect.arrayContaining(Object.keys(meta.expect)));
    });

    it.each(Object.entries(meta.expect))(
      "extracts at least %s items from selector",
      (selector, minItems) => {
        const { result, diagnostics } = extract(parse(html), meta.url);
        const diag = diagnostics.find((d) => d.selector === selector);

        expect(diag).toBeDefined();
        // Report the diagnostic in the failure message — "expected 3, got 0" is
        // useless without knowing whether the container matched.
        expect({
          selector,
          containersMatched: diag?.containersMatched,
          itemsProduced: diag?.itemsProduced,
          perFieldHitRate: diag?.perFieldHitRate,
        }).toMatchObject({
          itemsProduced: expect.any(Number),
        });
        expect(diag!.itemsProduced).toBeGreaterThanOrEqual(minItems as number);
        expect(looksBroken(diag!)).toBe(false);

        const items = result!.items.filter((i) => i.selector === selector);
        expect(items.length).toBeGreaterThanOrEqual(minItems as number);
        // Classification must survive extraction — it is what types the row.
        for (const item of items) {
          expect(item.personalDataType).toBe(
            profile.dataSelectors[selector].personalDataType,
          );
        }
      },
    );

    it("records fixture provenance", () => {
      // Synthetic fixtures are a floor, not proof. Surfacing provenance in the
      // suite keeps that visible rather than letting a green run imply more
      // than it does.
      expect(["captured", "synthetic"]).toContain(meta.provenance);
    });
  },
);
