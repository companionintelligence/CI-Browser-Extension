/**
 * Post-sign-in app discovery against CI-Portal.
 *
 * After the OIDC flow completes, the extension asks the Portal where the
 * user's Memory (CI-Server, app slug `ci-memory`) runs so serverURL can be
 * configured automatically. The endpoint is Bearer-authenticated with the
 * OAuth access_token (a Portal API — unlike CI-Server calls, which use the
 * id_token) and returns `{ apps: [{ slug, url, deviceName }] }`.
 */

import { normalizeServerUrl } from "@/utils";

export const MEMORY_APP_SLUG = "ci-memory";

const FETCH_TIMEOUT_MS = 5000;

export interface PortalApp {
  slug: string;
  url: string;
  deviceName?: string;
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
 * The Memory server URL to auto-configure, or null when the user has no
 * ci-memory app. Multiple devices can each run Memory; the Portal's response
 * order is authoritative and the first entry wins.
 */
export function selectMemoryAppUrl(apps: PortalApp[]): string | null {
  const memoryApps = apps.filter(
    (app) => app.slug === MEMORY_APP_SLUG && typeof app.url === "string",
  );

  if (memoryApps.length === 0) {
    return null;
  }

  if (memoryApps.length > 1) {
    console.log(
      "[CI] Multiple Memory apps found; using the first:",
      memoryApps.map((app) => `${app.url} (${app.deviceName ?? "unknown"})`),
    );
  }

  return normalizeServerUrl(memoryApps[0].url);
}
