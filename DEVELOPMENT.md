# Development Guide

## Quick Start

1. **Setup**
   ```bash
   npm install
   ```

2. **Development**
   ```bash
   # Chrome development
   npm run dev
   
   # Firefox development
   npm run dev:firefox

   # Safari development (builds the bundle; see step 3 — Safari can't load it unpacked)
   npm run dev:safari
   ```

3. **Load in Browser**
   - **Chrome**: Go to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", select `.output/chrome-mv3`
   - **Firefox**: Go to `about:debugging`, click "This Firefox", click "Load Temporary Add-on", select any file in `.output/firefox-mv2`
   - **Safari**: there is no unpacked-load mode. Safari only runs a web
     extension wrapped in a native app built with Xcode. To test locally, run
     `xcrun safari-web-extension-converter .output/safari-mv2` to scaffold the
     Xcode wrapper, then build & run it from Xcode (Safari's Develop menu →
     "Allow Unsigned Extensions" is needed for an ad-hoc-signed local build).
     See [`PUBLISHING.md`](PUBLISHING.md#apple-app-store-safari) for the full
     flow used for actual releases.

## Development Workflow

### Code Quality

Always run before committing:
```bash
npm run lint:fix    # Fix linting issues
npm run compile     # Check TypeScript
```

### Building

```bash
npm run build:all            # Build every target (Chrome, Firefox, Edge, Safari, Safari Mobile, …)
npm run build:safari         # Safari desktop    → .output/safari-mv2
npm run build:safari-mobile  # Safari iOS/mobile → .output/safari-mv3
npm run clean                # Clean build output
```

### Store Publishing

```bash
npm run prepare:store  # Full pipeline: clean, lint, compile, zip
```

## Architecture

### Entry Points
- `src/entrypoints/popup/` - Extension popup UI
- `src/entrypoints/options/` - Options/settings page
- `src/entrypoints/background/` - Background script
- `src/entrypoints/content/` - Content scripts

### State Management
- Redux store in `src/store/`
- Uses `webext-redux` for cross-context state sharing
- Actions and reducers follow Redux Toolkit patterns

### Cross-Browser Compatibility
- WXT automatically handles manifest differences (MV2 vs MV3)
- Uses WebExtension APIs for maximum compatibility
- Browser-specific builds in `.output/chrome-mv3/` and `.output/firefox-mv2/`

## Testing in Browsers

### Chrome
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` folder

### Firefox
1. Go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on..."
4. Select any file in the `.output/firefox-mv2` folder

### Safari
Safari doesn't support loading an unpacked extension folder — every test run
has to go through the Xcode wrapper:
1. `yarn build:safari` (or `yarn build:safari-mobile` for iOS)
2. Regenerate / refresh the Xcode wrapper (gitignored under `.safari-xcode/`):
   ```bash
   xcrun safari-web-extension-converter \
     --no-prompt \
     --project-location .safari-xcode \
     --bundle-identifier com.companionintel.extension \
     --copy-resources \
     --force \
     .output/safari-mv2
   ```
3. Open the generated `.xcodeproj`, pick your Team under Signing, Run
4. In Safari: Settings → Advanced → enable "Show features for web
   developers", then Develop → "Allow Unsigned Extensions" (needed for an
   ad-hoc/dev-signed build), then enable the extension in Settings →
   Extensions

Sign-in on Safari does **not** use `browser.identity`. The Safari build opens
the Portal authorize URL in a tab (`prompt=select_account` so you can pick
which Companion account); the redirect lands on the Portal HTTPS page
`{portal}/extension/oidc-callback` (CI-Portal #451). The content script on
that page **performs the PKCE token exchange itself**
(`exchangeFromCallbackPage`): it reads the pending PKCE session from
`browser.storage.local`, POSTs `/oauth2/token` same-origin, and stores the
tokens — the Safari background page (which Safari unloads aggressively and
does not reliably wake) is not in the critical path. The page shows
"Signed in" or the real exchange error inline. Fallbacks, in order: the URL
is stashed in storage before the exchange (crash insurance; the background
finishes it on its next wake after an ~8s ownership window), and a
message-retry loop covers the case where another path owns the attempt.
After tokens are stored, reopen the popup — it should show Connected /
**Choose Memory** (when the account has more than one Memory). The Memory
URL is discovered via Portal `/me/apps` (opaque `access_token`); CI-Server
calls use the Portal `id_token` Bearer.

**Safari site access:** Settings → Extensions → Companion Intelligence → allow
the Portal host (`hub.companionintelligence.com` for Development). Without
that, the callback page loads but the extension never sees `?code=`.

Developer Portal switch: ⌥⇧. or 7× title → **Development**. Use **Use another
account** to clear the binding and pick a different Portal identity.

> Loopback (`127.0.0.1:8732`) lives on `feat/safari-oidc-loopback` if you need
> to test without the Portal HTTPS callback.

## Debugging

### Background Scripts
- **Chrome**: Go to `chrome://extensions/`, click "Service worker" link
- **Firefox**: Go to `about:debugging`, click "Inspect" next to your extension

### Content Scripts
- Use browser DevTools on the webpage where content script runs
- Content script logs appear in the webpage's console

### Popup/Options
- Right-click popup/options and select "Inspect"
- Or use DevTools from the extension pages

## Common Issues

### Build Errors
- Run `npm run clean` and try again
- Check for TypeScript errors: `npm run compile`
- Verify all imports are correct

### Extension Not Loading
- Check console for errors in browser extension management page
- Verify manifest.json is valid
- Check file permissions

### Hot Reload Not Working
- Restart the dev server: `Ctrl+C` then `npm run dev`
- Reload the extension in browser extension management page

## Performance Tips

- Use React DevTools browser extension for component debugging
- Monitor background script memory usage in browser extension management
- Profile content script performance with browser DevTools
- Use `webext-redux` sparingly to avoid performance overhead