export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    // Content script for capturing form submissions, scroll depth, and
    // user-selected text (highlight-to-save). Highlight save renders its
    // floating toolbar inside a closed Shadow DOM so host-page CSS can't
    // clobber it. See planning/08-highlight-capture.md.

    let maxScrollDepth = 0;
    let scrollDepthPercent = 0;
    let isTracking = false;

    installHighlightToolbar();

    function installHighlightToolbar() {
      // Only top-frame; iframes can't reliably anchor a floating toolbar.
      if (window.top !== window) {
        return;
      }

      const host = document.createElement("ci-highlight-toolbar");
      host.style.cssText =
        "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; display: none;";
      document.documentElement.appendChild(host);
      const shadow = host.attachShadow({ mode: "closed" });

      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; }
        .toolbar {
          font: 13px/1.4 -apple-system, "Segoe UI", system-ui, sans-serif;
          background: #1a1a1a;
          color: #fff;
          border: 1px solid #4ba7a6;
          border-radius: 8px;
          padding: 4px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25);
          display: flex;
          gap: 4px;
          user-select: none;
        }
        button {
          font: inherit;
          color: inherit;
          background: transparent;
          border: 0;
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover { background: rgba(75,167,166,0.2); }
        button[aria-busy="true"] { opacity: 0.6; cursor: progress; }
        .status {
          padding: 6px 10px;
          color: #4ba7a6;
          font-size: 12px;
        }
      `;
      shadow.appendChild(style);

      const toolbar = document.createElement("div");
      toolbar.className = "toolbar";
      toolbar.setAttribute("role", "toolbar");
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.textContent = "💾 Save to CI";
      saveBtn.title = "Save the selected text to CI Server (Alt+Shift+H)";
      toolbar.appendChild(saveBtn);
      const status = document.createElement("span");
      status.className = "status";
      status.style.display = "none";
      toolbar.appendChild(status);
      shadow.appendChild(toolbar);

      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      let lastRect: DOMRect | null = null;

      function showStatus(msg: string) {
        status.textContent = msg;
        status.style.display = "inline";
        setTimeout(() => {
          status.style.display = "none";
        }, 3000);
      }

      function hideToolbar() {
        host.style.display = "none";
        lastRect = null;
      }

      function positionToolbar(rect: DOMRect) {
        host.style.display = "block";
        // Anchor above the selection if there's room, else below.
        const top = rect.top - 44 > 0 ? rect.top - 44 : rect.bottom + 8;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 200));
        host.style.top = `${top}px`;
        host.style.left = `${left}px`;
        lastRect = rect;
      }

      function getSelectedText(): {
        text: string;
        rect: DOMRect | null;
      } {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          return { text: "", rect: null };
        }

        const text = selection.toString().trim();
        if (text.length < 4) {
          return { text: "", rect: null };
        }

        const range = selection.getRangeAt(0);
        const target = range.startContainer.parentElement as HTMLElement | null;
        // Refuse to surface a toolbar inside password fields or contenteditable.
        if (
          target?.closest('input[type="password"], [contenteditable="true"]')
        ) {
          return { text: "", rect: null };
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          return { text: "", rect: null };
        }

        return { text, rect };
      }

      document.addEventListener(
        "selectionchange",
        () => {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }

          debounceTimer = setTimeout(() => {
            const { text, rect } = getSelectedText();
            if (text && rect) {
              positionToolbar(rect);
            } else {
              hideToolbar();
            }
          }, 250);
        },
        { passive: true },
      );

      document.addEventListener("mousedown", (e) => {
        if (e.composedPath().includes(host)) {
          return;
        }

        hideToolbar();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          hideToolbar();

          return;
        }

        if (e.altKey && e.shiftKey && (e.key === "H" || e.key === "h")) {
          e.preventDefault();
          void doSave();
        }
      });

      window.addEventListener(
        "scroll",
        () => {
          if (host.style.display === "block" && lastRect) {
            // The visible rect moves with scroll; recompute on next selection
            // event. Hide preemptively to avoid stale anchoring.
            hideToolbar();
          }
        },
        { passive: true },
      );

      saveBtn.addEventListener("click", () => {
        void doSave();
      });

      browser.runtime.onMessage.addListener((message) => {
        if (message?.action === "TRIGGER_SAVE_HIGHLIGHT") {
          void doSave();
        }
      });

      async function doSave() {
        const { text } = getSelectedText();
        if (!text) {
          return;
        }

        saveBtn.setAttribute("aria-busy", "true");
        try {
          const response = (await browser.runtime.sendMessage({
            action: "SAVE_HIGHLIGHT",
            input: {
              selectedText: text,
              url: window.location.href,
              title: document.title,
            },
          })) as { success: boolean; queued?: boolean; error?: string };

          if (response?.success) {
            showStatus(response.queued ? "Queued (offline)" : "Saved");
          } else {
            showStatus(`Save failed: ${response?.error ?? "unknown"}`);
          }
        } catch (err) {
          showStatus(
            `Save failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          saveBtn.removeAttribute("aria-busy");
        }
      }
    }

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
