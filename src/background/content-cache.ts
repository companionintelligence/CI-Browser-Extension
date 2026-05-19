/**
 * Shared local cache for content payloads we'd like to send to
 * `POST /api/content` once the endpoint is reachable.
 *
 * Used by both the active-tab screenshot path and the highlight-to-save
 * path. Once planning/06 (IndexedDB outbox) lands, this should be folded
 * into the outbox abstraction so we have one drain loop, one retry policy,
 * and one quota story.
 */

import { logger } from "@/lib/log";

const STORAGE_KEY = "pendingCaptures";
const MAX_ENTRIES = 20;

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

export async function readPending(): Promise<ContentPayload[]> {
  const result = await browser.storage.local.get(STORAGE_KEY);

  return (result[STORAGE_KEY] as ContentPayload[] | undefined) ?? [];
}

export async function pushPending(payload: ContentPayload): Promise<number> {
  const pending = await readPending();
  pending.push(payload);
  if (pending.length > MAX_ENTRIES) {
    pending.splice(0, pending.length - MAX_ENTRIES);
  }

  await browser.storage.local.set({ [STORAGE_KEY]: pending });
  logger.debug("contentCache.queued", {
    kind: payload.kind,
    pending: pending.length,
  });

  return pending.length;
}

export async function clearPending(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
  logger.info("contentCache.cleared");
}
