/**
 * CI-Portal OIDC client configuration for the browser extension.
 *
 * Phase 3 of the unified identity pipeline: the extension authenticates against
 * CI-Portal (the platform IdP) as the public PKCE client `ci-browser-extension`.
 * The issuer is normally the same server the user configured as their CI-Server
 * URL (prod: https://hub.ci.computer, whose better-auth mount is `/api/auth`),
 * but an explicit `portalIssuer` setting overrides it when the portal and server
 * live on different hosts.
 */

import type { OidcConfig } from "./oidcAuth";

/** Public PKCE client id registered in CI-Portal (#356). */
export const OIDC_CLIENT_ID = "ci-browser-extension";

/** `offline_access` requests a refresh token so the alarm can refresh silently. */
export const OIDC_SCOPES = "openid profile email offline_access";

/** Prod CI-Portal issuer (better-auth is mounted under `/api/auth`). */
export const DEFAULT_PORTAL_ISSUER = "https://hub.ci.computer/api/auth";

/**
 * Derive the portal issuer from the configured CI-Server URL. The stored
 * serverURL always includes a protocol (see utils.normalizeServerUrl); only
 * trailing slashes need stripping before the mount path is appended.
 */
export function deriveIssuer(serverURL: string): string {
  return `${serverURL.replace(/\/+$/, "")}/api/auth`;
}

/**
 * Resolve the OIDC issuer: an explicit portal-issuer setting wins; otherwise
 * derive it from the configured server URL; otherwise fall back to prod.
 */
export function resolvePortalIssuer(opts: {
  serverURL?: string | null;
  portalIssuer?: string | null;
}): string {
  const explicit = opts.portalIssuer?.trim();
  if (explicit) {
    return explicit;
  }

  const serverURL = opts.serverURL?.trim();

  return serverURL ? deriveIssuer(serverURL) : DEFAULT_PORTAL_ISSUER;
}

/** Full OIDC client config for the extension's portal session. */
export function portalOidcConfig(opts: {
  serverURL?: string | null;
  portalIssuer?: string | null;
}): OidcConfig {
  return {
    issuer: resolvePortalIssuer(opts),
    clientId: OIDC_CLIENT_ID,
    scopes: OIDC_SCOPES,
  };
}
