import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { clearSyncHistoryLogs, setState } from "@/store/ciStateSlice.ts";
import bowser from "bowser";
import { Button, Input, Select, Card, Alert } from '@ci/shadcn';

function App() {
  const dispatch = useDispatch();
  const ciState = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
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
    formSyncEnabled: boolean;
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
    historySyncInProgress,
    historySyncStatus,
    lastHistorySync,
    syncHistoryLogs,
    serverDomain,
  } = ciState;
  const [syncTimeRange, setSyncTimeRange] = useState("7");
  const [showSyncLogs, setShowSyncLogs] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [domain, setDomain] = useState(serverDomain);

  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");
  }, []);

  const changeDomain = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    dispatch(setState({ serverDomain: domain }));
  };

  const handleDomainChange = (e: { target: { value: string } }) => {
    setDomain(e.target.value);
  };

  // const handleNewDomainChange = (e: { target: { value: string } }) => {
  //   setNewDomain(e.target.value);
  // };

  // const handleNewPageChange = (e: { target: { value: string } }) => {
  //   setNewPage(e.target.value);
  // };

  const triggerHistorySync = async () => {
    if (historySyncInProgress) {
      return;
    }

    try {
      const timeRangeMs = parseInt(syncTimeRange) * 24 * 60 * 60 * 1000;
      const response = await browser.runtime.sendMessage({
        action: "triggerManualHistorySync",
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

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
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

  return (
    <div className={`w-full min-h-screen p-4 box-border ${isMobile ? "p-2" : ""}`}>
      <Card className={`bg-white/5 rounded-xl p-8 mx-auto max-w-[800px] ${isMobile ? "p-3" : ""}`}>
        <h1 className={`text-2xl font-semibold mb-6 text-[#4ba7a6] ${isMobile ? "text-xl text-center" : ""}`}>
          Companion Intelligence Browser Extension Options
        </h1>

        <div className="p-4 space-y-4 text-left">
          <p className="mb-4 leading-relaxed">
            CI can help you organize and search your time on the web. This can
            be done by navigating to a site, clicking the CI extension icon in
            the upper right, and selecting either 'Start tracking this domain'
            or 'Start tracking this URL'. You can also manually add the domain
            or URL to the list below.
          </p>
          <p className="mb-4 leading-relaxed">
            When you add a domain or URL to the whitelist, all visits to that
            domain or URL will be indexed from your browser.
          </p>
          <p className="mb-4 leading-relaxed">
            Deleting an item from the list will stop tracking it, but it will{" "}
            <u>not</u> delete visits already recorded for that domain or URL.
          </p>
          <p className="mb-4 leading-relaxed">
            At this time, there is no option for selectively deleting data
            gathered using this extension, but you can delete all indexed web
            visits from that browser in the CI app.
          </p>

          <div className="mt-8">
            <h3 className="text-xl mb-4 text-[#4ba7a6]">CI Server URL</h3>
            <p className="mb-4">Enter the domain that your CI server is accessible at</p>
            <form onSubmit={changeDomain} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px]">
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

          <div className="mt-8 pt-8 border-t border-[#333] dark:border-[#333] light:border-[#ddd]">
            <h3 className="text-xl mb-4 text-[#4ba7a6]">Browser History Sync</h3>
            <p className="mb-4 leading-relaxed">
              Manually sync your browser history to the CI-Server. This will
              sync all browsing history (not just whitelisted sites) for the
              selected time period.
            </p>
            <Alert className="mb-4 bg-[rgba(75,167,166,0.1)]">
              <p className="text-sm">
                <strong>Note:</strong> Large time ranges may take several
                minutes to process. The sync runs in the background and you'll
                see progress updates.
              </p>
            </Alert>

            <div className="my-6 flex flex-col items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="syncTimeRange" className="font-medium">Sync time range:</label>
                <Select
                  value={syncTimeRange}
                  onValueChange={(value) => setSyncTimeRange(value)}
                  disabled={historySyncInProgress}
                >
                  <Select.Trigger className="w-[180px] min-h-[44px]">
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="1">Last 24 hours</Select.Item>
                    <Select.Item value="7">Last 7 days</Select.Item>
                    <Select.Item value="30">Last 30 days</Select.Item>
                    <Select.Item value="90">Last 90 days</Select.Item>
                    <Select.Item value="365">Last year</Select.Item>
                  </Select.Content>
                </Select>
              </div>

              <Button
                onClick={triggerHistorySync}
                disabled={historySyncInProgress}
                className={`min-h-[44px] rounded-lg px-6 py-3 text-base font-medium transition-all ${
                  historySyncInProgress 
                    ? "opacity-60 cursor-not-allowed bg-[#333] text-[#888] border-[#333]" 
                    : "bg-[#4ba7a6] text-white border-[#4ba7a6] hover:bg-[#2f6b7e] hover:border-[#2f6b7e] active:translate-y-[1px]"
                }`}
              >
                {historySyncInProgress ? "Syncing..." : "Start History Sync"}
              </Button>
            </div>

            {historySyncStatus && (
              <Alert className="my-4 p-4 rounded bg-[rgba(75,167,166,0.1)] text-[#4ba7a6] text-center italic">
                {historySyncStatus}
              </Alert>
            )}

            {lastHistorySync && (
              <div className="text-sm text-[#888] dark:text-[#888] light:text-[#666] text-center mt-4">
                Last successful sync:{" "}
                {new Date(lastHistorySync).toLocaleString()}
              </div>
            )}
          </div>

          <div className="mt-8 pt-8 border-t border-[#333] dark:border-[#333] light:border-[#ddd]">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
              <h3 className="text-xl m-0 text-[#4ba7a6]">Sync History & Logs</h3>
              <div className="flex gap-2 items-center flex-wrap">
                <Button
                  onClick={() => setShowSyncLogs(!showSyncLogs)}
                  variant="outline"
                  className="text-sm px-3 py-2 bg-transparent text-[#4ba7a6] border-[#4ba7a6] hover:bg-[rgba(75,167,166,0.1)] min-h-[44px]"
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
                      className="text-sm px-3 py-2 bg-transparent text-[#4ba7a6] border-[#4ba7a6] hover:bg-[rgba(75,167,166,0.1)] min-h-[44px]"
                      title="Export logs as JSON file"
                    >
                      Export Logs
                    </Button>
                    <Button
                      onClick={clearSyncLogs}
                      variant="destructive"
                      className="text-sm px-3 py-2 bg-[#dc3545] text-white border-[#dc3545] hover:bg-[#c82333] hover:border-[#c82333] min-h-[44px]"
                      title="Clear all sync logs"
                    >
                      Clear Logs
                    </Button>
                  </>
                )}
              </div>
            </div>

            {showSyncLogs && (
              <div className="mt-4">
                {syncHistoryLogs.length === 0 ? (
                  <div className="text-center p-8 text-[#888] italic bg-white/5 border border-dashed border-[#333] rounded-lg">
                    No sync operations recorded yet. Start a history sync to
                    see logs here.
                  </div>
                ) : (
                  <Card className="bg-[#1a1a1a] dark:bg-[#1a1a1a] light:bg-[#f9f9f9] rounded-lg border border-[#333] dark:border-[#333] light:border-[#ddd] overflow-hidden">
                    <div className={`grid gap-4 p-4 bg-[#333] dark:bg-[#333] light:bg-[#f0f0f0] font-semibold text-sm text-white dark:text-white light:text-[#213547] ${isMobile ? "grid-cols-1" : "grid-cols-[2fr_1fr_2fr_1.5fr_1fr]"}`}>
                      <span>Date & Time</span>
                      <span>Range</span>
                      <span>Total/Processed/Uploaded</span>
                      <span>Status</span>
                      <span>Duration</span>
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
                          className={`grid gap-4 p-3 border-b border-[#333] dark:border-[#333] light:border-[#e0e0e0] text-sm items-center last:border-b-0 even:bg-white/[0.02] dark:even:bg-white/[0.02] light:even:bg-[#f7f7f7] ${isMobile ? "grid-cols-1" : "grid-cols-[2fr_1fr_2fr_1.5fr_1fr]"}`}
                        >
                          <div className="font-mono text-sm">
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                          <div className="text-center font-medium">
                            {log.timeRange === 1
                              ? "24h"
                              : `${log.timeRange}d`}
                          </div>
                          <div className="font-mono text-center">
                            {log.totalEntries}/{log.processedEntries}/
                            {log.uploadedEntries}
                          </div>
                          <div
                            className="font-medium text-center"
                            style={{ color: getStatusColor(log.status) }}
                          >
                            {log.status.charAt(0).toUpperCase() +
                              log.status.slice(1)}
                            {log.error && (
                              <div className="text-xs text-[#dc3545] mt-1 italic" title={log.error}>
                                ⚠️ {log.error.substring(0, 50)}
                                {log.error.length > 50 ? "..." : ""}
                              </div>
                            )}
                          </div>
                          <div className="font-mono text-center text-[#888]">
                            {formatDuration(log.duration || 0)}
                          </div>
                        </div>
                      ),
                    )}
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default App;
