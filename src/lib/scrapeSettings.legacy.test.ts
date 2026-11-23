import {
  LEGACY_SENSITIVE_KEY,
  removeLegacyScrapeSettings,
} from "./scrapeSettings";

function withStorageRemove(remove: jest.Mock): void {
  Object.assign(globalThis, {
    browser: { storage: { local: { remove } } },
  });
}

describe("removeLegacyScrapeSettings", () => {
  it("removes the retired opt-in key from storage", async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    withStorageRemove(remove);

    await removeLegacyScrapeSettings();

    expect(remove).toHaveBeenCalledWith(LEGACY_SENSITIVE_KEY);
  });

  it("does not throw when storage refuses the removal", async () => {
    withStorageRemove(
      jest.fn().mockRejectedValue(new Error("storage unavailable")),
    );

    await expect(removeLegacyScrapeSettings()).resolves.toBeUndefined();
  });
});
