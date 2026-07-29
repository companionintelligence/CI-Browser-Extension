import type { BrowserActivity } from "@/services/captureEvents";
import { parseUrl } from "@/utils";

// Keep stored highlights a sane size; selections beyond this are truncated
export const MAX_HIGHLIGHT_LENGTH = 10000;

/**
 * Build a CaptureEvent-ready browser activity for a saved text selection.
 *
 * Phase 3: highlights ride the same unified `/api/v1/events` path as every other
 * capture (kind `browser.highlight`), replacing the legacy event envelope.
 */
export function buildHighlightActivity(
  selectionText: string,
  url: string,
  deviceId: string,
  title?: string,
): BrowserActivity {
  const text =
    selectionText.length > MAX_HIGHLIGHT_LENGTH
      ? selectionText.slice(0, MAX_HIGHLIGHT_LENGTH)
      : selectionText;

  const source = title || parseUrl(url)?.hostname || url;

  return {
    time: new Date().toISOString(),
    device_id: deviceId,
    url: url,
    title: title,
    action_type: "highlight",
    properties: {
      description: `Highlight from ${source}`,
      text: text,
    },
  };
}
