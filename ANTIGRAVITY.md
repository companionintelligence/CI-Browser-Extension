# ANTIGRAVITY.md — CI-Browser-Extension

## Context

**CI-Browser-Extension** — **Capture** layer of the Companion Intelligence platform (Lifescope Inc).

Architecture: `CI-Engineering/architecture/architecture.md`
Roadmap: `CI-Engineering/architecture/roadmap.md`

## Purpose

WXT-based browser extension that captures browsing activity and sends it to CI-Server. Uses IndexedDB for local queue and domain-specific scrapers.

## Stack

- WXT (browser extension framework)
- TypeScript
- IndexedDB (local queue)
- Jest (unit tests)

## Commands

```bash
npm install
npm run dev
npm test
```

## Rules

- Package manager: do not switch or mix.
- Destructive git operations (`reset --hard`, `clean -f`) require explicit user confirmation.
- Commits reference CI-Engineering issues.
- All content is **private and confidential** — Property of Lifescope Inc.
