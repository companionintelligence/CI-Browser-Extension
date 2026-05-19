# 09 — Media Capture + OAuth Split (PR #14 / Issue #13)

## Problem

Issue #13 asks for a "camera capture shortcut" — minimum-viable: one button → screenshot of the active tab → upload to CI.

PR #14 expanded that into a full system:

- Webcam capture via `navigator.mediaDevices.getUserMedia`.
- Desktop capture via Chrome's `desktopCapture` API.
- An **OAuth 2.0 authorization-code flow** to obtain tokens (replacing the existing session-cookie auth).
- Scheduled automatic capture via `browser.alarms`.

The PR is open because the scope is incoherent — three loosely related concerns shipped as one diff:

1. **OAuth migration** is not actually justified by capture; the existing session-cookie + JWT pair from PR #40 works fine. But OAuth *would* help with explicit-scope delegation if Browser-Use ([11](11-browser-use.md)) ever lands.
2. **Capture mechanics** (camera, desktop) have UX/permission questions independent of auth.
3. **Scheduled capture** is a privacy-sensitive feature that needs its own opt-in flow and storage policy.

## Goals

- Ship the tab-screenshot shortcut from Issue #13 quickly.
- Treat OAuth as a separate, optional auth path that we can adopt independently.
- Treat scheduled capture as a feature that requires explicit per-session opt-in with clear visual indicators.

## Approach — split into three PRs

### PR-A: Active-tab screenshot

Smallest valuable shippable unit. Closes #13.

```ts
// background/capture/tab.ts
export async function captureActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId!, { format: "png" });
  await outbox.enqueue({
    kind: "screenshot",
    payload: {
      device_id, source_url: tab.url, source_title: tab.title,
      kind: "screenshot", mime_type: "image/png",
      body: dataUrl.replace(/^data:image\/png;base64,/, ""),
      captured_at: new Date().toISOString(),
    },
    dedupKey: `screenshot:${tab.url}:${Date.now()}`,
  });
}
```

UI: button in popup ("Snapshot current page") + keyboard command (`Alt+Shift+C`).

Permissions: `activeTab` (avoids needing broad host permissions for screenshots).

### PR-B: Webcam / desktop capture (opt-in)

Behind a setting (`mediaCaptureEnabled: false` by default).

- Webcam: content script injects a hidden `<video>` + `<canvas>` after explicit user click; captures one frame; tears down stream.
- Desktop: `chrome.desktopCapture.chooseDesktopMedia` shows the OS picker.
- Both result in image blobs → outbox.

UX requirements:

- A persistent "recording / capturing" indicator while any stream is open.
- One-tap revoke from popup.
- No background capture without an explicit timer the user can see.

### PR-C: OAuth flow (independent)

> **See [15 — OAuth integration](15-oauth-integration.md) for the full design** (Path B specifically). The summary below is preserved for context.

This is a major auth change and deserves its own design doc. Key questions:

- **Why?** What does OAuth give us that the current session-cookie flow doesn't? Possible answer: per-scope consent (read-history vs. read-bookmarks vs. write-content). If yes, define the scopes.
- **Where does the consent screen live?** On the CI-Server dashboard, opened via `browser.identity.launchWebAuthFlow`.
- **Token storage**: refresh token in `storage.local` (encrypted? Web Crypto?), access token in memory + storage with TTL.
- **Coexistence**: support both auth modes (cookie + OAuth) for at least one release so we can revert.

Until those questions are answered, do **not** merge PR #14's OAuth portion. The screenshot capture (PR-A) doesn't need it.

### Scheduled capture (PR-D, later)

If we ship scheduled capture, do it with:

- Mandatory persistent on-screen indicator (browser-level if possible, otherwise our own injected toolbar in every tab).
- Hard cap on frequency: minimum 5-minute interval.
- Activity-aware: skip if no user activity in the last hour.
- Local-only mode: opt-in checkbox to keep captures in IndexedDB and never sync.

Don't ship until [12 — privacy](12-privacy.md) policies are documented.

## Sequencing

1. PR-A (active-tab screenshot) — small, ships quickly. Closes #13.
2. PR-B (webcam/desktop) — behind feature flag, gated on UI indicator work.
3. PR-C (OAuth) — separate design doc + RFC. Don't merge with capture.
4. PR-D (scheduled capture) — last, after privacy doc lands.

## Risks & open questions

- **Storage explosion** — screenshots are ~100 KB–1 MB each. The outbox quota policy ([06](06-local-first-sync.md)) must understand "large payloads count more." Consider storing image bodies in a separate IndexedDB store keyed by row id, so query-time tables stay small.
- **`activeTab` vs. `tabs` permission** — `captureVisibleTab` requires either `activeTab` (cleanest) or `<all_urls>` + `tabs`. Use `activeTab`; it's user-gesture-gated and avoids manifest churn.
- **Webcam UX** — opening a camera stream silently is creepy and likely violates store policies. The capture must be visible, brief, and have a clear shutter sound or visual flash.
- **Desktop capture in MV3** — works in service workers since Chrome 116. Confirm Firefox MV2 has an equivalent (it doesn't — `getDisplayMedia` from a popup is the fallback).
- **OAuth + Browser-Use** — Browser-Use will likely want OAuth scopes anyway. Coordinate so we don't design OAuth twice.

## Acceptance criteria (per PR)

### PR-A: Tab screenshot
- [ ] Popup button captures active tab and enqueues a `screenshot` row.
- [ ] Alt+Shift+C does the same from any tab.
- [ ] Outbox drain uploads to `/api/content` with `kind: screenshot`.
- [ ] No new permissions beyond `activeTab`.
- [ ] Issue #13 closed.

### PR-B: Webcam/desktop
- [ ] Disabled by default; toggle in popup with explanatory copy.
- [ ] When enabled, capture works for both webcam and desktop with explicit user-click trigger.
- [ ] Visible indicator while stream is live.

### PR-C: OAuth
- [ ] Design doc reviewed and merged before code.
- [ ] Both auth modes coexist for one release.
- [ ] Scopes documented and surfaced in the consent screen.

### PR-D: Scheduled capture
- [ ] Privacy doc ([12](12-privacy.md)) merged first.
- [ ] On-screen indicator visible whenever scheduling is active.
- [ ] Minimum interval enforced at 5 minutes.
