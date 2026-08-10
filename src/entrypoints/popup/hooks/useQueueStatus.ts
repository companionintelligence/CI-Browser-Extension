import { useEffect, useState } from "react";
import { useCiState } from "./useCiState";

/**
 * Retry-queue depth via the additive GET_QUEUE_STATUS message. Returns 0
 * against an un-upgraded background (the message just fails).
 */
export function useQueueStatus(): number {
  const [queued, setQueued] = useState(0);
  const { historySyncInProgress } = useCiState();

  useEffect(() => {
    // Refresh on mount and whenever a sync run finishes (syncs drain the queue).
    if (historySyncInProgress) {
      return;
    }

    let active = true;

    browser.runtime
      .sendMessage({ action: "GET_QUEUE_STATUS" })
      .then((response: { success?: boolean; queued?: number } | undefined) => {
        if (
          active &&
          response?.success &&
          typeof response.queued === "number"
        ) {
          setQueued(response.queued);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [historySyncInProgress]);

  return queued;
}
