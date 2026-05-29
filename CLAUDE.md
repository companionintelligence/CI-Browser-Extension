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
npm install

# Start development server / service
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Package manager

**npm** — use exclusively; do not mix with npm/yarn/pnpm/bun unless the repo explicitly requires it.

## Cross-repo connections

- Sends browser-activity events to CI-Server (/browser-activity endpoint)
- Auth: API key from CI-Server
- Supports Chrome, Firefox, and Chromium-based browsers

## Build targets

`npm run build` produces Chrome and Firefox variants. See PUBLISHING.md for store submission.

## Multi-agent safety

Multiple AI agents work these repos in parallel. Never use `git reset --hard`, `git clean -f`, or any destructive git command without explicit confirmation from the user.

## Confidentiality

Private & Confidential — Property of Lifescope Inc. Do not distribute.
