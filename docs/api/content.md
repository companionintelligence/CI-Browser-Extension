# `POST /api/content` Contract

Single endpoint for non-event content captured by the extension: screenshots, highlighted text, future clips/PDFs.

This document is the source of truth from the extension's perspective. The CI-Server contract should match. File issues against `companionintelligence/ci-server` when something diverges.

## Endpoint

```
POST https://{serverDomain}/api/content
Authorization: Bearer {accessToken}
Content-Type: application/json
```

## Request body

A single JSON object matching the [`ContentPayload`](../../src/background/content-cache.ts) TypeScript type:

```jsonc
{
  "device_id": "01HABC...",
  "source_url": "https://example.com/articles/42",
  "source_title": "How memory works",
  "kind": "highlight",                 // "screenshot" | "highlight" | "clip"
  "mime_type": "text/plain",           // "image/png" for screenshots
  "body": "Selected text or base64-encoded image bytes (no data: prefix)",
  "captured_at": "2026-05-18T16:42:11.789Z",
  "context": {                         // optional, mostly for highlights
    "before": "200 chars before the selection",
    "after": "200 chars after",
    "selector_path": "main > article > p:nth-of-type(3)"
  },
  "metadata": {                        // arbitrary, extension-controlled
    "truncated": false,
    "length": 412
  }
}
```

### Field details

| Field | Required | Notes |
|---|---|---|
| `device_id` | yes | UUID issued by `POST /api/devices`. Server should 400 on unknown IDs. |
| `source_url` | yes | The page the content was captured from. May be empty for synthesized content. |
| `source_title` | no | Page title at capture time. |
| `kind` | yes | One of `screenshot`, `highlight`, `clip`. The server is expected to reject unknown kinds with 400. |
| `mime_type` | yes | Image: `image/png`. Highlight: `text/plain`. |
| `body` | yes | For images: base64 bytes only (no `data:` prefix). For text: UTF-8. Server may cap at 1 MB; client caps text at 32 KB and image PNGs at ~1 MB. |
| `captured_at` | yes | ISO 8601 with milliseconds. Used by client + server for dedup. |
| `context` | no | Surrounding-text and DOM-path hints; helps re-anchor the highlight later. |
| `metadata` | no | Free-form. The client sets `truncated`, `length`, etc. Server should preserve verbatim. |

## Responses

| Status | Body | Meaning |
|---|---|---|
| `201 Created` | `{ "id": "..." }` | Stored as new content. |
| `200 OK` | `{ "id": "...", "duplicate": true }` | Server-side dedup hit (e.g. same `(device_id, source_url, hash(body), captured_at)`). Treated by the client as success — the outbox row gets marked `synced` and removed. |
| `400 Bad Request` | error object | Validation failure. Client moves the row to `failed_permanent`. |
| `401 Unauthorized` | — | Token expired. Client pauses drain and re-auths. |
| `413 Payload Too Large` | — | Treat as `400`. |
| `429 Too Many Requests` | `Retry-After` header honored | Client backs off and retries. |
| `5xx` | — | Client increments attempt count with exponential backoff (30s → 2m → 8m → 30m → 2h, then `failed`). |

## Dedup

The extension's outbox prevents a re-enqueue with the same client-side `dedupKey = kind:source_url:captured_at`. Server should also dedup defensively, using `(device_id, kind, source_url, captured_at)` or `(device_id, kind, sha256(body))`. The server's `200 + duplicate=true` shape lets the client mark the local row synced without re-uploading.

## Size limits

- Default soft cap: **1 MB** per payload.
- Server should accept `Content-Encoding: gzip` and `br` for image bodies.
- Client compresses neither today; doing so is a follow-up.

## Privacy

This endpoint receives user-typed text and screen captures. Server-side storage MUST honor `DELETE /api/me/data` (see [planning/12 — privacy](../../planning/12-privacy.md)).

## Status

CI-Server `/api/content` is **not yet implemented**. Until it lands the extension queues every payload locally in the IndexedDB outbox (see [src/background/outbox.ts](../../src/background/outbox.ts)) and the drain loop is a no-op on the network — the rows accumulate, capped by quota eviction, and surface in the popup Diagnostics tab.

When the endpoint goes live, no client change should be required: the drain loop reads pending rows, POSTs them, and marks them synced.

## Related

- Client code: [src/background/outbox.ts](../../src/background/outbox.ts), [src/background/content-cache.ts](../../src/background/content-cache.ts), [src/background/capture.ts](../../src/background/capture.ts), [src/background/highlight.ts](../../src/background/highlight.ts).
- Planning docs: [planning/06 — local-first sync](../../planning/06-local-first-sync.md), [planning/08 — highlight capture](../../planning/08-highlight-capture.md), [planning/09 — media capture](../../planning/09-media-capture-oauth.md).
