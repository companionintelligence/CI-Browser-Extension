/**
 * Curated list of known CI-Server environments the user can pick during
 * setup. The `custom` entry is implicit — anything not matching one of
 * these IDs is treated as a user-provided domain.
 *
 * See planning/03-configurable-server.md.
 */

export type EnvironmentId = "prod" | "alpha" | "dev" | "local" | "custom";

export interface Environment {
  id: EnvironmentId;
  label: string;
  description: string;
  domain: string;
}

export const ENVIRONMENTS: ReadonlyArray<Environment> = [
  {
    id: "prod",
    label: "Companion Intelligence (Production)",
    description: "The production CI-Server",
    domain: "app.companionintel.com",
  },
  {
    id: "alpha",
    label: "Alpha / Demo",
    description: "Public alpha environment",
    domain: "alpha.companionintel.com",
  },
  {
    id: "dev",
    label: "Development",
    description: "Internal development server",
    domain: "dev.companionintelligence.com",
  },
  {
    id: "local",
    label: "Local (https://localhost)",
    description:
      "A CI-Server running on this machine. Requires the nginx cert in dev mode.",
    domain: "localhost",
  },
];

export function findEnvironmentById(
  id: string | null | undefined,
): Environment | undefined {
  if (!id) {
    return undefined;
  }

  return ENVIRONMENTS.find((e) => e.id === id);
}

export interface HealthResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  version?: string;
  error?: string;
}

/**
 * Lightweight probe — fetches `/api/health` (or `/`) and reports timing.
 * Used by the setup wizard before accepting a domain. CORS must allow
 * the extension origin or this will fail; that's the desired signal.
 */
export async function probeServer(domain: string): Promise<HealthResult> {
  const start = performance.now();
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(`https://${domain}/api/health`, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Math.round(performance.now() - start),
      version: res.headers.get("x-ci-version") ?? undefined,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
