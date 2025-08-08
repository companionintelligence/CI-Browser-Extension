import { useState, useEffect } from 'react';
import { fetchJson } from "@/hooks/fetchJson.ts";

import { useAuth } from '@/hooks';
import { useMemo } from 'react'
import { jwtDecode } from 'jwt-decode'

const API_BASE = '/api';

export default function App() {
  console.log('render app')
  const [accessToken, setAccessToken] = useState(null)
  const [sessionToken, setSessionToken] = useState(null)
  const [domain, setDomain] = useState(null)
  const [whitelist, setWhitelist] = useState([])
  const [whitelistPending, setWhitelistPending] = useState({})
  const [url, setUrl] = useState(null)

  useEffect(() => {
    browser.storage.local.get().then(result => {
      setAccessToken(result.accessToken)
      setSessionToken(result.sessionToken)
      setWhitelist(result.whitelist)
      setDomain(result.domain)
      setUrl(result.url)
      setWhitelistPending(result.whitelistPending)
    })
  }, [])


  const domainRegex = /([a-zA-Z0-9]+\.)+[a-zA-Z0-9]+/;
  const siteRegex = /^(http(s)?:\/\/)([a-zA-Z0-9]+\.)+[a-zA-Z0-9]+(\/([.a-zA-Z0-9_-~!$&'()*+,;=:@])+)*\/?/;
  const domainWhitelisted = useMemo(() => {
    let whitelistHit = false;

    whitelist.forEach( item => {
      let domainRegex = new RegExp(item);

      if (domainRegex.test(domain)) {
        whitelistHit = true;

        return;
      }
    })

    return whitelistHit;
  }, [whitelist])

  const sessionTokenExpired = useMemo(() => {
    return (sessionToken ? Date.now() >= jwtDecode<JwtPayload>(sessionToken).exp * 1000 : true)
  }, [sessionToken])

  const siteWhitelisted = useMemo(() => {
    let self = this;
    let whitelistHit = false;

    whitelist.forEach(item => {
      let parsedUrl = new URL(item);

      if (parsedUrl.protocol && parsedUrl.host && parsedUrl.pathname) {
        let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host;

        if (parsedUrl.pathname !== '/') {
          condensedUrl += parsedUrl.pathname
        }

        let tempRegex = new RegExp(condensedUrl);

        if (siteRegex.test(item) && tempRegex.test(url)) {
          whitelistHit = true;

          return;
        }
      }
    });

    return whitelistHit;
  }, [whitelist])

  const domainPending = useMemo(() => {
    let whitelistHit = false;

    Object.entries(whitelistPending).forEach(([key, value]) => {
      let domainRegex = new RegExp(value);

      if (domainRegex.test(domain)) {
        whitelistHit = true;

        return;
      }
    });

    return whitelistHit;
  }, [whitelistPending])

  const sitePending = useMemo(() => {
    let self = this;
    let whitelistHit = false;

    Object.entries(whitelistPending).forEach(([key, value]) => {
      let parsedUrl = new URL(value);

      if (parsedUrl.protocol && parsedUrl.host && parsedUrl.pathname) {
        let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host;

        if (parsedUrl.pathname !== '/') {
          condensedUrl += parsedUrl.pathname
        }

        let tempRegex = new RegExp(condensedUrl);

        if (siteRegex.test(value) && tempRegex.test(url)) {
          whitelistHit = true;

          return;
        }
      }
    });

    return whitelistHit;
  }, [whitelistPending])


  const addDomainWhitelistEntry = async function() {
    console.log('addDomainWhitelistEntry')
    console.log('domain', domain)
    if (domain.match(domainRegex) == null) {
      console.log('Not a domain')
      return;
    }

    let domainWhitelistExists = whitelist.indexOf(this.$data.domain);
    console.log('domainWhitelistExists', domainWhitelistExists)

    if (domainWhitelistExists === -1) {
      console.log('Add whitelist entry', domain)
      browser.storage.local.set({ 'whitelist': whitelist.push(domain) });

      // await this.$store.dispatch({
      //   type: 'saveUserSettings'
      // });

      // browser.runtime.sendMessage({
      //   data: 'triggerHistoryCrawl',
      //   connection: this.$data.connection
      // });
    }
  }

  const deleteDomainWhitelistEntry = async function() {
    let self = this;

    Object.entries(whitelist).forEach(([key, value], i) => {
      let domainRegex = new RegExp(value);

      // if (domainRegex.test(self.$data.domain)) {
      //   self.$store.state.whitelist.splice(i, 1);
      // }
    });

    // this.$store.dispatch({
    //   type: 'saveUserSettings'
    // });
  }

  const addSiteWhitelistEntry = async function() {
    if (url.match(siteRegex) == null) {
      return;
    }

    let parsedUrl = new URL(url);

    let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host;

    if (parsedUrl.pathname !== '/') {
      condensedUrl += parsedUrl.pathname
    }

    let domainWhitelistExists = whitelist.indexOf(condensedUrl);

    if (domainWhitelistExists === -1) {
      browser.storage.local.set('whitelist', whitelist.push(condensedUrl));

      // await this.$store.dispatch({
      //   type: 'saveUserSettings'
      // });
      //
      // browser.runtime.sendMessage({
      //   data: 'triggerHistoryCrawl',
      //   connection: this.$data.connection
      // });
    }
  }

  const deleteSiteWhitelistEntry = function() {
    let self = this;

    let parsedUrl = url.parse(this.$data.url);

    let condensedUrl = parsedUrl.protocol + '//' + parsedUrl.host + parsedUrl.pathname;

    let index = whitelist.indexOf(condensedUrl)

    if (index >= 0) {
      browser.storage.local.set({ 'whitelist': whitelist.splice(index, 1)})

      // this.$store.dispatch({
      //   type: 'saveUserSettings'
      // });
    }
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
              { domainWhitelisted && <button className="danger" onClick={deleteDomainWhitelistEntry}>Stop tracking this Site
                </button> }
              { !domainWhitelisted && <button className="primary" onClick={() => addDomainWhitelistEntry()}>Start tracking this Site
                </button> }
              { siteWhitelisted && <button className="danger margin-bottom-1em" onClick={deleteSiteWhitelistEntry}>Stop tracking this Page
                </button> }
              { !siteWhitelisted && <button className="primary margin-bottom-1em" onClick={addSiteWhitelistEntry}>Start tracking this Page
                </button> }
                <button onClick={openOptionsPage}>Open Extension Options</button>
            </div>

            {/*<div v-if="domainPending" className="crawl-pending">*/}
            {/*    Your site history is being parsed. You may be tag when process is complete.*/}
            {/*</div>*/}

            {/*<div v-if="sitePending" className="crawl-pending">*/}
            {/*    Your page history is being parsed. You may be tag when process is complete.*/}
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
