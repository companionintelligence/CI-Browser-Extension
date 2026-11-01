/**
 * Single-flight gate with backoff for calls that reach the Memory server.
 *
 * A caller that arrives while an attempt is running shares that attempt's
 * promise. After a transient failure (see isTransientFailure) new attempts wait
 * out an exponential delay, capped, so an unreachable server is probed a few
 * times over minutes rather than once per caller.
 */

const TRANSIENT_FAILURE =
  /HTTP (?:50[234]|5[23]\d)\b|status code (?:50[234]|5[23]\d)\b|network ?error|failed to fetch|load failed|timeout of \d+ms/i;

/**
 * A gateway or origin outage from the Memory (502 to 504, or 520 to 539, which
 * covers Cloudflare's origin errors such as 530 when its origin is unreachable),
 * or a request that never got an answer. That is an outage, not a bug. Other
 * 5xx responses stay reported.
 */
export function isTransientFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return TRANSIENT_FAILURE.test(message);
}

export interface RetryGateOptions {
  now?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export function createRetryGate<T>(
  task: () => Promise<T>,
  {
    now = Date.now,
    baseDelayMs = 30_000,
    maxDelayMs = 5 * 60_000,
  }: RetryGateOptions = {},
) {
  let inFlight: Promise<T> | null = null;
  let transientFailures = 0;
  let retryAt = 0;

  const deferred = (): boolean => now() < retryAt;

  function run({ force = false }: { force?: boolean } = {}): Promise<T> {
    if (inFlight) {
      return inFlight;
    }

    if (!force && deferred()) {
      return Promise.reject(new Error("Retry deferred after a server failure"));
    }

    inFlight = task()
      .then(
        (value) => {
          transientFailures = 0;
          retryAt = 0;

          return value;
        },
        (error: unknown) => {
          if (isTransientFailure(error)) {
            transientFailures += 1;
            const delayMs = Math.min(
              maxDelayMs,
              baseDelayMs * 2 ** (transientFailures - 1),
            );
            retryAt = now() + delayMs;
          } else {
            transientFailures = 0;
            retryAt = 0;
          }

          throw error;
        },
      )
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  return {
    run,
    pending: (): Promise<T> | null => inFlight,
    deferred,
  };
}
