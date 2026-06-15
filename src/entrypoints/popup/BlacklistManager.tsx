import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  addSiteBlacklist,
  removeSiteBlacklist,
  addPageBlacklist,
  removePageBlacklist,
} from "@/store/ciStateSlice";
import { domainRegex, siteRegex, parseUrl } from "@/utils.ts";
import "./BlacklistManager.css";

interface BlacklistManagerProps {
  onBack: () => void;
}

export default function BlacklistManager({ onBack }: BlacklistManagerProps) {
  const dispatch = useDispatch();
  const ciState = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    siteBlacklist: string[];
    pageBlacklist: string[];
  };
  const { siteBlacklist, pageBlacklist } = ciState;

  const [newSite, setNewSite] = useState("");
  const [newPage, setNewPage] = useState("");
  const [invalidSite, setInvalidSite] = useState(false);
  const [invalidPage, setInvalidPage] = useState(false);
  const [activeTab, setActiveTab] = useState<"sites" | "pages">("sites");

  const addSiteEntry = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setInvalidSite(!domainRegex.test(newSite));
    if (domainRegex.test(newSite)) {
      dispatch(addSiteBlacklist(newSite));
      setNewSite("");
    }
  };

  const deleteSiteEntry = (site: string) => {
    dispatch(removeSiteBlacklist(site));
  };

  const addPageEntry = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setInvalidPage(!siteRegex.test(newPage));
    if (siteRegex.test(newPage)) {
      dispatch(addPageBlacklist(newPage));
      setNewPage("");
    }
  };

  const deletePageEntry = (page: string) => {
    dispatch(removePageBlacklist(page));
  };

  const addCurrentSite = async () => {
    const tabInfo = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const active = tabInfo[0]?.url;
    if (active) {
      const currentDomain = new URL(active).hostname;
      if (domainRegex.test(currentDomain)) {
        dispatch(addSiteBlacklist(currentDomain));
      }
    }
  };

  const addCurrentPage = async () => {
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

    const parsedUrl = parseUrl(active);
    if (!parsedUrl) {
      return;
    }

    parsedUrl.hash = "";
    dispatch(addPageBlacklist(parsedUrl.toString()));
  };

  return (
    <div className="blacklist-manager">
      <div className="blacklist-header">
        <button className="back-button" onClick={onBack} title="Go back">
          ←
        </button>
        <h2>Ignored Pages and Sites</h2>
      </div>

      <div className="blacklist-description">
        <p>
          These sites and pages will be excluded from automatic browser history
          sync.
        </p>
      </div>

      <div className="tab-selector">
        <button
          className={`tab ${activeTab === "sites" ? "active" : ""}`}
          onClick={() => setActiveTab("sites")}
        >
          Ignored Sites ({siteBlacklist.length})
        </button>
        <button
          className={`tab ${activeTab === "pages" ? "active" : ""}`}
          onClick={() => setActiveTab("pages")}
        >
          Ignored Pages ({pageBlacklist.length})
        </button>
      </div>

      {activeTab === "sites" && (
        <div className="blacklist-section">
          <div className="current-actions">
            <button className="primary" onClick={addCurrentSite}>
              Add Current Site
            </button>
          </div>

          <form onSubmit={addSiteEntry}>
            <div className="add-entry">
              <div className="adder">
                <input
                  type="text"
                  value={newSite}
                  onChange={(e) => setNewSite(e.target.value)}
                  placeholder="example.com"
                  className="text-input"
                />
                <button type="submit" className="add-button">
                  +
                </button>
              </div>
              {invalidSite && (
                <span className="error">That is not a valid domain.</span>
              )}
            </div>
          </form>

          <div className="blacklist-entries">
            {siteBlacklist.length === 0 ? (
              <div className="empty-state">No ignored sites</div>
            ) : (
              siteBlacklist.map((site: string) => (
                <div className="entry" key={site}>
                  <span className="entry-text">{site}</span>
                  <button
                    className="delete-button"
                    onClick={() => deleteSiteEntry(site)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "pages" && (
        <div className="blacklist-section">
          <div className="current-actions">
            <button className="primary" onClick={addCurrentPage}>
              Add Current Page
            </button>
          </div>

          <form onSubmit={addPageEntry}>
            <div className="add-entry">
              <div className="adder">
                <input
                  type="text"
                  value={newPage}
                  onChange={(e) => setNewPage(e.target.value)}
                  placeholder="https://example.com/page"
                  className="text-input"
                />
                <button type="submit" className="add-button">
                  +
                </button>
              </div>
              {invalidPage && (
                <span className="error">That is not a valid page URL.</span>
              )}
            </div>
          </form>

          <div className="blacklist-entries">
            {pageBlacklist.length === 0 ? (
              <div className="empty-state">No ignored pages</div>
            ) : (
              pageBlacklist.map((page: string) => (
                <div className="entry" key={page}>
                  <span className="entry-text" title={page}>
                    {page.length > 40 ? page.slice(0, 40) + "..." : page}
                  </span>
                  <button
                    className="delete-button"
                    onClick={() => deletePageEntry(page)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
