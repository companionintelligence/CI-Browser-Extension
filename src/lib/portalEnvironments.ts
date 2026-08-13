// Curated CI-Portal deployments for the PortalUrl setting. Production is the
// default; the rest exist for development against non-prod stacks. A custom
// URL (self-hosted portal) is always allowed via free-text entry.

export interface PortalEnvironment {
  id: string;
  label: string;
  url: string;
}

export const PORTAL_ENVIRONMENTS: PortalEnvironment[] = [
  { id: "prod", label: "Production", url: "https://hub.ci.computer" },
  { id: "staging", label: "Staging", url: "https://hub.companionintel.com" },
  {
    id: "dev",
    label: "Development",
    url: "https://hub.companionintelligence.com",
  },
  { id: "local", label: "Local", url: "https://hub.ci.localhost" },
];

/** Sentinel Select value for a free-text portal URL. */
export const CUSTOM_PORTAL_ID = "custom";

/** The preset matching a stored portal URL, or undefined for custom URLs. */
export function portalEnvironmentForUrl(
  url: string,
): PortalEnvironment | undefined {
  const normalized = url.replace(/\/+$/, "");

  return PORTAL_ENVIRONMENTS.find((env) => env.url === normalized);
}
