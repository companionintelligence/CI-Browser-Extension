import { useState, useEffect } from 'react';
import { fetchJson } from "@/hooks/fetchJson.ts";

import { useAuth } from '@/hooks';

const API_BASE = '/api';

export default function App() {
    const [authStatus, authFunctions] = useAuth();

    console.log('authStatus', authStatus)

    if (authStatus.error) {
        return <div className="text-red-600">Error: {authStatus.error}</div>;
    }

    return (
        <div className="flexbox flex-column flex-x-center">
            <div className="login-status">
                <a href="https://dev.companionintelligence.com" target="_blank">
                    { authStatus.expired ? 'Log in to continue' : 'Logged in to Companion Intelligence' }
                </a>
            </div>
            <div>{ authStatus.authToken }</div>
            {/*<div className="flexbox flex-column">*/}
                {/*<button v-if="domainWhitelisted === true" className="danger" v-on:click="deleteDomainWhitelistEntry"*/}
                {/*        style="margin-bottom: 0.5em">Stop tracking this Site*/}
                {/*</button>*/}
                {/*<button v-else-if="domainWhitelisted === false" className="primary" v-on:click="addDomainWhitelistEntry"*/}
                {/*        style="margin-bottom: 0.5em">Start tracking this Site*/}
                {/*</button>*/}
                {/*<button v-if="siteWhitelisted === true" className="danger margin-bottom-1em"*/}
                {/*        v-on:click="deleteSiteWhitelistEntry">Stop tracking this Page*/}
                {/*</button>*/}
                {/*<button v-else-if="siteWhitelisted === false" className="primary margin-bottom-1em"*/}
                {/*        v-on:click="addSiteWhitelistEntry">Start tracking this Page*/}
                {/*</button>*/}
                {/*<button v-on:click="openOptionsPage">Open Extension Options</button>*/}
            {/*</div>*/}

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
            {/*          <i className="fa fa-plus" v-on:click="addTag"></i>*/}
            {/*        </div>*/}
            {/*        <div className="tags">*/}
            {/*          <div v-if="$data.item && $data.item.tags" v-for="tag in $data.item.tags">*/}
            {/*            <span v-on:click="searchTag(tag)">#{{tag}}</span>*/}
            {/*            <i className="delete fa fa-times" v-on:click="removeTag(tag)"></i>*/}
            {/*          </div>*/}
            {/*        </div>*/}
            {/*      </form>*/}
            {/*    </div>*/}
            {/*</div>*/}
        </div>
    );
}
