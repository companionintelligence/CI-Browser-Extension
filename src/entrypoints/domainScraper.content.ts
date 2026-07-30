import { SCRAPE_MATCH_PATTERNS } from "@/scrape/profiles";
import { profileForUrl, scrape } from "@/scrape/scraper";
import { isSensitiveScrapingEnabled } from "@/lib/scrapeSettings";

export default defineContentScript({
  // Derived from the profile registry rather than hand-maintained. The two used
  // to be separate lists that drifted: five registered profiles (cnn, wsj,
  // quora, robinhood, airbnb) were missing from this array and could never run.
  matches: SCRAPE_MATCH_PATTERNS,
  main() {
    async function performScraping() {
      const currentUrl = window.location.href;
      const profile = profileForUrl(currentUrl);

      if (!profile) {
        return;
      }

      // Check BEFORE scraping: the point of the gate is not to read sensitive
      // data, not to read it and drop it afterwards.
      if (profile.sensitive && !(await isSensitiveScrapingEnabled())) {
        return;
      }

      const result = scrape(document, currentUrl);
      if (!result) {
        return;
      }

      // The background is the only consumer. A second copy used to be written
      // to storage.local under a unique `scrapeData_<domain>_<ts>` key on every
      // scrape — never read, never pruned. Delivery failures are handled by the
      // background's retry queue.
      browser.runtime
        .sendMessage({ action: "DOMAIN_SCRAPE_DATA", data: result })
        .catch((error) => {
          console.error("Failed to send scraped data:", error);
        });
    }

    function scheduleScraping() {
      performScraping().catch((error) => {
        console.error("Scrape failed:", error);
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", scheduleScraping);
    } else {
      scheduleScraping();
    }

    // Streaming and social sites are SPAs: the URL changes without a document
    // load, so re-scrape when it does.
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(scheduleScraping, 1000);
      }
    }).observe(document.body, { childList: true, subtree: true });
  },
});
