/**
 * Post-sign-in app discovery against CI-Portal.
 *
 * After the OIDC flow completes, the extension asks the Portal where the
 * user's Memory (CI-Server, app slug `ci-memory`) runs so serverURL can be
 * configured automatically. The endpoint is Bearer-authenticated with the
 * OAuth access_token (a Portal API — unlike CI-Server calls, which use the
 * id_token) and returns `{ apps: [{ slug, url, deviceName, deviceSlug }] }`.
 */

import { normalizeServerUrl } from "@/utils";

export const MEMORY_APP_SLUG = "ci-memory";

/**
 * Discovery hint for an account with zero `ci-memory` apps — the popup keys a
 * dedicated "No Memory found" panel off this exact value, so keep it in sync.
 */
export const NO_MEMORY_HINT = "No Memory on this account.";

const FETCH_TIMEOUT_MS = 5000;

export interface PortalApp {
  slug: string;
  url: string;
  deviceName?: string;
  // One Memory per device: the owning device's slug (Portal ≥ #449). Stable
  // identity for telling several Memories apart when deviceName is missing.
  deviceSlug?: string;
}

export type PortalAppsResult =
  | { status: "ok"; apps: PortalApp[] }
  // 404/405: a Portal predating /api/users/me/apps. Callers fall back to
  // manual serverURL entry.
  | { status: "unsupported" }
  | { status: "unauthorized" }
  | { status: "error"; error: string };

export function meAppsUrl(portalUrl: string, slug: string): string {
  const base = portalUrl.replace(/\/+$/, "");

  return `${base}/api/users/me/apps?slug=${encodeURIComponent(slug)}`;
}

export async function fetchPortalApps(
  portalUrl: string,
  accessToken: string,
  slug: string = MEMORY_APP_SLUG,
): Promise<PortalAppsResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(meAppsUrl(portalUrl, slug), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });

    if (response.status === 404 || response.status === 405) {
      return { status: "unsupported" };
    }

    if (response.status === 401 || response.status === 403) {
      return { status: "unauthorized" };
    }

    if (!response.ok) {
      return { status: "error", error: `HTTP ${response.status}` };
    }

    const body = (await response.json()) as { apps?: PortalApp[] };
    const apps = Array.isArray(body?.apps) ? body.apps : [];

    return { status: "ok", apps };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The user's Memory candidates: normalized URLs, deduplicated by URL. One
 * entry → auto-configure it; several (Memory installed on more than one
 * device) → the popup asks the user which to use.
 *
 * No slug re-filter here: the Portal already matched `?slug=ci-memory` and —
 * since CI-Portal matches the canonical app *name* too — a returned instance
 * may carry a user-chosen slug like `ci-memory2` (the Hub install form's
 * exposure subdomain). Re-checking for the exact slug dropped those.
 */
export function memoryAppsFrom(apps: PortalApp[]): PortalApp[] {
  const seen = new Set<string>();
  const memoryApps: PortalApp[] = [];

  for (const app of apps) {
    if (typeof app.url !== "string") {
      continue;
    }

    const url = normalizeServerUrl(app.url);

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    memoryApps.push({ ...app, url });
  }

  return memoryApps;
}
