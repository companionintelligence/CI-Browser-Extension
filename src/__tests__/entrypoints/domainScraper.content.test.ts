/**
 * The consent gate in the content script. A profile that declares a data
 * category must not read its page until the user has granted that category, and
 * a profile that declares none must run as it did before consent existed.
 */

import { profileForUrl, scrape } from "@/scrape/scraper";
import type { ScrapeProfile } from "@/scrape/types";

jest.mock("@/scrape/scraper", () => ({
  profileForUrl: jest.fn(),
  scrape: jest.fn(),
}));

interface ContentScriptDefinition {
  main: () => void;
}

const mocked = (fn: unknown) => fn as jest.Mock;

const bankProfile = {
  domain: "bank.example",
  name: "Bank",
  description: "Test profile",
  matchPatterns: ["*://*.bank.example/*"],
  targetUrl: "https://bank.example/*",
  dataCategories: ["financial"],
  dataSelectors: {},
} as unknown as ScrapeProfile;

const newsProfile = {
  ...bankProfile,
  domain: "news.example",
  dataCategories: undefined,
} as unknown as ScrapeProfile;

const storageGet = mocked(browser.storage.local.get);
const sendMessage = jest.fn(() => Promise.resolve());
let script: ContentScriptDefinition;

beforeAll(async () => {
  (globalThis as { defineContentScript?: unknown }).defineContentScript = (
    definition: unknown,
  ) => definition;
  (browser.runtime as unknown as { sendMessage: unknown }).sendMessage =
    sendMessage;
  script = (await import("@/entrypoints/domainScraper.content"))
    .default as unknown as ContentScriptDefinition;
});

/** Run the content script, then let its consent read and send settle. */
async function runScript(): Promise<void> {
  script.main();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("consent gate in the content script", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked(scrape).mockReturnValue({ items: [] });
  });

  it("does not read a gated page when nothing is granted", async () => {
    mocked(profileForUrl).mockReturnValue(bankProfile);
    storageGet.mockResolvedValue({});

    await runScript();

    expect(scrape).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not read it when only a different category is granted", async () => {
    mocked(profileForUrl).mockReturnValue(bankProfile);
    storageGet.mockResolvedValue({
      scrapeConsent: { location: true, health: true },
    });

    await runScript();

    expect(scrape).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("reads and sends the page once its category is granted", async () => {
    mocked(profileForUrl).mockReturnValue(bankProfile);
    storageGet.mockResolvedValue({ scrapeConsent: { financial: true } });

    await runScript();

    expect(scrape).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DOMAIN_SCRAPE_DATA" }),
    );
  });

  it("runs a profile with no categories without reading consent at all", async () => {
    mocked(profileForUrl).mockReturnValue(newsProfile);

    await runScript();

    expect(storageGet).not.toHaveBeenCalled();
    expect(scrape).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
