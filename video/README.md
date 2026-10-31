# Companion Intelligence browser extension — product video

Storyboard for the 16:9 and 9:16 cuts (`storyboard.json`, video-kit 0.35.0). Nothing rendered is committed.

## Footage: honest scope

`store-assets/shared/screenshot-*.png` and `demo.gif` are NOT used. They are SVG reproductions of the v1.4.0 popup ("Start History Sync", "Authorized with Companion Intelligence"); none of those strings exist in the current popup (v1.6.1, redesigned). Filming them would show a UI that no longer ships.

Instead `capture-popup.mjs` drives the built extension in Chromium (Playwright 1.62.1, pinned) and shoots the real signed-out Welcome screen, light and dark, with no account, server or fixture:

```bash
yarn build && cd video && npm i --no-save playwright@1.62.1 && node capture-popup.mjs
```

Screens behind sign-in (Home, Sync activity, Ignored sites) need a Memory to talk to and are not captured. Every other scene is a typographic card whose lines come from the popup copy, `CAPTURE.md`, `CHANGELOG.md` and `wxt.config.ts`.
