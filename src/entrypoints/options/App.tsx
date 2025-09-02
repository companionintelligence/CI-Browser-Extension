import { useState, useEffect } from "react";

import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import "./App.css";
import {
  addDomainWhitelistEntry,
  addPageWhitelistEntry,
  removeDomainWhitelistEntry,
  removePageWhitelistEntry,
  clearSyncHistoryLogs,
} from "@/store/ciStateSlice.ts";
import bowser from "bowser";

import { domainRegex, siteRegex } from "@/utils.ts";

function App() {
  const dispatch = useDispatch();
  const ciState = useSelector((state) => state.ciState);
  const {
    domainWhitelist,
    pageWhitelist,
    historySyncInProgress,
    historySyncStatus,
    lastHistorySync,
    syncHistoryLogs,
  } = ciState;
  const { domainWhitelist, pageWhitelist } = ciState;
  const [invalidDomain, setInvalidDomain] = useState(false);
  const [invalidPage, setInvalidPage] = useState(false);
  const [syncTimeRange, setSyncTimeRange] = useState("7");
  const [showSyncLogs, setShowSyncLogs] = useState(false);

  const [invalidDomain, setInvalidDomain] = useState(false);
  const [invalidPage, setInvalidPage] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");
  }, []);

  const addDomainEntry = (e: any) => {
    e.preventDefault();
    const newDomain = e.target.elements["newDomain"].value;
    setInvalidDomain(!domainRegex.test(newDomain));
    if (domainRegex.test(newDomain)) {
      dispatch(addDomainWhitelistEntry(newDomain));
    }
  };

  const deleteDomainEntry = (domain: string) => {
    dispatch(removeDomainWhitelistEntry(domain));
  };

  const addPageEntry = (e: any) => {
    e.preventDefault();
    const newPage = e.target.elements["newPage"].value;
    setInvalidPage(!siteRegex.test(newPage));
    if (siteRegex.test(newPage)) {
      dispatch(addPageWhitelistEntry(newPage));
    }
  };

  const deletePageEntry = (page: string) => {
    dispatch(removePageWhitelistEntry(page));
  };

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
    <>
      <div className={`page ${isMobile ? "mobile" : ""}`}>
        <div className="boxed-group">
          <div className="title">
            Companion Intelligence Browser Extension Options
          </div>

          <div className="padded paragraphed mobile-margin">
            <p>
              CI can help you organize and search your time on the web. This can
              be done by navigating to a site, clicking the CI extension icon in
              the upper right, and selecting either 'Start tracking this domain'
              or 'Start tracking this URL'. You can also manually add the domain
              or URL to the list below.
            </p>
            <p>
              When you add a domain or URL to the whitelist, all visits to that
              domain or URL will be indexed from your browser.
            </p>
            {/*    /!*<p v-else-if="browserName === 'Microsoft Edge'">*!/*/}
            {/*    /!*    Microsoft Edge unfortunately does not let us access your browser history at this time.*!/*/}
            {/*    /!*    We therefore cannot retrieve any previous visits to domains or URLs that you have approved,*!/*/}
            {/*    /!*    and can only track future visits.*!/*/}
            {/*    /!*    Note that you must be logged into LifeScope on that device for future visits to be recorded.*!/*/}
            {/*    /!*</p>*!/*/}
            <p>
              Deleting an item from the list will stop tracking it, but it will{" "}
              <u>not</u> delete visits already recorded for that domain or URL.
            </p>
            <p>
              At this time, there is no option for selectively deleting data
              gathered using this extension, but you can delete all indexed web
              visits from that browser in the CI app.
            </p>
            <div className="domainWhitelist">
              <h3>Tracked Domain List</h3>
              <div>
                <p>Enter domains for CI to track, such as 'wikipedia.org'</p>
              </div>
              <form onSubmit={addDomainEntry}>
                <div className="add-entry">
                  <div className="adder">
                    <div className="text-box">
                      <input
                        type="text"
                        name="newDomain"
                        placeholder={isMobile ? "google.com" : "google.com"}
                      />
                    </div>
                    <i className="plus" onClick={addDomainEntry}>
                      +
                    </i>
                  </div>
                  {invalidDomain && <span>That is not a valid domain.</span>}
                </div>
              </form>
              <div className="entries">
                {domainWhitelist.map((domain) => (
                  <div className="entry" key={domain}>
                    <span>{domain}</span>
                    <i
                      className="delete"
                      onClick={() => deleteDomainEntry(domain)}
                    >
                      X
                    </i>
                  </div>
                ))}
              </div>
            </div>
            <div className="pageWhitelist">
              <h3>Tracked Page List</h3>
              <div>
                <p>
                  Enter specific pages for CI to track, such as
                  'https://en.wikipedia.org/wiki/Proceratosaurus'
                </p>
              </div>
              <form onSubmit={addPageEntry}>
                <div className="add-entry">
                  <div className="adder">
                    <div className="text-box">
                      <input
                        type="text"
                        name="newPage"
                        placeholder={
                          isMobile
                            ? "https://google.com/search?q=..."
                            : "https://google.com/search?q=roses"
                        }
                      />
                    </div>
                    <i className="plus" onClick={addPageEntry}>
                      +
                    </i>
                  </div>
                  {invalidPage && <span>That is not a valid page URL.</span>}
                </div>
              </form>
              <div className="entries">
                {pageWhitelist.map((page) => (
                  <div className="entry" key={page}>
                    <span title={page}>
                      {isMobile && page.length > 30
                        ? page.slice(0, 30) + "..."
                        : page.length > 40
                          ? page.slice(0, 40) + "..."
                          : page}
                    </span>
                    <i className="delete" onClick={() => deletePageEntry(page)}>
                      X
                    </i>
                  </div>
                ))}
              </div>
            </div>

            <div className="historySync">
              <h3>Browser History Sync</h3>
              <div>
                <p>
                  Manually sync your browser history to the CI-Server. This will
                  sync all browsing history (not just whitelisted sites) for the
                  selected time period.
                </p>
                <p>
                  <strong>Note:</strong> Large time ranges may take several
                  minutes to process. The sync runs in the background and you'll
                  see progress updates.
                </p>
              </div>
              <div className="sync-controls">
                <div className="time-range-selector">
                  <label htmlFor="syncTimeRange">Sync time range:</label>
                  <select
                    id="syncTimeRange"
                    value={syncTimeRange}
                    onChange={(e) => setSyncTimeRange(e.target.value)}
                    disabled={historySyncInProgress}
                  >
                    <option value="1">Last 24 hours</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last year</option>
                  </select>
                </div>
                <button
                  onClick={triggerHistorySync}
                  disabled={historySyncInProgress}
                  className={historySyncInProgress ? "disabled" : "primary"}
                >
                  {historySyncInProgress ? "Syncing..." : "Start History Sync"}
                </button>
              </div>
              {historySyncStatus && (
                <div className="sync-status">{historySyncStatus}</div>
              )}
              {lastHistorySync && (
                <div className="last-sync">
                  Last successful sync:{" "}
                  {new Date(lastHistorySync).toLocaleString()}
                </div>
              )}
            </div>

            <div className="syncHistoryLogs">
              <div className="sync-logs-header">
                <h3>Sync History & Logs</h3>
                <div className="sync-logs-controls">
                  <button
                    onClick={() => setShowSyncLogs(!showSyncLogs)}
                    className="secondary"
                  >
                    {showSyncLogs
                      ? "Hide Logs"
                      : `Show Logs (${syncHistoryLogs.length})`}
                  </button>
                  {syncHistoryLogs.length > 0 && (
                    <>
                      <button
                        onClick={exportSyncLogs}
                        className="secondary"
                        title="Export logs as JSON file"
                      >
                        Export Logs
                      </button>
                      <button
                        onClick={clearSyncLogs}
                        className="danger"
                        title="Clear all sync logs"
                      >
                        Clear Logs
                      </button>
                    </>
                  )}
                </div>
              </div>

              {showSyncLogs && (
                <div className="sync-logs-list">
                  {syncHistoryLogs.length === 0 ? (
                    <div className="no-logs">
                      No sync operations recorded yet. Start a history sync to
                      see logs here.
                    </div>
                  ) : (
                    <div className="logs-table">
                      <div className="logs-header">
                        <span>Date & Time</span>
                        <span>Range</span>
                        <span>Total/Processed/Uploaded</span>
                        <span>Status</span>
                        <span>Duration</span>
                      </div>
                      {syncHistoryLogs.map((log) => (
                        <div key={log.id} className="log-entry">
                          <div className="log-timestamp">
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                          <div className="log-range">
                            {log.timeRange === 1 ? "24h" : `${log.timeRange}d`}
                          </div>
                          <div className="log-counts">
                            {log.totalEntries}/{log.processedEntries}/
                            {log.uploadedEntries}
                          </div>
                          <div
                            className="log-status"
                            style={{ color: getStatusColor(log.status) }}
                          >
                            {log.status.charAt(0).toUpperCase() +
                              log.status.slice(1)}
                            {log.error && (
                              <div className="log-error" title={log.error}>
                                ⚠️ {log.error.substring(0, 50)}
                                {log.error.length > 50 ? "..." : ""}
                              </div>
                            )}
                          </div>
                          <div className="log-duration">
                            {formatDuration(log.duration)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
