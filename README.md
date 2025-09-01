# 📄 PRIVATE AND CONFIDENTIAL
# 📄 PROPERTY OF LIFESCOPE INC
# Companion Intelligence Browser Extension
 
A privacy-focused browser extension that records and extracts your web browsing history to work with your private CI Server for digital memory and web history archiving.

## 🌟 Vision & Overview

The Companion Intelligence Browser Extension is designed to create a comprehensive digital memory of your web browsing activities. It serves as a data logger that works seamlessly with your private CI Server to maintain a detailed archive of your web history, enabling you to build a personal knowledge base from your online activities.

## ✨ Features

- **Smart Domain Tracking**: Monitor specific domains you care about with configurable whitelists
- **Page Content Extraction**: Automatically extract page titles, descriptions, and metadata
- **Media Detection**: Capture thumbnails, videos, and audio content from visited pages
- **Private Data Logging**: All data is sent to your private CI Server, maintaining full control over your information
- **Historical Crawling**: Retroactively process your browser history for whitelisted domains
- **Real-time Monitoring**: Track your browsing activity as it happens
- **Authentication Integration**: Secure token-based authentication with your CI Server

## 🚀 Installation

### For Users (Production)
*Store publication coming soon - we plan to publish to all major browser extension stores*

### For Developers (Manual Installation)
1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in your browser:
   - **Chrome/Edge**: Go to `chrome://extensions/`, enable Developer mode, click "Load unpacked" and select the `.output/chrome-mv3` folder
   - **Firefox**: Go to `about:debugging`, click "This Firefox", click "Load Temporary Add-on" and select the manifest.json file

## 📖 Usage Guide

### Initial Setup
1. Install the extension following the installation instructions above
2. Configure your CI Server URL (see Configuration section)
3. Authenticate with your CI Server through the extension popup
4. Configure your domain and page whitelists to specify what content to track

### Daily Usage
- The extension works automatically in the background
- Visit the extension popup to view current tracking status
- Manage your whitelists through the options page
- Monitor authentication status and connection to your CI Server

### What Gets Tracked
- **Domain Visits**: URLs matching your domain whitelist patterns
- **Page Content**: Title, description, and metadata from visited pages
- **Media Content**: Thumbnails and embedded media information
- **Visit Timing**: When pages were accessed
- **Historical Data**: Past visits to whitelisted domains (processed retroactively)

## ⚙️ Configuration

### Server URL Configuration
**Important**: The extension currently uses a hardcoded server URL (`dev.companionintelligence.com`). This needs to be made configurable to support:
- Demo server at `alpha.companionintel.com`
- Private CI Server instances
- Local development environments

*Configuration UI for server URL selection is planned for future releases.*

### Whitelist Configuration
Configure which domains and pages to track:
- **Domain Whitelist**: Track all pages from specific domains (e.g., `github.com`, `stackoverflow.com`)
- **Page Whitelist**: Track specific URL patterns or individual pages

### Authentication
The extension uses JWT-based authentication with your CI Server:
- Access tokens for API requests
- Session tokens for maintaining login state
- Automatic token refresh when needed

## 🛠️ Development Setup

### Prerequisites
- Node.js (v18 or later)
- npm or yarn
- Modern browser for testing

### Development Commands
```bash
# Install dependencies
npm install

# Start development mode (Chrome)
npm run dev

# Start development mode (Firefox)
npm run dev:firefox

# Build for production
npm run build

# Build for Firefox
npm run build:firefox

# Create distribution packages
npm run zip
npm run zip:firefox

# Linting and code quality
npm run lint
npm run lint:fix
npm run compile
```
## Safari Setup

For Safari Mobile (iOS) development:

1. Build the extension with `npm run build:safari`
2. The output will be in `.output/safari-mv3/`
3. Use Xcode to create a Safari App Extension wrapper for iOS distribution
4. The extension uses Manifest V3 for better Safari iOS compatibility

### Project Structure
```
src/
├── entrypoints/
│   ├── background.ts      # Background script with main logic
│   ├── content.ts         # Content script
│   ├── popup/            # Extension popup UI
│   └── options/          # Options page UI
├── hooks/                # Custom React hooks
├── store/                # Redux store configuration
└── utils.ts              # Utility functions
```

## 📦 Building and Packaging

### For Chrome/Edge
```bash
npm run build
npm run zip
```

### For Firefox
```bash
npm run build:firefox
npm run zip:firefox
```

The built extensions will be available in the `.output/` directory, with packaged versions in the `dist/` directory.

## 🏪 Store Publication Plans

We plan to publish this extension to all major browser extension stores:

- **Chrome Web Store** - For Chrome and Chromium-based browsers
- **Firefox Add-ons** - For Firefox
- **Microsoft Edge Add-ons** - For Microsoft Edge
- **Safari Extensions** - For Safari (future consideration)

This will eliminate the need for manual installation and building, making the extension accessible to all users.

## 🏗️ Technical Architecture

### Core Technologies
- **Framework**: WXT (Web Extension Toolkit) - Modern, type-safe extension development
- **Frontend**: React 19 with TypeScript
- **State Management**: Redux Toolkit with webext-redux for cross-context state
- **HTTP Client**: Axios for API communications
- **Build Tool**: Vite for fast development and building

### Key Components
- **Background Script**: Handles web navigation monitoring, API communications, and data processing
- **Content Scripts**: Inject functionality into web pages when needed
- **Popup Interface**: Provides user controls and status information
- **Options Page**: Configuration interface for whitelists and settings

### Data Flow
1. Web navigation events trigger the background script
2. URLs are checked against configured whitelists
3. Page metadata is extracted via iframely API
4. Processed events are sent to your CI Server
5. Historical data is crawled and processed for new whitelist entries

### Security & Privacy
- All data processing happens locally in the extension
- Data is only sent to your configured CI Server
- JWT-based authentication ensures secure API access
- No third-party analytics or tracking

## 🚀 Future Roadmap

### Browser-Use Integration
We plan to integrate with **Browser-Use** running on your CI Server, which will enable:
- **Automated Browser Control**: Let the CI Server control browser actions
- **Task Automation**: Execute complex web workflows automatically  
- **Enhanced Data Collection**: More sophisticated page analysis and interaction
- **Bidirectional Communication**: The extension will not only send data but also receive and execute commands

### Planned Features
- **Enhanced Configuration UI**: Easy server URL and advanced settings management
- **Improved Content Extraction**: Better handling of dynamic content and SPAs
- **Data Export/Import**: Backup and restore extension data
- **Privacy Controls**: Fine-grained control over what data is collected
- **Performance Optimization**: Reduced memory usage and faster processing
- **Multi-Server Support**: Connect to multiple CI Server instances

### Store Distribution
- Automated publishing pipeline for all browser stores
- Consistent release process across platforms
- User feedback integration and rapid updates

## 🤝 Contributing

This project uses modern development practices:
- TypeScript for type safety
- ESLint for code quality
- Prettier for code formatting
- WXT for cross-browser compatibility
 
## 🆘 Support

For support with the Companion Intelligence Browser Extension:
- Check the extension options and popup for status information
- Ensure your CI Server is properly configured and accessible
- Verify your authentication tokens are valid
- Review browser console logs for error messages
