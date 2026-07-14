/**
 * CI-Portal OIDC Authorization-Code + PKCE for the browser extension.
 *
 * Phase 3 of the unified identity pipeline: replaces the legacy cookie/CSRF/
 * refresh flow with a standard public-client OIDC flow against CI-Portal. The
 * extension is registered as the `ci-browser-extension` public PKCE client
 * (CI-Portal #356); the redirect is `browser.identity.getRedirectURL()`
 * (`https://<extension-id>.chromiumapp.org/`, allowed by the portal redirect
 * allowlist). The **id_token** (getIdToken) — not the opaque OAuth access_token —
 * is the Bearer the extension sends to CI-Server's `/v1/events` (which validates
 * the JWKS-signed portal JWT after CI-Server #1473).
 *
 * Pure helpers (PKCE, authorize-URL, redirect parsing, token-request body) are
 * separated from the `browser`/network flow so they unit-test without a browser.
 */

const STORAGE_KEY = "oidcTokens";

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
  });
  if (!res.ok) {
    throw new Error(`OIDC token request failed: HTTP ${res.status}`);
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

/** Interactive sign-in: PKCE + launchWebAuthFlow + code exchange; stores tokens. */
export async function signIn(config: OidcConfig): Promise<OidcTokens> {
  const { authorization_endpoint, token_endpoint } = await discover(
    config.issuer,
  );
  const verifier = randomString(32);
  const challenge = await pkceChallenge(verifier);
  const state = randomString(16);
  const redirectUri = browser.identity.getRedirectURL();

  const authorizeUrl = buildAuthorizeUrl(authorization_endpoint, {
    clientId: config.clientId,
    redirectUri,
    scopes: config.scopes,
    state,
    codeChallenge: challenge,
  });

  const redirectUrl = await browser.identity.launchWebAuthFlow({
    url: authorizeUrl,
    interactive: true,
  });
  if (!redirectUrl) {
    throw new Error("OIDC sign-in cancelled");
  }

  const parsed = parseRedirect(redirectUrl);
  if (parsed.error) {
    throw new Error(`OIDC authorize error: ${parsed.error}`);
  }

  if (parsed.state !== state) {
    throw new Error("OIDC state mismatch");
  }

  if (!parsed.code) {
    throw new Error("OIDC authorize returned no code");
  }

  const tokens = await postToken(token_endpoint, {
    grant_type: "authorization_code",
    code: parsed.code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
  await saveTokens(tokens);

  return tokens;
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
 * forward to CI-Server as the Bearer for `/v1/events`. The OAuth access_token is
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
