/**
 * Structured logger for the extension.
 *
 * See planning/04-logging-observability.md for the full design. This is the
 * minimal first cut: levels, redaction of known-sensitive fields, and a
 * bounded ring buffer mirrored to browser.storage.local so the popup can
 * render a Diagnostics view in a follow-up.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  fields: Record<string, unknown>;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to `info`; bump to `debug` when running under Vite dev (`MODE=development`)
// or when Jest sets NODE_ENV. Wrapped in a function so jest's tsconfig (which has
// no `import.meta` support) doesn't choke on the file.
function detectLevel(): LogLevel {
  try {
    // `import.meta.env.DEV` is the Vite signal. `process.env.NODE_ENV` is jest's.
    const meta = (
      globalThis as { import?: { meta?: { env?: { DEV?: boolean } } } }
    ).import?.meta?.env;
    if (meta?.DEV) {
      return "debug";
    }
  } catch {
    // ignore
  }

  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV !== "production"
  ) {
    return "debug";
  }

  return "info";
}

const CURRENT_LEVEL: LogLevel = detectLevel();

const REDACT_KEYS = new Set([
  "accessToken",
  "sessionToken",
  "csrfToken",
  "authorization",
  "password",
  "refresh_token",
  "proxy_refresh_token",
]);

const RING_SIZE = 500;
const STORAGE_KEY = "logRing";

const ring: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function redactValue(key: string, value: unknown, depth: number): unknown {
  if (depth > 4) {
    return "<truncated>";
  }

  if (REDACT_KEYS.has(key)) {
    return "<redacted>";
  }

  if (key === "url" && typeof value === "string") {
    try {
      const u = new URL(value);
      u.search = "";

      return u.toString();
    } catch {
      return value;
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>, depth + 1);
  }

  return value;
}

function redactObject(
  obj: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v, depth);
  }

  return out;
}

function flushRing(): void {
  flushTimer = null;
  try {
    if (typeof browser !== "undefined" && browser?.storage?.local?.set) {
      void browser.storage.local.set({ [STORAGE_KEY]: ring });
    }
  } catch {
    // Storage write failures are non-critical; the in-memory ring still works.
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) {
    return;
  }

  flushTimer = setTimeout(flushRing, 1000);
}

function emit(level: LogLevel, event: string, fields: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[CURRENT_LEVEL]) {
    return;
  }

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    event,
    fields: redactObject(fields, 0),
  };

  ring.push(entry);
  if (ring.length > RING_SIZE) {
    ring.splice(0, ring.length - RING_SIZE);
  }

  scheduleFlush();

  // Mirror to the SW/devtools console for live tailing.
  const consoleMethod = level === "debug" ? "log" : level;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any)[consoleMethod](entry);
}

export const logger = {
  debug(event: string, fields: Record<string, unknown> = {}): void {
    emit("debug", event, fields);
  },
  info(event: string, fields: Record<string, unknown> = {}): void {
    emit("info", event, fields);
  },
  warn(event: string, fields: Record<string, unknown> = {}): void {
    emit("warn", event, fields);
  },
  error(event: string, fields: Record<string, unknown> = {}): void {
    emit("error", event, fields);
  },
  /** Snapshot of the in-memory ring (most recent 500 entries). */
  snapshot(): LogEntry[] {
    return ring.slice();
  },
  /** Clears the ring locally and in storage. */
  async clear(): Promise<void> {
    ring.length = 0;
    if (typeof browser !== "undefined" && browser?.storage?.local?.remove) {
      await browser.storage.local.remove(STORAGE_KEY);
    }
  },
};

export function errMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === "string") {
    return err;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
