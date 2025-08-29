import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Companion Intelligence",
    permissions: ["cookies", "history", "storage", "tabs", "webNavigation"],
    host_permissions: ["*://*.companionintelligence.com/"],
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
