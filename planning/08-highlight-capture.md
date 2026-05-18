# 08 — Highlight-to-Save (PR #26 / Issue #25)

## Problem

Issue #25 asks for a "save highlighted text to CI Server" feature. PR #26 implements it: text selection on any page triggers a "💾 Save to CI" button near the selection; clicking POSTs to `/api/content` with the selection, surrounding context, page metadata, and timestamp.

The PR is open and blocked on:

- CI-Server `/api/content` endpoint not finalized — content versus events versus activity is unclear.
- No coordination with the outbox / sync model (see [06](06-local-first-sync.md)).
- Whitelist/blacklist semantics not aligned — should this respect the same `siteBlacklist` / `pageBlacklist` as the visit recorder, or have its own list?
- Selection UI lives in a content script and styles can collide with the host page.

## Goals

- Ship "select text → save" with a polished UX.
- Use the outbox; never directly POST.
- One source of truth for "what sites are ignored" — share with visit-recorder.
- Render UI that doesn't pollute or get clobbered by host-page styles.

## Approach

### Content payload shape

Coordinate with CI-Server team on a single content endpoint. Proposed shape:

```ts
interface ContentPayload {
  device_id: string;
  source_url: string;
  source_title?: string;
  captured_at: string;          // ISO 8601
  kind: "highlight" | "screenshot" | "clip";
  mime_type: string;            // "text/plain" for highlight; "image/png" for screenshot
  body: string;                 // text or base64 image
  context?: {
    before?: string;            // ~200 chars surrounding text
    after?: string;
    selector_path?: string;     // CSS path to the selection root (for re-anchoring)
  };
  tags?: string[];
  metadata?: Record<string, unknown>;
}
```

If CI-Server already has `/api/events` or `/api/browser-activity`, prefer a new `/api/content` to keep types clean. Confirm before merging.

### Selection UI

Use a Shadow DOM root attached to `document.body` for the floating button:

```ts
const host = document.createElement("ci-highlight-toolbar");
host.style.cssText = "all: initial; position: fixed; z-index: 2147483647;";
const shadow = host.attachShadow({ mode: "closed" });
shadow.innerHTML = `<style>${TOOLBAR_CSS}</style><button id="save">💾 Save to CI</button>`;
document.body.appendChild(host);
```

Shadow DOM with `all: initial` is the only reliable way to inject UI into arbitrary pages without inheriting wild host styles.

### Selection lifecycle

- `selectionchange` event with a 250 ms debounce.
- Only show toolbar when `selection.toString().trim().length >= 4` and selection is inside a contenteditable-false node.
- Anchor toolbar to selection bounding rect; reposition on scroll.
- Hide on `mousedown` outside toolbar or on `Escape`.

### Keyboard shortcut

Define a command in the manifest:

```ts
manifest: {
  commands: {
    "save-highlight": {
      suggested_key: { default: "Alt+Shift+S" },
      description: "Save selected text to CI",
    },
  },
}
```

Background listens via `browser.commands.onCommand`, sends a message to the active tab to grab the current selection and save it.

### Blacklist sharing

Pull `siteBlacklist` + `pageBlacklist` from the same Redux store. Highlight save respects them by default; offer a per-action override ("Save anyway?") for sensitive pages the user *wants* to capture.

### Outbox integration

```ts
async function saveHighlight(payload: ContentPayload) {
  await outbox.enqueue({
    kind: "highlight",
    payload,
    dedupKey: `highlight:${payload.source_url}:${hash(payload.body)}`,
  });
  showToast("Saved");
}
```

Drain loop uploads via `POST /api/content` instead of `/api/browser-activity` based on `kind`.

### Edge cases

- **Iframes**: a selection inside an iframe with a same-origin host can be read; cross-origin can't. For now, show toolbar only on top-frame selections.
- **PDFs and Chrome's built-in viewer**: content scripts can't run there. Out of scope for v1.
- **Password fields**: never offer to save selections inside `<input type=password>`.
- **Selection across long DOM ranges**: cap captured text at 32 KB; surface a "selection too long" message.

### Server-side considerations

CI-Server should:

- Accept the `/api/content` payload above.
- Index `source_url`, `captured_at`, `kind` for retrieval.
- Honor a soft cap of, say, 1 MB per payload.
- De-dup by `(device_id, source_url, hash(body))` server-side as a defense-in-depth on top of the extension dedup.

File a tracking issue in `companionintelligence/ci-server` linked to this doc.

## Migration / sequencing

1. **Block on CI-Server contract.** Get `/api/content` endpoint shape signed off.
2. Rebase PR #26 onto master + [01 — modularization](01-background-modularization.md). Move the API call from inline POST to outbox enqueue.
3. Replace the inline-styled toolbar with a Shadow-DOM toolbar.
4. Add the keyboard command + manifest entry.
5. Wire respect for `siteBlacklist`/`pageBlacklist`.
6. Add a "Highlights" filter to the Diagnostics tab so the user can see what they saved recently.

## Risks & open questions

- **Server contract drift** — until CI-Server commits to `/api/content`, this feature can't ship. Don't merge half.
- **Z-index wars** — `z-index: 2147483647` works most places but some sites pin their own UI higher. The Shadow DOM root needs to handle being obscured (auto-flip above/below selection, fall back to a corner badge if no room).
- **Anti-paste sites** — some sites disable selection or copy. We can still read `window.getSelection()`, but consider whether honoring those restrictions is more polite.
- **Highlight as personal data** — selections may contain PII. Apply the same redaction posture as logging ([04](04-logging-observability.md)) when emitting events about the save (don't log the selection itself).

## Acceptance criteria

- [ ] Selecting >4 chars of text on a non-blacklisted page shows the toolbar.
- [ ] Clicking "Save to CI" enqueues an outbox row; the row drains to `POST /api/content` on the next tick.
- [ ] Alt+Shift+S saves the current selection from anywhere.
- [ ] Toolbar renders identically (Shadow DOM) on three smoke-test sites: a CSS-heavy media site, a strict CSP site (e.g. GitHub), and a long-scrolling article.
- [ ] Blacklisted sites do not show the toolbar.
- [ ] Diagnostics tab lists the last 50 highlights with timestamp + truncated body.
- [ ] CI-Server `/api/content` endpoint accepts the documented payload and returns 201 on dedup miss, 200 on dedup hit.
