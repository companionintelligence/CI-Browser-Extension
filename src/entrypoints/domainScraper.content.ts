import { domainScraper } from "@/domainScraper";

export default defineContentScript({
  matches: [
    "*://*.netflix.com/*",
    "*://*.hulu.com/*",
    "*://secure.hulu.com/*",
    "*://*.disneyplus.com/*",
    "*://*.slashdot.org/*",
    "*://slashdot.org/*",
    "*://*.github.com/*",
    "*://github.com/*",
    "*://*.max.com/*",
    "*://*.paramountplus.com/*",
    "*://*.primevideo.com/*",
    "*://*.amazon.com/gp/video/*",
  ],
  main() {
    function performScraping() {
      const currentUrl = window.location.href;

      if (domainScraper.canScrape(currentUrl)) {
        const result = domainScraper.scrape(document, currentUrl);

        if (result && result.data) {
          // The background is the only consumer. A second copy used to be
          // written to storage.local under a unique `scrapeData_<domain>_<ts>`
          // key on every scrape — a new key each time, never read and never
          // pruned, so browsing a scraped site steadily filled the quota.
          // Delivery failures are handled by the background's retry queue.
          browser.runtime
            .sendMessage({
              action: "DOMAIN_SCRAPE_DATA",
              data: result,
            })
            .catch((error) => {
              console.error("Failed to send scraped data:", error);
            });
        }
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", performScraping);
    } else {
      performScraping();
    }

    let lastUrl = window.location.href;
    new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(performScraping, 1000);
      }
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener("message", (event) => {
      if (event.source !== window) {
        return;
      }

      if (event.data.type === "MANUAL_SCRAPE_REQUEST") {
        performScraping();
      }
    });
  },
});
