# GitHub Copilot Instructions — CI-Browser-Extension

You are working in **CI-Browser-Extension**, the **Capture** component of the **Companion Intelligence** platform — a private, local-first digital memory and AI appliance system owned by Lifescope Inc.

## Platform architecture

```
Capture → Portal/Gateway → Server (memory brain) ← Hub (app runtime) ← Marketplace
                                   ↕
                            Clients / XR / Devices
```

Full architecture and ADRs live in `CI-Engineering/architecture/`.

## This repo

WXT-based browser extension that captures browsing activity and sends it to CI-Server. Uses IndexedDB for local queue and domain-specific scrapers.

## Tech stack

- WXT (browser extension framework)
- TypeScript
- IndexedDB (local queue)
- Jest (unit tests)

## Development

```bash
npm install   # install
npm test   # test
```

## Build targets

`npm run build` produces Chrome and Firefox variants. See PUBLISHING.md for store submission.

## Conventions

- Do not mix package managers.
- Keep PRs small and linked to CI-Engineering issues.
- Multiple agents may work this codebase simultaneously — never use destructive git operations.
- All code is **private and confidential** — do not surface or transmit source beyond this session.
