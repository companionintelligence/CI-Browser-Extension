import { createRetryGate, isTransientFailure } from "./retryGate";

function controlled<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe("isTransientFailure", () => {
  it("treats origin 5xx responses and unanswered requests as transient", () => {
    expect(
      isTransientFailure(
        new Error(
          "Failed to create device (HTTP 530): Request failed with status code 530",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientFailure(
        new Error(
          "CI-Server https://memory.example/api/v1/browser-activity failed: HTTP 503",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientFailure(
        new Error(
          "Failed to create device: Request failed with status code 530",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientFailure(new Error("Failed to create device: Network Error")),
    ).toBe(true);
    expect(isTransientFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientFailure(new Error("timeout of 10000ms exceeded"))).toBe(
      true,
    );
  });

  it("does not treat client errors or local failures as transient", () => {
    expect(
      isTransientFailure(
        new Error("Failed to create device (HTTP 401): Unauthorized"),
      ),
    ).toBe(false);
    expect(
      isTransientFailure(
        new Error("No access token available. Please log in first."),
      ),
    ).toBe(false);
  });
  it("still reports server errors that are not an outage", () => {
    expect(
      isTransientFailure(
        new Error("Failed to create device (HTTP 500): Server error"),
      ),
    ).toBe(false);
  });
});

describe("createRetryGate", () => {
  it("shares one in-flight attempt among concurrent callers", async () => {
    const attempt = controlled<string>();
    const task = jest.fn(() => attempt.promise);
    const gate = createRetryGate(task);

    const callers = [gate.run(), gate.run(), gate.run()];

    expect(task).toHaveBeenCalledTimes(1);
    expect(gate.pending()).not.toBeNull();

    attempt.resolve("device-1");

    await expect(Promise.all(callers)).resolves.toEqual([
      "device-1",
      "device-1",
      "device-1",
    ]);
    expect(gate.pending()).toBeNull();
  });

  it("starts a new attempt once the previous one has settled", async () => {
    const task = jest
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");
    const gate = createRetryGate(task);

    await expect(gate.run()).resolves.toBe("first");
    await expect(gate.run()).resolves.toBe("second");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("defers attempts after a transient failure, doubling the delay up to a cap", async () => {
    let clock = 0;
    const task = jest.fn(async () => {
      throw new Error(
        "Failed to create device (HTTP 530): Request failed with status code 530",
      );
    });
    const gate = createRetryGate(task, {
      now: () => clock,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
    });

    await expect(gate.run()).rejects.toThrow("HTTP 530");
    await expect(gate.run()).rejects.toThrow("deferred");
    expect(task).toHaveBeenCalledTimes(1);

    clock = 999;
    expect(gate.deferred()).toBe(true);
    clock = 1000;
    expect(gate.deferred()).toBe(false);

    await expect(gate.run()).rejects.toThrow("HTTP 530");
    clock = 2999;
    expect(gate.deferred()).toBe(true);
    clock = 3000;

    await expect(gate.run()).rejects.toThrow("HTTP 530");
    clock = 6999;
    expect(gate.deferred()).toBe(true);
    clock = 7000;

    await expect(gate.run()).rejects.toThrow("HTTP 530");
    clock = 10999;
    expect(gate.deferred()).toBe(true);
    clock = 11000;
    expect(gate.deferred()).toBe(false);
    expect(task).toHaveBeenCalledTimes(4);
  });

  it("runs at once when forced, even while deferred", async () => {
    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error("CI-Server x failed: HTTP 503"))
      .mockResolvedValueOnce("device-1");
    const gate = createRetryGate(task, { now: () => 0 });

    await expect(gate.run()).rejects.toThrow("HTTP 503");
    await expect(gate.run({ force: true })).resolves.toBe("device-1");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("does not defer after a failure that is not transient", async () => {
    const task = jest
      .fn()
      .mockRejectedValueOnce(
        new Error("Failed to create device (HTTP 401): Unauthorized"),
      )
      .mockResolvedValueOnce("device-1");
    const gate = createRetryGate(task, { now: () => 0 });

    await expect(gate.run()).rejects.toThrow("HTTP 401");
    expect(gate.deferred()).toBe(false);
    await expect(gate.run()).resolves.toBe("device-1");
  });

  it("restarts the backoff from the base delay after a success", async () => {
    let clock = 0;
    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 530"))
      .mockResolvedValueOnce("device-1")
      .mockRejectedValueOnce(new Error("HTTP 530"));
    const gate = createRetryGate(task, {
      now: () => clock,
      baseDelayMs: 1000,
    });

    await expect(gate.run()).rejects.toThrow("HTTP 530");
    clock = 1000;
    await expect(gate.run()).resolves.toBe("device-1");
    await expect(gate.run()).rejects.toThrow("HTTP 530");
    clock = 1999;
    expect(gate.deferred()).toBe(true);
    clock = 2000;
    expect(gate.deferred()).toBe(false);
  });
});
