/**
 * Wait for a page that draws its content after load to finish drawing.
 *
 * The scrape engine reads once. A single-page app that fetches its data and then
 * renders it is an empty shell at `document_idle`, so the engine records nothing
 * and reports nothing. This waits until `selector` matches and its match count
 * holds still, and gives up after `timeoutMs`.
 *
 * Pure apart from the DOM it is given, so it tests against jsdom with fake timers.
 */

export interface ReadinessOptions {
  /** Give up and resolve false after this long. */
  timeoutMs: number;
  /** How long the match count must hold still before the page counts as drawn. */
  settleMs?: number;
}

/**
 * Resolve true once `selector` matches in `root` and its count has not changed
 * for `settleMs`; resolve false if `timeoutMs` passes first.
 *
 * Every DOM change restarts the settle window, so a page still streaming in
 * keeps waiting. A count that drops back to zero (the page swapped out) starts
 * over.
 */
export function waitForSettled(
  root: Document,
  selector: string,
  { timeoutMs, settleMs = 500 }: ReadinessOptions,
): Promise<boolean> {
  return new Promise((resolve) => {
    let lastCount = -1;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (ready: boolean) => {
      clearTimeout(settleTimer);
      clearTimeout(deadline);
      observer?.disconnect();
      resolve(ready);
    };

    const check = () => {
      const count = root.querySelectorAll(selector).length;

      if (count === 0) {
        lastCount = -1;
        clearTimeout(settleTimer);

        return;
      }

      if (count !== lastCount) {
        lastCount = count;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(true), settleMs);
      }
    };

    const deadline = setTimeout(() => finish(false), timeoutMs);

    const observer = new MutationObserver(check);
    observer.observe(root.documentElement, { childList: true, subtree: true });

    check();
  });
}
