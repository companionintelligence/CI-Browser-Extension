import type { BrowserActivity } from "@/services/browserActivity";
import { parseUrl } from "@/utils";

// Keep stored highlights a sane size; selections beyond this are truncated
export const MAX_HIGHLIGHT_LENGTH = 10000;

/**
 * Build a capture record for a saved text selection (right-click →
 * "Save highlight").
 *
 * Highlights upload to `/api/v1/contents` as `type: 'highlight'`, NOT to
 * browser-activity: a saved selection is a reading annotation with a body, not a
 * page visit. `properties.text` is how the selection reaches the sender
 * (BrowserActivity has no text field of its own) — toHighlightContentRecord
 * lifts it into the content row's `text`. See @/services/browserActivity.
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
