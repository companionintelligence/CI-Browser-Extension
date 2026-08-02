/**
 * Safari OIDC Portal callback page (`{portal}/extension/oidc-callback`).
 * Reports location.href (including ?code=&state=) to the background so PKCE
 * exchange can finish even when tabs/webNavigation are flaky.
 */
export default defineContentScript({
  matches: [
    "*://*.ci.computer/extension/*",
    "*://*.companionintelligence.com/extension/*",
    "*://*.companionintel.com/extension/*",
    "*://*.ci.localhost/extension/*",
  ],
  runAt: "document_start",
  main() {
    const url = window.location.href;
    if (!url.includes("/extension/oidc-callback")) {
      return;
    }

    void browser.runtime
      .sendMessage({ action: "OIDC_CALLBACK", url })
      .catch(() => undefined);
  },
});
