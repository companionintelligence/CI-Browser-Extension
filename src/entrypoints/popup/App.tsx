import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleAutoSync,
  toggleBookmarkSync,
  toggleDownloadSync,
  toggleHistorySync,
} from "@/store/ciStateSlice";
import "./App.css";
import bowser from "bowser";
import BlacklistManager from "./BlacklistManager";

export default function App() {
  const dispatch = useDispatch();
  const ciState = useSelector(
    (state: { ciState: unknown }) => state.ciState,
  ) as {
    sessionToken: string | null;
    domain: string | null;
    url: string | null;
    historySyncInProgress: boolean;
    historySyncStatus: string | null;
    lastHistorySync: string | null;
    serverDomain: string;
    autoSyncEnabled: boolean;
    siteBlacklist: string[];
    pageBlacklist: string[];
    deviceId: string | null;
    deviceName: string | null;
    bookmarkSyncEnabled: boolean;
    downloadSyncEnabled: boolean;
    historySyncEnabled: boolean;
    isAuthenticated: boolean;
  };
  const {
    historySyncInProgress,
    historySyncStatus,
    lastHistorySync,
    serverDomain,
    autoSyncEnabled,
    siteBlacklist,
    pageBlacklist,
    deviceName,
    bookmarkSyncEnabled,
    downloadSyncEnabled,
    historySyncEnabled,
    isAuthenticated,
  } = ciState;

  const [showBlacklistManager, setShowBlacklistManager] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Theme detection and style injection - must run before any early returns
  useEffect(() => {
    // Inject a style tag with theme-aware styles that will override everything
    const styleId = "ci-theme-override";
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;

    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    const updateStyles = () => {
      // Styles for both dark and light mode with maximum specificity
      styleElement.textContent = `
        /* Theme-aware styles - injected via JS to override browser defaults */
        /* Dark mode styles */
        html[data-theme="dark"] .sync-section .auto-sync-control,
        html.dark-mode .sync-section .auto-sync-control {
          background-color: rgba(75, 167, 166, 0.08) !important;
          border-radius: 8px !important;
          padding: 1rem !important;
          text-align: left !important;
          margin-bottom: 1rem !important;
        }

        html[data-theme="dark"] .sync-section .auto-sync-control .checkbox-label,
        html.dark-mode .sync-section .auto-sync-control .checkbox-label {
          display: flex !important;
          align-items: center !important;
          gap: 0.5rem !important;
          cursor: pointer !important;
          font-size: 0.95em !important;
          font-weight: 500 !important;
          color: rgba(255, 255, 255, 0.87) !important;
        }

        html[data-theme="dark"] .sync-section .auto-sync-control .checkbox-label input[type="checkbox"],
        html.dark-mode .sync-section .auto-sync-control .checkbox-label input[type="checkbox"] {
          width: 20px !important;
          height: 20px !important;
          min-width: 20px !important;
          min-height: 20px !important;
          max-width: 20px !important;
          max-height: 20px !important;
          flex-shrink: 0 !important;
          cursor: pointer !important;
          accent-color: #4ba7a6 !important;
          appearance: checkbox !important;
          -webkit-appearance: checkbox !important;
        }

        html[data-theme="dark"] .sync-section .auto-sync-control .checkbox-label span,
        html.dark-mode .sync-section .auto-sync-control .checkbox-label span {
          user-select: none !important;
          color: rgba(255, 255, 255, 0.87) !important;
          font-weight: 500 !important;
        }

        html[data-theme="dark"] .sync-section .auto-sync-control .auto-sync-description,
        html.dark-mode .sync-section .auto-sync-control .auto-sync-description {
          margin: 0.5rem 0 0 1.75rem !important;
          font-size: 0.8em !important;
          color: rgba(255, 255, 255, 0.7) !important;
          line-height: 1.4 !important;
        }

        html[data-theme="dark"] .sync-section .device-info,
        html.dark-mode .sync-section .device-info {
          background-color: rgba(75, 167, 166, 0.08) !important;
          border-radius: 8px !important;
          padding: 0.75rem !important;
          text-align: left !important;
          margin-bottom: 1rem !important;
        }

        html[data-theme="dark"] .sync-section .device-info .device-name,
        html.dark-mode .sync-section .device-info .device-name {
          margin: 0 !important;
          font-size: 0.9em !important;
          color: #4ba7a6 !important;
          font-weight: 500 !important;
        }

        /* Light mode styles */
        html[data-theme="light"] .sync-section .auto-sync-control,
        html.light-mode .sync-section .auto-sync-control {
          background-color: rgba(75, 167, 166, 0.08) !important;
          border-radius: 8px !important;
          padding: 1rem !important;
          text-align: left !important;
          margin-bottom: 1rem !important;
        }

        html[data-theme="light"] .sync-section .auto-sync-control .checkbox-label,
        html.light-mode .sync-section .auto-sync-control .checkbox-label {
          display: flex !important;
          align-items: center !important;
          gap: 0.5rem !important;
          cursor: pointer !important;
          font-size: 0.95em !important;
          font-weight: 500 !important;
          color: #213547 !important;
        }

        html[data-theme="light"] .sync-section .auto-sync-control .checkbox-label input[type="checkbox"],
        html.light-mode .sync-section .auto-sync-control .checkbox-label input[type="checkbox"] {
          width: 20px !important;
          height: 20px !important;
          min-width: 20px !important;
          min-height: 20px !important;
          max-width: 20px !important;
          max-height: 20px !important;
          flex-shrink: 0 !important;
          cursor: pointer !important;
          accent-color: #4ba7a6 !important;
          appearance: checkbox !important;
          -webkit-appearance: checkbox !important;
        }

        html[data-theme="light"] .sync-section .auto-sync-control .checkbox-label span,
        html.light-mode .sync-section .auto-sync-control .checkbox-label span {
          user-select: none !important;
          color: #213547 !important;
          font-weight: 500 !important;
        }

        html[data-theme="light"] .sync-section .auto-sync-control .auto-sync-description,
        html.light-mode .sync-section .auto-sync-control .auto-sync-description {
          margin: 0.5rem 0 0 1.75rem !important;
          font-size: 0.8em !important;
          color: #666 !important;
          line-height: 1.4 !important;
        }

        html[data-theme="light"] .sync-section .device-info,
        html.light-mode .sync-section .device-info {
          background-color: rgba(0, 0, 0, 0.03) !important;
          border-radius: 8px !important;
          padding: 0.75rem !important;
          text-align: left !important;
          margin-bottom: 1rem !important;
        }

        html[data-theme="light"] .sync-section .device-info .device-name,
        html.light-mode .sync-section .device-info .device-name {
          margin: 0 !important;
          font-size: 0.9em !important;
          color: #4ba7a6 !important;
          font-weight: 500 !important;
        }

        /* Compact sync controls - Dark mode */
        html[data-theme="dark"] .compact-sync-controls,
        html.dark-mode .compact-sync-controls {
          display: flex !important;
          flex-direction: column !important;
          gap: 0.5rem !important;
          margin-top: 1rem !important;
          padding: 1rem !important;
          background-color: rgba(75, 167, 166, 0.08) !important;
          border-radius: 8px !important;
          border-top: 1px solid rgba(75, 167, 166, 0.2) !important;
        }

        html[data-theme="dark"] .compact-sync-controls .sync-toggle,
        html.dark-mode .compact-sync-controls .sync-toggle {
          display: flex !important;
          align-items: center !important;
        }

        html[data-theme="dark"] .compact-sync-controls .sync-toggle .checkbox-label,
        html.dark-mode .compact-sync-controls .sync-toggle .checkbox-label {
          margin: 0 !important;
          font-size: 0.9em !important;
          font-weight: 500 !important;
          color: rgba(255, 255, 255, 0.87) !important;
        }

        html[data-theme="dark"] .compact-sync-controls .sync-toggle .checkbox-label input[type="checkbox"],
        html.dark-mode .compact-sync-controls .sync-toggle .checkbox-label input[type="checkbox"] {
          width: 18px !important;
          height: 18px !important;
          min-width: 18px !important;
          min-height: 18px !important;
          max-width: 18px !important;
          max-height: 18px !important;
          margin-right: 0.5rem !important;
          cursor: pointer !important;
          accent-color: #4ba7a6 !important;
          flex-shrink: 0 !important;
        }

        html[data-theme="dark"] .compact-sync-controls .sync-toggle .checkbox-label span,
        html.dark-mode .compact-sync-controls .sync-toggle .checkbox-label span {
          color: rgba(255, 255, 255, 0.87) !important;
          font-weight: 500 !important;
        }

        /* Compact sync controls - Light mode */
        html[data-theme="light"] .compact-sync-controls,
        html.light-mode .compact-sync-controls {
          display: flex !important;
          flex-direction: column !important;
          gap: 0.5rem !important;
          margin-top: 1rem !important;
          padding: 1rem !important;
          background-color: rgba(75, 167, 166, 0.08) !important;
          border-radius: 8px !important;
          border-top: 1px solid rgba(75, 167, 166, 0.2) !important;
        }

        html[data-theme="light"] .compact-sync-controls .sync-toggle .checkbox-label,
        html.light-mode .compact-sync-controls .sync-toggle .checkbox-label {
          color: #213547 !important;
        }

        html[data-theme="light"] .compact-sync-controls .sync-toggle .checkbox-label span,
        html.light-mode .compact-sync-controls .sync-toggle .checkbox-label span {
          color: #213547 !important;
        }

        /* Blacklist counts - Dark mode */
        html[data-theme="dark"] .blacklist-counts,
        html.dark-mode .blacklist-counts {
          display: flex !important;
          justify-content: space-around !important;
          padding: 0.5rem !important;
          background-color: rgba(75, 167, 166, 0.08) !important;
          border-radius: 4px !important;
          font-size: 0.85em !important;
        }

        html[data-theme="dark"] .blacklist-counts .blacklist-count,
        html.dark-mode .blacklist-counts .blacklist-count {
          color: rgba(255, 255, 255, 0.7) !important;
        }

        /* Blacklist counts - Light mode */
        html[data-theme="light"] .blacklist-counts,
        html.light-mode .blacklist-counts {
          display: flex !important;
          justify-content: space-around !important;
          padding: 0.5rem !important;
          background-color: rgba(0, 0, 0, 0.05) !important;
          border-radius: 4px !important;
          font-size: 0.85em !important;
        }

        html[data-theme="light"] .blacklist-counts .blacklist-count,
        html.light-mode .blacklist-counts .blacklist-count {
          color: #666 !important;
        }

        /* Secondary buttons - Dark mode (remove hover border) */
        html[data-theme="dark"] button.secondary,
        html.dark-mode button.secondary {
          background-color: #555 !important;
          color: white !important;
          border-color: #555 !important;
        }

        html[data-theme="dark"] button.secondary:hover:not(:disabled),
        html.dark-mode button.secondary:hover:not(:disabled) {
          background-color: #666 !important;
          border-color: #666 !important;
        }

        /* Secondary buttons - Light mode */
        html[data-theme="light"] button.secondary,
        html.light-mode button.secondary {
          background-color: #e0e0e0 !important;
          color: #213547 !important;
          border-color: #d0d0d0 !important;
        }

        html[data-theme="light"] button.secondary:hover:not(:disabled),
        html.light-mode button.secondary:hover:not(:disabled) {
          background-color: #d0d0d0 !important;
          border-color: #c0c0c0 !important;
        }

        /* BlacklistManager - Dark mode */
        html[data-theme="dark"] .blacklist-manager,
        html.dark-mode .blacklist-manager {
          background-color: #242424 !important;
        }

        html[data-theme="dark"] .blacklist-header,
        html.dark-mode .blacklist-header {
          display: flex !important;
          align-items: center !important;
          gap: 0.75rem !important;
          margin-bottom: 1rem !important;
          padding-bottom: 0 !important;
          border-bottom: none !important;
        }

        html[data-theme="dark"] .blacklist-header h2,
        html.dark-mode .blacklist-header h2 {
          color: #fff !important;
          margin: 0 !important;
          font-size: 1.3em !important;
          font-weight: 600 !important;
          flex: 1 !important;
        }

        html[data-theme="dark"] .back-button,
        html.dark-mode .back-button {
          width: 32px !important;
          height: 32px !important;
          padding: 0 !important;
          background-color: #444 !important;
          color: white !important;
          border: none !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 1.1em !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }

        html[data-theme="dark"] .back-button:hover,
        html.dark-mode .back-button:hover {
          background-color: #555 !important;
        }

        html[data-theme="dark"] .blacklist-description,
        html.dark-mode .blacklist-description {
          color: #888 !important;
          margin-bottom: 1rem !important;
          font-size: 0.85em !important;
        }

        html[data-theme="dark"] .tab-selector,
        html.dark-mode .tab-selector {
          display: flex !important;
          gap: 0.25rem !important;
          margin-bottom: 1rem !important;
          border-bottom: none !important;
          background-color: rgba(0, 0, 0, 0.2) !important;
          border-radius: 8px !important;
          padding: 0.25rem !important;
        }

        html[data-theme="dark"] .tab-selector .tab,
        html.dark-mode .tab-selector .tab {
          flex: 1 !important;
          padding: 0.75em 1em !important;
          background-color: transparent !important;
          color: rgba(255, 255, 255, 0.7) !important;
          border: none !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 0.9em !important;
          font-weight: 500 !important;
        }

        html[data-theme="dark"] .tab-selector .tab:hover,
        html.dark-mode .tab-selector .tab:hover {
          color: rgba(255, 255, 255, 0.9) !important;
          background-color: rgba(75, 167, 166, 0.1) !important;
        }

        html[data-theme="dark"] .tab-selector .tab.active,
        html.dark-mode .tab-selector .tab.active {
          color: #4ba7a6 !important;
          background-color: rgba(75, 167, 166, 0.2) !important;
          font-weight: 600 !important;
        }

        html[data-theme="dark"] .blacklist-entries,
        html.dark-mode .blacklist-entries {
          min-height: 200px !important;
          max-height: 400px !important;
          padding: 1.5rem !important;
          background-color: rgba(0, 0, 0, 0.2) !important;
          border-radius: 8px !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        html[data-theme="dark"] .empty-state,
        html.dark-mode .empty-state {
          color: rgba(255, 255, 255, 0.5) !important;
          padding: 3rem 1rem !important;
        }

        html[data-theme="dark"] .adder,
        html.dark-mode .adder {
          display: flex !important;
          flex-direction: row !important;
          gap: 0.75rem !important;
          align-items: stretch !important;
        }

        html[data-theme="dark"] .text-input,
        html.dark-mode .text-input {
          flex: 1 !important;
          padding: 0.75em 1em !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 6px !important;
          background-color: rgba(0, 0, 0, 0.3) !important;
          color: rgba(255, 255, 255, 0.87) !important;
          font-size: 0.9em !important;
          outline: none !important;
          min-width: 0 !important;
          width: auto !important;
        }

        html[data-theme="dark"] .text-input:focus,
        html.dark-mode .text-input:focus {
          border-color: #4ba7a6 !important;
          box-shadow: 0 0 0 3px rgba(75, 167, 166, 0.15) !important;
          background-color: rgba(0, 0, 0, 0.4) !important;
        }

        html[data-theme="dark"] .text-input::placeholder,
        html.dark-mode .text-input::placeholder {
          color: rgba(255, 255, 255, 0.4) !important;
        }

        html[data-theme="dark"] .add-button,
        html.dark-mode .add-button {
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          min-height: 44px !important;
          max-width: 44px !important;
          max-height: 44px !important;
          padding: 0 !important;
          background-color: #4ba7a6 !important;
          color: white !important;
          border: none !important;
          border-radius: 6px !important;
          font-size: 1.4em !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }

        html[data-theme="dark"] .add-button:hover,
        html.dark-mode .add-button:hover {
          background-color: #2f6b7e !important;
        }

        html[data-theme="dark"] .add-entry,
        html.dark-mode .add-entry {
          display: flex !important;
          flex-direction: column !important;
          gap: 0.75rem !important;
          margin-top: 1.5rem !important;
          margin-bottom: 1.5rem !important;
        }

        /* BlacklistManager - Light mode */
        html[data-theme="light"] .blacklist-manager,
        html.light-mode .blacklist-manager {
          background-color: #ffffff !important;
        }

        html[data-theme="light"] .blacklist-header,
        html.light-mode .blacklist-header {
          display: flex !important;
          align-items: center !important;
          gap: 0.75rem !important;
          margin-bottom: 1rem !important;
          padding-bottom: 0 !important;
          border-bottom: none !important;
        }

        html[data-theme="light"] .blacklist-header h2,
        html.light-mode .blacklist-header h2 {
          color: #213547 !important;
          margin: 0 !important;
          font-size: 1.3em !important;
          font-weight: 600 !important;
          flex: 1 !important;
        }

        html[data-theme="light"] .back-button,
        html.light-mode .back-button {
          width: 32px !important;
          height: 32px !important;
          padding: 0 !important;
          background-color: #e0e0e0 !important;
          color: #213547 !important;
          border: none !important;
          border-radius: 6px !important;
          cursor: pointer !important;
          font-size: 1.1em !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }

        html[data-theme="light"] .back-button:hover,
        html.light-mode .back-button:hover {
          background-color: #d0d0d0 !important;
        }

        html[data-theme="light"] .blacklist-description,
        html.light-mode .blacklist-description {
          color: #666 !important;
          margin-bottom: 1rem !important;
          font-size: 0.85em !important;
        }

        html[data-theme="light"] .tab-selector,
        html.light-mode .tab-selector {
          display: flex !important;
          gap: 0.25rem !important;
          margin-bottom: 1rem !important;
          border-bottom: none !important;
          background-color: rgba(0, 0, 0, 0.05) !important;
          border-radius: 8px !important;
          padding: 0.25rem !important;
        }

        html[data-theme="light"] .tab-selector .tab.active,
        html.light-mode .tab-selector .tab.active {
          color: #4ba7a6 !important;
          background-color: rgba(75, 167, 166, 0.15) !important;
          font-weight: 600 !important;
        }

        html[data-theme="light"] .blacklist-entries,
        html.light-mode .blacklist-entries {
          min-height: 200px !important;
          max-height: 400px !important;
          padding: 1.5rem !important;
          background-color: rgba(0, 0, 0, 0.03) !important;
          border-radius: 8px !important;
          border: 1px solid #ddd !important;
        }

        html[data-theme="light"] .empty-state,
        html.light-mode .empty-state {
          color: #999 !important;
          padding: 3rem 1rem !important;
        }

        html[data-theme="light"] .adder,
        html.light-mode .adder {
          display: flex !important;
          flex-direction: row !important;
          gap: 0.75rem !important;
          align-items: stretch !important;
        }

        html[data-theme="light"] .text-input,
        html.light-mode .text-input {
          flex: 1 !important;
          padding: 0.75em 1em !important;
          border: 1px solid #ddd !important;
          border-radius: 6px !important;
          background-color: #f9f9f9 !important;
          color: #213547 !important;
          font-size: 0.9em !important;
          outline: none !important;
          min-width: 0 !important;
          width: auto !important;
        }

        html[data-theme="light"] .text-input:focus,
        html.light-mode .text-input:focus {
          border-color: #4ba7a6 !important;
          background-color: #fff !important;
        }

        html[data-theme="light"] .text-input::placeholder,
        html.light-mode .text-input::placeholder {
          color: #999 !important;
        }

        html[data-theme="light"] .add-button,
        html.light-mode .add-button {
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          min-height: 44px !important;
          max-width: 44px !important;
          max-height: 44px !important;
          padding: 0 !important;
          background-color: #4ba7a6 !important;
          color: white !important;
          border: none !important;
          border-radius: 6px !important;
          font-size: 1.4em !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }

        html[data-theme="light"] .add-button:hover,
        html.light-mode .add-button:hover {
          background-color: #2f6b7e !important;
        }

        html[data-theme="light"] .add-entry,
        html.light-mode .add-entry {
          display: flex !important;
          flex-direction: column !important;
          gap: 0.75rem !important;
          margin-top: 0.5rem !important;
          margin-bottom: 0.5rem !important;
        }

        /* Ensure body has proper background in both modes */
        html[data-theme="dark"] .body,
        html.dark-mode .body {
          background-color: #242424 !important;
          color: rgba(255, 255, 255, 0.87) !important;
        }

        html[data-theme="light"] .body,
        html.light-mode .body {
          background-color: #ffffff !important;
          color: #213547 !important;
        }
      `;
    };

    // Detect theme and set attributes
    const detectTheme = () => {
      const rootBg = window.getComputedStyle(
        document.documentElement,
      ).backgroundColor;
      const rgbMatch = rootBg.match(/\d+/g);

      let isDark = true; // Default to dark since root has dark background

      if (rgbMatch && rgbMatch.length >= 3) {
        const r = parseInt(rgbMatch[0]);
        const g = parseInt(rgbMatch[1]);
        const b = parseInt(rgbMatch[2]);
        isDark = (r + g + b) / 3 < 200;
      } else {
        try {
          isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        } catch {
          isDark = true;
        }
      }

      setIsDarkMode(isDark);
      document.documentElement.setAttribute(
        "data-theme",
        isDark ? "dark" : "light",
      );
      document.documentElement.classList.toggle("dark-mode", isDark);
      document.documentElement.classList.toggle("light-mode", !isDark);
      updateStyles();
    };

    // Initial setup
    updateStyles();
    detectTheme();

    try {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = () => {
        detectTheme();
      };

      mediaQuery.addEventListener("change", handleChange);

      return () => {
        mediaQuery.removeEventListener("change", handleChange);
        // Don't remove style element, keep it for the lifetime of the popup
      };
    } catch {
      return () => {};
    }
  }, []);

  useEffect(() => {
    const browser_info = bowser.getParser(window.navigator.userAgent);
    setIsMobile(browser_info.getPlatformType() === "mobile");

    // Check authentication status every time popup opens
    const checkAuthStatus = async () => {
      try {
        // Send message to background to refresh auth status
        await browser.runtime.sendMessage({
          action: "checkAuthStatus",
        });
      } catch (error) {
        console.error("Error checking auth status:", error);
      }
    };

    // Check auth status immediately when popup opens
    checkAuthStatus();

    // Reload user settings when popup opens to get latest auth state
    dispatch({ type: "loadUserSettings" });
  }, [dispatch]);

  // Also refresh periodically while popup is open to catch device updates
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "loadUserSettings" });
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [dispatch]);

  // Authentication state is now managed by background script and stored in Redux

  // Use isAuthenticated directly from Redux state (updated by background script)
  console.log("Popup authentication state:", isAuthenticated);

  const openOptionsPage = async function () {
    if (browser.runtime.openOptionsPage) {
      browser.runtime.openOptionsPage();
    } else {
      window.open(browser.runtime.getURL("/options.html"));
    }
  };

  const triggerManualSync = async function () {
    console.log(
      "triggerManualSync called, historySyncInProgress:",
      historySyncInProgress,
    );

    if (historySyncInProgress) {
      console.log("Sync already in progress, returning");

      return;
    }

    try {
      // If auto-sync is enabled, just trigger the background periodic sync
      if (autoSyncEnabled) {
        console.log("Auto-sync enabled, triggering background sync");
        const response = await browser.runtime.sendMessage({
          action: "triggerBackgroundSync",
        });

        console.log("Background sync response:", response);
        if (!response.success) {
          console.error("Background sync failed:", response.error);
        }
      } else {
        // If auto-sync is disabled, do a full manual sync
        console.log("Auto-sync disabled, triggering manual sync");
        const response = await browser.runtime.sendMessage({
          action: "triggerManualSync",
          options: {
            timeRange: 7 * 24 * 60 * 60 * 1000, // Last 7 days
          },
        });

        console.log("Manual sync response:", response);
        if (!response.success) {
          console.error("Manual history sync failed:", response.error);
        }
      }
    } catch (error) {
      console.error("Error triggering sync:", error);
    }
  };

  const handleAutoSyncToggle = () => {
    dispatch(toggleAutoSync());
  };

  const handleBookmarkSyncToggle = () => {
    dispatch(toggleBookmarkSync());
  };

  const handleDownloadSyncToggle = () => {
    dispatch(toggleDownloadSync());
  };

  const handleHistorySyncToggle = () => {
    dispatch(toggleHistorySync());
  };

  if (showBlacklistManager) {
    return (
      <div className={`body ${isMobile ? "mobile" : ""}`}>
        <BlacklistManager onBack={() => setShowBlacklistManager(false)} />
      </div>
    );
  }

  return (
    <div className={`body ${isMobile ? "mobile" : ""}`}>
      <div className="login-status">
        <a href={`https://${serverDomain}`} target="_blank">
          {!isAuthenticated
            ? "Log in to continue"
            : "Logged in to Companion Intelligence"}
        </a>
      </div>

      {isAuthenticated && (
        <div className="sync-section">
          <div className="sync-header">
            <h4>Browser History Sync</h4>
          </div>

          <div
            className="auto-sync-control"
            style={{
              backgroundColor: isDarkMode
                ? "rgba(75, 167, 166, 0.08)"
                : "rgba(75, 167, 166, 0.08)",
              borderRadius: "8px",
              padding: "1rem",
              textAlign: "left",
              marginBottom: "1rem",
            }}
          >
            <label
              className="checkbox-label"
              style={{
                color: isDarkMode ? "rgba(255, 255, 255, 0.87)" : "#213547",
                fontWeight: 500,
              }}
            >
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={handleAutoSyncToggle}
                style={{
                  width: "20px",
                  height: "20px",
                  minWidth: "20px",
                  minHeight: "20px",
                  maxWidth: "20px",
                  maxHeight: "20px",
                  accentColor: "#4ba7a6",
                }}
              />
              <span>Auto sync all browser history</span>
            </label>
            <div
              className="auto-sync-description"
              style={{
                color: isDarkMode ? "rgba(255, 255, 255, 0.7)" : "#666",
              }}
            >
              Automatically sync your browser history in the background
            </div>
          </div>

          {deviceName && (
            <div
              className="device-info"
              style={{
                backgroundColor: isDarkMode
                  ? "rgba(75, 167, 166, 0.08)"
                  : "rgba(0, 0, 0, 0.03)",
                borderRadius: "8px",
                padding: "0.75rem",
                textAlign: "left",
              }}
            >
              <p className="device-name">{deviceName}</p>
            </div>
          )}

          <button
            onClick={triggerManualSync}
            disabled={historySyncInProgress}
            className="primary"
            style={{ width: "100%", marginTop: "1rem" }}
          >
            {historySyncInProgress ? "Syncing..." : "Sync Last 7 Days"}
          </button>

          {historySyncStatus && (
            <div
              className="sync-status"
              style={{
                marginTop: "0.5rem",
                padding: "0.5rem",
                borderRadius: "4px",
                backgroundColor: historySyncStatus.includes("Error")
                  ? "rgba(255, 0, 0, 0.1)"
                  : "rgba(0, 255, 0, 0.1)",
                color: historySyncStatus.includes("Error")
                  ? "#ff4444"
                  : "#44ff44",
                fontSize: "0.85em",
              }}
            >
              {historySyncStatus}
            </div>
          )}

          {lastHistorySync && (
            <div
              className="last-sync"
              style={{
                marginTop: "0.5rem",
                fontSize: "0.8em",
                color: isDarkMode ? "rgba(255, 255, 255, 0.6)" : "#888",
              }}
            >
              Last sync: {new Date(lastHistorySync).toLocaleString()}
            </div>
          )}

          <div
            className="compact-sync-controls"
            style={{
              backgroundColor: isDarkMode
                ? "rgba(75, 167, 166, 0.08)"
                : "rgba(75, 167, 166, 0.05)",
              borderRadius: "8px",
              padding: "1rem",
              marginTop: "1rem",
              borderTop: "1px solid rgba(75, 167, 166, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div className="sync-toggle">
              <label
                className="checkbox-label"
                style={{
                  color: isDarkMode ? "rgba(255, 255, 255, 0.87)" : "#213547",
                  fontWeight: 500,
                  fontSize: "0.9em",
                }}
              >
                <input
                  type="checkbox"
                  checked={historySyncEnabled}
                  onChange={handleHistorySyncToggle}
                  style={{
                    width: "18px",
                    height: "18px",
                    minWidth: "18px",
                    minHeight: "18px",
                    maxWidth: "18px",
                    maxHeight: "18px",
                    accentColor: "#4ba7a6",
                    marginRight: "0.5rem",
                  }}
                />
                <span>History</span>
              </label>
            </div>

            <div className="sync-toggle">
              <label
                className="checkbox-label"
                style={{
                  color: isDarkMode ? "rgba(255, 255, 255, 0.87)" : "#213547",
                  fontWeight: 500,
                  fontSize: "0.9em",
                }}
              >
                <input
                  type="checkbox"
                  checked={bookmarkSyncEnabled}
                  onChange={handleBookmarkSyncToggle}
                  style={{
                    width: "18px",
                    height: "18px",
                    minWidth: "18px",
                    minHeight: "18px",
                    maxWidth: "18px",
                    maxHeight: "18px",
                    accentColor: "#4ba7a6",
                    marginRight: "0.5rem",
                  }}
                />
                <span>Bookmarks</span>
              </label>
            </div>

            <div className="sync-toggle">
              <label
                className="checkbox-label"
                style={{
                  color: isDarkMode ? "rgba(255, 255, 255, 0.87)" : "#213547",
                  fontWeight: 500,
                  fontSize: "0.9em",
                }}
              >
                <input
                  type="checkbox"
                  checked={downloadSyncEnabled}
                  onChange={handleDownloadSyncToggle}
                  style={{
                    width: "18px",
                    height: "18px",
                    minWidth: "18px",
                    minHeight: "18px",
                    maxWidth: "18px",
                    maxHeight: "18px",
                    marginRight: "0.5rem",
                    cursor: "pointer",
                    accentColor: "#4ba7a6",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: isDarkMode ? "rgba(255, 255, 255, 0.87)" : "#213547",
                    fontWeight: 500,
                  }}
                >
                  Downloads
                </span>
              </label>
            </div>
          </div>
          <div className="blacklist-buttons" style={{ marginTop: "1rem" }}>
            <button
              onClick={() => setShowBlacklistManager(true)}
              className="secondary"
              style={{ width: "100%" }}
            >
              Manage Blacklists
            </button>
            <div
              className="blacklist-counts"
              style={{
                backgroundColor: isDarkMode
                  ? "rgba(75, 167, 166, 0.08)"
                  : "rgba(0, 0, 0, 0.05)",
                borderRadius: "4px",
                padding: "0.5rem",
                display: "flex",
                justifyContent: "space-around",
                fontSize: "0.85em",
              }}
            >
              <span
                className="blacklist-count"
                style={{
                  color: isDarkMode ? "rgba(255, 255, 255, 0.7)" : "#666",
                }}
              >
                Sites: {siteBlacklist.length}
              </span>
              <span
                className="blacklist-count"
                style={{
                  color: isDarkMode ? "rgba(255, 255, 255, 0.7)" : "#666",
                }}
              >
                Pages: {pageBlacklist.length}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="blacklist-buttons">
        <button
          onClick={openOptionsPage}
          className="secondary"
          style={{ width: "100%" }}
        >
          {isMobile ? "Options" : "Open Extension Options"}
        </button>
      </div>
    </div>
  );
}
