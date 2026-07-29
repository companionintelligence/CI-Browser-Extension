import path from "node:path";
import { defineConfig } from "wxt";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";

/**
 * The extension icon, at every size the manifest advertises. Referenced from
 * three places, which must agree:
 *   - top-level `icons`          — about:addons / chrome://extensions entry
 *   - `action.default_icon`      — the toolbar button on MV3 (Chrome)
 *   - `browser_action.default_icon` — the toolbar button on MV2 (Firefox)
 *
 * The files are generated from public/icon/logo.png; they shipped for a while as
 * the wxt template's green puzzle-piece placeholders.
 */
const ICONS = {
  "16": "icon/16.png",
  "32": "icon/32.png",
  "48": "icon/48.png",
  "96": "icon/96.png",
  "128": "icon/128.png",
} as const;

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: (env) => ({
    name: "Companion Intelligence",
    host_permissions: [
      "*://*.companionintelligence.com/*",
      "*://*.companionintel.com/*",
      "*://*.ci.computer/*",
      "*://*.netflix.com/*",
      "*://*.hulu.com/*",
      "*://secure.hulu.com/*",
      "*://*.disneyplus.com/*",
      "*://*.ci.localhost/*",
      "*://ci-server.localhost/*",
    ],
    permissions: [
      "alarms",
      "bookmarks",
      "contextMenus",
      "downloads",
      "history",
      // OIDC Auth-Code+PKCE via chrome.identity.launchWebAuthFlow (Phase 3).
      // Replaces the legacy CI-Server cookie/CSRF session flow, so the
      // "cookies" permission is no longer needed.
      "identity",
      "storage",
      "tabs",
      "webNavigation",
    ],
    // AMO-only disclosure requirement — scoped to Firefox so it doesn't leak
    // into the Chrome/Safari/Edge manifests (Safari's Xcode wrapper reads the
    // Safari manifest verbatim, so stray Firefox keys would show up there too).
    ...(env.browser === "firefox"
      ? {
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
        }
      : {}),
    icons: ICONS,
    // Mobile browser optimizations
    action: {
      default_title: "Companion Intelligence",
      default_popup: "popup.html",
      // Not cosmetic: Chrome falls back to the top-level `icons` when an action
      // declares no icon of its own, but Firefox does NOT — an MV2
      // `browser_action` with no `default_icon` gets the browser's generic
      // puzzle-piece button however correct `icons` is.
      default_icon: ICONS,
    },
    // wxt 0.20 builds the action block from the popup entrypoint (its
    // `<meta name="manifest.type" content="browser_action">`) and, on the MV2
    // path, converts `action` -> `browser_action` while DROPPING default_icon —
    // verified: it survives in chrome-mv3 and vanishes in firefox-mv2. Setting
    // the MV2 key directly is what actually reaches Firefox. Remove once wxt
    // carries default_icon through the conversion.
    ...(env.manifestVersion === 2
      ? { browser_action: { default_icon: ICONS } }
      : {}),
    // Add Android Chrome support
    minimum_chrome_version: "88",
  }),
  srcDir: "src",
  // Clean store-artifact names (the package is @ci/ci-browser-extension, which
  // would otherwise produce "cici-browser-extension-*.zip")
  zip: {
    name: "ci-browser-extension",
  },
  modules: ["@wxt-dev/module-react"],
  // Don't auto-launch Chrome via web-ext — on Linux the CDP pipe often dies with
  // ECONNRESET after a successful build. Load `.output/chrome-mv3-dev` unpacked instead.
  webExt: {
    disabled: true,
  },
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
