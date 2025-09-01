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
   ```

3. **Load in Browser**
   - **Chrome**: Go to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", select `.output/chrome-mv3`
   - **Firefox**: Go to `about:debugging`, click "This Firefox", click "Load Temporary Add-on", select any file in `.output/firefox-mv2`

## Development Workflow

### Code Quality

Always run before committing:
```bash
npm run lint:fix    # Fix linting issues
npm run compile     # Check TypeScript
```

### Building

```bash
npm run build:all   # Build both Chrome and Firefox
npm run clean       # Clean build output
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