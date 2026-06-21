/**
 * CI-Portal OIDC client configuration for the browser extension.
 *
 * Phase 3 of the unified identity pipeline: the extension authenticates against
 * CI-Portal (the platform IdP) as the public PKCE client `ci-browser-extension`.
 * The issuer is normally the same host the user configured as their CI-Server
 * domain (prod: hub.ci.computer, whose better-auth mount is `/api/auth`), but an
 * explicit `portalIssuer` setting overrides it when the portal and server live
 * on different hosts.
 */

import type { OidcConfig } from "./oidcAuth";

/** Public PKCE client id registered in CI-Portal (#356). */
export const OIDC_CLIENT_ID = "ci-browser-extension";

/** `offline_access` requests a refresh token so the alarm can refresh silently. */
export const OIDC_SCOPES = "openid profile email offline_access";

/** Prod CI-Portal issuer (better-auth is mounted under `/api/auth`). */
export const DEFAULT_PORTAL_ISSUER = "https://hub.ci.computer/api/auth";

/** Bare host from a stored domain or URL (no protocol, no trailing slash). */
function host(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** Derive the portal issuer from the configured CI-Server domain. */
export function deriveIssuer(serverDomain: string): string {
  return `https://${host(serverDomain)}/api/auth`;
}

/**
 * Resolve the OIDC issuer: an explicit portal-issuer setting wins; otherwise
 * derive it from the configured server domain; otherwise fall back to prod.
 */
export function resolvePortalIssuer(opts: {
  serverDomain?: string | null;
  portalIssuer?: string | null;
}): string {
  const explicit = opts.portalIssuer?.trim();
  if (explicit) {
    return explicit;
  }

  const domain = opts.serverDomain?.trim();

  return domain ? deriveIssuer(domain) : DEFAULT_PORTAL_ISSUER;
}

/** Full OIDC client config for the extension's portal session. */
export function portalOidcConfig(opts: {
  serverDomain?: string | null;
  portalIssuer?: string | null;
}): OidcConfig {
  return {
    issuer: resolvePortalIssuer(opts),
    clientId: OIDC_CLIENT_ID,
    scopes: OIDC_SCOPES,
  };
}
