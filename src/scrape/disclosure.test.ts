/**
 * The Firefox data-collection disclosure. The optional scrape categories are
 * derived from the registry, and the Firefox manifest that wxt.config.ts builds
 * must carry exactly that derived list.
 */

import config from "../../wxt.config";

import { firefoxOptionalDisclosures } from "./disclosure";
import { SCRAPE_PROFILES } from "./profiles";

// wxt.config.ts needs these only to assemble the config object. Mocking them
// keeps the build tooling out of the test, and the manifest function itself is
// the thing under test.
jest.mock("wxt", () => ({ defineConfig: (config: unknown) => config }));
jest.mock("@tailwindcss/vite", () => ({
  __esModule: true,
  default: () => ({}),
}));
jest.mock("@vitejs/plugin-react-swc", () => ({
  __esModule: true,
  default: () => ({}),
}));

interface GeckoPermissions {
  required: string[];
  optional: string[];
}

interface Manifest {
  browser_specific_settings?: {
    gecko?: { data_collection_permissions?: GeckoPermissions };
  };
}

function manifestFor(browser: "firefox" | "chrome"): Manifest {
  const build = config.manifest as unknown as (env: {
    browser: string;
    manifestVersion: number;
    mode: string;
    command: string;
  }) => Manifest;

  return build({
    browser,
    manifestVersion: browser === "firefox" ? 2 : 3,
    mode: "production",
    command: "build",
  });
}

describe("firefoxOptionalDisclosures", () => {
  it("declares nothing when no profile reads a category", () => {
    expect(firefoxOptionalDisclosures([{ domain: "plain.example" }])).toEqual(
      [],
    );
  });

  it("maps each classified category to its AMO key", () => {
    expect(
      firefoxOptionalDisclosures([
        { domain: "bank.example", dataCategories: ["financial"] },
        { domain: "clinic.example", dataCategories: ["health"] },
        { domain: "maps.example", dataCategories: ["location"] },
      ]),
    ).toEqual(["financialAndPaymentInfo", "healthInfo", "locationInfo"]);
  });

  it("declares each key once, however many profiles need it", () => {
    expect(
      firefoxOptionalDisclosures([
        { domain: "bank-a.example", dataCategories: ["financial"] },
        { domain: "bank-b.example", dataCategories: ["financial"] },
      ]),
    ).toEqual(["financialAndPaymentInfo"]);
  });

  it("refuses a category with no AMO classification rather than guessing", () => {
    expect(() =>
      firefoxOptionalDisclosures([
        { domain: "books.example", dataCategories: ["reading"] },
      ]),
    ).toThrow(/"reading".*books\.example/);
  });

  it("derives nothing from the shipped registry, which declares no categories", () => {
    expect(firefoxOptionalDisclosures(SCRAPE_PROFILES)).toEqual([]);
  });
});

describe("wxt.config.ts Firefox manifest", () => {
  it("declares the registry-derived categories plus crash reporting", () => {
    const gecko =
      manifestFor("firefox").browser_specific_settings?.gecko
        ?.data_collection_permissions;

    expect(gecko?.optional).toEqual([
      ...firefoxOptionalDisclosures(SCRAPE_PROFILES),
      "technicalAndInteraction",
    ]);
  });

  it("adds no disclosure to the Chrome manifest", () => {
    expect(manifestFor("chrome").browser_specific_settings).toBeUndefined();
  });
});
