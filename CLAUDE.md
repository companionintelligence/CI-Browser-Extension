# CLAUDE.md — CI-Browser-Extension

> **Private & Confidential — Property of Lifescope Inc. Do not distribute.**

## Platform role

**CI-Browser-Extension** sits in the **Capture** layer of the Companion Intelligence platform.

Architecture: `CI-Engineering/architecture/architecture.md`
Roadmap: `CI-Engineering/architecture/roadmap.md`
Issues: <https://github.com/companionintelligence/CI-Engineering/issues>

## What this repo does

WXT-based browser extension that captures browsing activity and sends it to CI-Server. Uses IndexedDB for local queue and domain-specific scrapers.

## Stack

- WXT (browser extension framework)
- TypeScript
- IndexedDB (local queue)
- Jest (unit tests)

## Key commands

```bash
# Install dependencies
yarn install

# Start development server / service
yarn dev

# Run tests
yarn test

# Type check and lint
yarn compile
yarn lint

# Build for production (Chrome MV3 / Firefox MV2)
yarn build
yarn build:firefox
```

## Package manager

**yarn 4** (via corepack; pinned by the `packageManager` field in package.json) —
required because the workspace uses the `workspace:*` protocol, which npm cannot
install. Do not mix with npm/pnpm/bun.

## Cross-repo connections

- Sends browser-activity events to CI-Server (/browser-activity endpoint)
- Auth: API key from CI-Server
- Supports Chrome, Firefox, and Chromium-based browsers

## Build targets

`yarn build` produces the Chrome variant and `yarn build:firefox` the Firefox variant. See PUBLISHING.md for store submission.

## Multi-agent safety

Multiple AI agents work these repos in parallel. Never use `git reset --hard`, `git clean -f`, or any destructive git command without explicit confirmation from the user.

## Confidentiality

Private & Confidential — Property of Lifescope Inc. Do not distribute.
