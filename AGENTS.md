# AGENTS.md — CI-Browser-Extension

## Platform context

CI-Browser-Extension is the **Capture** layer component of the Companion Intelligence platform — a private, local-first digital memory system.

Full architecture: `CI-Engineering/architecture/architecture.md`

## Repo summary

WXT-based browser extension that captures browsing activity and sends it to CI-Server. Uses IndexedDB for local queue and domain-specific scrapers.

## Stack

- WXT (browser extension framework)
- TypeScript
- IndexedDB (local queue)
- Jest (unit tests)

## Setup & commands

```bash
npm install   # install
npm run dev   # dev
npm test   # test
npm run build   # build
```

## Build targets

`npm run build` produces Chrome and Firefox variants. See PUBLISHING.md for store submission.

## Git discipline

- Never `git reset --hard` or `git clean -f` without user confirmation.
- Commit messages: imperative mood, ≤ 72 chars.
- Reference CI-Engineering issues in PRs (e.g. `Closes companionintelligence/CI-Engineering#32`).

## Confidentiality

Private & Confidential — Property of Lifescope Inc. Do not distribute.
