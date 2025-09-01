import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Companion Intelligence",
    permissions: [
      "cookies",
      "history",
      "storage",
      "tabs",
      "webNavigation",
      "activeTab",
      "desktopCapture",
      "alarms",
      "scripting",
      "identity",
    ],
    host_permissions: ["*://*.companionintelligence.com/"],
    commands: {
      "capture-screenshot": {
        suggested_key: {
          default: "Ctrl+Shift+S",
          mac: "Command+Shift+S",
        },
        description: "Capture screenshot for CI-Server",
      },
    },
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
});
