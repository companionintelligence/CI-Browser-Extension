# Privacy Policy — Companion Intelligence Browser Extension

**Effective date:** 2026-08-02
**Publisher:** Lifescope Inc.
**Canonical URL:** https://ci.computer/privacy-policy

The Companion Intelligence ("CI") Browser Extension is a personal web-archival
tool. It records _your own_ browsing activity and sends it to a **Companion
Memory server that you control**. Lifescope Inc. does not operate a shared
backend for your captured data and **never receives your browsing data**. There
is no analytics, advertising, or user tracking in the extension: nothing counts
what you do, builds a profile of you, or is sold or shared with anyone.

**Two exceptions, stated plainly.** The first: signing in uses Lifescope's identity service
(CI-Portal, by default `hub.ci.computer`). Signing in therefore tells that
service who you are — your account identifier, name, and email — exactly as any
login would. It never receives your captured browsing data. If you run your own
Portal, you can point the extension at it instead under **Advanced**.

The second: the extension reports **its own crashes** to Lifescope so they can be
fixed. Crash reports contain no web addresses, no page contents, and nothing you
have captured — see §3.1 — and you can switch them off in the popup.

This document is the formal privacy disclosure required by the Chrome Web
Store, Firefox Add-ons (AMO), and the Apple App Store.

## 1. What the extension collects

When you are signed in and a data type is enabled, the extension collects:

| Data | Detail | Toggle | Default |
|------|--------|--------|---------|
| **Browsing history** | URL, page title, visit time, dwell duration, scroll depth, and the page `<meta name="description">` | History | **On** |
| **Bookmarks** | URL, title, and date added, on create and change | Bookmarks | Off |
| **Downloads** | File URL, filename, size, and state | Downloads | Off |
| **Highlighted text** | Text you explicitly select and save via the right-click menu | On demand | — |
| **Supported-site data** | Structured items from pages you open on 13 sites — see §2 | Built-in profiles | On (except financial) |
| **Financial-account data** | Portfolio holdings, order history, and watchlist on Robinhood | Include financial accounts | **Off** |
| **Device descriptor** | Browser name, OS, and a generated device id used to label your data on your server | Automatic | — |
| **Crash reports** | The extension's own error message, stack trace, and version — see §3.1 | Send error reports | **On** |

The extension also keeps a local record of which items have already been synced
(so it does not re-upload them), a bounded queue of captures that failed to
upload, and your settings. This local state lives in the browser's extension
storage on your machine.

## 2. Supported-site profiles

A profile reads your own data from a site you are signed in to, only on the
specific pages it was written for. Thirteen ship today:

| Sites | What is read |
|---|---|
| Netflix, Hulu, Disney+, Max, Paramount+, Prime Video (incl. `amazon.com/gp/video`) | Viewing history, watchlist, recommendations, profile names |
| CNN, WSJ, Slashdot | Articles listed on pages you open; WSJ's markets section also records listed symbols and prices |
| GitHub | Repositories, issues, pull requests, commits, activity |
| Quora | Your questions, answers, and who you follow |
| Airbnb | Trips, wishlist, hosting activity |
| **Robinhood** | **Portfolio holdings, order history, watchlist — requires the "Include financial accounts" opt-in, which is off by default** |

The financial opt-in gates *account* data. It is checked before the page is
read: with the setting off, the extension does not read your brokerage page at
all. WSJ's markets section is ordinary published market data on a news page and
is not gated.

## 3. What it does **not** collect

- **No passwords or form-field contents.** The extension does not capture form
  submissions or input field values.
- **No email addresses, plan, or billing details.** Profiles read what you
  watched, read, or saved — not your account identity on those sites.
- **No page text or HTML.** Only the title and meta description of pages you
  visit.
- **No cookies from any site.** The extension does not request the `cookies`
  permission.
- **No data from ignored sites or pages.** Ignore-list rules are applied to
  every capture path before upload.
- **No data when signed out**, and none of the optional data types you have
  turned off.
- **No third-party transmission.** Captured data is sent only to the Memory
  server you configure.

### 3.1 Crash reports

The extension reports **its own crashes** to Lifescope's error-tracking service
(Sentry) so that faults can be fixed. This is the only data Lifescope receives
from the extension other than sign-in (§5), and it is separate from — and never
mixed with — anything you capture.

A crash report contains the error message, the stack trace inside the
extension's own code, the extension version, and a short label naming which
internal task failed (for example `auto-sync`). That is all.

It specifically does **not** contain:

- **Any web address.** Not the page you were on, not its site, not its path —
  every address is removed before a report is sent, including from error text.
  The only exception is Lifescope's own Portal addresses, which are the same for
  every user and identify nobody. **The address of your own Memory server is
  removed too.**
- **Anything from a page you visit.** The scripts that run inside web pages
  **do not report at all** — no crash reporting code is included in them. Only
  the extension's background task and its popup can report.
- **Your identity, account, tokens, cookies, bookmarks, history, downloads,
  highlights, or anything a site profile read** — including anything from the
  financial-accounts opt-in.
- **Your locale, timezone, computer name, or a per-installation identifier.**

**Turn it off** with **"Send error reports"** in the popup — it is there whether
or not you are signed in, and it takes effect immediately. Builds distributed
without error reporting compiled in do not show the switch and never report.

## 4. Where your data goes

All captured data is transmitted over HTTPS to the Companion Memory server
associated with your account, or to a server URL you set manually under
**Advanced**. You — or your organization — own and operate that server.
Retention, deletion, and access controls are governed by that server, not by
the extension or by Lifescope.

## 5. Authentication

Sign-in is a standard OpenID Connect **Authorization Code flow with PKCE**
against CI-Portal. The extension opens a browser-managed sign-in window; your
password is entered on the Portal's own page and is never visible to the
extension.

The extension stores the resulting tokens in extension storage and sends the
identity token as a `Bearer` header to your Memory server. It reads **no
cookies** — the `cookies` permission was removed when this flow replaced the
previous cookie/CSRF login.

## 6. Permissions and why they are needed

| Permission | Why |
|------------|-----|
| `history` | Read your browsing history to sync it to your server |
| `bookmarks` | Read and watch bookmarks when bookmark sync is on |
| `downloads` | Read and watch downloads when download sync is on |
| `identity` | Run the OIDC sign-in window (`launchWebAuthFlow`) and obtain the redirect URL |
| `tabs` | Identify the URL/title of the tab a navigation occurred in |
| `webNavigation` | Detect page navigations to record visits |
| `storage` | Store your settings, sync bookkeeping, and retry queue locally |
| `contextMenus` | Add the right-click "save highlight" item |
| `alarms` | Schedule background sync without keeping the worker awake |
| Host access — CI domains | Reach the Portal and your Memory server |
| Host access — `<all_urls>` content script | A lightweight script reports scroll depth and the page meta description on request. It stores nothing and does not read page text or HTML. Site profiles are separate and run only on their 14 declared match patterns. |

## 7. Your controls

- Turn any data type (history, bookmarks, downloads) on or off at any time.
- Leave **Include financial accounts** off — it is off unless you enable it.
- Add sites or pages to **Ignored Pages and Sites** to exclude them from every
  form of capture.
- Turn **Send error reports** off to stop crash reporting (§3.1).
- Sign out to stop all capture.
- Delete synced data from your Memory server per that server's controls.
- Remove the extension to stop all collection and clear its local state.

## 8. Children

The extension is not directed to children under 13 and collects no data from
them beyond the browsing activity of the signed-in user. Streaming profiles
record profile names as labels but do not record whether a profile is a child
profile.

## 9. Changes

Material changes to this policy will update the effective date above and be
reflected at the canonical URL.

## 10. Contact

Questions: **privacy@ci.computer** (or your organization's CI administrator).
