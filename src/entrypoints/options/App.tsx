import { useState } from "react";

import { useSelector, useDispatch } from "react-redux";
import "./App.css";
import {
  addDomainWhitelistEntry,
  addPageWhitelistEntry,
  removeDomainWhitelistEntry,
  removePageWhitelistEntry,
} from "@/store/ciStateSlice.ts";

import { domainRegex, siteRegex } from "@/utils.ts";

function App() {
  const dispatch = useDispatch();
  const ciState = useSelector((state) => state.ciState);
  const { domainWhitelist, pageWhitelist } = ciState;
  const [invalidDomain, setInvalidDomain] = useState(false);
  const [invalidPage, setInvalidPage] = useState(false);

  const addDomainEntry = (e) => {
    e.preventDefault();
    const newDomain = e.target.elements["newDomain"].value;
    setInvalidDomain(!domainRegex.test(newDomain));
    if (domainRegex.test(newDomain)) {
      dispatch(addDomainWhitelistEntry(newDomain));
    }
  };

  const deleteDomainEntry = (domain) => {
    dispatch(removeDomainWhitelistEntry(domain));
  };

  const addPageEntry = (e) => {
    e.preventDefault();
    const newPage = e.target.elements["newPage"].value;
    setInvalidPage(!siteRegex.test(newPage));
    if (siteRegex.test(newPage)) {
      dispatch(addPageWhitelistEntry(newPage));
    }
  };

  const deletePageEntry = (page) => {
    dispatch(removePageWhitelistEntry(page));
  };

  return (
    <>
      <div className="page">
        <div className="boxed-group">
          <div className="title">
            Companion Intelligence Browser Extension Options
          </div>

          <div className="padded paragraphed mobile-margin">
            <p>
              CI can help you organize and search your time on the web. This can
              be done by navigating to a site, clicking the CI extension icon in
              the upper right, and selecting either 'Start tracking this domain'
              or 'Start tracking this URL'. You can also manually add the domain
              or URL to the list below.
            </p>
            <p>
              When you add a domain or URL to the whitelist, all visits to that
              domain or URL will be indexed from your browser.
            </p>
            {/*    /!*<p v-else-if="browserName === 'Microsoft Edge'">*!/*/}
            {/*    /!*    Microsoft Edge unfortunately does not let us access your browser history at this time.*!/*/}
            {/*    /!*    We therefore cannot retrieve any previous visits to domains or URLs that you have approved,*!/*/}
            {/*    /!*    and can only track future visits.*!/*/}
            {/*    /!*    Note that you must be logged into LifeScope on that device for future visits to be recorded.*!/*/}
            {/*    /!*</p>*!/*/}
            <p>
              Deleting an item from the list will stop tracking it, but it will{" "}
              <u>not</u> delete visits already recorded for that domain or URL.
            </p>
            <p>
              At this time, there is no option for selectively deleting data
              gathered using this extension, but you can delete all indexed web
              visits from that browser in the CI app.
            </p>
            <div className="domainWhitelist">
              <h3>Tracked Domain List</h3>
              <div>
                <p>Enter domains for CI to track, such as 'wikipedia.org'</p>
              </div>
              <form onSubmit={addDomainEntry}>
                <div className="add-entry">
                  <div className="adder">
                    <div className="text-box">
                      <input
                        type="text"
                        name="newDomain"
                        placeholder="google.com"
                      />
                    </div>
                    <i className="plus" onClick={addDomainEntry}>
                      +
                    </i>
                  </div>
                  {invalidDomain && <span>That is not a valid domain.</span>}
                </div>
              </form>
              <div className="entries">
                {domainWhitelist.map((domain) => (
                  <div className="entry">
                    <span>{domain}</span>
                    <i
                      className="delete"
                      onClick={() => deleteDomainEntry(domain)}
                    >
                      X
                    </i>
                  </div>
                ))}
              </div>
            </div>
            <div className="pageWhitelist">
              <h3>Tracked Page List</h3>
              <div>
                <p>
                  Enter specific pages for CI to track, such as
                  'https://en.wikipedia.org/wiki/Proceratosaurus'
                </p>
              </div>
              <form onSubmit={addPageEntry}>
                <div className="add-entry">
                  <div className="adder">
                    <div className="text-box">
                      <input
                        type="text"
                        name="newPage"
                        placeholder="https://google.com/search?q=roses"
                      />
                    </div>
                    <i className="plus" onClick={addPageEntry}>
                      +
                    </i>
                  </div>
                  {invalidPage && <span>That is not a valid page URL.</span>}
                </div>
              </form>
              <div className="entries">
                {pageWhitelist.map((page) => (
                  <div className="entry">
                    <span title={page}>{page.slice(0, 40) + "..."}</span>
                    <i className="delete" onClick={() => deletePageEntry(page)}>
                      X
                    </i>
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
