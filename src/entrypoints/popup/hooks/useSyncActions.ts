import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useToast } from "@ci/shadcn";
import { toggleHistorySync, saveUserSettings } from "@/store/ciStateSlice";
import { copy } from "../copy";
import { useCiState, type HistorySyncProgress } from "./useCiState";

const PERIOD_KEY = "ci-sync-period";
const DEFAULT_PERIOD = "7";

/** Progress for the bar: structured field first, string-parse fallback. */
export interface SyncProgressView {
  phase: HistorySyncProgress["phase"] | null;
  current: number | null;
  total: number | null;
  ignored: number | null;
  /** Raw status string for when nothing structured parses. */
  raw: string | null;
}

export function useSyncActions() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const {
    historySyncInProgress,
    historySyncProgress,
    historySyncStatus,
    historySyncEnabled,
    syncHistoryLogs,
  } = useCiState();

  const [period, setPeriodState] = useState<string>(
    () => localStorage.getItem(PERIOD_KEY) ?? DEFAULT_PERIOD,
  );

  const setPeriod = useCallback((value: string) => {
    setPeriodState(value);
    localStorage.setItem(PERIOD_KEY, value);
  }, []);

  const syncNow = useCallback(async () => {
    try {
      const timeRangeMs = parseInt(period, 10) * 24 * 60 * 60 * 1000;
      const response = await browser.runtime.sendMessage({
        action: "TRIGGER_MANUAL_HISTORY_SYNC",
        options: { timeRange: timeRangeMs },
      });

      if (response && response.success === false) {
        toast.error(copy.sync.triggerFailed);
      }
    } catch {
      toast.error(copy.sync.triggerFailed);
    }
  }, [period, toast]);

  const togglePause = useCallback(() => {
    dispatch(toggleHistorySync());
    dispatch(saveUserSettings());
  }, [dispatch]);

  // Completion toast on the in-progress falling edge, judged by the newest log.
  const wasInProgress = useRef(historySyncInProgress);
  useEffect(() => {
    if (wasInProgress.current && !historySyncInProgress) {
      if (syncHistoryLogs[0]?.status === "failed") {
        toast.error(copy.sync.failToast);
      } else {
        toast.success(copy.sync.doneToast);
      }
    }

    wasInProgress.current = historySyncInProgress;
  }, [historySyncInProgress, syncHistoryLogs, toast]);

  const progress: SyncProgressView = (() => {
    if (historySyncProgress) {
      return {
        phase: historySyncProgress.phase,
        current: historySyncProgress.current ?? null,
        total: historySyncProgress.total ?? null,
        ignored: historySyncProgress.ignored ?? null,
        raw: historySyncStatus,
      };
    }

    // Un-upgraded background: parse "240/1180" shapes out of the status string.
    const match = historySyncStatus?.match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      return {
        phase: null,
        current: parseInt(match[1], 10),
        total: parseInt(match[2], 10),
        ignored: null,
        raw: historySyncStatus,
      };
    }

    return {
      phase: null,
      current: null,
      total: null,
      ignored: null,
      raw: historySyncStatus,
    };
  })();

  return {
    period,
    setPeriod,
    syncNow,
    togglePause,
    paused: !historySyncEnabled,
    inProgress: historySyncInProgress,
    progress,
  };
}
