/**
 * Compatibility wrapper around the IndexedDB outbox.
 *
 * Older callers (`capture.ts`, `highlight.ts`) and older builds wrote
 * captures into a `pendingCaptures` array in `browser.storage.local`.
 * Now we enqueue into the outbox (`src/background/outbox.ts`) instead.
 * The legacy storage-local array is migrated to the outbox on startup
 * via `migrateLegacyPendingCaptures()`.
 *
 * The `ContentPayload` shape is shared with the outbox and the
 * `/api/content` contract — see docs/api/content.md.
 */

import { enqueue } from "./outbox";

export interface ContentPayload {
  device_id: string | null;
  source_url: string | undefined;
  source_title: string | undefined;
  kind: "screenshot" | "highlight" | "clip";
  mime_type: string;
  body: string;
  captured_at: string;
  context?: {
    before?: string;
    after?: string;
    selector_path?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Queue a content payload for eventual upload. Idempotent on a derived
 * `dedupKey`. Returns the outbox row id, or null if dedup'd / failed.
 */
export async function pushPending(
  payload: ContentPayload,
): Promise<string | null> {
  const dedupKey = makeDedupKey(payload);
  const row = await enqueue(payload, { dedupKey });

  return row?.id ?? null;
}

function makeDedupKey(payload: ContentPayload): string {
  // For screenshots the captured_at + source_url is unique-enough.
  // For highlights we'd want a body hash too; defer until a Web Crypto
  // helper lands.
  return `${payload.kind}:${payload.source_url ?? ""}:${payload.captured_at}`;
}
