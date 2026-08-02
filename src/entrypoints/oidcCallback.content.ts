/**
 * Safari OIDC Portal callback page (`{portal}/extension/oidc-callback`).
 * Reports location.href (including ?code=&state=) to the background so PKCE
 * exchange can finish. Retries — Safari often has no listener yet when the
 * page first loads, or the background was suspended during Portal login.
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

    let attempts = 0;
    const maxAttempts = 60; // ~15s at 250ms

    const tick = () => {
      attempts += 1;
      void browser.runtime
        .sendMessage({ action: "OIDC_CALLBACK", url })
        .then((res: { success?: boolean } | undefined) => {
          if (res?.success) {
            return;
          }

          if (attempts < maxAttempts) {
            setTimeout(tick, 250);
          }
        })
        .catch(() => {
          if (attempts < maxAttempts) {
            setTimeout(tick, 250);
          }
        });
    };

    tick();
  },
});
