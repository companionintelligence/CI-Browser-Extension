export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Content script loaded");

    // Function to get selected text and surrounding context
    function getSelectionContext() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText) {
        return null;
      }

      // Get the range and container element
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // Find the closest element that has text content
      let contextElement =
        container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : container;

      // Try to get more context by going up the DOM tree
      while (
        contextElement &&
        contextElement.textContent.trim().length < selectedText.length + 100
      ) {
        if (contextElement.parentElement) {
          contextElement = contextElement.parentElement;
        } else {
          break;
        }
      }

      const contextText = contextElement
        ? contextElement.textContent.trim()
        : selectedText;

      return {
        selectedText,
        contextText,
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
      };
    }

    // Function to show a save button near the selection
    function showSaveButton(x: number, y: number) {
      // Remove any existing save button
      const existingButton = document.getElementById("ci-save-highlight-btn");
      if (existingButton) {
        existingButton.remove();
      }

      const button = document.createElement("button");
      button.id = "ci-save-highlight-btn";
      button.textContent = "💾 Save to CI";
      button.style.cssText = `
        position: fixed;
        top: ${y - 40}px;
        left: ${x}px;
        z-index: 10000;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 12px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      button.addEventListener("click", async (e) => {
        e.stopPropagation();
        const context = getSelectionContext();
        if (context) {
          // Send message to background script
          try {
            await browser.runtime.sendMessage({
              type: "SAVE_HIGHLIGHTED_CONTENT",
              data: context,
            });

            // Show success feedback
            button.textContent = "✓ Saved";
            button.style.background = "#28a745";
            setTimeout(() => {
              button.remove();
            }, 2000);
          } catch (error) {
            console.error("Error saving highlighted content:", error);
            button.textContent = "✗ Error";
            button.style.background = "#dc3545";
            setTimeout(() => {
              button.remove();
            }, 2000);
          }
        }
      });

      document.body.appendChild(button);

      // Auto-remove button after 5 seconds or on click elsewhere
      setTimeout(() => {
        if (document.getElementById("ci-save-highlight-btn")) {
          button.remove();
        }
      }, 5000);
    }

    // Handle text selection
    document.addEventListener("mouseup", (e) => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        // Show save button near the selection
        showSaveButton(e.clientX, e.clientY);
      } else {
        // Remove save button if no selection
        const existingButton = document.getElementById("ci-save-highlight-btn");
        if (existingButton) {
          existingButton.remove();
        }
      }
    });

    // Handle keyboard selection (like Ctrl+A, Shift+arrows)
    document.addEventListener("keyup", (e) => {
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "Home" ||
        e.key === "End" ||
        e.key === "PageUp" ||
        e.key === "PageDown" ||
        e.ctrlKey ||
        e.shiftKey
      ) {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          showSaveButton(rect.left + rect.width / 2, rect.top);
        }
      }
    });

    // Hide button when clicking elsewhere
    document.addEventListener("click", (e) => {
      const button = document.getElementById("ci-save-highlight-btn");
      if (button && e.target !== button) {
        button.remove();
      }
    });
  },
});
