# 11 — Browser-Use Bidirectional Command Channel

## Problem

The README roadmap calls out a "Browser-Use Integration" — CI-Server sends commands to the extension to drive the browser on the user's behalf (navigate, click, extract, screenshot). Today the extension is **strictly outbound**: it talks to the server but never listens for inbound commands.

To build this, we need:

- A persistent server → extension channel that survives MV3 service-worker suspension.
- A command vocabulary aligned with [Browser-Use](https://github.com/browser-use/browser-use) and Playwright primitives.
- A permission model so the user knows what's about to happen and can interrupt.
- Replay / audit so the user can see what the server did and why.

This is a Phase-5 effort — explicitly **after** the foundation work in Phases 1–3.

## Goals

- Bidirectional command channel with sub-second latency under normal load.
- Per-origin, per-capability user consent.
- Audit log of every executed command stored locally and surfaced in the popup.
- Pluggable command handlers — easy to add new primitives.

## Non-goals (for v1)

- Headless / background automation. Every command runs in a visible tab the user can see.
- Multi-tab orchestration. v1 drives one tab at a time.
- Form-credential autofill. Out of scope for safety reasons.

## Transport options

### Option A — Server-Sent Events (SSE)

```
GET /api/extension/commands  (long-lived HTTP/2 stream, text/event-stream)
```

Pros:
- One-way (server→client), which matches the command-dispatch shape.
- HTTP/2 friendly; survives CDN proxies.
- No new auth model; reuses the access token.
- Works in MV3 service workers via `fetch` + `ReadableStream` and reconnects easily.

Cons:
- SW suspension cuts the stream. Need a small inbound `keepalive` server message that the SW can use as an excuse to stay alive — or wake the SW via push.

### Option B — Web Push

```
chrome.gcm / chrome.notifications via FCM
```

Pros:
- Real push: wakes the SW even after full suspension.
- Backed by Chrome's infrastructure; very reliable.

Cons:
- Requires Firebase project + VAPID keys.
- Latency variable (seconds typical).
- Firefox / Safari support varies; per-browser flakiness.

### Option C — WebSocket from a long-lived offscreen document

Use `chrome.offscreen.createDocument` to keep a WS open even when the SW dies.

Pros:
- True full-duplex.
- Stays alive longer than the SW.

Cons:
- Offscreen documents have their own lifecycle and limits.
- More moving parts.

**Recommendation**: Start with **SSE + alarm-driven reconnect** (Option A). Add Option B push later for cold-start latency when the SW is fully suspended.

```ts
// commands/transport.ts
export async function openCommandStream() {
  const { accessToken, serverDomain } = store.getState().ciState;
  const res = await fetch(`https://${serverDomain}/api/extension/commands`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/event-stream" },
  });
  if (!res.ok || !res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for await (const chunk of readSSEFrames(reader)) {
    await dispatchCommand(chunk);
  }
}
```

Alarms tick every 60 s to reconnect if the stream is closed.

## Command vocabulary

Borrow from Playwright; keep small:

```ts
type Command =
  | { id: string; op: "navigate"; url: string; tabId?: number }
  | { id: string; op: "click"; selector: string }
  | { id: string; op: "type"; selector: string; text: string }
  | { id: string; op: "extract"; selector: string; fields: Record<string, FieldSpec> }
  | { id: string; op: "screenshot"; tabId?: number }
  | { id: string; op: "wait_for"; selector: string; timeoutMs: number }
  | { id: string; op: "scroll"; to: "top" | "bottom" | { y: number } };
```

Each `id` is server-issued; every command result POSTs back to `POST /api/extension/commands/:id/result` (success or error).

## Execution model

Background receives `Command` → injects an executor into the target tab → executor performs the op using DOM APIs → returns serializable result.

Re-use the content-script infrastructure from [07 — scrape profiles](07-scrape-profiles.md); the `prerequisites` DSL there is essentially a constrained subset of this command vocabulary.

## Permission model

**Tiered consent**, surfaced when a command arrives:

1. **Per-session**: first command for an origin shows a popup asking "Allow CI to control example.com for this session?" Yes / No / Always.
2. **Per-capability**: separate consent for `extract` (read-only) vs. `click`/`type` (write).
3. **Master kill switch**: a big red "Stop CI" button in the popup that disables the command channel entirely.

Consent is stored in `storage.local`:

```ts
{
  commandConsents: {
    "example.com": { read: true, write: false, expiresAt: <ts> }
  }
}
```

Default for unknown origins: deny. Server is expected to handle deny gracefully.

## Audit log

Every command — accepted, denied, succeeded, failed — appends to an `audit` IndexedDB store:

```ts
{
  id, commandId, origin, op, payload,
  result: "accepted" | "denied" | "success" | "error",
  startedAt, completedAt, error?
}
```

Surfaced in the popup under a "Server actions" tab with filtering and a "Revoke origin" action.

## Safety guards

- Hard timeout per command (default 30 s; configurable per op).
- Rate limit: max 60 commands/minute per origin.
- Refuse to type into `<input type=password>`, hidden inputs, or fields the user is currently focused on.
- Refuse to click `<a target="_blank">` without explicit consent (mass tab-spawn protection).
- Refuse to navigate to `chrome://`, `chrome-extension://`, `file://`, `data:`, `javascript:`.
- Anything financial-looking (forms with credit-card-like fields, checkout pages) requires per-command confirmation.

## Migration / sequencing

Deferred to Phase 5. Prerequisites:

1. [01 — modularization](01-background-modularization.md), [02 — alarms](02-mv3-lifecycle.md), [04 — logging](04-logging-observability.md), [06 — outbox](06-local-first-sync.md) all landed.
2. CI-Server team has built a command-dispatch service.
3. A small RFC merges first, capturing the command vocabulary and consent model.

Order of work within Phase 5:

1. Transport (SSE) + reconnect logic — no commands yet, just observe.
2. Command executor for `extract` and `wait_for` only (read-only). Ship and gather feedback.
3. Add `click`, `type`, `scroll` behind consent.
4. Add `navigate`, `screenshot`.
5. Add Web Push fallback for cold-start latency.

## Risks & open questions

- **Trust model** — the extension is *executing server commands on the user's behalf*. If the server is compromised, the attacker drives the user's browser. Permissions help; mandatory per-session consent helps; visible "currently running" indicator helps.
- **Store policy** — Chrome Web Store may scrutinize this heavily. A clear consent model is the only path to approval.
- **Conflict with user input** — what if the user is typing into the same field the command targets? Defer the command, surface a toast.
- **Cross-site request forgery via commands** — server should sign commands with HMAC + nonce, and the extension validates before executing.
- **Browser-Use upstream compatibility** — align with their command schema so existing playbooks port.

## Acceptance criteria

- [ ] Design RFC merged covering: transport, vocabulary, consent, audit, rate limits.
- [ ] SSE channel reconnects automatically across SW restarts.
- [ ] First-of-origin command produces a consent dialog; deny is honored.
- [ ] Audit log shows every command with status.
- [ ] Read-only `extract` works against a Playwright-comparable benchmark page.
- [ ] Master kill switch in popup disables all commands within 1 s.
- [ ] No `chrome://` / `file://` / `javascript:` navigation possible via commands.
