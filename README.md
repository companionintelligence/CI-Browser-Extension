# Companion Intelligence Browser Extension

A React-based browser extension built with WXT framework, supporting both Chrome and Firefox browsers.

## Features

- Cross-browser support (Chrome MV3, Firefox MV2)
- React with TypeScript
- Redux state management
- Modern build tooling with Vite
- ESLint code quality checks
- Automated store publishing preparation

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Chrome or Firefox for testing

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd CI-Browser-Extension

# Install dependencies
npm install
```

### Development Commands

```bash
# Start development server (Chrome)
npm run dev

# Start development server (Firefox)
npm run dev:firefox

# Type checking
npm run compile

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Building for Production

### Build Commands

```bash
# Build for Chrome (Manifest V3)
npm run build

# Build for Firefox (Manifest V2)
npm run build:firefox

# Build development version
npm run build:dev
```

Built extensions will be available in the `.output/` directory:
- Chrome: `.output/chrome-mv3/`
- Firefox: `.output/firefox-mv2/`

## Store Publishing

### Create Store-Ready Packages

```bash
# Create ZIP package for Chrome Web Store
npm run zip

# Create ZIP packages for Firefox Add-ons (includes source code)
npm run zip:firefox
```

This generates:
- `ci-browser-extension-0.0.0-chrome.zip` - Chrome Web Store submission
- `ci-browser-extension-0.0.0-firefox.zip` - Firefox Add-ons submission
- `ci-browser-extension-0.0.0-sources.zip` - Source code (required for Firefox)

### Store Submission Guidelines

#### Chrome Web Store
1. Upload `ci-browser-extension-0.0.0-chrome.zip`
2. Fill out store listing details
3. Submit for review

#### Firefox Add-ons
1. Upload `ci-browser-extension-0.0.0-firefox.zip`
2. Upload `ci-browser-extension-0.0.0-sources.zip` as source code
3. Fill out add-on details
4. Submit for review

## Project Structure

```
src/
├── entrypoints/          # Extension entry points (popup, options, etc.)
├── components/           # React components
├── hooks/               # Custom React hooks
├── store/               # Redux store configuration
├── assets/              # Static assets
└── utils.ts             # Utility functions

public/
├── icon/                # Extension icons
└── ...                  # Other static files
```

## Permissions

The extension requests the following permissions:
- `cookies` - Access browser cookies
- `history` - Access browsing history
- `storage` - Store extension data
- `tabs` - Access tab information
- `webNavigation` - Monitor navigation events
- Host permissions for `*.companionintelligence.com`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and test them
4. Run linting: `npm run lint:fix`
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/your-feature`
7. Submit a pull request

## Technical Stack

- **Framework**: [WXT](https://wxt.dev/) - Web Extension Tooling
- **Frontend**: React 19 + TypeScript
- **State Management**: Redux Toolkit + React-Redux
- **Build Tool**: Vite
- **Code Quality**: ESLint + Prettier
- **Extension APIs**: WebExtension APIs for cross-browser compatibility
