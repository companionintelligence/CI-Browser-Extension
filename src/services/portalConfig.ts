/**
 * CI-Portal OIDC client configuration for the browser extension.
 *
 * Phase 3 of the unified identity pipeline: the extension authenticates against
 * CI-Portal (the platform IdP) as the public PKCE client `ci-browser-extension`.
 * The issuer is derived from the configured Portal URL (prod:
 * https://hub.ci.computer, whose better-auth mount is `/api/auth`); a legacy
 * `portalIssuer` setting still overrides it when present in storage.
 */

import type { OidcConfig } from "./oidcAuth";

/** Public PKCE client id registered in CI-Portal (#356). */
export const OIDC_CLIENT_ID = "ci-browser-extension";

/** `offline_access` requests a refresh token so the alarm can refresh silently. */
export const OIDC_SCOPES = "openid profile email offline_access";

/** Prod CI-Portal origin; the default for the PortalUrl setting. */
export const DEFAULT_PORTAL_URL = "https://hub.ci.computer";

/** Prod CI-Portal issuer (better-auth is mounted under `/api/auth`). */
export const DEFAULT_PORTAL_ISSUER = `${DEFAULT_PORTAL_URL}/api/auth`;

/**
 * Derive the OIDC issuer from a Portal URL. The stored portalUrl always
 * includes a protocol (see utils.normalizeServerUrl); only trailing slashes
 * need stripping before the mount path is appended.
 */
export function issuerFromPortalUrl(portalUrl: string): string {
  return `${portalUrl.replace(/\/+$/, "")}/api/auth`;
}

/**
 * Resolve the OIDC issuer: a legacy explicit portal-issuer setting wins;
 * otherwise derive it from the configured Portal URL; otherwise fall back to
 * prod.
 */
export function resolvePortalIssuer(opts: {
  portalUrl?: string | null;
  portalIssuer?: string | null;
}): string {
  const explicit = opts.portalIssuer?.trim();
  if (explicit) {
    return explicit;
  }

  const portalUrl = opts.portalUrl?.trim();

  return portalUrl ? issuerFromPortalUrl(portalUrl) : DEFAULT_PORTAL_ISSUER;
}

/** Full OIDC client config for the extension's portal session. */
export function portalOidcConfig(opts: {
  portalUrl?: string | null;
  portalIssuer?: string | null;
}): OidcConfig {
  return {
    issuer: resolvePortalIssuer(opts),
    clientId: OIDC_CLIENT_ID,
    scopes: OIDC_SCOPES,
  };
}
