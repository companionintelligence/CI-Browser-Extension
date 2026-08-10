import { useCallback, useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { setState, saveUserSettings } from "@/store/ciStateSlice";
import { portalOidcConfig } from "@/services/portalConfig";
import {
  prepareAuthorizeRequest,
  savePendingAuth,
  shouldUseTabAuthFlow,
} from "@/services/oidcAuth";
import { useCiState } from "./useCiState";

/**
 * Sign-in state and actions. Mirrors the background's persisted auth state:
 * `oidcAuthInProgressAt` restores "authorizing" after Safari tears the popup
 * down, and `oidcLastAuthError` keeps failures visible across reopens
 * (AUTH_FAILED broadcasts are lost while the popup is closed).
 */
export function useAuth() {
  const dispatch = useDispatch();
  const { portalUrl } = useCiState();
  const [authorizing, setAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const restore = async () => {
      try {
        const stored = await browser.storage.local.get([
          "oidcAuthInProgressAt",
          "oidcLastAuthError",
        ]);
        const lastError = stored.oidcLastAuthError as
          | { message?: string }
          | undefined;
        if (lastError?.message) {
          setAuthError(lastError.message);
        }

        // Mirror oidcAuth's TAB_AUTH_TIMEOUT_MS (10 min).
        const startedAt = stored.oidcAuthInProgressAt;
        if (
          typeof startedAt === "number" &&
          Date.now() - startedAt < 10 * 60 * 1000 &&
          !lastError?.message
        ) {
          setAuthorizing(true);
        }

        await browser.runtime.sendMessage({ action: "CHECK_AUTH_STATUS" });
      } catch (error) {
        console.error("Error checking auth status:", error);
      }
    };

    void restore();

    const onMessage = (message: {
      action?: string;
      payload?: { accessToken?: string | null };
      error?: string;
    }) => {
      if (message.action === "AUTH_STATE_UPDATED") {
        setAuthorizing(false);
        setAuthError(null);
      }

      if (message.action === "AUTH_FAILED") {
        setAuthorizing(false);
        setAuthError(
          typeof message.error === "string" && message.error
            ? message.error
            : "Sign-in failed",
        );
      }
    };

    browser.runtime.onMessage.addListener(onMessage);

    const onStorage = (
      changes: { [key: string]: { newValue?: unknown; oldValue?: unknown } },
      area: string,
    ) => {
      if (area !== "local") {
        return;
      }

      if (
        changes.oidcAuthInProgressAt &&
        !changes.oidcAuthInProgressAt.newValue
      ) {
        // Auth finished while the popup was closed or open — re-check Redux.
        setAuthorizing(false);
        void browser.runtime.sendMessage({ action: "CHECK_AUTH_STATUS" });
      }

      if (changes.oidcLastAuthError) {
        const next = changes.oidcLastAuthError.newValue as
          | { message?: string }
          | undefined;
        if (next?.message) {
          setAuthorizing(false);
          setAuthError(next.message);
        } else {
          setAuthError(null);
        }
      }
    };

    browser.storage.onChanged.addListener(onStorage);

    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  // Kick off Portal OIDC Auth-Code + PKCE. On Safari the popup itself persists
  // the PKCE session BEFORE anything else: the callback page's content script
  // does the token exchange from that stored session, and the background may
  // never wake. The AUTHORIZE message is purely best-effort so an awake
  // background can run its capture fallbacks; nothing blocks on it.
  const authorize = useCallback(async () => {
    setAuthorizing(true);
    setAuthError(null);
    void browser.storage.local.remove("oidcLastAuthError");
    try {
      if (shouldUseTabAuthFlow()) {
        const prepared = await prepareAuthorizeRequest(
          portalOidcConfig({ portalUrl }),
          { prompt: "select_account" },
        );
        // The load-bearing write: the callback page exchanges against this.
        await savePendingAuth(prepared);

        void browser.runtime
          .sendMessage({ action: "AUTHORIZE", prepared })
          .catch(() => undefined);

        const tab = await browser.tabs.create({
          url: prepared.authorizeUrl,
          active: true,
        });
        if (tab.id !== undefined) {
          void browser.runtime
            .sendMessage({ action: "AUTHORIZE_TAB", tabId: tab.id })
            .catch(() => undefined);
        }

        return;
      }

      const response = await browser.runtime.sendMessage({
        action: "AUTHORIZE",
      });

      if (response && response.success === false) {
        setAuthError(response.error || "Sign-in failed");
        setAuthorizing(false);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
      setAuthorizing(false);
    }
  }, [portalUrl]);

  /**
   * Back out of a stuck tab-auth without waiting out the 10-minute window.
   * Clears the Safari callback stash too — a leftover one makes the next
   * background wake record a spurious "sign-in expired" failure (and light
   * the toolbar's error badge).
   */
  const cancelAuthorize = useCallback(() => {
    setAuthorizing(false);
    void browser.storage.local.remove([
      "oidcAuthInProgressAt",
      "oidcPendingAuth",
      "oidcPendingCallbackUrl",
    ]);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await browser.runtime.sendMessage({ action: "SIGN_OUT" });
      setAuthorizing(false);
      setAuthError(null);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  /** Clear the local session and reopen Portal with an account picker. */
  const switchAccount = useCallback(async () => {
    try {
      await browser.runtime.sendMessage({ action: "SIGN_OUT" });
      dispatch(
        setState({
          serverURL: "",
          serverURLSource: null,
          memoryAppChoices: null,
          discoveryHint: null,
          deviceId: null,
          deviceName: null,
        }),
      );
      dispatch(saveUserSettings());
    } catch {
      // Still attempt a fresh authorize.
    }

    await authorize();
  }, [dispatch, authorize]);

  const dismissAuthError = useCallback(() => {
    setAuthError(null);
    void browser.storage.local.remove("oidcLastAuthError");
  }, []);

  return {
    authorizing,
    authError,
    authorize,
    cancelAuthorize,
    signOut,
    switchAccount,
    dismissAuthError,
  };
}
