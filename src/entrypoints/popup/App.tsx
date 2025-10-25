import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
} from "@/store/ciStateSlice";
import "./App.css";
import bowser from "bowser";
import BlacklistManager from "./BlacklistManager";

export default function App() {
  const dispatch = useDispatch();
  const ciState = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    sessionToken: string | null;
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
    isAuthenticated: boolean;
  };
  const {
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
    isAuthenticated,
  } = ciState;

  const [showBlacklistManager, setShowBlacklistManager] = useState(false);

  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");

    // Check authentication status every time popup opens
    const checkAuthStatus = async () => {
      try {
        // Send message to background to refresh auth status
        await browser.runtime.sendMessage({
          action: "checkAuthStatus",
        });
      } catch (error) {
        console.error("Error checking auth status:", error);
      }
    };

    // Check auth status immediately when popup opens
    checkAuthStatus();

    // Reload user settings when popup opens to get latest auth state
    dispatch({ type: "loadUserSettings" });
  }, [dispatch]);

  // Also refresh periodically while popup is open to catch device updates
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "loadUserSettings" });
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [dispatch]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // Mobile detection
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");
  }, []);

  // Authentication state is now managed by background script and stored in Redux

  // Use isAuthenticated directly from Redux state (updated by background script)
  console.log("Popup authentication state:", isAuthenticated);

  const openOptionsPage = async function () {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    } else {
      window.open(browser.runtime.getURL("/options.html"));
    }
  };

  const triggerManualSync = async function () {
    console.log(
      "triggerManualSync called, historySyncInProgress:",
      historySyncInProgress,
    );

    if (historySyncInProgress) {
      console.log("Sync already in progress, returning");

      return;
    }

    try {
      // If auto-sync is enabled, just trigger the background periodic sync
      if (autoSyncEnabled) {
        console.log("Auto-sync enabled, triggering background sync");
        const response = await browser.runtime.sendMessage({
          action: "triggerBackgroundSync",
        });

        console.log("Background sync response:", response);
        if (!response.success) {
          console.error("Background sync failed:", response.error);
        }
      } else {
        // If auto-sync is disabled, do a full manual sync
        console.log("Auto-sync disabled, triggering manual sync");
        const response = await browser.runtime.sendMessage({
          action: "triggerManualSync",
          options: {
            timeRange: 7 * 24 * 60 * 60 * 1000, // Last 7 days
          },
        });

        console.log("Manual sync response:", response);
        if (!response.success) {
          console.error("Manual history sync failed:", response.error);
        }
      }
    } catch (error) {
      console.error("Error triggering sync:", error);
    }
  };

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

  if (showBlacklistManager) {
    return (
      <div className={`body ${isMobile ? "mobile" : ""}`}>
        <BlacklistManager onBack={() => setShowBlacklistManager(false)} />
      </div>
    );
  }

  return (
    <div className={`body ${isMobile ? "mobile" : ""}`}>
      <div className="login-status">
        <a href={`https://${serverDomain}`} target="_blank">
          {!isAuthenticated
            ? "Log in to continue"
            : "Logged in to Companion Intelligence"}
        </a>
      </div>

      {isAuthenticated && (
        <div className="sync-section">
          <div className="sync-header">
            <h4>Browser History Sync</h4>
          </div>

          <div className="auto-sync-control">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={handleAutoSyncToggle}
              />
              <span>Auto-sync all browser history</span>
            </label>
            <p className="auto-sync-description">
              Automatically sync all browsing history (excluding blacklisted
              items)
            </p>
          </div>

          {deviceId ? (
            <div className="device-info">
              <p className="device-name">
                Device: {deviceName || "Unknown Device"}
              </p>
            </div>
          ) : (
            <div className="device-info">
              <p className="device-label">Not Authenticated</p>
              <p className="device-status">
                Please log in through the main application first.
              </p>
              <p className="device-note">
                This extension requires authentication to sync browser history.
              </p>
            </div>
          )}

          <div className="sync-controls">
            <button
              onClick={triggerManualSync}
              disabled={historySyncInProgress}
              className={historySyncInProgress ? "disabled" : "primary"}
            >
              {historySyncInProgress
                ? "Syncing..."
                : autoSyncEnabled
                  ? "Trigger Background Sync"
                  : "Sync Last 7 Days"}
            </button>
          </div>
          {historySyncStatus && (
            <div className="sync-status">{historySyncStatus}</div>
          )}
          {lastHistorySync && (
            <div className="last-sync">
              Last sync: {new Date(lastHistorySync).toLocaleString()}
            </div>
          )}

          {/* Compact sync toggles moved below sync button */}
          <div className="compact-sync-controls">
            <div className="sync-toggle">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={historySyncEnabled}
                  onChange={handleHistorySyncToggle}
                />
                <span>History</span>
              </label>
            </div>

            <div className="sync-toggle">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={bookmarkSyncEnabled}
                  onChange={handleBookmarkSyncToggle}
                />
                <span>Bookmarks</span>
              </label>
            </div>

            <div className="sync-toggle">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={downloadSyncEnabled}
                  onChange={handleDownloadSyncToggle}
                />
                <span>Downloads</span>
              </label>
            </div>
          </div>
          <div className="blacklist-buttons" style={{ marginTop: "1rem" }}>
            <button
              onClick={() => setShowBlacklistManager(true)}
              className="secondary"
              style={{ width: "100%" }}
            >
              Manage Blacklists
            </button>
            <div className="blacklist-counts">
              <span className="blacklist-count">
                Sites: {siteBlacklist.length}
              </span>
              <span className="blacklist-count">
                Pages: {pageBlacklist.length}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="blacklist-buttons">
        <button
          onClick={openOptionsPage}
          className="secondary"
          style={{ width: "100%" }}
        >
          {isMobile ? "Options" : "Open Extension Options"}
        </button>
      </div>
    </div>
  );
}
