import { copy } from "../copy";
import { relativeTime } from "../lib/formatters";
import type { DotTone } from "../components/StatusDot";
import { useCiState } from "./useCiState";

export interface PopupStatus {
  tone: DotTone;
  pulse: boolean;
  headline: string;
  detail: string | null;
  /** Full datetime for the verdict `title` when detail is a relative time. */
  detailTitle: string | null;
}

/**
 * The single prioritized status derivation — drives the header corner dot,
 * Home's verdict line, and the Activity attention dot, so they can never
 * disagree: authError > syncing > provisioning > queued > lastFailed >
 * paused > ok.
 */
export function usePopupStatus({
  queued,
  authError,
}: {
  queued: number;
  authError: string | null;
}): PopupStatus {
  const {
    historySyncInProgress,
    historySyncProgress,
    historySyncEnabled,
    deviceId,
    deviceSetupError,
    lastHistorySync,
    syncHistoryLogs,
    serverURL,
    accessToken,
  } = useCiState();

  if (accessToken && authError) {
    return {
      tone: "err",
      pulse: false,
      headline: copy.verdict.authError,
      detail: copy.verdict.authErrorDetail,
      detailTitle: null,
    };
  }

  if (historySyncInProgress) {
    const phase = historySyncProgress?.phase;

    return {
      tone: "busy",
      pulse: true,
      headline: copy.verdict.syncing,
      detail: phase ? (copy.sync.phases[phase] ?? null) : null,
      detailTitle: null,
    };
  }

  if (accessToken && serverURL && !deviceId) {
    if (deviceSetupError) {
      return {
        tone: "err",
        pulse: false,
        headline: copy.home.registerFailed,
        detail: copy.verdict.registerFailedDetail,
        detailTitle: deviceSetupError,
      };
    }

    return {
      tone: "warn",
      pulse: true,
      headline: copy.verdict.provisioning,
      detail: copy.verdict.provisioningDetail,
      detailTitle: null,
    };
  }

  if (queued > 0) {
    return {
      tone: "warn",
      pulse: false,
      headline: copy.verdict.queue,
      detail: copy.verdict.queueDetail(queued),
      detailTitle: null,
    };
  }

  if (syncHistoryLogs[0]?.status === "failed") {
    return {
      tone: "err",
      pulse: false,
      headline: copy.verdict.lastFailed,
      detail: copy.verdict.lastFailedDetail,
      detailTitle: null,
    };
  }

  if (!historySyncEnabled) {
    return {
      tone: "warn",
      pulse: false,
      headline: copy.verdict.paused,
      detail: copy.verdict.pausedDetail,
      detailTitle: null,
    };
  }

  const rel = relativeTime(lastHistorySync);
  if (!rel) {
    return {
      tone: "ok",
      pulse: false,
      headline: copy.verdict.neverSynced,
      detail: copy.verdict.neverSyncedDetail,
      detailTitle: null,
    };
  }

  return {
    tone: "ok",
    pulse: false,
    headline: copy.verdict.ok,
    detail: copy.verdict.okDetail(rel),
    detailTitle: lastHistorySync
      ? new Date(lastHistorySync).toLocaleString()
      : null,
  };
}
