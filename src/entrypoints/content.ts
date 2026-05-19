export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // Content script for capturing form submissions and scroll depth
    // This script runs on all pages to capture form submission events and scroll tracking

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
              (result.scrollDepthData as
                | Array<typeof scrollData>
                | undefined) ?? [];
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

    // Listen for form submissions
    document.addEventListener("submit", async (event) => {
      try {
        const form = event.target as HTMLFormElement;
        if (!form) {
          return;
        }

        // Get form data
        const formData = new FormData(form);
        const fields: Record<string, string> = {};

        // Extract form fields (excluding sensitive data like passwords)
        for (const [key, value] of formData.entries()) {
          if (
            typeof value === "string" &&
            !key.toLowerCase().includes("password")
          ) {
            fields[key] = value;
          }
        }

        // Create form submission data
        const submissionData = {
          id: `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          url: window.location.href,
          domain: window.location.hostname,
          fields: fields,
          timestamp: new Date().toISOString(),
        };

        // Store form submission locally
        const existingSubmissions =
          await browser.storage.local.get("formSubmissions");
        const submissions =
          (existingSubmissions.formSubmissions as
            | Array<typeof submissionData>
            | undefined) ?? [];
        submissions.push(submissionData);

        // Keep only last 1000 form submissions to prevent storage bloat
        if (submissions.length > 1000) {
          submissions.splice(0, submissions.length - 1000);
        }

        await browser.storage.local.set({
          formSubmissions: submissions,
        });

        // Send message to background script if form sync is enabled
        try {
          await browser.runtime.sendMessage({
            action: "formSubmitted",
            data: submissionData,
          });
        } catch {
          // Ignore errors - background script might not be ready
        }
      } catch (error) {
        console.error("Error capturing form submission:", error);
      }
    });

    // Also listen for AJAX form submissions
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const result = await originalFetch.apply(this, args);

      // Check if this might be a form submission
      if (
        args[1] &&
        args[1].method &&
        ["POST", "PUT", "PATCH"].includes(args[1].method)
      ) {
        try {
          const url =
            typeof args[0] === "string"
              ? args[0]
              : (args[0] as { url?: string }).url || "";
          const submissionData = {
            id: `ajax_form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: url,
            domain: new URL(url).hostname,
            fields: {},
            timestamp: new Date().toISOString(),
            type: "ajax",
          };

          // Store AJAX form submission
          const existingSubmissions =
            await browser.storage.local.get("formSubmissions");
          const submissions =
            (existingSubmissions.formSubmissions as
              | Array<typeof submissionData>
              | undefined) ?? [];
          submissions.push(submissionData);

          if (submissions.length > 1000) {
            submissions.splice(0, submissions.length - 1000);
          }

          await browser.storage.local.set({
            formSubmissions: submissions,
          });
        } catch (error) {
          console.error("Error capturing AJAX form submission:", error);
        }
      }

      return result;
    };
  },
});
