# 12 — Privacy, Incognito, Sensitive-Content Detection

## Problem

The extension's value proposition is privacy: data goes only to the user's own CI-Server. But several current behaviors undercut that promise:

1. **`is_incognito: false`** is hardcoded on every event ([background.ts:566](../src/entrypoints/background.ts)). Pages visited in private windows get synced like normal.
2. **`contains_sensitive: false`** is hardcoded too. No heuristic, no allowlist of banking/health/auth domains, no detection of password-protected forms.
3. **Form submissions** are captured by [content.ts:105](../src/entrypoints/content.ts). Password fields are filtered, but credit-card numbers, SSNs, and most other sensitive form data are not.
4. **Query strings** in URLs (e.g. `?email=foo@bar.com&token=xyz`) are sent verbatim.
5. **Highlight save** ([08](08-highlight-capture.md)) captures arbitrary user-selected text — could be passwords, secrets, anything.
6. **No "purge" UX**. The user can't easily clear what's been synced.
7. **No documented data inventory** — README has marketing copy but no precise list of "we send X, Y, Z."

The README's "Privacy Controls" roadmap item is genuine, not aspirational; it needs to become real.

## Goals

- Honest, audited data inventory.
- Incognito respected by default.
- Heuristic + allowlist sensitive-content detection that errs on the side of skipping.
- Per-event "skip / sync local-only / sync" routing.
- One-click "purge everything I've synced" flow (local + remote).

## Approach

### 1. Data inventory doc

`docs/privacy/data-inventory.md` — for every captured event kind, list:

- Trigger (when it fires)
- Payload fields (exhaustive)
- Storage location (local outbox, remote, both)
- Retention policy
- Opt-out mechanism
- Sample payload

Single source of truth. Reviewed every release.

### 2. Incognito handling

```ts
// activity/recordHit.ts
const tab = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
if (tab?.incognito) {
  logger.debug("activity.skipped.incognito", { url: tab.url });
  return;   // do not capture
}
```

Also use `browser.extension.inIncognitoContext` in content scripts. Tab and context both checked.

Add an opt-in (off by default): "Track activity in private windows too" — but with strong warning copy.

### 3. Sensitive-content detection

Layered:

**Tier 1 — Hard allowlist of "never sync" hosts** (configurable, with sensible defaults):
- `*.bank-*.com`, common bank domains (Chase, BoA, Wells Fargo, etc.)
- Health portals (HealthVault, MyChart)
- Auth flows: `*/login`, `*/oauth/*`, `*/sso/*`, `accounts.google.com`, `login.microsoft.com`
- Anything matching `password|reset|verify|2fa|mfa` in the path

**Tier 2 — DOM heuristic** for forms:
- Form contains `<input type=password>` → don't capture submission fields, only URL.
- Form contains fields named like `card|cvv|ssn|tax|account_number` → don't capture submission.

**Tier 3 — URL query redaction**:
- Strip query string entirely at the outbox boundary unless the user opts into "full URLs."
- Keep path; strip `?…&…`.

Emit `contains_sensitive: true` when any tier triggers, so server-side analytics know to handle these specially.

### 4. Per-event routing

Add a `routing` field to outbox rows:

```ts
type Routing = "sync" | "local_only" | "drop";
```

- `sync`: normal upload.
- `local_only`: persist in IndexedDB, never POST. Visible in the Diagnostics view but stays on device. Use for incognito-but-tracked, sensitive captures the user explicitly chose to keep, etc.
- `drop`: skip entirely.

Decision rules live in `privacy/router.ts` and are unit-tested with named scenarios.

### 5. Purge UX

Settings tab "Privacy" gains:

- **Clear local queue** — wipes IndexedDB, keeps server data.
- **Request server purge** — calls `DELETE /api/me/data?since=…` on CI-Server. Confirmation modal with typed confirmation ("type PURGE").
- **Sign out and forget device** — clears tokens + `deviceId` + local queue.

CI-Server contract for purge:
```
DELETE /api/me/data?since=<iso>&kinds=visit,bookmark,...
→ 202 with a job id; client polls or the server emails when complete
```

### 6. Sensitive-data redaction in logs

Already covered in [04 — logging](04-logging-observability.md). Reuse the redactor in the outbox enqueue path:

```ts
async function enqueue(row: OutboxRow) {
  row.payload = redactPayload(row.payload, getPrivacyConfig());
  await db.outbox.add(row);
}
```

### 7. UX affordances

- Tray icon shows a small indicator when on a "do-not-track" matched site, so the user sees the protection.
- Popup shows "Last skipped: <domain> (sensitive)" in Diagnostics so users can audit.

## Migration / sequencing

1. Write the data inventory doc first — forces clarity on what we currently do.
2. Add incognito skip (one-line fix, immediate value).
3. Add query-string redaction at outbox boundary.
4. Add hard allowlist with default banking/health/auth list.
5. Add DOM-heuristic sensitive detection for form submission paths.
6. Build purge UX + server endpoint (cross-team).

## Risks & open questions

- **False positives** — a legitimate site matching `*/login` is fine to *not* capture URL parameters but probably fine to capture the visit itself. Tune the rules per tier.
- **Configurability vs. complexity** — every user wants different defaults. Ship sensible defaults plus a YAML-style editor for power users; don't try to do a full rules-engine UI.
- **Server-side delete completeness** — we need CI-Server to truly delete, not soft-delete, when requested. Confirm with that team.
- **Tracking what we skipped** — if a sensitive page is skipped, do we log the URL? Probably hash it for diagnostics so the user can verify without us storing the URL itself.
- **Regulatory posture** — GDPR / CCPA imply a right to export and delete. Document the export path (which is "ask CI-Server, which has all your data anyway") and the delete path.

## Acceptance criteria

- [ ] `docs/privacy/data-inventory.md` exists and lists every event kind.
- [ ] Visits in incognito windows are not synced by default; opt-in toggle exists with a warning.
- [ ] Default sensitive-host allowlist blocks at least: top-20 US banks, Chase, BoA, Wells Fargo, login pages on Google/Microsoft/Apple, MyChart.
- [ ] Outbox payloads do not contain query strings unless the user opts in.
- [ ] Form submissions on pages with `<input type=password>` capture no form fields.
- [ ] "Clear local queue" wipes IndexedDB within 1 s.
- [ ] "Request server purge" successfully deletes server-side data (verified end-to-end).
- [ ] Tray icon indicates do-not-track matched sites.
- [ ] Privacy posture is summarized in the README in plain English, linked to data-inventory.md.
