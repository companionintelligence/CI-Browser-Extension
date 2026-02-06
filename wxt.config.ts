import path from 'node:path';
import { defineConfig } from "wxt";

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Companion Intelligence",
    host_permissions: [
      "*://*.companionintelligence.com/",
      "*://*.companionintel.com/",
      "*://*.netflix.com/*",
      "*://*.hulu.com/*",
      "*://secure.hulu.com/*",
      "*://*.disneyplus.com/*",
    ],
    permissions: [
      "bookmarks",
      "cookies",
      "downloads",
      "history",
      "storage",
      "tabs",
      "webNavigation",
    ],
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
    "shadcn": 'packages/shadcn/src'
  },
  vite: () => ({
    build: {
      minify: false
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }),
});
