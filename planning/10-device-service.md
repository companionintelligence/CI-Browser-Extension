# 10 — Device Service Alignment (PR #37)

## Problem

CI-Server recently refactored its device controller and service. The extension's device-registration logic ([fetchDeviceFromServer](../src/entrypoints/background.ts:201), [createDeviceOnServer](../src/entrypoints/background.ts:277), [setupDevice](../src/entrypoints/background.ts:353)) was written for the old model and now produces:

- Primary-key / foreign-key errors during sync (per PR #37 description).
- Stale `last_seen` timestamps on the server (no path updates it from the extension).
- Device matching that misses on the renamed device fields.

PR #37 implements:

- A `last_seen` periodic update.
- Improved matching using more device characteristics (browser name, OS version, model).

It's open waiting for CI-Server release alignment and a clean rebase.

## Goals

- Match the current CI-Server device contract exactly.
- `last_seen` updates on a reasonable cadence without spamming the API.
- Robust device-matching that never creates duplicates on the same physical machine.
- Recovery path for users whose devices got duplicated by previous bugs.

## Current contract gaps

From reading [background.ts:382](../src/entrypoints/background.ts) (`getDeviceInfo`):

```ts
return {
  device_name,             // "Chrome on macOS"
  device_type,             // "desktop" | "mobile" | "tablet"
  platform,                // "macos"
  model,                   // "macOS 14.4.1"
};
```

Server-side recent fields (per PR #37 conversation) likely include:

```
device_id          UUID
device_name        string
device_type        enum
platform           string
model              string
last_seen          timestamp
created_at         timestamp
user_id            UUID
browser            string         // NEW — not currently sent
browser_version    string         // NEW
os_version         string         // NEW
```

We're under-sending. Result: server creates a "Chrome on macOS / macOS 14.4.1" device, but a matching attempt from Sonoma 14.5 produces a new row instead of an update.

## Approach

### 1. Confirm the contract

File a tracking issue in `companionintelligence/ci-server` to publish the canonical device schema. Capture in this repo at `docs/api/devices.md`.

### 2. Extend `getDeviceInfo()`

```ts
export function getDeviceInfo() {
  const ua = bowser.getParser(navigator.userAgent);
  const browser_info = {
    browser:          ua.getBrowserName(),         // "Chrome"
    browser_version:  ua.getBrowserVersion(),      // "120.0.0.0"
    os_version:       ua.getOSVersion(),           // "14.5"
    platform:         (ua.getOSName() ?? "unknown").toLowerCase(),
  };
  const platformType = ua.getPlatformType();
  const device_type = platformType === "mobile" ? "mobile"
                    : platformType === "tablet" ? "tablet"
                    : "desktop";
  return {
    device_name: `${browser_info.browser} on ${ua.getOSName()}`,
    device_type,
    model: ua.getOSVersion() ? `${ua.getOSName()} ${ua.getOSVersion()}` : ua.getOSName(),
    ...browser_info,
  };
}
```

### 3. Matching strategy

Currently `fetchDeviceFromServer` matches on `device_name + platform`. PR #37 proposes a richer match. Recommended:

1. **Exact match** — `device_id` in `storage.local` and it exists on the server → use it.
2. **Strict tuple match** — same `(user_id, device_name, platform, browser, browser_version)` → reuse.
3. **Loose tuple match** — same `(user_id, device_name, platform)` and `browser` matches → reuse (handles browser-version bumps).
4. **Otherwise** create.

This avoids both extremes: never reusing (today's duplicate problem) and always reusing (which would conflate two browsers on the same machine).

Server should consider doing the matching itself via a "upsert by fingerprint" endpoint — simpler client. File as a follow-up.

### 4. `last_seen` update

Add `PATCH /api/devices/:id { last_seen }` (or whatever the server prefers). Send:

- On every successful outbox drain that uploaded ≥1 row.
- Plus a passive `chrome.alarms` heartbeat every 30 minutes.
- Coalesce — never more than 1 per minute.

```ts
// device/heartbeat.ts
let lastSentAt = 0;
export async function maybeHeartbeat() {
  if (Date.now() - lastSentAt < 60_000) return;
  const { deviceId } = store.getState().ciState;
  if (!deviceId) return;
  await api.patchDevice(deviceId, { last_seen: new Date().toISOString() });
  lastSentAt = Date.now();
}
```

### 5. Duplicate cleanup for affected users

Users hit by the legacy bug have multiple rows on the server for one physical device. Two options:

- **Server-side migration** — preferred. CI-Server merges duplicates by `(user_id, device_name, platform)` and rewrites foreign keys. One-shot.
- **Client-side reconciliation** — on startup, if `GET /api/devices` returns multiple matching the local fingerprint, prefer the oldest, update `storage.local.deviceId` to that one, and call a server endpoint to mark the others as merged.

Use whichever the server team prefers.

### 6. Telemetry

Log device-resolution outcomes:

```ts
logger.info("device.resolved", { strategy: "exact" | "strictTuple" | "looseTuple" | "created", deviceId });
```

If `created` fires more than once per install, something is wrong.

## Migration / sequencing

1. Align this PR's wire format with CI-Server's current contract — small back-and-forth.
2. Land PR #37 (rebase onto master, integrate with [01 — modularization](01-background-modularization.md) so it touches `background/device/` rather than the monolith).
3. Ship the heartbeat behind the existing outbox-drain alarm so it's a single network call per drain.
4. Server migration to merge duplicates rolls out separately.

## Risks & open questions

- **PII in device names** — `device_name` is generic ("Chrome on macOS") so this is fine; if we ever include hostnames we'd need consent. Keep generic.
- **Multi-account on same device** — if a user logs into two CI accounts in the same browser, they get two `device_id` rows (one per user). Confirm the server matches scope to `user_id`.
- **Token churn vs. device churn** — re-auth shouldn't create a new device. Verify by signing out and back in: `deviceId` should persist via `storage.local`.
- **Firefox AMO data-collection declaration** — adding `browser_version`, `os_version` may need a manifest data-collection update.

## Acceptance criteria

- [ ] No PK/FK errors in CI-Server logs during normal extension sync.
- [ ] Fresh install on a machine that previously had the extension installed reuses the existing device row.
- [ ] `last_seen` advances on every successful drain, capped at 1/min.
- [ ] `device.resolved` log shows `created` exactly once per fresh install, then `exact`/`strictTuple` thereafter.
- [ ] Documented in `docs/api/devices.md`.
- [ ] PR #37 merged.
