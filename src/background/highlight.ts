/**
 * Server-side handler for selection-save events. Mirrors the capture pipeline:
 * try `POST /api/content`, otherwise stash in the local content cache for the
 * outbox to drain later.
 *
 * See planning/08-highlight-capture.md.
 */

import axios from "axios";
import { logger, errMessage } from "@/lib/log";
import { store } from "@/store";
import { pushPending, type ContentPayload } from "./content-cache";

const POST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 32_768;

export interface HighlightInput {
  selectedText: string;
  url: string;
  title?: string;
  context?: {
    before?: string;
    after?: string;
    selector_path?: string;
  };
}

export interface SaveHighlightResult {
  size: number;
  queued: boolean;
  truncated: boolean;
}

function isUrlBlacklisted(
  url: string,
  siteBlacklist: string[],
  pageBlacklist: string[],
): boolean {
  try {
    const parsed = new URL(url);
    for (const site of siteBlacklist) {
      try {
        if (new RegExp(site).test(parsed.hostname)) {
          return true;
        }
      } catch {
        // ignore bad regex entries
      }
    }

    parsed.hash = "";
    const stripped = parsed.toString();
    for (const page of pageBlacklist) {
      try {
        if (new RegExp(page.replace("?", "\\?")).test(stripped)) {
          return true;
        }
      } catch {
        // ignore
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function saveHighlight(
  input: HighlightInput,
): Promise<SaveHighlightResult> {
  const trimmed = input.selectedText.trim();
  if (trimmed.length < 4) {
    throw new Error("Selection too short");
  }

  const state = store.getState().ciState;
  const { accessToken, serverDomain, deviceId, siteBlacklist, pageBlacklist } =
    state;

  if (isUrlBlacklisted(input.url, siteBlacklist ?? [], pageBlacklist ?? [])) {
    logger.info("highlight.skippedBlacklist", { url: input.url });
    throw new Error(
      "This site is ignored — open the page in the popup to unignore it before saving highlights.",
    );
  }

  let body = trimmed;
  let truncated = false;
  if (body.length > MAX_BODY_BYTES) {
    body = body.slice(0, MAX_BODY_BYTES);
    truncated = true;
  }

  const payload: ContentPayload = {
    device_id: deviceId,
    source_url: input.url,
    source_title: input.title,
    kind: "highlight",
    mime_type: "text/plain",
    body,
    captured_at: new Date().toISOString(),
    context: input.context,
    metadata: { truncated, length: trimmed.length },
  };

  if (accessToken && serverDomain && deviceId) {
    try {
      await axios.post(`https://${serverDomain}/api/content`, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: POST_TIMEOUT_MS,
      });
      logger.info("highlight.uploaded", { url: input.url, size: body.length });

      return { size: body.length, queued: false, truncated };
    } catch (err) {
      await pushPending(payload);
      logger.warn("highlight.uploadDeferred", {
        url: input.url,
        size: body.length,
        err: errMessage(err),
      });

      return { size: body.length, queued: true, truncated };
    }
  }

  await pushPending(payload);
  logger.info("highlight.cachedLocal", { url: input.url, size: body.length });

  return { size: body.length, queued: true, truncated };
}
