import { useState, useEffect } from 'react';
import { fetchJson } from "@/hooks/fetchJson.ts";

import { useAuth } from '@/hooks';
import { useMemo } from 'react'
import { jwtDecode } from 'jwt-decode'
import { useSelector, useDispatch } from 'react-redux'
import {
  addDomainWhitelistEntry,
  removeDomainWhitelistEntry,
  addPageWhitelistEntry,
  removePageWhitelistEntry
} from '@/store/ciStateSlice'

const API_BASE = '/api';

export default function App() {
  const dispatch = useDispatch()
  const ciState = useSelector(state => state.ciState)
  const {
    accessToken,
    sessionToken,
    domain,
    domainWhitelist,
    domainWhitelistPending,
    pageWhitelist,
    pageWhitelistPending,
    url
  } = ciState

  const domainRegex = /([a-zA-Z0-9]+).[a-zA-Z0-9]+/;
  const siteRegex = /^(http(s)?:\/\/)([a-zA-Z0-9]+\.)+[a-zA-Z0-9]+(\/([.a-zA-Z0-9_-~!$&'()*+,;=:@])+)*\/?/;
  const domainWhitelisted = useMemo(() => {
    let domainWhitelistHit = false;

    domainWhitelist.forEach( item => {
      let domainRegex = new RegExp(item);

      if (domainRegex.test(domain)) {
        domainWhitelistHit = true;

        return;
      }
    })

    return domainWhitelistHit;
  }, [domainWhitelist])

  const sessionTokenExpired = useMemo(() => {
    return (sessionToken ? Date.now() >= jwtDecode<JwtPayload>(sessionToken).exp * 1000 : true)
  }, [sessionToken])

  const pageWhitelisted = useMemo(() => {
    let pageWhitelistHit = false;

    pageWhitelist.forEach(item => {
      let parsedUrl = new URL(item);

      if (parsedUrl.protocol && parsedUrl.host && parsedUrl.pathname) {
        let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host;

        if (parsedUrl.pathname !== '/') {
          condensedUrl += parsedUrl.pathname
        }

        let tempRegex = new RegExp(condensedUrl);

        if (siteRegex.test(item) && tempRegex.test(url)) {
          pageWhitelistHit = true;

          return;
        }
      }
    });

    return pageWhitelistHit;
  }, [pageWhitelist])

  const domainPending = useMemo(() => {
    let domainWhitelistHit = false;

    Object.entries(domainWhitelistPending).forEach(([key, value]) => {
      let domainRegex = new RegExp(value);

      if (domainRegex.test(domain)) {
        domainWhitelistHit = true;

        return;
      }
    });

    return domainWhitelistHit;
  }, [domainWhitelistPending])

  const pagePending = useMemo(() => {
    let pageWhitelistHit = false;

    Object.entries(pageWhitelistPending).forEach(([key, value]) => {
      let parsedUrl = new URL(value);

      if (parsedUrl.protocol && parsedUrl.host && parsedUrl.pathname) {
        let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host;

        if (parsedUrl.pathname !== '/') {
          condensedUrl += parsedUrl.pathname
        }

        let tempRegex = new RegExp(condensedUrl);

        if (siteRegex.test(value) && tempRegex.test(url)) {
          pageWhitelistHit = true;

          return;
        }
      }
    });

    return pageWhitelistHit;
  }, [pageWhitelistPending])


  const addDomainWhitelistEntryCall = async function() {
    if (domain.match(domainRegex) == null) {
      return;
    }

    dispatch(addDomainWhitelistEntry(domain))
  }

  const deleteDomainWhitelistEntryCall = async function() {
   dispatch(removeDomainWhitelistEntry(domain))
  }

  const addPageWhitelistEntryCall = async function() {
    if (url.match(siteRegex) == null) {
      return;
    }

    let parsedUrl = new URL(url);

    let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host;

    if (parsedUrl.pathname !== '/') {
      condensedUrl += parsedUrl.pathname
    }

    dispatch(addPageWhitelistEntry(condensedUrl))
  }

  const deletePageWhitelistEntryCall = function() {
    let parsedUrl = new URL(url);

    let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host + parsedUrl.pathname;

    dispatch(removePageWhitelistEntry(condensedUrl))
  }

  const openOptionsPage = async function() {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    }
    else {
      window.open(browser.runtime.getURL('options.html'));
    }
  }

    return (
        <div className="flexbox flex-column flex-x-center">
            <div className="login-status">
                <a href="https://dev.companionintelligence.com" target="_blank">
                    { sessionTokenExpired ? 'Log in to continue' : 'Logged in to Companion Intelligence' }
                </a>
            </div>
            <div className="flexbox flex-column">
              { domainWhitelisted && <button className="danger" onClick={deleteDomainWhitelistEntryCall}>Stop tracking this Site
                </button> }
              { !domainWhitelisted && <button className="primary" onClick={addDomainWhitelistEntryCall}>Start tracking this Site
                </button> }
              { pageWhitelisted && <button className="danger margin-bottom-1em" onClick={deletePageWhitelistEntryCall}>Stop tracking this Page
                </button> }
              { !pageWhitelisted && <button className="primary margin-bottom-1em" onClick={addPageWhitelistEntryCall}>Start tracking this Page
                </button> }
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
