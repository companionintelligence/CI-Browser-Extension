import { useSelector } from "react-redux";

export interface SyncHistoryLog {
  id: string;
  status: string;
  timestamp: string;
  timeRange?: number;
  totalEntries?: number;
  processedEntries?: number;
  uploadedEntries?: number;
  error?: string;
  duration?: number;
}

/** Structured mirror of the historySyncStatus strings (additive; may be absent
 *  when the background predates it — consumers must fall back). */
export interface HistorySyncProgress {
  phase:
    | "starting"
    | "searching"
    | "processing"
    | "uploading"
    | "bookmarks"
    | "downloads"
    | "queue"
    | "finishing";
  current?: number;
  total?: number;
  ignored?: number;
}

export interface CiStateView {
  accessToken: string | null;
  url: string | null;
  domain: string | null;
  historySyncInProgress: boolean;
  historySyncStatus: string | null;
  historySyncProgress?: HistorySyncProgress | null;
  lastHistorySync: string | null;
  serverURL: string;
  serverURLSource: "auto" | "manual" | null;
  portalUrl: string;
  discoveryHint: string | null;
  memoryAppChoices:
    | { slug: string; url: string; deviceName?: string; deviceSlug?: string }[]
    | null;
  settingsLoaded: boolean;
  autoSyncEnabled: boolean;
  siteBlacklist: string[];
  pageBlacklist: string[];
  deviceId: string | null;
  deviceName: string | null;
  deviceSetupError: string | null;
  bookmarkSyncEnabled: boolean;
  downloadSyncEnabled: boolean;
  sensitiveScrapingEnabled: boolean;
  historySyncEnabled: boolean;
  syncHistoryLogs: SyncHistoryLog[];
}

export function useCiState(): CiStateView {
  return useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as CiStateView;
}
