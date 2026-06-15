export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // Content script for scroll-depth tracking and page metadata.
    // The background script queries it via getScrollDepth / getMetaDescription.

    let maxScrollDepth = 0;
    let scrollDepthPercent = 0;
    let isTracking = false;

    // Track scroll depth
    function updateScrollDepth() {
      if (!isTracking) {
        return;
      }

      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const documentHeight =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;

      if (documentHeight > 0) {
        const currentScrollPercent = Math.round(
          (scrollTop / documentHeight) * 100,
        );
        maxScrollDepth = Math.max(maxScrollDepth, currentScrollPercent);
        scrollDepthPercent = maxScrollDepth;
      }
    }

    // Start tracking when page loads
    function startScrollTracking() {
      isTracking = true;
      maxScrollDepth = 0;
      scrollDepthPercent = 0;
    }

    // Stop tracking when user leaves page
    function stopScrollTracking() {
      isTracking = false;

      // Store scroll depth data when user leaves page
      if (scrollDepthPercent > 0) {
        const scrollData = {
          url: window.location.href,
          scrollDepth: scrollDepthPercent,
          timestamp: Date.now(),
        };

        // Store in browser storage for later retrieval
        browser.storage.local
          .get("scrollDepthData")
          .then((result) => {
            const scrollDepthData =
              (result.scrollDepthData as (typeof scrollData)[] | undefined) ??
              [];
            scrollDepthData.push(scrollData);

            // Keep only last 1000 entries to prevent storage bloat
            if (scrollDepthData.length > 1000) {
              scrollDepthData.splice(0, scrollDepthData.length - 1000);
            }

            browser.storage.local.set({ scrollDepthData });
          })
          .catch(console.error);
      }
    }

    // Listen for scroll events
    window.addEventListener("scroll", updateScrollDepth, { passive: true });

    // Start tracking on page load
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startScrollTracking);
    } else {
      startScrollTracking();
    }

    // Stop tracking when page unloads
    window.addEventListener("beforeunload", stopScrollTracking);
    window.addEventListener("pagehide", stopScrollTracking);

    // Listen for messages from background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "getScrollDepth") {
        sendResponse({ scrollDepth: scrollDepthPercent });

        return true;
      }

      if (message.action === "getMetaDescription") {
        const metaDescription = document.querySelector(
          'meta[name="description"]',
        );
        const description = metaDescription
          ? metaDescription.getAttribute("content")
          : "";
        sendResponse({ description });

        return true;
      }
    });
  },
});
