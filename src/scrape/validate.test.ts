import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { validateProfile } from "./validate";

const PROFILE_DIR = join(__dirname, "..", "scrapeProfiles");

function valid(): Record<string, unknown> {
  return {
    domain: "example.com",
    name: "Example",
    description: "d",
    matchPatterns: ["*://*.example.com/*"],
    targetUrl: "https://example.com/*",
    dataSelectors: {
      things: {
        personalDataType: "browsing_history",
        container: ".thing",
        fields: { title: { selector: ".t", type: "text", transform: "trim" } },
      },
    },
  };
}

describe("validateProfile", () => {
  it("accepts a well-formed profile", () => {
    expect(validateProfile(valid())).toEqual([]);
  });

  // The three failures the `as unknown as ScrapeProfile[]` cast used to let
  // through: each compiled, shipped, and then silently captured nothing.
  it("rejects an unknown field type", () => {
    const p = valid() as never as { dataSelectors: Record<string, never> };
    (p.dataSelectors.things as never as Record<string, never>).fields = {
      title: { selector: ".t", type: "txt" },
    } as never;

    expect(validateProfile(p)).toEqual([
      expect.objectContaining({
        path: "dataSelectors.things.fields.title.type",
      }),
    ]);
  });

  it("rejects a misspelled key rather than ignoring it", () => {
    const p = valid();
    (p.dataSelectors as never as Record<string, never>)["things"] = {
      personalDataType: "x",
      container: ".c",
      fields: { u: { selector: "a", type: "attribute", atribute: "href" } },
    } as never;

    const issues = validateProfile(p);
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining([
        "dataSelectors.things.fields.u.attribute",
        "dataSelectors.things.fields.u.atribute",
      ]),
    );
  });

  it("rejects a selector with no personalDataType", () => {
    const p = valid();
    delete (p.dataSelectors as never as Record<string, Record<string, unknown>>)
      .things.personalDataType;

    expect(validateProfile(p)).toEqual([
      expect.objectContaining({
        path: "dataSelectors.things.personalDataType",
      }),
    ]);
  });

  it("rejects an unknown transform, which the engine would silently no-op", () => {
    const p = valid();
    (
      p.dataSelectors as never as Record<
        string,
        { fields: Record<string, Record<string, unknown>> }
      >
    ).things.fields.title.transform = "uppercase";

    expect(validateProfile(p)).toEqual([
      expect.objectContaining({
        path: "dataSelectors.things.fields.title.transform",
      }),
    ]);
  });

  it("rejects structural problems", () => {
    expect(validateProfile(null)).not.toEqual([]);
    expect(validateProfile({ ...valid(), matchPatterns: [] })).not.toEqual([]);
    expect(validateProfile({ ...valid(), dataSelectors: {} })).not.toEqual([]);
    expect(validateProfile({ ...valid(), sensitive: "yes" })).not.toEqual([]);
  });
});

describe("shipped profile JSON", () => {
  const files = readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".json"));

  it("finds the profile files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  // Covers template.json too — it is the file people copy, so a malformed
  // template propagates into every profile written from it.
  it.each(files)("%s is schema-valid", (file) => {
    const raw = JSON.parse(readFileSync(join(PROFILE_DIR, file), "utf8"));

    expect(validateProfile(raw)).toEqual([]);
  });
});
