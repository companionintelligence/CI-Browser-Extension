import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Companion Intelligence",
    host_permissions: [
      "*://*.companionintelligence.com/",
      "*://*.netflix.com/*",
      "*://*.hulu.com/*",
      "*://secure.hulu.com/*",
      "*://*.disneyplus.com/*",
    ],
    permissions: [
      "bookmarks",
      "cookies",
      "history",
      "storage",
      "tabs",
      "webNavigation",
      "geolocation",
    ],
    icons: {
      "16": "icon/favicon-16x16.png",
      "32": "icon/favicon-32x32.png",
      "48": "icon/favicon-32x32.png",
      "96": "icon/favicon-96x96.png",
      "128": "icon/favicon-96x96.png",
    },
  },
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  imports: {
    bowser: ["default"],
  },
  // Browser-specific configurations
  webExt: {
    // Safari development configuration
    safari: {
      devtools: true,
    },
  },
});
