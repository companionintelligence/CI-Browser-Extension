# Detailed Sub-Plans — Index

These documents expand each item in [planning.MD](../planning.MD) into a concrete, reviewable plan: problem statement, proposed approach, risks, and acceptance criteria.

Order roughly matches the phase sequencing in `planning.MD` § 3.

## Phase 1 — Stabilize the foundation
- [01 — Background script modularization](01-background-modularization.md)
- [02 — MV3 lifecycle: alarms and event-driven auth](02-mv3-lifecycle.md)
- [03 — Configurable server URL & first-run setup](03-configurable-server.md)
- [04 — Logging and observability](04-logging-observability.md)
- [05 — Testing strategy](05-testing.md)

## Phase 2 — Land in-flight features
- [06 — Scrape profile system (PR #30 / EPIC #27)](07-scrape-profiles.md)
- [07 — Highlight-to-save (PR #26 / Issue #25)](08-highlight-capture.md)
- [08 — Media capture + OAuth split (PR #14 / Issue #13)](09-media-capture-oauth.md)
- [09 — Device service alignment (PR #37)](10-device-service.md)

## Phase 3 — Reliability and local-first sync
- [10 — Local-first sync via IndexedDB outbox](06-local-first-sync.md)

## Phase 5 — Bidirectional Browser-Use
- [11 — Browser-Use bidirectional command channel](11-browser-use.md)

## Cross-cutting
- [12 — Privacy, incognito, sensitive-content detection](12-privacy.md)
- [13 — Distribution & release pipeline](13-distribution.md)
- [14 — i18n & accessibility](14-i18n-a11y.md)

## How to use these docs

Each file is structured the same way:

1. **Problem** — what's broken or missing today, with file/line pointers to current code.
2. **Goals / Non-goals** — bounded scope.
3. **Approach** — proposed design, file layout, code sketches where useful.
4. **Migration / sequencing** — how to land it without breaking master.
5. **Risks & open questions** — known unknowns.
6. **Acceptance criteria** — checklist a reviewer can use.

Treat each doc as the spec for one (or a small cluster of) GitHub issue(s). When work begins, copy the relevant sections into the issue body and link back here.
