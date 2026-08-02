/**
 * Safari OIDC loopback landing page. The container app serves HTML on
 * 127.0.0.1:8732 so the redirect loads; this script reports location.href
 * (including ?code=&state=) to the background. Relying on tabs/webNavigation
 * alone is flaky on Safari even when the page loads successfully.
 */
export default defineContentScript({
  matches: ["http://127.0.0.1:8732/*"],
  runAt: "document_start",
  main() {
    const url = window.location.href;
    if (!url.includes("/oidc-callback")) {
      return;
    }

    void browser.runtime
      .sendMessage({ action: "OIDC_CALLBACK", url })
      .catch(() => undefined);
  },
});
