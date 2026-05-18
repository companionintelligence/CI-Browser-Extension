# 04 — Logging & Observability

## Problem

`console.log` is sprinkled throughout `background.ts` — `grep -c "console\." src/entrypoints/background.ts` returns ~50. Commit `137dabc` was a one-time cleanup; the logs grew right back.

Specific issues:

- No level filtering. Debug noise drowns out real errors in the SW console.
- No structured fields. Every log is a free-form string, often `console.log("History sync state:", { ... })` — useful for one engineer once, useless in aggregate.
- Errors are frequently swallowed with `// Continue without title` style comments, leaving no breadcrumb when something genuinely fails.
- User-visible status strings (`historySyncStatus`) are the only feedback most users get; they don't include error context.
- No way to ship logs anywhere — even for opt-in users debugging their own setup.
- Sensitive data risk: today's logs include the full URL of every visited page, sometimes JWTs (commit `137dabc` removed at least one accidental token log).

## Goals

- Single logger module with `debug`/`info`/`warn`/`error` levels.
- `debug` compiled out of production builds (zero overhead).
- Structured payload shape so we can switch sinks later (console → server → both).
- Opt-in user-facing log viewer in the popup for self-service debugging.
- No PII leaks at `info` level or below.

## Approach

### Logger module

```ts
// src/lib/log.ts
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const CURRENT_LEVEL: Level =
  import.meta.env.DEV ? "debug" : "info";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function log(level: Level, event: string, fields: Fields = {}) {
  if (ORDER[level] < ORDER[CURRENT_LEVEL]) return;
  const entry = { ts: new Date().toISOString(), level, event, ...sanitize(fields) };
  console[level === "debug" ? "log" : level](entry);
  sink.write(entry); // see below
}

export const logger = {
  debug: (e: string, f?: Fields) => log("debug", e, f),
  info:  (e: string, f?: Fields) => log("info",  e, f),
  warn:  (e: string, f?: Fields) => log("warn",  e, f),
  error: (e: string, f?: Fields) => log("error", e, f),
};
```

### Production stripping

WXT/Vite supports `define`. Strip debug calls at build time:

```ts
// wxt.config.ts
vite: () => ({
  define: {
    __BUILD_LEVEL__: JSON.stringify(process.env.NODE_ENV === "production" ? 1 : 0),
  },
})
```

With a small babel/swc transform, `logger.debug(...)` becomes a no-op in prod. Simpler: rely on dead-code elimination — wrap in `if (__DEV__) logger.debug(...)`. Less ergonomic but zero tooling.

### Event names, not f-strings

```ts
logger.info("sync.history.start",  { timeRangeDays: 7 });
logger.info("sync.history.batch",  { uploaded: 100, total: 543 });
logger.info("sync.history.done",   { uploaded, durationMs });
logger.warn("sync.history.partial",{ failed: lastError });
```

Rule: the event name is a dotted noun-phrase, the fields are payload. This pattern survives migration to a real logging service later.

### Sanitization

`sanitize()` redacts known-sensitive keys:

```ts
const REDACT = new Set(["accessToken", "sessionToken", "csrfToken", "authorization", "password"]);
function sanitize(fields: Fields, depth = 0): Fields {
  if (depth > 3) return { _truncated: true };
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.has(k)) { out[k] = "<redacted>"; continue; }
    if (k === "url") { out[k] = redactUrlQueryStrings(v as string); continue; }
    out[k] = (v && typeof v === "object") ? sanitize(v as Fields, depth + 1) : v;
  }
  return out;
}
```

URL query strings frequently carry tokens — strip them at `info` and below; keep full at `debug` for local development only.

### Ring-buffer sink for user-facing log view

```ts
// src/lib/log-sink.ts
const RING_SIZE = 500;
const ring: LogEntry[] = [];
export const sink = {
  write(entry: LogEntry) {
    ring.push(entry);
    if (ring.length > RING_SIZE) ring.shift();
    void browser.storage.local.set({ logRing: ring });   // debounce in practice
  },
  snapshot() { return [...ring]; },
  clear() { ring.length = 0; void browser.storage.local.remove("logRing"); },
};
```

Popup gets a "Diagnostics" tab that renders the ring with copy-to-clipboard, filter by level, and "Send to support" (opt-in — see below).

### Optional server-side telemetry

Behind a setting (`telemetryEnabled: false` by default), the sink also POSTs batches to `POST /api/extension-telemetry` on the user's own CI-Server. The user's data, the user's server — privacy-preserving by construction.

### Error capture

Replace silent `// Continue without title` swallowing with:

```ts
} catch (err) {
  logger.warn("activity.metadata.title.failed", { url, err: errMessage(err) });
}
```

A swallowed error is still an event; we just don't escalate it.

### Status-string improvements

`historySyncStatus` strings are still the user-facing surface. Pair each status update with a `logger.info` of the same intent so the diagnostics tab has the timeline:

```ts
function setStatus(msg: string, fields?: Fields) {
  store.dispatch(setState({ historySyncStatus: msg }));
  logger.info("ui.status", { msg, ...fields });
}
```

## Migration / sequencing

Lands cleanly **after** [01 — modularization](01-background-modularization.md). Replace `console.*` call sites module-by-module as they're extracted.

1. Add `src/lib/log.ts` and `src/lib/log-sink.ts`.
2. Add Diagnostics tab to popup (read-only first; clear/copy actions next).
3. Sweep `background.ts` and `content.ts` for `console.*`; replace with logger calls and meaningful event names. ESLint rule `no-console` becomes `"error"` at end of sweep.
4. Add the telemetry endpoint + setting in a follow-up PR once we have a CI-Server contract.

## Risks & open questions

- **SW console truncation** — Chrome's SW console drops old logs aggressively. The ring buffer in `storage.local` is the durable store; the SW console is for live tailing only.
- **Storage churn** — writing the full ring to `storage.local` on every log is wasteful. Debounce with a 1-second flush.
- **PII redaction is heuristic** — we can't know every sensitive query param shape. The redactor should be conservative (strip *all* query params at info level) and configurable for power users.
- **Performance** — `logger.debug` calls compiled to no-ops in prod must truly disappear; verify with a bundle inspection.
- **Cross-context logging** — popup and content scripts have their own consoles. Either pipe their logs through `runtime.sendMessage` to the background ring, or maintain separate per-context rings and unify in the Diagnostics view.

## Acceptance criteria

- [ ] `eslint --rule '{"no-console": "error"}'` passes on `src/`.
- [ ] No production bundle contains the string `"console.log"` originating from our source (verify with `grep -r` on `.output/chrome-mv3`).
- [ ] Diagnostics tab shows the last 500 events with level filter and "Copy as JSON" button.
- [ ] Redaction is unit-tested: passing `{ accessToken, url: "https://x.com/?token=abc" }` produces `{ accessToken: "<redacted>", url: "https://x.com/" }`.
- [ ] At least one user-visible failure path (e.g. sync 5xx) emits a `logger.error` with `event`, `status`, `bodyExcerpt`, `durationMs`.
