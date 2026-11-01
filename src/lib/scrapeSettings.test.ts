import type { ScrapeProfile } from "@/scrape/types";

import {
  mayRunProfile,
  readScrapeConsent,
  SCRAPE_CONSENT_KEY,
} from "./scrapeSettings";

const open: Pick<ScrapeProfile, "dataCategories"> = {};
const financial: Pick<ScrapeProfile, "dataCategories"> = {
  dataCategories: ["financial"],
};
const financialAndHealth: Pick<ScrapeProfile, "dataCategories"> = {
  dataCategories: ["financial", "health"],
};

describe("mayRunProfile", () => {
  it("runs a profile that declares no categories, with nothing granted", () => {
    expect(mayRunProfile(open, {})).toBe(true);
  });

  it("does not run a financial profile without financial consent", () => {
    expect(mayRunProfile(financial, {})).toBe(false);
    expect(mayRunProfile(financial, { financial: false })).toBe(false);
  });

  it("does not let consent for one category open another", () => {
    expect(
      mayRunProfile(financial, { location: true, health: true, media: true }),
    ).toBe(false);
  });

  it("runs once its category is granted", () => {
    expect(mayRunProfile(financial, { financial: true })).toBe(true);
  });

  it("needs every category a profile declares", () => {
    expect(mayRunProfile(financialAndHealth, { financial: true })).toBe(false);
    expect(
      mayRunProfile(financialAndHealth, { financial: true, health: true }),
    ).toBe(true);
  });

  it("counts only a literal true as a grant", () => {
    expect(
      mayRunProfile(financial, { financial: "true" as unknown as boolean }),
    ).toBe(false);
  });
});

describe("readScrapeConsent", () => {
  const get = browser.storage.local.get as unknown as jest.Mock;

  beforeEach(() => {
    get.mockReset();
  });

  it("returns the stored grants", async () => {
    get.mockResolvedValueOnce({ [SCRAPE_CONSENT_KEY]: { financial: true } });

    await expect(readScrapeConsent()).resolves.toEqual({ financial: true });
    expect(get).toHaveBeenCalledWith(SCRAPE_CONSENT_KEY);
  });

  it("grants nothing when the key is absent", async () => {
    get.mockResolvedValueOnce({});

    await expect(readScrapeConsent()).resolves.toEqual({});
  });

  it("grants nothing when the stored value is not an object", async () => {
    get.mockResolvedValueOnce({ [SCRAPE_CONSENT_KEY]: true });

    await expect(readScrapeConsent()).resolves.toEqual({});
  });

  it("grants nothing when storage cannot be read", async () => {
    get.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(readScrapeConsent()).resolves.toEqual({});
  });
});
