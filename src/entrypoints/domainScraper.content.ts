import { domainScraper } from "@/domainScraper";

export default defineContentScript({
  matches: [
    // Streaming & Entertainment
    "*://*.netflix.com/*",
    "*://*.hulu.com/*",
    "*://secure.hulu.com/*",
    "*://*.disneyplus.com/*",
    "*://*.max.com/*",
    "*://*.primevideo.com/*",
    "*://*.amazon.com/gp/video/*",
    "*://*.paramountplus.com/*",

    // Social Media
    "*://*.quora.com/*",

    // News & Media
    "*://*.cnn.com/*",
    "*://edition.cnn.com/*",

    // Additional high-priority sites without APIs
    "*://*.peacocktv.com/*",
    "*://*.crunchyroll.com/*",
    "*://*.sling.com/*",
    "*://*.wsj.com/*",
    "*://*.washingtonpost.com/*",
    "*://*.aljazeera.com/*",
    "*://*.axios.com/*",
    "*://*.politico.com/*",
    "*://*.dailymail.co.uk/*",
  ],
  main() {
    // Auto-scrape when page loads if it's a supported scraping target
    function performScraping() {
      const currentUrl = window.location.href;

      if (domainScraper.canScrape(currentUrl)) {
        console.log("Domain scraper: Found supported page", currentUrl);

        const result = domainScraper.scrape(document, currentUrl);

        if (result && result.data) {
          console.log("Domain scraper: Scraped data", result);

          // Send scraped data to background script
          browser.runtime
            .sendMessage({
              type: "DOMAIN_SCRAPE_DATA",
              data: result,
            })
            .catch((error) => {
              console.error(
                "Failed to send scraped data to background script:",
                error,
              );
            });

          // Store locally as well
          browser.storage.local
            .set({
              [`scrapeData_${result.domain}_${Date.now()}`]: result,
            })
            .catch((error) => {
              console.error("Failed to store scraped data:", error);
            });
        } else {
          console.log("Domain scraper: No data scraped from", currentUrl);
        }
      }
    }

    // Run scraping on initial load
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", performScraping);
    } else {
      performScraping();
    }

    // Also run when URL changes (for SPAs)
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Wait a bit for content to load after navigation
        setTimeout(performScraping, 1000);
      }
    }).observe(document.body, { childList: true, subtree: true });

    // Manual scraping trigger (for testing or user-initiated scraping)
    window.addEventListener("message", (event) => {
      if (event.source !== window) {
        return;
      }

      if (event.data.type === "MANUAL_SCRAPE_REQUEST") {
        performScraping();
      }
    });

    // Determine which domain we're on for logging
    const domain = window.location.hostname
      .replace("www.", "")
      .replace("secure.", "");
    console.log(`Domain scraper content script loaded for ${domain}`);
  },
});
