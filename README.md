# Companion Intelligence Browser Extension

A cross-browser extension built with WXT and React, supporting Chrome, Firefox, and Safari.

## Browser Support

This extension supports the following browsers:
- **Chrome** (Manifest V3)
- **Firefox** (Manifest V2/V3)  
- **Safari** (Manifest V2)

## Development

Start the development server:
```bash
# For Chrome (default)
npm run dev

# For Firefox
npm run dev:firefox

# For Safari
npm run dev:safari
```

## Building

Build for production:
```bash
# For Chrome (default)
npm run build

# For Firefox
npm run build:firefox

# For Safari  
npm run build:safari
```

## Packaging

Create distribution packages:
```bash
# For Chrome (default)
npm run zip

# For Firefox
npm run zip:firefox

# For Safari
npm run zip:safari
```

The packaged extensions will be created in the `.output/` directory.
