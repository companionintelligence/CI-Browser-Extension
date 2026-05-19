/**
 * Drain loop for the IndexedDB outbox.
 *
 * One run pulls a small batch of `pending` rows whose `nextAttemptAt` has
 * passed, marks them `in_flight`, POSTs each to `/api/content`, and marks
 * them `synced` or `failed` (with backoff) based on the response.
 *
 * See docs/api/content.md for the endpoint contract and
 * planning/06-local-first-sync.md for the architectural plan.
 */

import type { AxiosError } from "axios";
import axios from "axios";
import { logger, errMessage } from "@/lib/log";
import { store } from "@/store";
import {
  counts,
  listPending,
  markFailed,
  markInFlight,
  markSynced,
  pruneSyncedOlderThan,
} from "./outbox";

const BATCH_SIZE = 5;
const PER_REQUEST_TIMEOUT_MS = 20_000;
const PRUNE_OLDER_THAN_MS = 7 * 24 * 60 * 60 * 1000;

let inFlight = false;

export async function drainContentOutbox(): Promise<void> {
  if (inFlight) {
    return;
  }

  const { accessToken, serverDomain } = store.getState().ciState;
  if (!accessToken || !serverDomain) {
    return;
  }

  inFlight = true;
  try {
    const batch = await listPending(BATCH_SIZE);
    if (batch.length === 0) {
      // Opportunistic GC of old synced rows.
      try {
        const removed = await pruneSyncedOlderThan(PRUNE_OLDER_THAN_MS);
        if (removed > 0) {
          logger.debug("outbox.pruned", { removed });
        }
      } catch (err) {
        logger.debug("outbox.pruneFailed", { err: errMessage(err) });
      }

      return;
    }

    await markInFlight(batch.map((r) => r.id));

    for (const row of batch) {
      try {
        await axios.post(`https://${serverDomain}/api/content`, row.payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: PER_REQUEST_TIMEOUT_MS,
        });
        await markSynced([row.id]);
        logger.info("outbox.uploaded", {
          id: row.id,
          kind: row.kind,
          url: row.payload.source_url,
        });
      } catch (err) {
        const ax = err as AxiosError;
        const status = ax.response?.status;
        const retryable =
          status === undefined ||
          status === 408 ||
          status === 425 ||
          status === 429 ||
          (status >= 500 && status < 600);
        await markFailed([row.id], errMessage(err), retryable);
        logger.warn("outbox.uploadFailed", {
          id: row.id,
          status,
          retryable,
          err: errMessage(err),
        });

        if (status === 401) {
          // Stop the rest of the batch; the auth subsystem will re-mint
          // the token and the next drain tick will resume.
          break;
        }
      }
    }
  } finally {
    inFlight = false;
  }
}

/**
 * Convenience for the Diagnostics tab.
 */
export async function getOutboxCounts() {
  return counts();
}
