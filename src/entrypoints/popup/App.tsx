import { useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
  clearSyncHistoryLogs,
  setState,
  saveUserSettings,
  updateCaptureSettings,
} from "@/store/ciStateSlice";
import "@/theme.css";
import bowser from "bowser";
import BlacklistManager from "./BlacklistManager";
import SetupWizard from "./SetupWizard";
import {
  Button,
  Checkbox,
  Field,
  Label,
  Input,
  Card,
  Toaster,
} from "@ci/shadcn";

export default function App() {
  const dispatch = useDispatch();
  const ciState = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    accessToken: string | null;
    oauthAccessToken: string | null;
    oauthTokenExpiry: number | null;
    captureSettings: {
      enableWebcam: boolean;
      enableDesktop: boolean;
      autoCapture: boolean;
      captureInterval: number;
    };
    domain: string | null;
    url: string | null;
    historySyncInProgress: boolean;
    historySyncStatus: string | null;
    lastHistorySync: string | null;
    serverDomain: string;
    settingsLoaded: boolean;
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
    oauthAccessToken,
    oauthTokenExpiry,
    captureSettings,
    historySyncInProgress,
    historySyncStatus,
    lastHistorySync,
    serverDomain,
    settingsLoaded,
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
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showCaptureSettings, setShowCaptureSettings] = useState(false);

  // First-run onboarding: once persisted settings have loaded, if no
  // CI-Server is configured yet, surface the setup wizard. Choosing a server
  // or skipping closes it (skip lets the user fall back to manual entry).
  useEffect(() => {
    if (settingsLoaded && !serverDomain) {
      setShowSetupWizard(true);
    }

    if (serverDomain) {
      setDomain(serverDomain);
      browser.runtime.sendMessage({
        action: "CHECK_AUTH_STATUS",
      });
    }
  }, [settingsLoaded, serverDomain]);

  useEffect(() => {
    setToken(accessToken);
  }, [accessToken]);

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

  const handleAutoSyncToggle = () => {
    dispatch(toggleAutoSync());
  };

  const handleBookmarkSyncToggle = () => {
    dispatch(toggleBookmarkSync());
  };

  const handleDownloadSyncToggle = () => {
    dispatch(toggleDownloadSync());
  };

  // Validity of the standalone OAuth token used for webcam/desktop capture
  // (separate from the portal OIDC `token` used for sync/auth above).
  const oauthTokenValid = useMemo(() => {
    if (!oauthAccessToken || !oauthTokenExpiry) {
      return false;
    }

    return Date.now() < oauthTokenExpiry - 300000; // Valid if not expiring within 5 minutes
  }, [oauthAccessToken, oauthTokenExpiry]);

  const handleHistorySyncToggle = () => {
    dispatch(toggleHistorySync());
  };

  const changeDomain = (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    dispatch(setState({ serverDomain: domain }));
    dispatch(saveUserSettings());
  };

  // Kick off the OIDC Auth-Code + PKCE sign-in. The flow runs in the background
  // service worker (the popup is torn down when launchWebAuthFlow takes focus);
  // the resulting token arrives back via the AUTH_STATE_UPDATED broadcast.
  const handleAuthorize = async () => {
    setAuthorizing(true);
    setAuthError(null);
    try {
      const response = await browser.runtime.sendMessage({
        action: "AUTHORIZE",
      });

      if (!response?.success) {
        setAuthError(response?.error || "Authorization failed");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthorizing(false);
    }
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

  // ---- Webcam/desktop capture + its own OAuth flow (independent of the
  // portal OIDC `token` above) ----

  const captureScreenshot = async function () {
    try {
      // Send message to background script to capture screenshot (now webcam/desktop)
      const result = await browser.runtime.sendMessage({
        action: "captureScreenshot",
      });

      if (result.success) {
        console.log("Capture successful:", result.method);
        // Could show a toast notification here
      } else {
        console.error("Failed to capture:", result.error);
      }
    } catch (error) {
      console.error("Error capturing:", error);
    }
  };

  const captureWebcam = async function () {
    try {
      const result = await browser.runtime.sendMessage({
        action: "captureWebcam",
      });

      if (result.success) {
        console.log("Webcam capture successful");
      } else {
        console.error("Failed to capture webcam:", result.error);
      }
    } catch (error) {
      console.error("Error capturing webcam:", error);
    }
  };

  const captureDesktop = async function () {
    try {
      const result = await browser.runtime.sendMessage({
        action: "captureDesktop",
      });

      if (result.success) {
        console.log("Desktop capture successful");
      } else {
        console.error("Failed to capture desktop:", result.error);
      }
    } catch (error) {
      console.error("Error capturing desktop:", error);
    }
  };

  const initiateOAuth = async function () {
    try {
      const result = await browser.runtime.sendMessage({
        action: "startOAuth",
      });

      if (result.success) {
        console.log("OAuth authentication successful");
        // Reload the popup to show updated auth status
        window.location.reload();
      } else {
        console.error("OAuth authentication failed:", result.error);
      }
    } catch (error) {
      console.error("Error during OAuth:", error);
    }
  };

  const toggleScheduledCapture = async function () {
    try {
      const newAutoCapture = !captureSettings.autoCapture;

      // Update local state
      dispatch(updateCaptureSettings({ autoCapture: newAutoCapture }));

      // Send message to background script
      const result = await browser.runtime.sendMessage({
        action: newAutoCapture
          ? "startScheduledCapture"
          : "stopScheduledCapture",
      });

      if (result.success) {
        console.log(
          `Scheduled capture ${newAutoCapture ? "started" : "stopped"}`,
        );
      } else {
        console.error("Failed to toggle scheduled capture:", result.error);
      }
    } catch (error) {
      console.error("Error toggling scheduled capture:", error);
    }
  };

  const updateCaptureInterval = function (minutes: number) {
    const milliseconds = minutes * 60 * 1000;
    dispatch(updateCaptureSettings({ captureInterval: milliseconds }));
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

  // Map sync-log statuses onto the design-system semantic tokens (defined in
  // theme.css for both light and dark), so status colors track the theme.
  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "var(--success)";
      case "failed":
        return "var(--destructive)";
      case "partial":
        return "var(--warning)";
      default:
        return "var(--muted-foreground)";
    }
  };

  if (showSetupWizard) {
    return (
      <>
        <Toaster />
        <div
          className={`min-w-[280px] ${isMobile ? "w-full max-w-full" : "max-w-[400px]"} mx-auto p-4 box-border`}
        >
          <SetupWizard
            onComplete={() => setShowSetupWizard(false)}
            onSkip={() => setShowSetupWizard(false)}
          />
        </div>
      </>
    );
  }

  if (showBlacklistManager) {
    return (
      <>
        <Toaster />
        <div
          className={`min-w-[280px] ${isMobile ? "w-full max-w-full" : "max-w-[400px]"} mx-auto p-4 box-border`}
        >
          <BlacklistManager onBack={() => setShowBlacklistManager(false)} />
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster />
      <div
        className={`min-w-[280px] ${isMobile ? "w-full max-w-full p-2" : "w-[350px] max-w-[400px]"} mx-auto p-4 box-border`}
      >
        {/* CI Server URL Section */}
        <div className="mb-6">
          <h4 className="m-0 mb-2 text-primary text-[1.25em] font-semibold">
            CI Server URL
          </h4>
          <p className="mb-3 text-[1em] text-muted-foreground">
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
                className="min-h-[44px] active:translate-y-[1px] transition-all"
              >
                Save
              </Button>
            </div>
          </form>
        </div>

        {domain?.length > 0 &&
          (token ? (
            <Button
              className="text-center mb-4 size-4 p-2 text-muted-foreground rounded-lg h-10 border-t bg-primary/10 block w-full font-medium no-underline hover:bg-primary/15 transition-colors"
              onClick={() => {
                window.open(`https://${serverDomain}`, "_blank");
              }}
            >
              Authorized with Companion Intelligence
            </Button>
          ) : (
            <Button
              onClick={handleAuthorize}
              disabled={authorizing}
              style={{ background: "var(--gradient-brand)" }}
              className="text-center mb-4 p-2 rounded-lg h-10 block w-full font-medium no-underline transition-all text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {authorizing ? "Authorizing…" : "Authorize with Companion"}
            </Button>
          ))}

        {authError && (
          <div className="mb-4 p-2 rounded text-[0.85em] text-destructive bg-destructive/10">
            {authError}
          </div>
        )}

        {/* Standalone OAuth status for webcam/desktop capture — separate
            from the portal OIDC token used for sync above */}
        <div className="mb-4 p-3 rounded-lg text-left bg-primary/5">
          {oauthTokenValid ? (
            <p className="m-0 text-[0.9em] text-primary">
              🔒 OAuth Active — Capture Enabled
            </p>
          ) : (
            <>
              <p className="m-0 mb-2 text-[0.9em] text-muted-foreground">
                🔑 OAuth Required for Capture
              </p>
              <Button
                onClick={initiateOAuth}
                variant="outline"
                className="w-full min-h-[40px]"
              >
                Authorize Camera & Desktop Access
              </Button>
            </>
          )}
        </div>

        {token && (
          <div className="mt-6 pt-4">
            <div className="mb-4">
              <h4 className="m-0 mb-2 text-primary text-[1.25em] font-semibold pt-4 border-t border-border">
                Browser History Sync
              </h4>
            </div>

            <Field className="mb-4 p-4 bg-primary/5 rounded-lg text-left">
              <Field orientation="horizontal">
                <Checkbox
                  id="auto-sync-enabled"
                  name="auto-sync-enabled"
                  checked={autoSyncEnabled}
                  onCheckedChange={handleAutoSyncToggle}
                  className="w-[18px] h-[18px] cursor-pointer accent-primary"
                />
                <Field.Label
                  htmlFor="auto-sync-enabled"
                  className="text-[1.2em]"
                >
                  Auto-sync all browser history
                </Field.Label>
              </Field>
              <Field.Description className="mt-2 ml-7 text-muted-foreground leading-[1.4] text-[0.9em]">
                Excludes ignored sites and pages
              </Field.Description>
            </Field>

            {deviceId ? (
              <div className="mb-4 p-3 rounded text-left">
                <p className="m-0 text-[0.9em] text-primary">
                  Device: {deviceName || "Unknown Device"}
                </p>
              </div>
            ) : (
              <div className="mb-4 p-3 rounded text-left">
                <p className="m-0 text-[0.9em] text-muted-foreground mb-2">
                  Not Authenticated
                </p>
                <p className="text-[0.9em] text-muted-foreground my-2">
                  Please log in through the main application first.
                </p>
                <p className="text-[0.8em] text-muted-foreground my-1 italic">
                  This extension requires authentication to sync browser
                  history.
                </p>
              </div>
            )}

            {/* Sync Time Range and Manual Sync Section */}
            <div className="mb-4">
              <div className="mb-3 flex items-center gap-2 flex-wrap">
                <label
                  htmlFor="syncTimeRange"
                  className="text-[0.9em] font-medium text-muted-foreground"
                >
                  Sync time range:
                </label>
                <select
                  id="syncTimeRange"
                  value={syncTimeRange}
                  onChange={(e) => setSyncTimeRange(e.target.value)}
                  disabled={historySyncInProgress}
                  className="w-[140px] min-h-[36px] text-sm rounded-md text-foreground border border-border bg-transparent px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-primary/5"
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
                    ? "opacity-60 cursor-not-allowed bg-muted text-muted-foreground border-border"
                    : "bg-primary text-primary-foreground border-primary hover:bg-primary/90 active:translate-y-[1px]"
                }`}
              >
                {historySyncInProgress ? "Syncing..." : "Start History Sync"}
              </Button>
            </div>
            {historySyncStatus && (
              <div className="text-[0.85em] text-muted-foreground my-2 p-2 rounded bg-primary/10">
                {historySyncStatus}
              </div>
            )}
            {lastHistorySync && (
              <div className="text-[1em] text-muted-foreground text-center">
                Last sync: {new Date(lastHistorySync).toLocaleString()}
              </div>
            )}

            {/* Compact sync toggles moved below sync button */}
            <div className="flex flex-col gap-2 mt-4 p-4 bg-primary/5 rounded-lg border-t border-primary/20">
              <Field.Group className="max-w-lg w-full">
                <Field orientation="horizontal">
                  <Checkbox
                    id="history-sync-enabled"
                    name="history-sync-enabled"
                    checked={historySyncEnabled}
                    onCheckedChange={handleHistorySyncToggle}
                    className="w-[18px] h-[18px] cursor-pointer accent-primary"
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
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                <h4 className="text-[0.95em] m-0 text-primary font-semibold">
                  Sync History & Logs
                </h4>
                <div className="flex gap-2 items-center flex-wrap">
                  <Button
                    onClick={() => setShowSyncLogs(!showSyncLogs)}
                    variant="outline"
                    className="text-xs px-2 py-1 bg-transparent text-primary border-primary hover:bg-primary/10 min-h-[36px]"
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
                        className="text-xs px-2 py-1 bg-transparent text-primary border-primary hover:bg-primary/10 min-h-[36px]"
                        title="Export logs as JSON file"
                      >
                        Export
                      </Button>
                      <Button
                        onClick={clearSyncLogs}
                        variant="destructive"
                        className="text-xs px-2 py-1 min-h-[36px]"
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
                    <div className="text-center p-4 text-muted-foreground text-xs italic bg-white/5 border border-dashed border-border rounded">
                      No sync operations recorded yet.
                    </div>
                  ) : (
                    <Card className="bg-card rounded border border-border overflow-hidden">
                      <div className="grid gap-2 p-2 bg-muted font-semibold text-xs text-foreground grid-cols-[2fr_1fr_1fr]">
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
                            className="grid gap-2 p-2 text-card-foreground border-b border-border text-xs items-center last:border-b-0 even:bg-white/[0.02] grid-cols-[2fr_1fr_1fr]"
                          >
                            <div className="font-mono text-xs truncate">
                              {new Date(log.timestamp).toLocaleString()}
                            </div>
                            <div className="text-center font-medium">
                              {log.timeRange === 1
                                ? "24h"
                                : `${log.timeRange}d`}
                            </div>
                            <div
                              className="font-medium text-center text-xs"
                              style={{ color: getStatusColor(log.status) }}
                            >
                              {log.status.charAt(0).toUpperCase() +
                                log.status.slice(1)}
                              {log.error && (
                                <div
                                  className="text-[10px] text-destructive mt-1 italic truncate"
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
                className="rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] touch-manipulation bg-secondary text-secondary-foreground border-secondary hover:bg-secondary/80 hover:border-secondary/80 active:translate-y-[1px] w-full"
              >
                Ignored Pages and Sites
              </Button>
              <div className="flex justify-around p-2 bg-muted rounded text-[0.85em]">
                <span className="text-muted-foreground">
                  Sites: {siteBlacklist.length}
                </span>
                <span className="text-muted-foreground">
                  Pages: {pageBlacklist.length}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Webcam/Desktop Capture Section — independent of portal login,
            gated only on the standalone OAuth status above */}
        <div className="mt-6 pt-6 border-t border-border">
          <h4 className="m-0 mb-3 text-primary text-[1.25em] font-semibold">
            📸 Capture Controls
          </h4>
          <div className="flex gap-2 flex-wrap mb-3">
            <Button
              onClick={captureScreenshot}
              disabled={!oauthTokenValid}
              className="flex-1 min-h-[44px]"
            >
              📸 Smart Capture
            </Button>
            <Button
              onClick={captureWebcam}
              disabled={!oauthTokenValid}
              variant="outline"
              className="flex-1 min-h-[44px]"
            >
              📹 Webcam
            </Button>
            <Button
              onClick={captureDesktop}
              disabled={!oauthTokenValid}
              variant="outline"
              className="flex-1 min-h-[44px]"
            >
              🖥️ Desktop
            </Button>
          </div>

          <Field className="mb-3 p-4 bg-primary/5 rounded-lg text-left">
            <Field orientation="horizontal">
              <Checkbox
                id="auto-capture-enabled"
                name="auto-capture-enabled"
                checked={captureSettings?.autoCapture || false}
                onCheckedChange={toggleScheduledCapture}
                disabled={!oauthTokenValid}
                className="w-[18px] h-[18px] cursor-pointer accent-primary"
              />
              <Field.Label
                htmlFor="auto-capture-enabled"
                className="text-[1.2em]"
              >
                🕒 Automatic Capture
              </Field.Label>
            </Field>
          </Field>

          {captureSettings?.autoCapture && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <label
                htmlFor="captureInterval"
                className="text-[0.9em] font-medium text-muted-foreground"
              >
                Interval:
              </label>
              <select
                id="captureInterval"
                value={(captureSettings.captureInterval || 300000) / 60000}
                onChange={(e) =>
                  updateCaptureInterval(parseInt(e.target.value, 10))
                }
                className="w-[140px] min-h-[36px] text-sm rounded-md text-foreground border border-border bg-transparent px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 hover:bg-primary/5"
              >
                <option value={1}>1 minute</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
              </select>
            </div>
          )}

          <Button
            onClick={() => setShowCaptureSettings(!showCaptureSettings)}
            variant="outline"
            className="text-xs px-2 py-1 bg-transparent text-primary border-primary hover:bg-primary/10 min-h-[36px]"
          >
            {showCaptureSettings ? "Hide Settings" : "⚙️ Capture Settings"}
          </Button>

          {showCaptureSettings && (
            <div className="flex flex-col gap-2 mt-3 p-4 bg-primary/5 rounded-lg border-t border-primary/20">
              <Field orientation="horizontal">
                <Checkbox
                  id="enable-webcam-capture"
                  name="enable-webcam-capture"
                  checked={captureSettings?.enableWebcam ?? true}
                  onCheckedChange={(checked: boolean) =>
                    dispatch(updateCaptureSettings({ enableWebcam: checked }))
                  }
                />
                <Label htmlFor="enable-webcam-capture">
                  Enable Webcam Capture
                </Label>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="enable-desktop-capture"
                  name="enable-desktop-capture"
                  checked={captureSettings?.enableDesktop ?? true}
                  onCheckedChange={(checked: boolean) =>
                    dispatch(updateCaptureSettings({ enableDesktop: checked }))
                  }
                />
                <Label htmlFor="enable-desktop-capture">
                  Enable Desktop Capture
                </Label>
              </Field>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
