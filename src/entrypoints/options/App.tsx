import { useState } from 'react';

import { useSelector, useDispatch } from 'react-redux'
import './App.css';
import {
    addDomainWhitelistEntry,
    addPageWhitelistEntry,
    removeDomainWhitelistEntry,
    removePageWhitelistEntry
} from "@/store/ciStateSlice.ts";

import { domainRegex, siteRegex } from '@/utils.ts'

function App() {
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
    console.log('domainWhitelist', domainWhitelist)
    const [invalidDomain, setInvalidDomain] = useState(false);

    const addDomainEntry = (e) => {
        e.preventDefault();
        console.log('adding domain whitelist', e, e.target, e.target.elements, e.target.elements['newDomain']);
        const newDomain = e.target.elements['newDomain'].value
        setInvalidDomain(!domainRegex.test(newDomain));
        if (domainRegex.test(newDomain))
            dispatch(addDomainWhitelistEntry(newDomain));
    }

    const deleteDomainEntry = (domain) => {
        console.log('removing domain whitelist', domain);
        dispatch(removeDomainWhitelistEntry(domain));
    }

  return (
      <>
          <div className="page">
              <div className="boxed-group">
                  <div className="title">Companion Intelligence Browser Extension Options</div>

                  <div className="padded paragraphed mobile-margin">
                      <p>
                          CI can help you organize and search your time on the web.
                          This can be done by navigating to a site, clicking the CI extension icon in the upper
                          right, and selecting either 'Start tracking this domain' or 'Start tracking this URL'.
                          You can also manually add the domain or URL to the list below.
                      </p>
                      <p>
                          When you add a domain or URL to the whitelist, all visits to that domain or URL will be
                          indexed from your browser.
                      </p>
                  {/*    /!*<p v-else-if="browserName === 'Microsoft Edge'">*!/*/}
                  {/*    /!*    Microsoft Edge unfortunately does not let us access your browser history at this time.*!/*/}
                  {/*    /!*    We therefore cannot retrieve any previous visits to domains or URLs that you have approved,*!/*/}
                  {/*    /!*    and can only track future visits.*!/*/}
                  {/*    /!*    Note that you must be logged into LifeScope on that device for future visits to be recorded.*!/*/}
                  {/*    /!*</p>*!/*/}
                      <p>Deleting an item from the list will stop tracking it, but it will <u>not</u> delete visits
                          already recorded for that domain or URL.</p>
                      <p>
                          At this time, there is no option for selectively deleting data gathered using this extension,
                          but you can delete all indexed web visits from that browser in the CI app.
                      </p>
                      <div className="domainWhitelist">
                          <h3>Tracked Domain List</h3>
                          <div>
                              <p>Enter domains websites for CI to track, such as 'wikipedia.org'</p>
                          </div>
                          <form onSubmit={addDomainEntry}>
                              <div className="add-domain flexbox flex-x-center">
                                  <div className="text-box">
                                      <input type="text" name="newDomain" placeholder="google.com"/>
                                  </div>
                                  <i className="fa fa-plus" onClick={addDomainEntry}>+</i>
                                  {invalidDomain && <span>That was not a valid domain.</span> }
                              </div>
                          </form>
                          <div className="entries">
                              { domainWhitelist.map(domain => (
                                  <div className="entry">
                                      <span>{domain}</span>
                                      <i className="delete fa fa-times" onClick={() => deleteDomainEntry(domain)}>X</i>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </>
  );
}

export default App;
