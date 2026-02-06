import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
} from "@/store/ciStateSlice";
import "@/theme.css";
import bowser from "bowser";
import BlacklistManager from "./BlacklistManager";
import { Button, Checkbox, Field, Label } from '@ci/shadcn'

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
      <div className={`min-w-[280px] ${isMobile ? "w-full max-w-full" : "max-w-[400px]"} mx-auto p-4 box-border`}>
        <BlacklistManager onBack={() => setShowBlacklistManager(false)} />
      </div>
    );
  }

  return (
    <div className={`min-w-[280px] ${isMobile ? "w-full max-w-full p-2" : "w-[350px] max-w-[400px]"} mx-auto p-4 box-border`}>
      <Button
        className="text-center mb-4 size-4 p-2 text-[#888] rounded-lg h-10 border-t bg-[rgba(75,167,166,0.1)] block w-full font-medium no-underline hover:bg-[rgba(75,167,166,0.15)] transition-colors"
        onClick={() => {
        window.open(`https://${serverDomain}`, '_blank')
      }}>
        {!isAuthenticated
            ? "Log in to continue"
            : "Logged in to Companion Intelligence"}
      </Button>

      {isAuthenticated && (
        <div className="mt-6 pt-4 border-t border-[#333] dark:border-[#333] light:border-[#ddd]">
          <div className="mb-4">
            <h4 className="m-0 mb-4 text-[#666] text-[1.5em]">Browser History Sync</h4>
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
              <Field.Label htmlFor="history-sync-enabled" className="text-[1em]">Auto-sync all browser history</Field.Label>
            </Field>
            <Field.Description className="mt-2 ml-7 text-[#888] dark:text-[#888] light:text-[#666] leading-[1.4]">
              Automatically sync all browsing history (excluding blacklisted
              items)
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
              <p className="m-0 text-[0.9em] text-[#888] mb-2">Not Authenticated</p>
              <p className="text-[0.9em] text-[#888] my-2">
                Please log in through the main application first.
              </p>
              <p className="text-[0.8em] text-[#666] my-1 italic">
                This extension requires authentication to sync browser history.
              </p>
            </div>
          )}

          <div className="mb-4">
            <Button
              onClick={triggerManualSync}
              disabled={historySyncInProgress}
              className={`rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] w-full touch-manipulation ${
                historySyncInProgress 
                  ? "opacity-60 cursor-not-allowed bg-[#333] dark:bg-[#333] light:bg-[#f0f0f0] text-[#888] dark:text-[#888] light:text-[#999] border-[#333] dark:border-[#333] light:border-[#ddd]" 
                  : "bg-[#4ba7a6] text-white border-[#4ba7a6] hover:bg-[#2f6b7e] hover:border-[#2f6b7e] active:translate-y-[1px]"
              }`}
            >
              {historySyncInProgress
                ? "Syncing..."
                : autoSyncEnabled
                  ? "Trigger Background Sync"
                  : "Sync Last 7 Days"}
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
            <Field.Group className="max-w-lg w-full" orientation="horizontal">
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
                  id="history-sync-enabled"
                  name="history-sync-enabled"
                  checked={bookmarkSyncEnabled}
                  onCheckedChange={handleBookmarkSyncToggle}
                />
                <Label htmlFor="history-sync-enabled">Bookmarks</Label>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="download-sync-enabled"
                  name="download-sync-enabled"
                  checked={downloadSyncEnabled}
                  onCheckedChange={handleDownloadSyncToggle}
                />
                <Label htmlFor="history-sync-enabled">Downloads</Label>
              </Field>
            </Field.Group>
          </div>

          <div className="flex flex-col gap-2 mb-4 mt-4">
            <Button
              onClick={() => setShowBlacklistManager(true)}
              className="rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] touch-manipulation bg-[#555] dark:bg-[#555] light:bg-[#e0e0e0] text-white dark:text-white light:text-[#213547] border-[#555] dark:border-[#555] light:border-[#d0d0d0] hover:bg-[#666] dark:hover:bg-[#666] light:hover:bg-[#d0d0d0] hover:border-[#666] dark:hover:border-[#666] light:hover:border-[#c0c0c0] active:translate-y-[1px] w-full"
            >
              Manage Blacklists
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

      <div className="flex flex-col gap-2 mb-4">
        <Button
          onClick={openOptionsPage}
          className="rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] touch-manipulation bg-[#555] dark:bg-[#555] light:bg-[#e0e0e0] text-white dark:text-white light:text-[#213547] border-[#555] dark:border-[#555] light:border-[#d0d0d0] hover:bg-[#666] dark:hover:bg-[#666] light:hover:bg-[#d0d0d0] hover:border-[#666] dark:hover:border-[#666] light:hover:border-[#c0c0c0] active:translate-y-[1px] w-full"
        >
          {isMobile ? "Options" : "Open Extension Options"}
        </Button>
      </div>
    </div>
  );
}
