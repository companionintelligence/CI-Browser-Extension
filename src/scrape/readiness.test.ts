/** @jest-environment jsdom */
import { waitForSettled } from "./readiness";

/** Track how a promise settles, without awaiting it. */
function track(promise: Promise<boolean>): { value?: boolean } {
  const state: { value?: boolean } = {};
  void promise.then((value) => {
    state.value = value;
  });

  return state;
}

describe("waitForSettled", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves true once the selector appears and holds still for the settle window", async () => {
    const state = track(
      waitForSettled(document, ".item", { timeoutMs: 5000, settleMs: 500 }),
    );

    await jest.advanceTimersByTimeAsync(1000);
    document.body.innerHTML = '<p class="item">one</p>';

    await jest.advanceTimersByTimeAsync(400);
    expect(state.value).toBeUndefined();

    await jest.advanceTimersByTimeAsync(200);
    expect(state.value).toBe(true);
  });

  it("restarts the settle window whenever the match count changes", async () => {
    const state = track(
      waitForSettled(document, ".item", { timeoutMs: 10000, settleMs: 500 }),
    );

    document.body.innerHTML = '<p class="item">one</p>';
    await jest.advanceTimersByTimeAsync(300);

    document.body.innerHTML = '<p class="item">one</p><p class="item">two</p>';
    await jest.advanceTimersByTimeAsync(300);
    // 300ms since the last change: still inside the settle window.
    expect(state.value).toBeUndefined();

    await jest.advanceTimersByTimeAsync(300);
    expect(state.value).toBe(true);
  });

  it("gives up with false when the selector never appears", async () => {
    const state = track(
      waitForSettled(document, ".never", { timeoutMs: 3000 }),
    );

    await jest.advanceTimersByTimeAsync(2999);
    expect(state.value).toBeUndefined();

    await jest.advanceTimersByTimeAsync(1);
    expect(state.value).toBe(false);
  });

  it("resolves after the settle window when the selector is already present", async () => {
    document.body.innerHTML = '<p class="item">one</p>';
    const state = track(
      waitForSettled(document, ".item", { timeoutMs: 5000, settleMs: 500 }),
    );

    await jest.advanceTimersByTimeAsync(499);
    expect(state.value).toBeUndefined();

    await jest.advanceTimersByTimeAsync(1);
    expect(state.value).toBe(true);
  });
});
