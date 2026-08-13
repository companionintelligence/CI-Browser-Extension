/**
 * Safari OIDC Portal callback page (`{portal}/extension/oidc-callback`).
 *
 * This page — not the background — owns the PKCE exchange. It is guaranteed
 * alive at the exact moment the authorization code arrives, runs on the
 * Portal's own origin (the token POST is same-origin), and content scripts
 * share `browser.storage.local` with the rest of the extension. Safari's
 * background page is unloaded aggressively and does not reliably wake for
 * runtime messages, so every background-routed path was flaky.
 *
 * Order of operations:
 *   1. Stash the callback URL in storage (crash insurance — the background
 *      can finish from the stash on its next wake if this script dies).
 *   2. Exchange the code directly via `exchangeFromCallbackPage`.
 *   3. On success: show "Signed in", best-effort notify the background
 *      (SIGNED_IN → discovery), try to close the tab.
 *   4. If no pending session exists here (another path owns the attempt),
 *      fall back to the legacy message-retry loop.
 *
 * Also renders a status line on the page itself: during Safari tab auth the
 * popup is closed, so this page is the only surface where a stuck or failed
 * exchange can explain itself.
 */
import { exchangeFromCallbackPage } from "@/services/oidcAuth";

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

    const setStatus = (text: string, isError: boolean) => {
      const render = () => {
        let el = document.getElementById("ci-extension-status");
        if (!el) {
          el = document.createElement("p");
          el.id = "ci-extension-status";
          el.style.cssText =
            "position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);" +
            "max-width:26rem;margin:0;padding:0.5rem 1rem;border-radius:0.5rem;" +
            "font:0.8rem/1.4 system-ui,sans-serif;text-align:center;" +
            "background:rgba(255,255,255,0.08);";
          document.body.appendChild(el);
        }

        el.textContent = text;
        el.style.color = isError ? "#f2a6a6" : "#9aafb8";
      };

      if (document.body) {
        render();
      } else {
        document.addEventListener("DOMContentLoaded", render, { once: true });
      }
    };

    setStatus("Companion Intelligence is finishing sign-in…", false);

    // Stash the callback URL in extension storage FIRST (crash insurance):
    // if this script dies mid-exchange, the background can still finish from
    // the stash on its next wake (popup open / auth alarm / storage event).
    let stashed = false;
    const stashPromise = browser.storage.local
      .set({ oidcPendingCallbackUrl: { url, at: Date.now() } })
      .then(() => {
        stashed = true;
      })
      .catch(() => undefined);

    // Fallback when this script has no pending PKCE session to exchange
    // against: message the background, which may hold the attempt in memory.
    const startMessageFallback = () => {
      let attempts = 0;
      const maxAttempts = 60; // ~15s at 250ms
      let lastError: string | null = null;

      const giveUp = async () => {
        await stashPromise;

        // Prefer the persisted background failure (e.g. the token-endpoint
        // response body) over a generic message.
        let detail = lastError;
        try {
          const got = await browser.storage.local.get("oidcLastAuthError");
          const stored = got.oidcLastAuthError as
            | { message?: string }
            | undefined;
          if (stored?.message) {
            detail = stored.message;
          }
        } catch {
          // Storage unavailable; fall through to whatever we have.
        }

        if (detail) {
          setStatus(`Sign-in could not complete: ${detail}`, true);

          return;
        }

        setStatus(
          stashed
            ? "Almost there — open the Companion Intelligence popup to finish sign-in."
            : "The extension couldn't pick up this sign-in. Reopen the extension popup and try Sign in again.",
          !stashed,
        );
      };

      const tick = () => {
        attempts += 1;
        void browser.runtime
          .sendMessage({ action: "OIDC_CALLBACK", url })
          .then((res: { success?: boolean; error?: string } | undefined) => {
            if (res?.success) {
              setStatus("Signed in — this tab will close itself.", false);
              // The message path finished the exchange; the stash is stale.
              void browser.storage.local
                .remove("oidcPendingCallbackUrl")
                .catch(() => undefined);

              return;
            }

            if (res?.error) {
              lastError = res.error;
            }

            if (attempts < maxAttempts) {
              setTimeout(tick, 250);
            } else {
              void giveUp();
            }
          })
          .catch(() => {
            if (attempts < maxAttempts) {
              setTimeout(tick, 250);
            } else {
              void giveUp();
            }
          });
      };

      tick();
    };

    const run = async () => {
      await stashPromise;

      let tokens;
      try {
        tokens = await exchangeFromCallbackPage(url);
      } catch (error) {
        // Real exchange failure (state mismatch, token endpoint rejection…).
        // exchangeFromCallbackPage already recorded it for the popup; the
        // stash stays so a surviving background can retry from it.
        setStatus(
          `Sign-in could not complete: ${
            error instanceof Error ? error.message : String(error)
          }`,
          true,
        );

        return;
      }

      if (tokens) {
        setStatus("Signed in — you can close this tab.", false);
        // Best-effort: an awake background runs Memory discovery and closes
        // this tab right away. If it is unloaded, the reopened popup's
        // CHECK_AUTH_STATUS finds the stored tokens and does the same.
        void browser.runtime
          .sendMessage({ action: "SIGNED_IN" })
          .catch(() => undefined);
        // Safari usually refuses to close tabs the page didn't open — the
        // status line above covers that case.
        window.close();

        return;
      }

      // No pending PKCE session in storage — another path (background tab
      // capture, Chrome's launchWebAuthFlow) owns this attempt.
      startMessageFallback();
    };

    void run();
  },
});
