import path from "node:path";
import { defineConfig } from "wxt";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Companion Intelligence",
    description:
      "Privately archive your browsing history, bookmarks, and downloads to your personal CI Server. Your data stays yours.",
    // Kept in lock-step with `matches` in src/entrypoints/domainScraper.content.ts
    // and with the profiles in src/scrapeProfiles/<category>/*.json.
    host_permissions: [
      "*://*.companionintelligence.com/*",
      "*://*.companionintel.com/*",
      "*://*.ci.computer/*",
      // Streaming
      "*://*.netflix.com/*",
      "*://*.hulu.com/*",
      "*://secure.hulu.com/*",
      "*://*.disneyplus.com/*",
      "*://*.max.com/*",
      "*://*.primevideo.com/*",
      "*://*.amazon.com/gp/video/*",
      "*://*.paramountplus.com/*",
      // Community
      "*://*.slashdot.org/*",
      "*://slashdot.org/*",
      "*://*.github.com/*",
      "*://github.com/*",
      // Social
      "*://*.quora.com/*",
      // News
      "*://*.cnn.com/*",
      "*://*.wsj.com/*",
      // Travel
      "*://*.airbnb.com/*",
      // Finance
      "*://*.robinhood.com/*",
    ],
    permissions: [
      "activeTab",
      "bookmarks",
      "cookies",
      "downloads",
      "history",
      "storage",
      "tabs",
      "webNavigation",
    ],
    commands: {
      "capture-active-tab": {
        suggested_key: {
          default: "Alt+Shift+C",
        },
        description: "Capture a snapshot of the active tab to CI",
      },
      "save-highlight": {
        suggested_key: {
          default: "Alt+Shift+H",
        },
        description: "Save the current text selection to CI",
      },
    },
    browser_specific_settings: {
      gecko: {
        id: "@ci-browser-extension",
        // `data_collection_permissions` is required for AMO listing but not
        // yet in the WXT manifest typings.
        ...({
          data_collection_permissions: {
            required: [
              "bookmarksInfo",
              "websiteActivity",
              "websiteContent",
              "browsingActivity",
            ],
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      },
    },
    icons: {
      "16": "icon/favicon-16x16.png",
      "32": "icon/favicon-32x32.png",
      "48": "icon/favicon-32x32.png",
      "96": "icon/favicon-96x96.png",
      "128": "icon/favicon-96x96.png",
    },
    // Mobile browser optimizations
    action: {
      default_title: "Companion Intelligence",
      default_popup: "popup.html",
    },
    // Add Android Chrome support
    minimum_chrome_version: "88",
  },
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // Output configurations for different browsers including mobile
  outDir: ".output",
  // Enable mobile browser builds
  alias: {
    shadcn: "packages/shadcn/src",
  },
  vite: () => ({
    build: {
      minify: false,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }),
});
