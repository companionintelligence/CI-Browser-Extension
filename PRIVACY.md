# Privacy Policy — Companion Intelligence Browser Extension

**Effective date:** 2026-06-10
**Publisher:** Lifescope Inc.
**Canonical URL:** https://ci.computer/privacy-policy

The Companion Intelligence ("CI") Browser Extension is a personal
web-archival tool. It records _your own_ browsing activity and sends it to a
**Companion Intelligence Server that you control**. Lifescope Inc. does not
operate a shared backend for this extension and **never receives your browsing
data**. There is no third-party analytics, advertising, or tracking in the
extension.

This document is the formal privacy disclosure required by the Chrome Web
Store, Firefox Add-ons (AMO), and the Apple App Store.

## 1. What the extension collects

When you are signed in and a data type is enabled, the extension collects:

| Data | Detail | Toggle |
|------|--------|--------|
| **Browsing history** | URL, page title, visit time, dwell duration, scroll depth, and the page `<meta name="description">` | History sync |
| **Bookmarks** | URL, title, folder, and add/change/remove events | Bookmarks sync |
| **Downloads** | File URL, filename, size, and state | Downloads sync |
| **Highlighted text** | Text you explicitly select and choose "save" on via the context menu | On demand |
| **Supported-site data** | On a small set of streaming/media sites (Netflix, Hulu, Disney+, Max, Paramount+, Prime Video, GitHub, Slashdot), structured items such as watchlist/viewing entries from pages you open | Built-in profiles |
| **Device descriptor** | Browser name, OS, and a generated device id used to label your data on your server | Automatic |

The extension also keeps a local record of which items have already been
synced (so it does not re-upload them) and your settings (server URL, ignore
lists, toggles). This local state lives in the browser's extension storage on
your machine.

## 2. What it does **not** collect

- **No passwords or form-field contents.** The extension does not capture form
  submissions or input field values.
- **No data from ignored sites or pages.** Anything matching your ignore lists
  is excluded before upload.
- **No data when signed out**, and none of the optional data types you have
  turned off.
- **No third-party transmission.** Data is sent only to the CI Server domain
  you configure.

## 3. Where your data goes

All captured data is transmitted over HTTPS to the CI Server domain you enter
in the extension popup (e.g. `my-ci.example.com`). You — or your organization —
own and operate that server. Retention, deletion, and access controls are
governed by that server, not by the extension or by Lifescope.

## 4. Authentication and cookies

The extension reads two cookies — `sessionToken` and `csrfToken` — **only from
your configured CI Server domain**, to obtain a short-lived access token via
`POST /api/authenticate/refresh`. It does not read cookies from any other site.
Access tokens are held in memory/extension storage and sent as a `Bearer`
header to your server's `/api/*` endpoints.

## 5. Permissions and why they are needed

| Permission | Why |
|------------|-----|
| `history` | Read your browsing history to sync it to your server |
| `bookmarks` | Read and watch bookmarks when bookmark sync is on |
| `downloads` | Read and watch downloads when download sync is on |
| `cookies` | Read the CI Server session/CSRF cookies for authentication |
| `tabs` | Identify the active tab's URL/title for the current visit |
| `webNavigation` | Detect page navigations to record visits |
| `storage` | Store your settings and sync bookkeeping locally |
| `contextMenus` | Add the right-click "save selection" item for highlight-to-save |
| `alarms` | Schedule background sync without keeping the worker awake |
| Host access (`<all_urls>` content script) | A lightweight content script reads only scroll depth and the page meta description, and supports highlight-to-save. It does not read page content otherwise. Supported-site profiles run only on their listed domains. |

## 6. Your controls

- Turn any data type (history, bookmarks, downloads) on or off at any time.
- Add sites or pages to the **Ignored Pages and Sites** list to exclude them.
- Sign out (clearing your CI Server session) to stop all capture.
- Delete synced data from your CI Server per that server's controls.
- Remove the extension to stop all collection and clear its local state.

## 7. Children

The extension is not directed to children under 13 and collects no data from
them beyond the browsing activity of the signed-in user.

## 8. Changes

Material changes to this policy will update the effective date above and be
reflected at the canonical URL.

## 9. Contact

Questions: **privacy@ci.computer** (or your organization's CI administrator).
