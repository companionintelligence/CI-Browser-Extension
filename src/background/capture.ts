/**
 * Active-tab screenshot capture. See planning/09 § PR-A.
 *
 * Tries `POST /api/content` if we're authenticated and have a device id;
 * otherwise queues locally via `content-cache`. The outbox refactor
 * (planning/06) will collapse the two paths into one drain loop.
 */

import axios from "axios";
import { logger, errMessage } from "@/lib/log";
import { store } from "@/store";
import { pushPending, type ContentPayload } from "./content-cache";

const POST_TIMEOUT_MS = 15_000;

export interface CaptureResult {
  url: string | undefined;
  title: string | undefined;
  size: number;
  queued: boolean;
}

export async function captureActiveTab(): Promise<CaptureResult> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab || typeof tab.windowId !== "number") {
    throw new Error("No active tab");
  }

  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const body = dataUrl.replace(/^data:image\/png;base64,/, "");
  const size = body.length;

  const state = store.getState().ciState;
  const { accessToken, serverDomain, deviceId } = state;
  const capturedAt = new Date().toISOString();

  const payload: ContentPayload = {
    device_id: deviceId,
    source_url: tab.url,
    source_title: tab.title,
    kind: "screenshot",
    mime_type: "image/png",
    body,
    captured_at: capturedAt,
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
      logger.info("capture.uploaded", { url: tab.url, size });

      return { url: tab.url, title: tab.title, size, queued: false };
    } catch (err) {
      await pushPending(payload);
      logger.warn("capture.uploadDeferred", {
        url: tab.url,
        size,
        err: errMessage(err),
      });

      return { url: tab.url, title: tab.title, size, queued: true };
    }
  }

  await pushPending(payload);
  logger.info("capture.cachedLocal", { url: tab.url, size });

  return { url: tab.url, title: tab.title, size, queued: true };
}
