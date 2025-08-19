import { useMemo } from "react";
import { jwtDecode } from "jwt-decode";
import { useSelector, useDispatch } from "react-redux";
import {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry,
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

      if (parsedUrl.protocol && parsedUrl.host && parsedUrl.pathname) {
        let condensedUrl = parsedUrl.protocol + "//" + parsedUrl.host;

        if (parsedUrl.pathname !== "/") {
          condensedUrl += parsedUrl.pathname;
        }

        const tempRegex = new RegExp(condensedUrl);

        if (siteRegex.test(item) && tempRegex.test(url)) {
          pageWhitelistHit = true;

          return;
        }
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
    if (domain.match(domainRegex) == null) {
      return;
    }

    dispatch(addDomainWhitelistEntry(domain));
  };

  const deleteDomainWhitelistEntryCall = async function () {
    dispatch(removeDomainWhitelistEntry(domain));
  };

  const addPageWhitelistEntryCall = async function () {
    if (url.match(siteRegex) == null) {
      return;
    }

    const parsedUrl = URL.parse(url);

    let condensedUrl = parsedUrl.protocol + "//" + parsedUrl.host;

    if (parsedUrl.pathname !== "/") {
      condensedUrl += parsedUrl.pathname;
    }

    dispatch(addPageWhitelistEntry(condensedUrl));
  };

  const deletePageWhitelistEntryCall = function () {
    const parsedUrl = URL.parse(url);

    const condensedUrl =
      parsedUrl.protocol + "//" + parsedUrl.host + parsedUrl.pathname;

    dispatch(removePageWhitelistEntry(condensedUrl));
  };

  const openOptionsPage = async function () {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    } else {
      window.open(browser.runtime.getURL("options.html"));
    }
  };

  return (
    <div class="body">
      <div class="login-status">
        <a href="https://dev.companionintelligence.com" target="_blank">
          {sessionTokenExpired
            ? "Log in to continue"
            : "Logged in to Companion Intelligence"}
        </a>
      </div>
      <div class="button-container">
        <div class="horizontal-container">
          {domainWhitelisted && (
            <button class="danger" onClick={deleteDomainWhitelistEntryCall}>
              Stop tracking this Site
            </button>
          )}
          {!domainWhitelisted && (
            <button class="primary" onClick={addDomainWhitelistEntryCall}>
              Start tracking this Site
            </button>
          )}
          {pageWhitelisted && (
            <button
              class="danger margin-bottom-1em"
              onClick={deletePageWhitelistEntryCall}
            >
              Stop tracking this Page
            </button>
          )}
          {!pageWhitelisted && (
            <button
              class="primary margin-bottom-1em"
              onClick={addPageWhitelistEntryCall}
            >
              Start tracking this Page
            </button>
          )}
        </div>
        <button onClick={openOptionsPage}>Open Extension Options</button>
      </div>

      {/*<div v-if="domainPending" class="crawl-pending">*/}
      {/*    Your site history is being parsed. You may tag when the process is complete.*/}
      {/*</div>*/}

      {/*<div v-if="sitePending" class="crawl-pending">*/}
      {/*    Your page history is being parsed. You may tag when the process is complete.*/}
      {/*</div>*/}

      {/*<div id="tagging" class="flexbox flex-column flex-x-center content actions"*/}
      {/*     v-if="(domainWhitelisted === true || siteWhitelisted === true) && $data.loggedIn === true && $data.item.id != null">*/}
      {/*    <div class="flexbox flex-x-center">*/}
      {/*        <div class="title">Tag this page</div>*/}
      {/*        <a class="how-to" href="https://lifescope.io/how-to" target="_blank"><i*/}
      {/*            class="fa fa-question-circle"></i></a>*/}
      {/*    </div>*/}

      {/*    <div class="tagging">*/}
      {/*      <form v-on:submit.prevent="addTag">*/}
      {/*        <div class="add-tag">*/}
      {/*          <span>#</span>*/}
      {/*          <input type="text" placeholder="Add a tag" v-model="tagName"/>*/}
      {/*          <i class="fa fa-plus" onClick="addTag"></i>*/}
      {/*        </div>*/}
      {/*        <div class="tags">*/}
      {/*          <div v-if="$data.item && $data.item.tags" v-for="tag in $data.item.tags">*/}
      {/*            <span onClick="searchTag(tag)">#{{tag}}</span>*/}
      {/*            <i class="delete fa fa-times" onClick="removeTag(tag)"></i>*/}
      {/*          </div>*/}
      {/*        </div>*/}
      {/*      </form>*/}
      {/*    </div>*/}
      {/*</div>*/}
    </div>
  );
}
