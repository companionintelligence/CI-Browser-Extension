import {
  ERROR_REPORTING_KEY,
  isErrorReportingEnabled,
  setErrorReportingEnabled,
  watchErrorReporting,
} from "./userSetting";

const storage = browser.storage.local as unknown as {
  get: jest.Mock;
  set: jest.Mock;
};

type ChangeHandler = (changes: Record<string, { newValue?: unknown }>) => void;

describe("isErrorReportingEnabled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defaults to ON — the posture is opt-out", async () => {
    storage.get.mockResolvedValue({});

    await expect(isErrorReportingEnabled()).resolves.toBe(true);
  });

  it("is off only on an explicit false", async () => {
    storage.get.mockResolvedValue({ [ERROR_REPORTING_KEY]: false });

    await expect(isErrorReportingEnabled()).resolves.toBe(false);
  });

  it("treats any other stored value as on", async () => {
    storage.get.mockResolvedValue({ [ERROR_REPORTING_KEY]: true });

    await expect(isErrorReportingEnabled()).resolves.toBe(true);
  });

  it("fails CLOSED when storage is unreadable", async () => {
    // We cannot know whether the user opted out, and reporting against a
    // decision we could not read is the worse failure.
    storage.get.mockRejectedValue(new Error("storage unavailable"));

    await expect(isErrorReportingEnabled()).resolves.toBe(false);
  });
});

describe("setErrorReportingEnabled", () => {
  it("writes the shared key", async () => {
    storage.set.mockResolvedValue(undefined);

    await setErrorReportingEnabled(false);

    expect(storage.set).toHaveBeenCalledWith({ [ERROR_REPORTING_KEY]: false });
  });
});

describe("watchErrorReporting", () => {
  const originalStorage = browser.storage;

  afterEach(() => {
    (browser as unknown as { storage: unknown }).storage = originalStorage;
  });

  function withOnChanged() {
    const handlers: ChangeHandler[] = [];
    const addListener = jest.fn((handler: ChangeHandler) =>
      handlers.push(handler),
    );
    const removeListener = jest.fn();

    (browser as unknown as { storage: unknown }).storage = {
      ...originalStorage,
      onChanged: { addListener, removeListener },
    };

    return { handlers, addListener, removeListener };
  }

  it("reports a flip to off", () => {
    const { handlers } = withOnChanged();
    const listener = jest.fn();

    watchErrorReporting(listener);
    handlers[0]!({ [ERROR_REPORTING_KEY]: { newValue: false } });

    expect(listener).toHaveBeenCalledWith(false);
  });

  it("reports a flip back on", () => {
    const { handlers } = withOnChanged();
    const listener = jest.fn();

    watchErrorReporting(listener);
    handlers[0]!({ [ERROR_REPORTING_KEY]: { newValue: true } });

    expect(listener).toHaveBeenCalledWith(true);
  });

  it("ignores changes to other keys", () => {
    const { handlers } = withOnChanged();
    const listener = jest.fn();

    watchErrorReporting(listener);
    handlers[0]!({ serverURL: { newValue: "https://x" } });

    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a working disposer", () => {
    const { removeListener } = withOnChanged();

    watchErrorReporting(jest.fn())();

    expect(removeListener).toHaveBeenCalled();
  });

  it("no-ops where storage.onChanged is unavailable", () => {
    (browser as unknown as { storage: unknown }).storage = {
      local: { get: jest.fn(), set: jest.fn() },
    };

    expect(() => watchErrorReporting(jest.fn())()).not.toThrow();
  });
});
