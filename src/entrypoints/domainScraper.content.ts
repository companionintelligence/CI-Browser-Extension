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
  ],
  main() {
    function performScraping() {
      const currentUrl = window.location.href;

      if (domainScraper.canScrape(currentUrl)) {
        const result = domainScraper.scrape(document, currentUrl);

        if (result && result.data) {
          browser.runtime
            .sendMessage({
              type: "DOMAIN_SCRAPE_DATA",
              data: result,
            })
            .catch((error) => {
              console.error("Failed to send scraped data:", error);
            });

          browser.storage.local
            .set({
              [`scrapeData_${result.domain}_${Date.now()}`]: result,
            })
            .catch((error) => {
              console.error("Failed to store scraped data:", error);
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
