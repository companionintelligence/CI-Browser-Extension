/**
 * CI-Portal OIDC Authorization-Code + PKCE for the browser extension.
 *
 * Phase 3 of the unified identity pipeline: replaces the legacy cookie/CSRF/
 * refresh flow with a standard public-client OIDC flow against CI-Portal. The
 * extension is registered as the `ci-browser-extension` public PKCE client
 * (CI-Portal #356). Chrome/Firefox use `browser.identity.getRedirectURL()`
 * (`*.chromiumapp.org` / `*.extensions.allizom.org`). Safari has no stable
 * vendor intercept redirect, so it opens a tab and uses the Portal-hosted
 * HTTPS `redirect_uri` (`{portal}/extension/oidc-callback`; CI-Portal #451).
 * A content script on that page reports `?code=` for PKCE exchange.
 * The **id_token** (getIdToken) — not the opaque OAuth access_token — is the
 * Bearer the extension sends to CI-Server's `/api/v1/*` bulk routes (which
 * validate the JWKS-signed portal JWT after CI-Server #1473).
 *
 * Every request here is sent with `credentials: "omit"` — see postToken; the
 * portal rejects cookie-bearing requests from the extension's origin.
 *
 * Pure helpers (PKCE, authorize-URL, redirect parsing, token-request body) are
 * separated from the `browser`/network flow so they unit-test without a browser.
 */

const STORAGE_KEY = "oidcTokens";
const PENDING_AUTH_KEY = "oidcPendingAuth";

/** Fixed path on Portal for Safari / tab-based extension OIDC. */
export const EXTENSION_OIDC_CALLBACK_PATH = "/extension/oidc-callback";

/**
 * @deprecated Loopback redirect used before Portal HTTPS callback shipped.
 * Kept for tests / emergency fallback only — prefer `extensionOidcCallbackUri`.
 */
export const SAFARI_OIDC_REDIRECT_URI = "http://127.0.0.1:8732/oidc-callback";

/** In-flight Safari capture: content script / AUTHORIZE_TAB feed this. */
let activeCaptureSink: ((url: string) => void) | null = null;
let pendingAuthorizeTabId: number | undefined;
/** Dedupes content-script + tab-listener + webNavigation completing the same code. */
let inFlightExchange: Promise<OidcTokens> | null = null;

const TAB_AUTH_TIMEOUT_MS = 2 * 60 * 1000;

/** True when `url` is a Portal (or legacy loopback) extension OIDC callback. */
export function isOidcCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === EXTENSION_OIDC_CALLBACK_PATH) {
      return true;
    }

    return url.startsWith(SAFARI_OIDC_REDIRECT_URI.split("?")[0]);
  } catch {
    return false;
  }
}

/**
 * Deliver a callback URL into the in-flight tab auth (from the oidcCallback
 * content script). Returns true if a listener consumed it.
 */
export function deliverOidcCallbackUrl(url: string): boolean {
  if (!isOidcCallbackUrl(url) || !activeCaptureSink) {
    return false;
  }

  activeCaptureSink(url);

  return true;
}

/** Late-bind the authorize tab id after the popup opens it (Safari). */
export function attachAuthorizeTabId(tabId: number): void {
  pendingAuthorizeTabId = tabId;
}

export async function savePendingAuth(
  prepared: PreparedAuthorize,
): Promise<void> {
  await browser.storage.local.set({
    [PENDING_AUTH_KEY]: { prepared, startedAt: Date.now() },
    oidcAuthInProgressAt: Date.now(),
  });
}

export async function loadPendingAuth(): Promise<PreparedAuthorize | null> {
  const got = await browser.storage.local.get(PENDING_AUTH_KEY);
  const pending = (
    got as Record<string, { prepared?: PreparedAuthorize; startedAt?: number }>
  )[PENDING_AUTH_KEY];

  if (!pending?.prepared || typeof pending.startedAt !== "number") {
    return null;
  }

  if (Date.now() - pending.startedAt > TAB_AUTH_TIMEOUT_MS) {
    await clearPendingAuth();

    return null;
  }

  return pending.prepared;
}

export async function clearPendingAuth(): Promise<void> {
  await browser.storage.local.remove([
    PENDING_AUTH_KEY,
    "oidcAuthInProgressAt",
  ]);
}

/**
 * Finish PKCE exchange from a callback URL. Safe to call from the content
 * script, webNavigation, or after `launchAuthViaTab` resolves — concurrent
 * callers share one in-flight exchange so the auth code is used once.
 */
export async function finishOidcCallback(
  config: OidcConfig,
  redirectUrl: string,
): Promise<OidcTokens | null> {
  if (!isOidcCallbackUrl(redirectUrl)) {
    return null;
  }

  // Wake tab-capture waiters (if the background listener is still alive).
  deliverOidcCallbackUrl(redirectUrl);

  if (inFlightExchange) {
    return inFlightExchange;
  }

  const prepared = await loadPendingAuth();
  if (!prepared) {
    // Already exchanged (pending cleared) — return whatever is stored.
    return loadTokens();
  }

  inFlightExchange = exchangeAuthorizationCode(config, prepared, redirectUrl)
    .then(async (tokens) => {
      await clearPendingAuth();

      return tokens;
    })
    .finally(() => {
      inFlightExchange = null;
    });

  return inFlightExchange;
}

/** Portal origin from an issuer (`…/api/auth`) or a bare Portal URL. */
export function portalOriginFromIssuer(issuerOrPortalUrl: string): string {
  return issuerOrPortalUrl.replace(/\/+$/, "").replace(/\/api\/auth$/, "");
}

/** Portal-hosted Safari callback (requires deployed Portal allowlist). */
export function extensionOidcCallbackUri(issuerOrPortalUrl: string): string {
  return `${portalOriginFromIssuer(issuerOrPortalUrl)}${EXTENSION_OIDC_CALLBACK_PATH}`;
}

/**
 * better-auth OIDC endpoints from the issuer (no network). Used so Safari can
 * open the authorize URL immediately instead of parking on the Portal store.
 */
export function endpointsFromIssuer(issuer: string): DiscoveryDoc {
  const base = issuer.replace(/\/+$/, "");

  return {
    authorization_endpoint: `${base}/oauth2/authorize`,
    token_endpoint: `${base}/oauth2/token`,
  };
}

/** PKCE + authorize URL ready to open in a tab (no network). */
export interface PreparedAuthorize {
  authorizeUrl: string;
  redirectUri: string;
  verifier: string;
  state: string;
  tokenEndpoint: string;
}

export async function prepareAuthorizeRequest(
  config: OidcConfig,
  opts?: { prompt?: string },
): Promise<PreparedAuthorize> {
  const { authorization_endpoint, token_endpoint } = endpointsFromIssuer(
    config.issuer,
  );
  const verifier = randomString(32);
  const challenge = await pkceChallenge(verifier);
  const state = randomString(16);
  const redirectUri = resolveRedirectUri(config);
  const authorizeUrl = buildAuthorizeUrl(authorization_endpoint, {
    clientId: config.clientId,
    redirectUri,
    scopes: config.scopes,
    state,
    codeChallenge: challenge,
    // Callers pass `select_account` for interactive Sign in. Omit for silent
    // renewal so Portal can reuse the existing SSO session without UI.
    prompt: opts?.prompt,
  });

  return {
    authorizeUrl,
    redirectUri,
    verifier,
    state,
    tokenEndpoint: token_endpoint,
  };
}

export interface OidcConfig {
  /** Discovery issuer, e.g. https://hub.ci.computer/api/auth */
  issuer: string;
  /** Public client id registered in CI-Portal. */
  clientId: string;
  /** Space-delimited scopes; `offline_access` requests a refresh token. */
  scopes: string;
}

export interface OidcTokens {
  access_token: string;
  refresh_token?: string;
  /** Absolute expiry (epoch ms). */
  expires_at: number;
  id_token?: string;
}

interface DiscoveryDoc {
  authorization_endpoint: string;
  token_endpoint: string;
}

// ---- PKCE + state (pure) ----

function base64UrlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) {
    s += String.fromCharCode(b);
  }

  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A high-entropy base64url string (PKCE verifier / state / nonce). */
export function randomString(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);

  return base64UrlEncode(arr);
}

/** The S256 PKCE challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return base64UrlEncode(new Uint8Array(digest));
}

// ---- authorize URL + redirect parsing (pure) ----

export function buildAuthorizeUrl(
  endpoint: string,
  params: {
    clientId: string;
    redirectUri: string;
    scopes: string;
    state: string;
    codeChallenge: string;
    /** OIDC prompt, e.g. `select_account` or `login`. */
    prompt?: string;
  },
): string {
  const u = new URL(endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("scope", params.scopes);
  u.searchParams.set("state", params.state);
  u.searchParams.set("code_challenge", params.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (params.prompt) {
    u.searchParams.set("prompt", params.prompt);
  }

  return u.toString();
}

/** Extract { code, state, error } from the redirect launchWebAuthFlow returns. */
export function parseRedirect(redirectUrl: string): {
  code?: string;
  state?: string;
  error?: string;
} {
  const u = new URL(redirectUrl);

  return {
    code: u.searchParams.get("code") ?? undefined,
    state: u.searchParams.get("state") ?? undefined,
    error: u.searchParams.get("error") ?? undefined,
  };
}

/** x-www-form-urlencoded token-endpoint body. */
export function tokenRequestBody(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

// ---- discovery + token endpoint ----

export async function discover(issuer: string): Promise<DiscoveryDoc> {
  const res = await fetch(
    `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
    { credentials: "omit" },
  );
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
  }

  const doc = (await res.json()) as DiscoveryDoc;
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC discovery doc missing endpoints");
  }

  return doc;
}

async function postToken(
  endpoint: string,
  params: Record<string, string>,
): Promise<OidcTokens> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: tokenRequestBody(params),
    // `credentials: "omit"` is load-bearing, not hygiene. The extension holds
    // host permissions for the portal origins, so Chrome attaches the portal's
    // session cookies (just set by launchWebAuthFlow) to this POST. CI-Portal's
    // better-auth runs its origin check on any *cookie-bearing* request, and the
    // extension's `Origin: chrome-extension://<id>` is not — and should not be —
    // in the portal's trustedOrigins, so the exchange came back 403
    // "Invalid origin". A public-client PKCE exchange is authenticated by
    // code_verifier alone; no cookie belongs on it.
    credentials: "omit",
  });
  if (!res.ok) {
    // Surface the body: better-auth reports the actual cause (invalid_grant,
    // invalid origin, ...) there, and a bare status code hides it.
    const detail = await res.text().catch(() => "");
    throw new Error(
      `OIDC token request failed: HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    id_token: json.id_token,
    expires_at: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

// ---- token storage (browser.storage.local) ----

async function saveTokens(tokens: OidcTokens): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: tokens });
}

export async function loadTokens(): Promise<OidcTokens | null> {
  const got = await browser.storage.local.get(STORAGE_KEY);

  return (
    ((got as Record<string, unknown>)?.[STORAGE_KEY] as OidcTokens) ?? null
  );
}

export async function clearTokens(): Promise<void> {
  await browser.storage.local.remove(STORAGE_KEY);
}

// ---- public flow ----

/** True when we must open a normal tab instead of `identity.launchWebAuthFlow`. */
export function shouldUseTabAuthFlow(): boolean {
  // Safari Web Extensions use this scheme; Chrome/Firefox do not.
  try {
    const extensionBase = browser.runtime?.getURL?.("");
    if (
      typeof extensionBase === "string" &&
      extensionBase.startsWith("safari-web-extension:")
    ) {
      return true;
    }
  } catch {
    // runtime unavailable (unit tests without a full browser mock).
  }

  // Safari may expose a stub `identity` API that hangs without a window.
  // Prefer the tab flow whenever the UA is Safari (not Chromium/Firefox).
  try {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (
      /Safari/i.test(ua) &&
      !/Chrome|Chromium|CriOS|Firefox|FxiOS|Edg/i.test(ua)
    ) {
      return true;
    }
  } catch {
    // ignore
  }

  const identity = browser.identity as
    | {
        launchWebAuthFlow?: unknown;
        getRedirectURL?: unknown;
      }
    | undefined;
  if (
    typeof identity?.launchWebAuthFlow !== "function" ||
    typeof identity?.getRedirectURL !== "function"
  ) {
    return true;
  }

  return false;
}

/** Redirect URI registered on the authorize request for this browser. */
export function resolveRedirectUri(config?: OidcConfig): string {
  if (shouldUseTabAuthFlow()) {
    if (!config?.issuer) {
      throw new Error("OIDC issuer required for Safari tab auth redirect");
    }

    return extensionOidcCallbackUri(config.issuer);
  }

  return browser.identity.getRedirectURL();
}

/**
 * Interactive OIDC for Safari: navigate a tab to authorize, capture the
 * Portal HTTPS callback, then close the tab.
 *
 * Prefer an existing `tabId` opened from the popup click (Safari drops the
 * user-gesture after async work, so background `tabs.create` often never
 * shows a window). Otherwise create a tab here as a fallback.
 *
 * Also listen to webNavigation commit events and poll `tabs.get().url`, and
 * accept a content-script delivery of the callback URL.
 */
export function launchAuthViaTab(
  authorizeUrl: string,
  redirectUri: string,
  existingTabId?: number,
  opts?: { alreadyNavigated?: boolean },
): Promise<string> {
  const redirectBase = redirectUri.split("?")[0];
  const alreadyNavigated = opts?.alreadyNavigated === true;

  return new Promise((resolve, reject) => {
    let tabId: number | undefined = existingTabId ?? pendingAuthorizeTabId;
    let settled = false;
    const pollTimers: ReturnType<typeof setInterval>[] = [];

    const finish = (err?: Error, url?: string) => {
      if (settled) {
        return;
      }

      settled = true;
      activeCaptureSink = null;
      pendingAuthorizeTabId = undefined;
      clearTimeout(timer);
      for (const pollTimer of pollTimers) {
        clearInterval(pollTimer);
      }

      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      try {
        browser.webNavigation?.onBeforeNavigate?.removeListener(onBeforeNav);
        browser.webNavigation?.onCommitted?.removeListener(onNavUrl);
        browser.webNavigation?.onErrorOccurred?.removeListener(onNavUrl);
      } catch {
        // webNavigation optional in some test mocks
      }

      if (tabId !== undefined) {
        void browser.tabs.remove(tabId).catch(() => undefined);
      }

      if (err) {
        reject(err);
      } else if (url) {
        resolve(url);
      } else {
        reject(new Error("OIDC sign-in cancelled"));
      }
    };

    const maybeCapture = (url: string | undefined, forTabId?: number) => {
      if (!url || !url.startsWith(redirectBase)) {
        return;
      }

      // Accept the matching tab even if we learned tabId late (popup may open
      // the authorize tab after AUTHORIZE already started listening).
      if (forTabId !== undefined) {
        tabId = forTabId;
      }

      finish(undefined, url);
    };

    activeCaptureSink = (url) => {
      maybeCapture(url);
    };

    const pollTabUrl = async () => {
      if (settled) {
        return;
      }

      try {
        if (tabId !== undefined) {
          const tab = await browser.tabs.get(tabId);
          maybeCapture(tab.url, tabId);

          return;
        }

        // No tabId yet — scan every tab for the callback (Safari often tears
        // down the popup before AUTHORIZE_TAB can run).
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) {
          maybeCapture(tab.url, tab.id);
          if (settled) {
            return;
          }
        }
      } catch {
        // Tab closed or unavailable.
      }
    };

    const onUpdated = (
      updatedTabId: number,
      changeInfo: { url?: string; status?: string },
    ) => {
      maybeCapture(changeInfo.url, updatedTabId);
      if (changeInfo.status === "loading" || changeInfo.status === "complete") {
        void pollTabUrl();
      }
    };

    const onBeforeNav = (details: {
      tabId: number;
      url: string;
      frameId: number;
    }) => {
      if (details.frameId !== 0) {
        return;
      }

      maybeCapture(details.url, details.tabId);
    };

    const onNavUrl = (details: {
      tabId: number;
      url?: string;
      frameId?: number;
    }) => {
      if (details.frameId !== undefined && details.frameId !== 0) {
        return;
      }

      maybeCapture(details.url, details.tabId);
    };

    const onRemoved = (removedTabId: number) => {
      if (removedTabId === tabId) {
        finish(new Error("OIDC sign-in cancelled"));
      }
    };

    const timer = setTimeout(() => {
      finish(new Error("Sign-in timed out"));
    }, TAB_AUTH_TIMEOUT_MS);

    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    try {
      browser.webNavigation?.onBeforeNavigate?.addListener(onBeforeNav);
      browser.webNavigation?.onCommitted?.addListener(onNavUrl);
      browser.webNavigation?.onErrorOccurred?.addListener(onNavUrl);
    } catch {
      // Fall back to tabs polling.
    }

    pollTimers.push(
      setInterval(() => {
        void pollTabUrl();
      }, 400),
    );

    const openOrNavigate = async () => {
      // Popup already opened (or will open) the authorize tab — only listen/poll.
      if (alreadyNavigated) {
        void pollTabUrl();

        return;
      }

      if (tabId !== undefined) {
        await browser.tabs.update(tabId, {
          url: authorizeUrl,
          active: true,
        });
        void pollTabUrl();

        return;
      }

      const tab = await browser.tabs.create({
        url: authorizeUrl,
        active: true,
      });
      tabId = tab.id;
      if (tabId === undefined) {
        throw new Error("OIDC sign-in failed to open a tab");
      }
    };

    void openOrNavigate().catch((error: unknown) => {
      finish(
        error instanceof Error
          ? error
          : new Error("OIDC sign-in failed to open a tab"),
      );
    });
  });
}

async function launchAuthorizeRedirect(
  authorizeUrl: string,
  redirectUri: string,
  interactive: boolean,
  existingTabId?: number,
): Promise<string> {
  if (shouldUseTabAuthFlow() || existingTabId !== undefined) {
    if (!interactive) {
      // Silent renewal needs identity's non-interactive window; tab flow is
      // always user-visible. Caller (signInSilently) treats this as "need human".
      throw new Error("Silent OIDC not supported with tab auth flow");
    }

    return launchAuthViaTab(authorizeUrl, redirectUri, existingTabId);
  }

  const redirectUrl = await browser.identity.launchWebAuthFlow({
    url: authorizeUrl,
    interactive,
  });
  if (!redirectUrl) {
    throw new Error("OIDC sign-in cancelled");
  }

  return redirectUrl;
}

/**
 * One Authorization-Code + PKCE round trip; stores the resulting tokens.
 *
 * `interactive: false` reuses the portal's existing browser session without
 * showing UI — the portal either redirects straight back with a code or errors
 * immediately. That is what makes a silent id_token renewal possible; see
 * signInSilently. Safari uses a tab-based flow and does not support silent
 * renewal this way.
 */
async function exchangeAuthorizationCode(
  config: OidcConfig,
  prepared: PreparedAuthorize,
  redirectUrl: string,
): Promise<OidcTokens> {
  const parsed = parseRedirect(redirectUrl);
  if (parsed.error) {
    throw new Error(`OIDC authorize error: ${parsed.error}`);
  }

  if (parsed.state !== prepared.state) {
    throw new Error("OIDC state mismatch");
  }

  if (!parsed.code) {
    throw new Error("OIDC authorize returned no code");
  }

  const tokens = await postToken(prepared.tokenEndpoint, {
    grant_type: "authorization_code",
    code: parsed.code,
    redirect_uri: prepared.redirectUri,
    client_id: config.clientId,
    code_verifier: prepared.verifier,
  });
  await saveTokens(tokens);

  return tokens;
}

async function runAuthCodeFlow(
  config: OidcConfig,
  interactive: boolean,
  existingTabId?: number,
): Promise<OidcTokens> {
  // Prefer issuer-derived endpoints so we can open/navigate the authorize URL
  // before any network round-trip (Safari was stuck on the Portal store while
  // discovery hung). Fall back to discovery if the convention POST fails later.
  const prepared = await prepareAuthorizeRequest(
    config,
    interactive ? { prompt: "select_account" } : undefined,
  );

  const redirectUrl = await launchAuthorizeRedirect(
    prepared.authorizeUrl,
    prepared.redirectUri,
    interactive,
    existingTabId,
  );

  return exchangeAuthorizationCode(config, prepared, redirectUrl);
}

/**
 * Finish a tab sign-in when the popup owns opening `prepared.authorizeUrl`.
 * `tabId` may be omitted — we poll every tab for the callback (Safari often
 * destroys the popup before it can send the tab id).
 *
 * Persists `prepared` so a content-script / webNavigation callback can still
 * complete the exchange if the in-memory tab listener was lost (common when
 * Safari tears down extension pages during the authorize tab).
 */
export async function completeTabSignIn(
  config: OidcConfig,
  prepared: PreparedAuthorize,
  tabId?: number,
): Promise<OidcTokens> {
  await savePendingAuth(prepared);

  const viaTab = launchAuthViaTab(
    prepared.authorizeUrl,
    prepared.redirectUri,
    tabId,
    { alreadyNavigated: true },
  ).then((redirectUrl) => finishOidcCallback(config, redirectUrl));

  // Fallback: content script exchanged while no capture sink was registered.
  const viaStorage = new Promise<OidcTokens>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      void (async () => {
        if (Date.now() - started > TAB_AUTH_TIMEOUT_MS) {
          clearInterval(timer);
          reject(new Error("Sign-in timed out"));

          return;
        }

        const pending = await loadPendingAuth();
        if (pending) {
          return;
        }

        const tokens = await loadTokens();
        if (tokens) {
          clearInterval(timer);
          resolve(tokens);
        }
      })();
    }, 300);
  });

  const tokens = await Promise.race([viaTab, viaStorage]);
  if (!tokens) {
    throw new Error("OIDC sign-in failed");
  }

  return tokens;
}

/**
 * Interactive sign-in: PKCE + auth window/tab + code exchange; stores tokens.
 * Pass `prepared` when the popup builds the authorize URL and opens the tab
 * (Safari). `tabId` is optional.
 */
export async function signIn(
  config: OidcConfig,
  opts?: { tabId?: number; prepared?: PreparedAuthorize },
): Promise<OidcTokens> {
  if (opts?.prepared) {
    return completeTabSignIn(config, opts.prepared, opts.tabId);
  }

  return runAuthCodeFlow(config, true, opts?.tabId);
}

/**
 * Try to renew the session without user interaction, returning null if that
 * needs a human.
 *
 * This exists because the refresh grant does not reissue an `id_token`, and the
 * id_token — not the opaque access_token — is the Bearer CI-Server accepts. So
 * a long-lived refresh token cannot by itself keep capture working: once the
 * id_token expires, every capture guard silently no-ops until someone opens the
 * popup and clicks sign in. A non-interactive auth-code round trip against the
 * portal's still-valid browser session mints a fresh id_token with no UI.
 *
 * Fails (returns null) when the portal session has also expired or the portal
 * wants consent — exactly the cases that genuinely require the user.
 */
export async function signInSilently(
  config: OidcConfig,
): Promise<OidcTokens | null> {
  try {
    return await runAuthCodeFlow(config, false);
  } catch (error) {
    console.debug(
      "Silent OIDC renewal failed; interactive sign-in needed:",
      error,
    );

    return null;
  }
}

/** Refresh with the stored refresh_token; stores + returns the new tokens. */
export async function refresh(config: OidcConfig): Promise<OidcTokens> {
  const current = await loadTokens();
  if (!current?.refresh_token) {
    throw new Error("No refresh token");
  }

  const { token_endpoint } = await discover(config.issuer);
  const tokens = await postToken(token_endpoint, {
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
    client_id: config.clientId,
  });
  // better-auth may not rotate the refresh token — keep the old one if absent.
  if (!tokens.refresh_token) {
    tokens.refresh_token = current.refresh_token;
  }

  await saveTokens(tokens);

  return tokens;
}

/**
 * Return a valid access token, refreshing when within `skewMs` of expiry.
 * Returns null when there is no usable session (caller prompts sign-in).
 */
export async function getAccessToken(
  config: OidcConfig,
  skewMs = 60_000,
): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) {
    return null;
  }

  if (tokens.expires_at - skewMs > Date.now()) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    return null;
  }

  try {
    return (await refresh(config)).access_token;
  } catch {
    return null;
  }
}

/** `exp` (epoch seconds) from a JWT payload, or null if unparseable. */
function jwtExp(jwt: string): number | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part.padEnd(
      part.length + ((4 - (part.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(atob(padded)) as { exp?: number };

    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Return the OIDC **id_token** — the JWKS-signed JWT (aud === client_id) to
 * forward to CI-Server as the Bearer for its `/api/v1/*` routes. The OAuth access_token is
 * an opaque random string and cannot pass CI-Server's `jwtVerify`, so this — not
 * getAccessToken — is the token to send to CI-Server.
 *
 * The refresh grant does not reissue an id_token, so once it expires this returns
 * null (the caller prompts a re-sign-in) rather than a token CI-Server rejects.
 */
export async function getIdToken(
  config: OidcConfig,
  skewMs = 60_000,
): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens?.id_token) {
    return null;
  }

  const exp = jwtExp(tokens.id_token);
  if (exp === null || exp * 1000 - skewMs > Date.now()) {
    return tokens.id_token;
  }

  if (!tokens.refresh_token) {
    return null;
  }

  try {
    return (await refresh(config)).id_token ?? null;
  } catch {
    return null;
  }
}

/** Sign out (RP-side): drop the stored tokens. */
export async function signOut(): Promise<void> {
  await clearTokens();
}
