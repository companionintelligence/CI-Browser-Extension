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

    // Stop tracking when user leaves page.
    //
    // Deliberately does NOT persist anything. This used to append every page's
    // final scroll depth to a `scrollDepthData` array in storage.local, which
    // nothing ever read — pure storage growth on every page the user closed.
    // Scroll depth reaches the server through the getScrollDepth message below,
    // which the background pulls while the page is still open.
    function stopScrollTracking() {
      isTracking = false;
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
