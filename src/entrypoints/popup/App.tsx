import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
  clearSyncHistoryLogs,
  setState,
  saveUserSettings,
} from "@/store/ciStateSlice";
import "@/theme.css";
import bowser from "bowser";
import BlacklistManager from "./BlacklistManager";
import { Button, Checkbox, Field, Label, Input, Card } from "@ci/shadcn";

export default function App() {
  const dispatch = useDispatch();
  const ciState = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    accessToken: string | null;
    domain: string | null;
    url: string | null;
    historySyncInProgress: boolean;
    historySyncStatus: string | null;
    lastHistorySync: string | null;
    serverDomain: string;
    autoSyncEnabled: boolean;
    siteBlacklist: string[];
    pageBlacklist: string[];
    deviceId: string | null;
    deviceName: string | null;
    bookmarkSyncEnabled: boolean;
    downloadSyncEnabled: boolean;
    historySyncEnabled: boolean;
    syncHistoryLogs: {
      id: string;
      status: string;
      timestamp: string;
      timeRange?: number;
      totalEntries?: number;
      processedEntries?: number;
      uploadedEntries?: number;
      error?: string;
      duration?: number;
    }[];
  };
  const {
    accessToken,
    historySyncInProgress,
    historySyncStatus,
    lastHistorySync,
    serverDomain,
    autoSyncEnabled,
    siteBlacklist,
    pageBlacklist,
    deviceId,
    deviceName,
    bookmarkSyncEnabled,
    downloadSyncEnabled,
    historySyncEnabled,
    syncHistoryLogs,
  } = ciState;

  const [showBlacklistManager, setShowBlacklistManager] = useState(false);
  const [domain, setDomain] = useState(serverDomain);
  const [syncTimeRange, setSyncTimeRange] = useState("7");
  const [showSyncLogs, setShowSyncLogs] = useState(false);
  const [token, setToken] = useState(accessToken);

  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");

    // Check authentication status every time popup opens
    const checkAuthStatus = async () => {
      try {
        // Send message to background to refresh auth status
        await browser.runtime.sendMessage({
          action: "CHECK_AUTH_STATUS",
        });
      } catch (error) {
        console.error("Error checking auth status:", error);
      }
    };

    // Check auth status immediately when popup opens. State updates arrive
    // automatically through the webext-redux proxy store, so no manual
    // settings reload is needed here.
    checkAuthStatus();
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // Mobile detection
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");

    browser.runtime.onMessage.addListener((message) => {
      if (message.action === "AUTH_STATE_UPDATED") {
        setToken(message.payload.accessToken);
      }
    });
  }, []);

  // const triggerManualSync = async function () {
  //   console.log(
  //     "triggerManualSync called, historySyncInProgress:",
  //     historySyncInProgress,
  //   );
  //
  //   if (historySyncInProgress) {
  //     console.log("Sync already in progress, returning");
  //
  //     return;
  //   }
  //
  //   try {
  //     // If auto-sync is enabled, just trigger the background periodic sync
  //     if (autoSyncEnabled) {
  //       console.log("Auto-sync enabled, triggering background sync");
  //       const response = await browser.runtime.sendMessage({
  //         action: "TRIGGER_BACKGROUND_SYNC",
  //       });
  //
  //       console.log("Background sync response:", response);
  //       if (!response.success) {
  //         console.error("Background sync failed:", response.error);
  //       }
  //     } else {
  //       // If auto-sync is disabled, do a full manual sync
  //       console.log("Auto-sync disabled, triggering manual sync");
  //       const response = await browser.runtime.sendMessage({
  //         action: "TRIGGER_MANUAL_SYNC",
  //         options: {
  //           timeRange: 7 * 24 * 60 * 60 * 1000, // Last 7 days
  //         },
  //       });
  //
  //       console.log("Manual sync response:", response);
  //       if (!response.success) {
  //         console.error("Manual history sync failed:", response.error);
  //       }
  //     }
  //   } catch (error) {
  //     console.error("Error triggering sync:", error);
  //   }
  // };

  const handleAutoSyncToggle = () => {
    dispatch(toggleAutoSync());
  };

  const handleBookmarkSyncToggle = () => {
    dispatch(toggleBookmarkSync());
  };

  const handleDownloadSyncToggle = () => {
    dispatch(toggleDownloadSync());
  };

  const handleHistorySyncToggle = () => {
    dispatch(toggleHistorySync());
  };

  const changeDomain = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    dispatch(setState({ serverDomain: domain }));
    dispatch(saveUserSettings());
  };

  const handleDomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDomain(e.target.value);
  };

  const triggerHistorySync = async () => {
    if (historySyncInProgress) {
      return;
    }

    try {
      const timeRangeMs = parseInt(syncTimeRange) * 24 * 60 * 60 * 1000;
      const response = await browser.runtime.sendMessage({
        action: "TRIGGER_MANUAL_HISTORY_SYNC",
        options: {
          timeRange: timeRangeMs,
        },
      });

      if (!response.success) {
        console.error("History sync failed:", response.error);
      }
    } catch (error) {
      console.error("Error triggering history sync:", error);
    }
  };

  const clearSyncLogs = () => {
    dispatch(clearSyncHistoryLogs());
  };

  const exportSyncLogs = () => {
    const dataStr = JSON.stringify(syncHistoryLogs, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

    const exportFileDefaultName = "sync_history_logs.json";

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "#28a745";
      case "failed":
        return "#dc3545";
      case "partial":
        return "#ffc107";
      default:
        return "#6c757d";
    }
  };

  if (showBlacklistManager) {
    return (
      <div
        className={`min-w-[280px] ${isMobile ? "w-full max-w-full" : "max-w-[400px]"} mx-auto p-4 box-border`}
      >
        <BlacklistManager onBack={() => setShowBlacklistManager(false)} />
      </div>
    );
  }

  return (
    <div
      className={`min-w-[280px] ${isMobile ? "w-full max-w-full p-2" : "w-[350px] max-w-[400px]"} mx-auto p-4 box-border`}
    >
      {/* CI Server URL Section */}
      <div className="mb-6">
        <h4 className="m-0 mb-2 text-[#4ba7a6] text-[1.25em] font-semibold">
          CI Server URL
        </h4>
        <p className="mb-3 text-[1em] text-[#888]">
          Enter the domain of your CI server
        </p>
        <form onSubmit={changeDomain} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[150px]">
              <Input
                value={domain}
                onChange={handleDomainChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    changeDomain(e);
                  }
                }}
                className="w-full min-h-[44px] text-base"
              />
            </div>
            <Button
              onClick={changeDomain}
              className="bg-[#4ba7a6] text-white border-[#4ba7a6] hover:bg-[#2f6b7e] hover:border-[#2f6b7e] min-h-[44px] active:translate-y-[1px] transition-all"
            >
              Save
            </Button>
          </div>
        </form>
      </div>

      {domain?.length > 0 && (
        <Button
          className="text-center mb-4 size-4 p-2 text-[#888] rounded-lg h-10 border-t bg-[rgba(75,167,166,0.1)] block w-full font-medium no-underline hover:bg-[rgba(75,167,166,0.15)] transition-colors"
          onClick={() => {
            window.open(`https://${serverDomain}`, "_blank");
          }}
        >
          {!token
            ? "Log in to continue"
            : "Logged in to Companion Intelligence"}
        </Button>
      )}

      {token && (
        <div className="mt-6 pt-4">
          <div className="mb-4">
            <h4 className="m-0 mb-2 text-[#4ba7a6] text-[1.25em] font-semibold pt-4 border-t border-[#333] dark:border-[#333] light:border-[#ddd]">
              Browser History Sync
            </h4>
          </div>

          <Field className="mb-4 p-4 bg-[rgba(75,167,166,0.05)] dark:bg-[rgba(75,167,166,0.05)] light:bg-[rgba(75,167,166,0.08)] rounded-lg text-left">
            <Field orientation="horizontal">
              <Checkbox
                id="auto-sync-enabled"
                name="auto-sync-enabled"
                checked={autoSyncEnabled}
                onCheckedChange={handleAutoSyncToggle}
                className="w-[18px] h-[18px] cursor-pointer accent-[#4ba7a6]"
              />
              <Field.Label htmlFor="auto-sync-enabled" className="text-[1.2em]">
                Auto-sync all browser history
              </Field.Label>
            </Field>
            <Field.Description className="mt-2 ml-7 text-[#888] dark:text-[#888] light:text-[#666] leading-[1.4] text-[0.9em]">
              Excludes ignored sites and pages
            </Field.Description>
          </Field>

          {deviceId ? (
            <div className="mb-4 p-3 rounded text-left">
              <p className="m-0 text-[0.9em] text-[#4ba7a6]">
                Device: {deviceName || "Unknown Device"}
              </p>
            </div>
          ) : (
            <div className="mb-4 p-3 rounded text-left">
              <p className="m-0 text-[0.9em] text-[#888] mb-2">
                Not Authenticated
              </p>
              <p className="text-[0.9em] text-[#888] my-2">
                Please log in through the main application first.
              </p>
              <p className="text-[0.8em] text-[#666] my-1 italic">
                This extension requires authentication to sync browser history.
              </p>
            </div>
          )}

          {/* Sync Time Range and Manual Sync Section */}
          <div className="mb-4">
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <label
                htmlFor="syncTimeRange"
                className="text-[0.9em] font-medium text-[#888]"
              >
                Sync time range:
              </label>
              <select
                id="syncTimeRange"
                value={syncTimeRange}
                onChange={(e) => setSyncTimeRange(e.target.value)}
                disabled={historySyncInProgress}
                className="w-[140px] min-h-[36px] text-sm rounded-md text-foreground border border-[#333] bg-transparent px-3 py-2 text-[#fff] outline-none focus:border-[#4ba7a6] focus:ring-2 focus:ring-[#4ba7a6]/50 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[rgba(75,167,166,0.05)]"
              >
                <option value="1">Last 24 hours</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="365">Last year</option>
              </select>
            </div>

            <Button
              onClick={triggerHistorySync}
              disabled={historySyncInProgress}
              className={`rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] w-full touch-manipulation ${
                historySyncInProgress
                  ? "opacity-60 cursor-not-allowed bg-[#333] dark:bg-[#333] light:bg-[#f0f0f0] text-[#888] dark:text-[#888] light:text-[#999] border-[#333] dark:border-[#333] light:border-[#ddd]"
                  : "bg-[#4ba7a6] text-white border-[#4ba7a6] hover:bg-[#2f6b7e] hover:border-[#2f6b7e] active:translate-y-[1px]"
              }`}
            >
              {historySyncInProgress ? "Syncing..." : "Start History Sync"}
            </Button>
          </div>
          {historySyncStatus && (
            <div className="text-[0.85em] text-[#666] dark:text-[#666] light:text-[#333] my-2 p-2 rounded bg-[rgba(75,167,166,0.1)]">
              {historySyncStatus}
            </div>
          )}
          {lastHistorySync && (
            <div className="text-[1em] text-[#888] dark:text-[#888] light:text-[#666] text-center">
              Last sync: {new Date(lastHistorySync).toLocaleString()}
            </div>
          )}

          {/* Compact sync toggles moved below sync button */}
          <div className="flex flex-col gap-2 mt-4 p-4 bg-[rgba(75,167,166,0.05)] rounded-lg border-t border-[rgba(75,167,166,0.2)]">
            <Field.Group className="max-w-lg w-full">
              <Field orientation="horizontal">
                <Checkbox
                  id="history-sync-enabled"
                  name="history-sync-enabled"
                  checked={historySyncEnabled}
                  onCheckedChange={handleHistorySyncToggle}
                  className="w-[18px] h-[18px] cursor-pointer accent-[#4ba7a6]"
                />
                <Label htmlFor="history-sync-enabled">History</Label>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="bookmark-sync-enabled"
                  name="bookmark-sync-enabled"
                  checked={bookmarkSyncEnabled}
                  onCheckedChange={handleBookmarkSyncToggle}
                />
                <Label htmlFor="bookmark-sync-enabled">Bookmarks</Label>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="download-sync-enabled"
                  name="download-sync-enabled"
                  checked={downloadSyncEnabled}
                  onCheckedChange={handleDownloadSyncToggle}
                />
                <Label htmlFor="download-sync-enabled">Downloads</Label>
              </Field>
            </Field.Group>
          </div>

          {/* Sync History & Logs Section */}
          <div className="mt-6 pt-6 border-t border-[#333] dark:border-[#333] light:border-[#ddd]">
            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
              <h4 className="text-[0.95em] m-0 text-[#4ba7a6] font-semibold">
                Sync History & Logs
              </h4>
              <div className="flex gap-2 items-center flex-wrap">
                <Button
                  onClick={() => setShowSyncLogs(!showSyncLogs)}
                  variant="outline"
                  className="text-xs px-2 py-1 bg-transparent text-[#4ba7a6] border-[#4ba7a6] hover:bg-[rgba(75,167,166,0.1)] min-h-[36px]"
                >
                  {showSyncLogs
                    ? "Hide Logs"
                    : `Show Logs (${syncHistoryLogs.length})`}
                </Button>
                {syncHistoryLogs.length > 0 && (
                  <>
                    <Button
                      onClick={exportSyncLogs}
                      variant="outline"
                      className="text-xs px-2 py-1 bg-transparent text-[#4ba7a6] border-[#4ba7a6] hover:bg-[rgba(75,167,166,0.1)] min-h-[36px]"
                      title="Export logs as JSON file"
                    >
                      Export
                    </Button>
                    <Button
                      onClick={clearSyncLogs}
                      variant="destructive"
                      className="text-xs px-2 py-1 bg-[#dc3545] text-white border-[#dc3545] hover:bg-[#c82333] hover:border-[#c82333] min-h-[36px]"
                      title="Clear all sync logs"
                    >
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </div>

            {showSyncLogs && (
              <div className="mt-3">
                {syncHistoryLogs.length === 0 ? (
                  <div className="text-center p-4 text-[#888] text-xs italic bg-white/5 border border-dashed border-[#333] rounded">
                    No sync operations recorded yet.
                  </div>
                ) : (
                  <Card className="bg-[#1a1a1a] dark:bg-[#1a1a1a] light:bg-[#f9f9f9] rounded border border-[#333] dark:border-[#333] light:border-[#ddd] overflow-hidden">
                    <div className="grid gap-2 p-2 bg-[#333] dark:bg-[#333] light:bg-[#f0f0f0] font-semibold text-xs text-white dark:text-white light:text-[#213547] grid-cols-[2fr_1fr_1fr]">
                      <span>Date & Time</span>
                      <span>Range</span>
                      <span>Status</span>
                    </div>
                    {syncHistoryLogs.map(
                      (log: {
                        id: string;
                        status: string;
                        timestamp: string;
                        timeRange?: number;
                        totalEntries?: number;
                        processedEntries?: number;
                        uploadedEntries?: number;
                        error?: string;
                        duration?: number;
                      }) => (
                        <div
                          key={log.id}
                          className="grid gap-2 p-2 text-background border-b border-[#333] dark:border-[#333] light:border-[#e0e0e0] text-xs items-center last:border-b-0 even:bg-white/[0.02] dark:even:bg-white/[0.02] light:even:bg-[#f7f7f7] grid-cols-[2fr_1fr_1fr]"
                        >
                          <div className="font-mono text-xs truncate">
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                          <div className="text-center font-medium">
                            {log.timeRange === 1 ? "24h" : `${log.timeRange}d`}
                          </div>
                          <div
                            className="font-medium text-center text-xs"
                            style={{ color: getStatusColor(log.status) }}
                          >
                            {log.status.charAt(0).toUpperCase() +
                              log.status.slice(1)}
                            {log.error && (
                              <div
                                className="text-[10px] text-[#dc3545] mt-1 italic truncate"
                                title={log.error}
                              >
                                ⚠️ {log.error.substring(0, 20)}...
                              </div>
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </Card>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 mb-4 mt-4">
            <Button
              onClick={() => setShowBlacklistManager(true)}
              className="rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] touch-manipulation bg-[#555] dark:bg-[#555] light:bg-[#e0e0e0] text-white dark:text-white light:text-[#213547] border-[#555] dark:border-[#555] light:border-[#d0d0d0] hover:bg-[#666] dark:hover:bg-[#666] light:hover:bg-[#d0d0d0] hover:border-[#666] dark:hover:border-[#666] light:hover:border-[#c0c0c0] active:translate-y-[1px] w-full"
            >
              Ignored Pages and Sites
            </Button>
            <div className="flex justify-around p-2 bg-[rgba(0,0,0,0.2)] dark:bg-[rgba(0,0,0,0.2)] light:bg-[rgba(0,0,0,0.05)] rounded text-[0.85em]">
              <span className="text-[#888] dark:text-[#888] light:text-[#666]">
                Sites: {siteBlacklist.length}
              </span>
              <span className="text-[#888] dark:text-[#888] light:text-[#666]">
                Pages: {pageBlacklist.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
