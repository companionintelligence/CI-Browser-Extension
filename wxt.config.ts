import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    "permissions": [
      "cookies",
      "history",
      "storage",
      "tabs",
      "webNavigation"
    ],
    "host_permissions": [
      "*://*.companionintelligence.com/",
    ]
  },
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
});
