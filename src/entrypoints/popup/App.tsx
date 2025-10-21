import { useMemo, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { useSelector, useDispatch } from "react-redux";
import {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry,
  setState,
  toggleAutoSync,
  toggleBookmarkSync,
  toggleIncludeBookmarks,
  toggleDownloadSync,
  toggleIncludeDownloads,
  toggleFormSync,
  toggleIncludeFormSubmissions,
} from "@/store/ciStateSlice";
import "./App.css";
import { domainRegex, siteRegex } from "@/utils.ts";
import bowser from "bowser";
import { domainScraper } from "@/domainScraper";
import BlacklistManager from "./BlacklistManager";

export default function App() {
  const dispatch = useDispatch();
  const ciState = useSelector((state: any) => state.ciState);
  const {
    sessionToken,
    domain,
    domainWhitelist,
    domainWhitelistPending,
    pageWhitelist,
    pageWhitelistPending,
    url,
    historySyncInProgress,
    historySyncStatus,
    lastHistorySync,
    serverDomain,
    autoSyncEnabled,
    siteBlacklist,
    pageBlacklist,
    deviceId,
    deviceName,
    deviceType,
    devicePlatform,
    includeBookmarks,
    bookmarkSyncEnabled,
    includeDownloads,
    downloadSyncEnabled,
    includeFormSubmissions,
    formSyncEnabled,
  } = ciState;

  const [showBlacklistManager, setShowBlacklistManager] = useState(false);

  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");
  }, []);

  // Reload user settings when popup opens to get latest device info
  useEffect(() => {
    dispatch({ type: "loadUserSettings" });
    
    // Also refresh periodically while popup is open to catch device updates
    const interval = setInterval(() => {
      dispatch({ type: "loadUserSettings" });
    }, 2000); // Check every 2 seconds
    
    return () => clearInterval(interval);
  }, [dispatch]);

  // Check if current URL can be scraped
  const canScrapeCurrentUrl = useMemo(() => {
    return url ? domainScraper.canScrape(url) : false;
  }, [url]);

  // Get scraper profile for current domain
  const scraperProfile = useMemo(() => {
    if (!domain) {
      return null;
    }

    return domainScraper.getProfile(domain.replace("www.", ""));
  }, [domain]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    // Mobile detection
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");

    // Load recent scraper data
    if (domain) {
      browser.storage.local.get(null).then((allData) => {
        const scraperKeys = Object.keys(allData).filter(
          (key) => key.startsWith("scrapeData_") && key.includes(domain),
        );
        if (scraperKeys.length > 0) {
          // Get the most recent entry
          const latestKey = scraperKeys.sort().pop();
          if (latestKey) {
            setScraperData(allData[latestKey]);
          }
        }
      });
    }
  }, [domain]);

  const [scraperData, setScraperData] = useState<any>(null);

  const domainWhitelisted = useMemo(() => {
    let domainWhitelistHit = false;

    domainWhitelist.forEach((item: string) => {
      const domainRegex = new RegExp(item);

      if (domainRegex.test(domain)) {
        domainWhitelistHit = true;

        return;
      }
    });

    const domainWhitelistPendingHit =
      Object.keys(domainWhitelistPending).indexOf(domain) > -1;

    return { hit: domainWhitelistHit, pending: domainWhitelistPendingHit };
  }, [domainWhitelist, domainWhitelistPending]);

  const sessionTokenExpired = useMemo(() => {
    return sessionToken
      ? Date.now() >= (jwtDecode(sessionToken) as any).exp * 1000
      : true;
  }, [sessionToken]);

  const pageWhitelisted = useMemo(() => {
    let pageWhitelistHit = false;
    let pageWhitelistPendingHit = false;

    pageWhitelist.forEach((item: string) => {
      const parsedUrl = URL.parse(item);

      if (parsedUrl) {
        parsedUrl.hash = "";

        if (
          siteRegex.test(item) &&
          new RegExp(parsedUrl.toString().replace("?", "\\?")).test(url)
        ) {
          pageWhitelistHit = true;

          return;
        }
      }
    });

    Object.keys(pageWhitelistPending).forEach((item: string) => {
      const parsedUrl = URL.parse(item);

      if (parsedUrl) {
        parsedUrl.hash = "";

        if (
          siteRegex.test(item) &&
          new RegExp(parsedUrl.toString().replace("?", "\\?")).test(url)
        ) {
          pageWhitelistPendingHit = true;

          return;
        }
      }
    });

    return { hit: pageWhitelistHit, pending: pageWhitelistPendingHit };
  }, [pageWhitelist, pageWhitelistPending]);


  const addDomainWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]!.url;
    if (active) {
      const domain = new URL(active).hostname;
      if (!domainRegex.test(domain)) {
        return;
      }

      dispatch(addDomainWhitelistEntry(domain));
      dispatch(setState({ domain: domain, url: active }));
    }
  };

  const deleteDomainWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]!.url;
    if (active) {
      const domain = new URL(active).hostname;
      dispatch(removeDomainWhitelistEntry(domain));
      dispatch(setState({ domain: domain, url: active }));
    }
  };

  const addPageWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]?.url;
    if (!active) {
      return;
    }

    if (active.match(siteRegex) == null) {
      return;
    }

    const parsedUrl = URL.parse(active);
    if (!parsedUrl) {
      return;
    }

    parsedUrl.hash = "";

    dispatch(addPageWhitelistEntry(parsedUrl.toString()));
    dispatch(setState({ domain: parsedUrl.hostname, url: active }));
  };

  const deletePageWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]?.url;
    if (!active) {
      return;
    }

    const parsedUrl = URL.parse(active);
    if (!parsedUrl) {
      return;
    }

    parsedUrl.hash = "";

    dispatch(removePageWhitelistEntry(parsedUrl.toString()));
    dispatch(setState({ domain: parsedUrl.hostname, url: active }));
  };

  const openOptionsPage = async function () {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    } else {
      window.open(browser.runtime.getURL("/options.html"));
    }
  };

  const triggerManualHistorySync = async function () {
    if (historySyncInProgress) {
      return;
    }

    try {
      // If auto-sync is enabled, just trigger the background periodic sync
      if (autoSyncEnabled) {
        const response = await browser.runtime.sendMessage({
          action: "triggerBackgroundSync",
        });

        if (!response.success) {
          console.error("Background sync failed:", response.error);
        }
      } else {
        // If auto-sync is disabled, do a full manual sync
        const response = await browser.runtime.sendMessage({
          action: "triggerManualHistorySync",
          options: {
            timeRange: 7 * 24 * 60 * 60 * 1000, // Last 7 days
          },
        });

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

  const handleIncludeBookmarksToggle = () => {
    dispatch(toggleIncludeBookmarks());
  };

  const handleDownloadSyncToggle = () => {
    dispatch(toggleDownloadSync());
  };

  const handleIncludeDownloadsToggle = () => {
    dispatch(toggleIncludeDownloads());
  };

  const handleFormSyncToggle = () => {
    dispatch(toggleFormSync());
  };

  const handleIncludeFormSubmissionsToggle = () => {
    dispatch(toggleIncludeFormSubmissions());
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
          {sessionTokenExpired
            ? "Log in to continue"
            : "Logged in to Companion Intelligence"}
        </a>
      </div>
      
      {!sessionTokenExpired && (
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
              Automatically sync all browsing history (excluding blacklisted items)
            </p>
          </div>

          <div className="bookmark-sync-control">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={bookmarkSyncEnabled}
                onChange={handleBookmarkSyncToggle}
              />
              <span>Enable bookmark sync</span>
            </label>
            <p className="bookmark-sync-description">
              Sync your bookmarks with Companion Intelligence
            </p>
          </div>

          {bookmarkSyncEnabled && (
            <div className="include-bookmarks-control">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeBookmarks}
                  onChange={handleIncludeBookmarksToggle}
                />
                <span>Include bookmarks in history sync</span>
              </label>
              <p className="include-bookmarks-description">
                Include bookmark data when syncing browser history
              </p>
            </div>
          )}

          <div className="download-sync-control">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={downloadSyncEnabled}
                onChange={handleDownloadSyncToggle}
              />
              <span>Enable download sync</span>
            </label>
            <p className="download-sync-description">
              Sync your download history with Companion Intelligence
            </p>
          </div>

          {downloadSyncEnabled && (
            <div className="include-downloads-control">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeDownloads}
                  onChange={handleIncludeDownloadsToggle}
                />
                <span>Include downloads in history sync</span>
              </label>
              <p className="include-downloads-description">
                Include download data when syncing browser history
              </p>
            </div>
          )}

          <div className="form-sync-control">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formSyncEnabled}
                onChange={handleFormSyncToggle}
              />
              <span>Enable form submission sync</span>
            </label>
            <p className="form-sync-description">
              Sync form submissions with Companion Intelligence
            </p>
          </div>

          {formSyncEnabled && (
            <div className="include-form-submissions-control">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={includeFormSubmissions}
                  onChange={handleIncludeFormSubmissionsToggle}
                />
                <span>Include form submissions in history sync</span>
              </label>
              <p className="include-form-submissions-description">
                Include form submission data when syncing browser history
              </p>
            </div>
          )}

          {deviceId ? (
            <div className="device-info">
              <p className="device-name">Device: {deviceName || 'Unknown Device'}</p>
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

          <div className="blacklist-buttons">
            <button
              onClick={() => setShowBlacklistManager(true)}
              className="secondary"
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

          <div className="sync-controls">
            <button
              onClick={triggerManualHistorySync}
              disabled={historySyncInProgress}
              className={historySyncInProgress ? "disabled" : "primary"}
            >
              {historySyncInProgress 
                ? "Syncing..." 
                : autoSyncEnabled 
                  ? "Trigger Background Sync" 
                  : "Sync Last 7 Days"
              }
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
        </div>
      )}

      <div className="button-container">
        <div className="horizontal-container">
          {domainWhitelisted.hit && domainWhitelisted.pending && (
            <button disabled className="disabled">
              History being processed...
            </button>
          )}
          {domainWhitelisted.hit && !domainWhitelisted.pending && (
            <button className="danger" onClick={deleteDomainWhitelistEntryCall}>
              {isMobile ? "Stop tracking Site" : "Stop tracking this Site"}
            </button>
          )}
          {!domainWhitelisted.hit && (
            <button className="primary" onClick={addDomainWhitelistEntryCall}>
              {isMobile ? "Start tracking Site" : "Start tracking this Site"}
            </button>
          )}
          {pageWhitelisted.hit && pageWhitelisted.pending && (
            <button disabled className="disabled">
              History being processed...
            </button>
          )}
          {pageWhitelisted.hit && !pageWhitelisted.pending && (
            <button
              className="danger margin-bottom-1em"
              onClick={deletePageWhitelistEntryCall}
            >
              {isMobile ? "Stop tracking Page" : "Stop tracking this Page"}
            </button>
          )}
          {!pageWhitelisted.hit && (
            <button
              className="primary margin-bottom-1em"
              onClick={addPageWhitelistEntryCall}
            >
              {isMobile ? "Start tracking Page" : "Start tracking this Page"}
            </button>
          )}
        </div>

        {/* Domain Scraper Status */}
        <div className="domain-scraper-status margin-top-1em">
          <h3>Domain Scraper</h3>
          {scraperProfile && (
            <div className="scraper-profile">
              <p>
                <strong>Profile:</strong> {scraperProfile.name}
              </p>
              <p>
                <strong>Description:</strong> {scraperProfile.description}
              </p>
              <p>
                <strong>Data Types:</strong>{" "}
                {scraperProfile.dataTypes.map((dt) => dt.name).join(", ")}
              </p>
              {canScrapeCurrentUrl && (
                <p style={{ color: "green" }}>
                  ✓ This page can be scraped for personal data
                </p>
              )}
              {!canScrapeCurrentUrl && url && (
                <div>
                  <p style={{ color: "orange" }}>
                    ⚠ Navigate to supported pages to scrape data:
                  </p>
                  <ul style={{ fontSize: "12px", marginLeft: "20px" }}>
                    {(Array.isArray(scraperProfile.targetUrl)
                      ? scraperProfile.targetUrl
                      : [scraperProfile.targetUrl]
                    ).map((targetUrl, idx) => (
                      <li key={idx}>
                        {targetUrl
                          .replace(/https?:\/\/[^/]+/, "")
                          .replace("*", "any-path")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!scraperProfile && domain && (
            <div>
              <p>No scrape profile available for {domain}</p>
              <p style={{ fontSize: "12px" }}>
                Supported domains: netflix.com, hulu.com, disneyplus.com
              </p>
            </div>
          )}
          {scraperData && (
            <div className="recent-scrape">
              <p>
                <strong>Last scraped:</strong>{" "}
                {new Date(scraperData.timestamp).toLocaleString()}
              </p>
              <p>
                <strong>Items found:</strong>{" "}
                {Object.values(scraperData.data).reduce(
                  (total, items) =>
                    total + (Array.isArray(items) ? items.length : 0),
                  0,
                )}
              </p>
              <details style={{ fontSize: "12px", marginTop: "8px" }}>
                <summary>View data breakdown</summary>
                {Object.entries(scraperData.data).map(([key, items]) => (
                  <p key={key}>
                    {key}: {Array.isArray(items) ? items.length : 0} items
                  </p>
                ))}
              </details>
            </div>
          )}
        </div>
        
        <button onClick={openOptionsPage}>
          {isMobile ? "Options" : "Open Extension Options"}
        </button>
      </div>
    </div>
  );
}
