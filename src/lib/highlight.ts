import { parseUrl } from "@/utils";

// Keep stored highlights a sane size; selections beyond this are truncated
export const MAX_HIGHLIGHT_LENGTH = 10000;

export interface HighlightEvent {
  name: string;
  start_time: string;
  type: "Highlight";
  content: Array<{
    type: "Highlight";
    mimetype: "text/plain";
    url: string;
    title?: string;
    text: string;
  }>;
}

// Same event family as the domain-scraper uploads handled by
// handleScrapedData, so CI-Server ingests both through one path
export function buildHighlightEvent(
  selectionText: string,
  url: string,
  title?: string,
): HighlightEvent {
  const text =
    selectionText.length > MAX_HIGHLIGHT_LENGTH
      ? selectionText.slice(0, MAX_HIGHLIGHT_LENGTH)
      : selectionText;

  const source = title || parseUrl(url)?.hostname || url;

  return {
    name: `Highlight from ${source}`,
    start_time: new Date().toISOString(),
    type: "Highlight",
    content: [
      {
        type: "Highlight",
        mimetype: "text/plain",
        url: url,
        title: title,
        text: text,
      },
    ],
  };
}
