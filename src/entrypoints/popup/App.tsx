import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleSensitiveScraping,
  toggleHistorySync,
  clearSyncHistoryLogs,
  setState,
  saveUserSettings,
} from "@/store/ciStateSlice";
import "@/theme.css";
import { parseUrl } from "@/utils";
import { portalOidcConfig } from "@/services/portalConfig";
import {
  prepareAuthorizeRequest,
  shouldUseTabAuthFlow,
} from "@/services/oidcAuth";
import bowser from "bowser";
import BlacklistManager from "./BlacklistManager";
import AdvancedSettings from "./AdvancedSettings";
import MemorySettings from "./MemorySettings";
import { Button, Checkbox, Field, Label, Card, Toaster } from "@ci/shadcn";

/** Hidden developer panel: ⌥⇧. (Alt+Shift+Period), or 7 clicks on the title. */
const DEV_CLICKS_NEEDED = 7;
const DEV_CLICK_WINDOW_MS = 2500;

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
    serverURL: string;
    portalUrl: string;
    discoveryHint: string | null;
    memoryAppChoices:
      | { slug: string; url: string; deviceName?: string }[]
      | null;
    settingsLoaded: boolean;
    autoSyncEnabled: boolean;
    siteBlacklist: string[];
    pageBlacklist: string[];
    deviceId: string | null;
    deviceName: string | null;
    bookmarkSyncEnabled: boolean;
    downloadSyncEnabled: boolean;
    sensitiveScrapingEnabled: boolean;
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
    serverURL,
    portalUrl,
    discoveryHint,
    memoryAppChoices,
    settingsLoaded,
    autoSyncEnabled,
    siteBlacklist,
    pageBlacklist,
    deviceId,
    deviceName,
    bookmarkSyncEnabled,
    downloadSyncEnabled,
    sensitiveScrapingEnabled,
    historySyncEnabled,
    syncHistoryLogs,
  } = ciState;

  const [showBlacklistManager, setShowBlacklistManager] = useState(false);
  const [showMemorySettings, setShowMemorySettings] = useState(false);
  const [syncTimeRange, setSyncTimeRange] = useState("7");
  const [showSyncLogs, setShowSyncLogs] = useState(false);
  const [token, setToken] = useState(accessToken);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [titleClicks, setTitleClicks] = useState<{ n: number; t: number }>({
    n: 0,
    t: 0,
  });
  const [authorizing, setAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    browser.runtime.sendMessage({
      action: "CHECK_AUTH_STATUS",
    });
  }, [settingsLoaded, serverURL]);

  useEffect(() => {
    setToken(accessToken);
    if (accessToken) {
      setAuthorizing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");

    // Safari tears the popup down during tab auth. On reopen, restore the
    // "finish in the tab" state and refresh tokens from the background.
    const checkAuthStatus = async () => {
      try {
        const stored = await browser.storage.local.get("oidcAuthInProgressAt");
        const startedAt = stored.oidcAuthInProgressAt;
        if (
          typeof startedAt === "number" &&
          Date.now() - startedAt < 2 * 60 * 1000
        ) {
          setAuthorizing(true);
        }

        await browser.runtime.sendMessage({
          action: "CHECK_AUTH_STATUS",
        });
      } catch (error) {
        console.error("Error checking auth status:", error);
      }
    };

    checkAuthStatus();
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");

    const onMessage = (message: {
      action?: string;
      payload?: { accessToken?: string | null };
      error?: string;
    }) => {
      if (message.action === "AUTH_STATE_UPDATED") {
        setToken(message.payload?.accessToken ?? null);
        setAuthorizing(false);
        setAuthError(null);
      }

      if (message.action === "AUTH_FAILED") {
        setAuthorizing(false);
        setAuthError(
          typeof message.error === "string" && message.error
            ? message.error
            : "Sign-in failed",
        );
      }
    };

    browser.runtime.onMessage.addListener(onMessage);

    const onStorage = (
      changes: { [key: string]: { newValue?: unknown; oldValue?: unknown } },
      area: string,
    ) => {
      if (area !== "local") {
        return;
      }

      if (changes.oidcAuthInProgressAt && !changes.oidcAuthInProgressAt.newValue) {
        // Auth finished while the popup was closed or open — re-check Redux.
        setAuthorizing(false);
        void browser.runtime.sendMessage({ action: "CHECK_AUTH_STATUS" });
      }
    };

    browser.storage.onChanged.addListener(onStorage);

    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  // Secret developer unlock — not advertised in the UI.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && (e.key === "." || e.code === "Period")) {
        e.preventDefault();
        setDevUnlocked((open) => !open);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleTitleClick = () => {
    const now = Date.now();
    const next =
      now - titleClicks.t > DEV_CLICK_WINDOW_MS
        ? { n: 1, t: now }
        : { n: titleClicks.n + 1, t: titleClicks.t };
    setTitleClicks(next);
    if (next.n >= DEV_CLICKS_NEEDED) {
      setDevUnlocked(true);
      setTitleClicks({ n: 0, t: 0 });
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

  const handleSensitiveScrapingToggle = () => {
    dispatch(toggleSensitiveScraping());
    // Persist immediately: the content script reads this key straight from
    // storage.local before it scrapes, so it must not wait for another save.
    dispatch(saveUserSettings());
  };

  // Kick off Portal OIDC Auth-Code + PKCE. On Safari: (1) start background
  // capture, (2) open authorize tab under the click gesture. Starting capture
  // first matters — opening the tab often tears the popup down before a
  // follow-up message can run. Completion via AUTH_STATE_UPDATED / AUTH_FAILED.
  const handleAuthorize = async () => {
    setAuthorizing(true);
    setAuthError(null);
    try {
      let tabId: number | undefined;
      let prepared:
        | Awaited<ReturnType<typeof prepareAuthorizeRequest>>
        | undefined;

      if (shouldUseTabAuthFlow()) {
        prepared = await prepareAuthorizeRequest(
          portalOidcConfig({ portalUrl }),
          { prompt: "select_account" },
        );
        // Begin listening before the tab steals focus / kills this popup.
        const start = await browser.runtime.sendMessage({
          action: "AUTHORIZE",
          prepared,
        });
        if (start && start.success === false) {
          throw new Error(start.error || "Sign-in failed");
        }

        const tab = await browser.tabs.create({
          url: prepared.authorizeUrl,
          active: true,
        });
        tabId = tab.id;
        if (tabId !== undefined) {
          // Best-effort; capture also scans all tabs for the callback URL.
          void browser.runtime
            .sendMessage({ action: "AUTHORIZE_TAB", tabId })
            .catch(() => undefined);
        }

        return;
      }

      const response = await browser.runtime.sendMessage({
        action: "AUTHORIZE",
      });

      if (response && response.success === false) {
        setAuthError(response.error || "Sign-in failed");
        setAuthorizing(false);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
      setAuthorizing(false);
    }
  };

  // Multi-device pick: an explicit user choice, so it's saved as "manual" and
  // later discoveries never silently switch it.
  const chooseMemory = (choice: { url: string }) => {
    dispatch(
      setState({
        serverURL: choice.url,
        serverURLSource: "manual",
        memoryAppChoices: null,
        discoveryHint: null,
      }),
    );
    dispatch(saveUserSettings());
    browser.runtime
      .sendMessage({ action: "CHECK_AUTH_STATUS" })
      .catch(console.error);
  };

  const handleSignOut = async () => {
    try {
      await browser.runtime.sendMessage({ action: "SIGN_OUT" });
      setToken(null);
      setAuthorizing(false);
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  };

  /** Clear local session and open Portal with an account picker. */
  const handleUseAnotherAccount = async () => {
    try {
      await browser.runtime.sendMessage({ action: "SIGN_OUT" });
      setToken(null);
      dispatch(
        setState({
          serverURL: "",
          serverURLSource: null,
          memoryAppChoices: null,
          discoveryHint: null,
          deviceId: null,
          deviceName: null,
        }),
      );
      dispatch(saveUserSettings());
    } catch {
      // Still attempt a fresh authorize.
    }

    await handleAuthorize();
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

  if (showMemorySettings) {
    return (
      <>
        <Toaster />
        <div
          className={`min-w-[280px] ${isMobile ? "w-full max-w-full" : "max-w-[400px]"} mx-auto p-4 box-border`}
        >
          <MemorySettings onBack={() => setShowMemorySettings(false)} />
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
        <div className="mb-3 text-center">
          <h4
            className="m-0 text-primary text-[1.15em] font-semibold select-none cursor-default"
            onClick={handleTitleClick}
          >
            Companion Intelligence
          </h4>
        </div>

        {token ? (
          <Button
            className="text-center mb-3 p-2 text-muted-foreground rounded-lg h-10 bg-primary/10 block w-full font-medium hover:bg-primary/15 transition-colors"
            onClick={() => {
              window.open(serverURL || portalUrl, "_blank");
            }}
          >
            {serverURL
              ? parseUrl(serverURL)?.host ?? "Connected"
              : "Signed in — choose Memory below"}
          </Button>
        ) : (
          <Button
            onClick={handleAuthorize}
            disabled={authorizing}
            style={{ background: "var(--gradient-brand)" }}
            className="text-center mb-3 p-2 rounded-lg h-10 block w-full font-medium transition-all text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {authorizing ? "Finish sign-in in the tab…" : "Sign in"}
          </Button>
        )}

        {authError && (
          <div className="mb-3 p-2 rounded text-[0.85em] text-destructive bg-destructive/10">
            {authError}
          </div>
        )}

        {discoveryHint && (!token || !serverURL) && (
          <div className="mb-3 p-2 rounded text-[0.85em] text-muted-foreground bg-primary/10">
            {discoveryHint}
          </div>
        )}

        {token && memoryAppChoices && memoryAppChoices.length > 0 && (
          <div className="mb-3 p-3 rounded-lg bg-primary/5 text-left">
            <p className="m-0 mb-2 text-[0.9em] font-semibold text-primary">
              Choose Memory
            </p>
            <p className="m-0 mb-2 text-[0.8em] text-muted-foreground">
              Pick which device’s Memory this browser should use.
            </p>
            <div className="flex flex-col gap-2">
              {memoryAppChoices.map((choice) => (
                <Button
                  key={choice.url}
                  variant="outline"
                  onClick={() => chooseMemory(choice)}
                  className="w-full min-h-[40px] px-3 py-2 flex flex-col items-start gap-0 bg-transparent text-left border-border hover:bg-primary/10 hover:border-primary transition-colors"
                >
                  <span className="text-[0.9em] font-medium text-foreground">
                    {choice.deviceName ??
                      parseUrl(choice.url)?.host ??
                      choice.url}
                  </span>
                  <span className="text-[0.75em] text-muted-foreground">
                    {parseUrl(choice.url)?.host ?? choice.url}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {token && (
          <div className="mt-2 pt-3 border-t border-border">
            <Field className="mb-3 p-3 bg-primary/5 rounded-lg text-left">
              <Field orientation="horizontal">
                <Checkbox
                  id="auto-sync-enabled"
                  name="auto-sync-enabled"
                  checked={autoSyncEnabled}
                  onCheckedChange={handleAutoSyncToggle}
                  className="w-[18px] h-[18px] cursor-pointer accent-primary"
                />
                <Field.Label htmlFor="auto-sync-enabled">
                  Auto-sync
                </Field.Label>
              </Field>
            </Field>

            {deviceId ? (
              <p className="m-0 mb-3 text-[0.85em] text-muted-foreground">
                {deviceName || "This device"}
              </p>
            ) : (
              <p className="m-0 mb-3 text-[0.85em] text-muted-foreground">
                Setting up device…
              </p>
            )}

            <div className="mb-3">
              <div className="mb-2 flex items-center gap-2 flex-wrap">
                <label
                  htmlFor="syncTimeRange"
                  className="text-[0.85em] text-muted-foreground"
                >
                  Range
                </label>
                <select
                  id="syncTimeRange"
                  value={syncTimeRange}
                  onChange={(e) => setSyncTimeRange(e.target.value)}
                  disabled={historySyncInProgress}
                  className="w-[140px] min-h-[36px] text-sm rounded-md text-foreground border border-border bg-transparent px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-primary/5"
                >
                  <option value="1">24 hours</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
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
                {historySyncInProgress ? "Syncing…" : "Sync history"}
              </Button>
            </div>
            {historySyncStatus && (
              <div className="text-[0.85em] text-muted-foreground my-2 p-2 rounded bg-primary/10">
                {historySyncStatus}
              </div>
            )}
            {lastHistorySync && (
              <div className="text-[0.8em] text-muted-foreground text-center mb-2">
                Last: {new Date(lastHistorySync).toLocaleString()}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-3 p-3 bg-primary/5 rounded-lg">
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

              <Field orientation="horizontal" className="mt-2">
                <Checkbox
                  id="sensitive-scraping-enabled"
                  name="sensitive-scraping-enabled"
                  checked={sensitiveScrapingEnabled}
                  onCheckedChange={handleSensitiveScrapingToggle}
                />
                <Label htmlFor="sensitive-scraping-enabled">
                  Financial accounts
                </Label>
              </Field>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                <h4 className="text-[0.9em] m-0 text-primary font-semibold">
                  Logs
                </h4>
                <div className="flex gap-2 items-center flex-wrap">
                  <Button
                    onClick={() => setShowSyncLogs(!showSyncLogs)}
                    variant="outline"
                    className="text-xs px-2 py-1 bg-transparent text-primary border-primary hover:bg-primary/10 min-h-[36px]"
                  >
                    {showSyncLogs ? "Hide" : `Show (${syncHistoryLogs.length})`}
                  </Button>
                  {syncHistoryLogs.length > 0 && (
                    <>
                      <Button
                        onClick={exportSyncLogs}
                        variant="outline"
                        className="text-xs px-2 py-1 bg-transparent text-primary border-primary hover:bg-primary/10 min-h-[36px]"
                        title="Export JSON"
                      >
                        Export
                      </Button>
                      <Button
                        onClick={clearSyncLogs}
                        variant="destructive"
                        className="text-xs px-2 py-1 min-h-[36px]"
                        title="Clear logs"
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {showSyncLogs && (
                <div className="mt-2">
                  {syncHistoryLogs.length === 0 ? (
                    <div className="text-center p-3 text-muted-foreground text-xs bg-white/5 border border-dashed border-border rounded">
                      No logs yet
                    </div>
                  ) : (
                    <Card className="bg-card rounded border border-border overflow-hidden">
                      <div className="grid gap-2 p-2 bg-muted font-semibold text-xs text-foreground grid-cols-[2fr_1fr_1fr]">
                        <span>When</span>
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
                                  className="text-[10px] text-destructive mt-1 truncate"
                                  title={log.error}
                                >
                                  {log.error.substring(0, 24)}…
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

            <div className="flex flex-col gap-2 mb-2 mt-3">
              <Button
                onClick={() => setShowBlacklistManager(true)}
                className="rounded-lg border border-transparent px-[1.4em] py-[0.8em] text-base font-medium font-inherit cursor-pointer transition-all min-h-[44px] min-w-[44px] touch-manipulation bg-secondary text-secondary-foreground border-secondary hover:bg-secondary/80 hover:border-secondary/80 active:translate-y-[1px] w-full"
              >
                Ignore list
              </Button>
              <div className="flex justify-around p-2 bg-muted rounded text-[0.8em]">
                <span className="text-muted-foreground">
                  Sites {siteBlacklist.length}
                </span>
                <span className="text-muted-foreground">
                  Pages {pageBlacklist.length}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="outline"
            onClick={() => setShowMemorySettings(true)}
            className="w-full min-h-[40px] text-sm"
          >
            Settings
          </Button>
          {token && (
            <>
              <Button
                variant="outline"
                onClick={handleUseAnotherAccount}
                disabled={authorizing}
                className="w-full min-h-[40px] text-sm"
              >
                Use another account
              </Button>
              <Button
                variant="ghost"
                onClick={handleSignOut}
                className="w-full min-h-[36px] text-sm text-muted-foreground"
              >
                Sign out
              </Button>
            </>
          )}
          {devUnlocked && (
            <div>
              <AdvancedSettings />
              <button
                type="button"
                onClick={() => setDevUnlocked(false)}
                className="mt-2 text-[0.7em] text-muted-foreground bg-transparent border-0 p-0 cursor-pointer hover:text-foreground"
              >
                Hide
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
