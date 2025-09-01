# WXT + React

This template should help get you started developing with React in WXT.

## Browser Support

This extension supports multiple browsers:

- **Chrome/Chromium** (default)
- **Firefox** 
- **Safari** (including Safari Mobile/iOS)

## Development

Start the development server:

```bash
# Default (Chrome)
npm run dev

# Firefox
npm run dev:firefox

# Safari
npm run dev:safari
```

## Building

Build for production:

```bash
# Default (Chrome)
npm run build

# Firefox
npm run build:firefox

# Safari (uses Manifest V3 for better iOS compatibility)
npm run build:safari
```

## Packaging

Create zip files for distribution:

```bash
# Default (Chrome)
npm run zip

# Firefox
npm run zip:firefox

# Safari
npm run zip:safari
```

## Safari Mobile Setup

For Safari Mobile (iOS) development:

1. Build the extension with `npm run build:safari`
2. The output will be in `.output/safari-mv3/`
3. Use Xcode to create a Safari App Extension wrapper for iOS distribution
4. The extension uses Manifest V3 for better Safari iOS compatibility
