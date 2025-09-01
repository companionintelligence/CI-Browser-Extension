import { useMemo, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { useSelector, useDispatch } from "react-redux";
import {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry,
  setState,
  updateCaptureSettings,
} from "@/store/ciStateSlice";
import "./App.css";
import { domainRegex, siteRegex } from "@/utils.ts";

export default function App() {
  const dispatch = useDispatch();
  const ciState = useSelector((state) => state.ciState);
  const {
    sessionToken,
    oauthAccessToken,
    oauthTokenExpiry,
    domain,
    domainWhitelist,
    // domainWhitelistPending,
    pageWhitelist,
    // pageWhitelistPending,
    url,
    captureSettings,
  } = ciState;

  const [showCaptureSettings, setShowCaptureSettings] = useState(false);

  const domainWhitelisted = useMemo(() => {
    let domainWhitelistHit = false;

    domainWhitelist.forEach((item) => {
      const domainRegex = new RegExp(item);

      if (domainRegex.test(domain)) {
        domainWhitelistHit = true;

        return;
      }
    });

    return domainWhitelistHit;
  }, [domainWhitelist]);

  const sessionTokenExpired = useMemo(() => {
    return sessionToken
      ? Date.now() >= jwtDecode<JwtPayload>(sessionToken).exp * 1000
      : true;
  }, [sessionToken]);

  const oauthTokenValid = useMemo(() => {
    if (!oauthAccessToken || !oauthTokenExpiry) {
      return false;
    }

    return Date.now() < oauthTokenExpiry - 300000; // Valid if not expiring within 5 minutes
  }, [oauthAccessToken, oauthTokenExpiry]);

  const pageWhitelisted = useMemo(() => {
    let pageWhitelistHit = false;

    pageWhitelist.forEach((item) => {
      const parsedUrl = URL.parse(item);

      parsedUrl.hash = "";

      if (
        siteRegex.test(item) &&
        new RegExp(parsedUrl.toString().replace("?", "\\?")).test(url)
      ) {
        pageWhitelistHit = true;

        return;
      }
    });

    return pageWhitelistHit;
  }, [pageWhitelist]);

  // const domainPending = useMemo(() => {
  //   let domainWhitelistHit = false;
  //
  //   Object.entries(domainWhitelistPending).forEach(([key, value]) => {
  //     const domainRegex = new RegExp(value);
  //
  //     if (domainRegex.test(domain)) {
  //       domainWhitelistHit = true;
  //
  //       return;
  //     }
  //   });
  //
  //   return domainWhitelistHit;
  // }, [domainWhitelistPending]);

  // const pagePending = useMemo(() => {
  //   let pageWhitelistHit = false;
  //
  //   Object.entries(pageWhitelistPending).forEach(([key, value]) => {
  //     const parsedUrl = URL.parse(value);
  //
  //     if (parsedUrl.protocol && parsedUrl.host && parsedUrl.pathname) {
  //       let condensedUrl = parsedUrl.protocol + "//" + parsedUrl.host;
  //
  //       if (parsedUrl.pathname !== "/") {
  //         condensedUrl += parsedUrl.pathname;
  //       }
  //
  //       const tempRegex = new RegExp(condensedUrl);
  //
  //       if (siteRegex.test(value) && tempRegex.test(url)) {
  //         pageWhitelistHit = true;
  //
  //         return;
  //       }
  //     }
  //   });
  //
  //   return pageWhitelistHit;
  // }, [pageWhitelistPending]);

  const addDomainWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]!.url;
    const domain = new URL(active).hostname;
    if (!domainRegex.test(domain)) {
      return;
    }

    dispatch(addDomainWhitelistEntry(domain));
    dispatch(setState({ domain: domain, url: active }));
  };

  const deleteDomainWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]!.url;
    const domain = new URL(active).hostname;
    dispatch(removeDomainWhitelistEntry(domain));
    dispatch(setState({ domain: domain, url: active }));
  };

  const addPageWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]!.url;
    if (active.match(siteRegex) == null) {
      return;
    }

    const parsedUrl = URL.parse(active);

    parsedUrl.hash = "";

    dispatch(addPageWhitelistEntry(parsedUrl.toString()));
    dispatch(setState({ domain: parsedUrl.hostname, url: active }));
  };

  const deletePageWhitelistEntryCall = async function () {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]!.url;
    const parsedUrl = URL.parse(active);

    parsedUrl.hash = "";

    dispatch(removePageWhitelistEntry(parsedUrl.toString()));
    dispatch(setState({ domain: parsedUrl.hostname, url: active }));
  };

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

  const updateCaptureInterval = function (minutes) {
    const milliseconds = minutes * 60 * 1000;
    dispatch(updateCaptureSettings({ captureInterval: milliseconds }));
  };

  const openOptionsPage = async function () {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    } else {
      window.open(browser.runtime.getURL("options.html"));
    }
  };

  return (
    <div className="body">
      <div className="login-status">
        <a href="https://dev.companionintelligence.com" target="_blank">
          {sessionTokenExpired
            ? "Log in to continue"
            : "Logged in to Companion Intelligence"}
        </a>
      </div>

      {/* OAuth Authentication Status */}
      <div className="oauth-status">
        {oauthTokenValid ? (
          <div className="oauth-valid">🔒 OAuth Active - Capture Enabled</div>
        ) : (
          <div className="oauth-invalid">
            <div>🔑 OAuth Required for Capture</div>
            <button className="oauth-button" onClick={initiateOAuth}>
              Authorize Camera & Desktop Access
            </button>
          </div>
        )}
      </div>

      <div className="button-container">
        <div className="horizontal-container">
          {domainWhitelisted && (
            <button className="danger" onClick={deleteDomainWhitelistEntryCall}>
              Stop tracking this Site
            </button>
          )}
          {!domainWhitelisted && (
            <button className="primary" onClick={addDomainWhitelistEntryCall}>
              Start tracking this Site
            </button>
          )}
          {pageWhitelisted && (
            <button
              className="danger margin-bottom-1em"
              onClick={deletePageWhitelistEntryCall}
            >
              Stop tracking this Page
            </button>
          )}
          {!pageWhitelisted && (
            <button
              className="primary margin-bottom-1em"
              onClick={addPageWhitelistEntryCall}
            >
              Start tracking this Page
            </button>
          )}
        </div>

        {/* Capture Controls */}
        <div className="capture-section">
          <h3>📸 Capture Controls</h3>
          <div className="capture-buttons">
            <button
              className="primary camera-capture"
              onClick={captureScreenshot}
              disabled={!oauthTokenValid}
            >
              📸 Smart Capture
            </button>
            <button
              className="secondary"
              onClick={captureWebcam}
              disabled={!oauthTokenValid}
            >
              📹 Webcam
            </button>
            <button
              className="secondary"
              onClick={captureDesktop}
              disabled={!oauthTokenValid}
            >
              🖥️ Desktop
            </button>
          </div>

          {/* Scheduled Capture */}
          <div className="scheduled-capture">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={captureSettings?.autoCapture || false}
                onChange={toggleScheduledCapture}
                disabled={!oauthTokenValid}
              />
              🕒 Automatic Capture
            </label>

            {captureSettings?.autoCapture && (
              <div className="capture-interval">
                <label>Interval:</label>
                <select
                  value={(captureSettings.captureInterval || 300000) / 60000}
                  onChange={(e) =>
                    updateCaptureInterval(parseInt(e.target.value))
                  }
                >
                  <option value={1}>1 minute</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </div>
            )}
          </div>

          {/* Capture Settings Toggle */}
          <button
            className="settings-toggle"
            onClick={() => setShowCaptureSettings(!showCaptureSettings)}
          >
            ⚙️ Settings
          </button>

          {showCaptureSettings && (
            <div className="capture-settings">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={captureSettings?.enableWebcam ?? true}
                  onChange={(e) =>
                    dispatch(
                      updateCaptureSettings({ enableWebcam: e.target.checked }),
                    )
                  }
                />
                Enable Webcam Capture
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={captureSettings?.enableDesktop ?? true}
                  onChange={(e) =>
                    dispatch(
                      updateCaptureSettings({
                        enableDesktop: e.target.checked,
                      }),
                    )
                  }
                />
                Enable Desktop Capture
              </label>
            </div>
          )}
        </div>

        <button onClick={openOptionsPage}>Open Extension Options</button>
      </div>

      {/*<div v-if="domainPending" className="crawl-pending">*/}
      {/*    Your site history is being parsed. You may tag when the process is complete.*/}
      {/*</div>*/}

      {/*<div v-if="sitePending" className="crawl-pending">*/}
      {/*    Your page history is being parsed. You may tag when the process is complete.*/}
      {/*</div>*/}

      {/*<div id="tagging" className="flexbox flex-column flex-x-center content actions"*/}
      {/*     v-if="(domainWhitelisted === true || siteWhitelisted === true) && $data.loggedIn === true && $data.item.id != null">*/}
      {/*    <div className="flexbox flex-x-center">*/}
      {/*        <div className="title">Tag this page</div>*/}
      {/*        <a className="how-to" href="https://lifescope.io/how-to" target="_blank"><i*/}
      {/*            className="fa fa-question-circle"></i></a>*/}
      {/*    </div>*/}

      {/*    <div className="tagging">*/}
      {/*      <form v-on:submit.prevent="addTag">*/}
      {/*        <div className="add-tag">*/}
      {/*          <span>#</span>*/}
      {/*          <input type="text" placeholder="Add a tag" v-model="tagName"/>*/}
      {/*          <i className="fa fa-plus" onClick="addTag"></i>*/}
      {/*        </div>*/}
      {/*        <div className="tags">*/}
      {/*          <div v-if="$data.item && $data.item.tags" v-for="tag in $data.item.tags">*/}
      {/*            <span onClick="searchTag(tag)">#{{tag}}</span>*/}
      {/*            <i className="delete fa fa-times" onClick="removeTag(tag)"></i>*/}
      {/*          </div>*/}
      {/*        </div>*/}
      {/*      </form>*/}
      {/*    </div>*/}
      {/*</div>*/}
    </div>
  );
}
