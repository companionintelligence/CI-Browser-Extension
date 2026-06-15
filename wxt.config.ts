import path from "node:path";
import { defineConfig } from "wxt";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Companion Intelligence",
    host_permissions: [
      "*://*.companionintelligence.com/*",
      "*://*.companionintel.com/*",
      "*://*.ci.computer/*",
      "*://*.netflix.com/*",
      "*://*.hulu.com/*",
      "*://secure.hulu.com/*",
      "*://*.disneyplus.com/*",
    ],
    permissions: [
      "alarms",
      "bookmarks",
      "contextMenus",
      "cookies",
      "downloads",
      "history",
      "storage",
      "tabs",
      "webNavigation",
    ],
    browser_specific_settings: {
      // data_collection_permissions is an AMO disclosure requirement that
      // WXT's manifest types don't model yet, hence the loose cast
      gecko: {
        id: "@ci-browser-extension",
        data_collection_permissions: {
          required: [
            "bookmarksInfo",
            "websiteActivity",
            "websiteContent",
            "browsingActivity",
          ],
        },
      } as unknown as { id: string },
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "96": "icon/96.png",
      "128": "icon/128.png",
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
  // Clean store-artifact names (the package is @ci/ci-browser-extension, which
  // would otherwise produce "cici-browser-extension-*.zip")
  zip: {
    name: "ci-browser-extension",
  },
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
