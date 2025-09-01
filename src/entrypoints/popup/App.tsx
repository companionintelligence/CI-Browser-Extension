import { useMemo } from "react";
import { jwtDecode } from "jwt-decode";
import { useSelector, useDispatch } from "react-redux";
import {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry,
  setState,
} from "@/store/ciStateSlice";
import "./App.css";
import { domainRegex, siteRegex } from "@/utils.ts";

export default function App() {
  const dispatch = useDispatch();
  const ciState = useSelector((state) => state.ciState);
  const {
    sessionToken,
    domain,
    domainWhitelist,
    // domainWhitelistPending,
    pageWhitelist,
    // pageWhitelistPending,
    url,
  } = ciState;

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
      // Send message to background script to capture screenshot
      const result = await browser.runtime.sendMessage({
        action: "captureScreenshot",
      });

      if (result.success) {
        console.log("Screenshot captured successfully");
        // Could show a toast notification here
      } else {
        console.error("Failed to capture screenshot:", result.error);
      }
    } catch (error) {
      console.error("Error capturing screenshot:", error);
    }
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
        <div className="horizontal-container">
          <button
            className="primary camera-capture"
            onClick={captureScreenshot}
          >
            📸 Capture Screenshot
          </button>
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
