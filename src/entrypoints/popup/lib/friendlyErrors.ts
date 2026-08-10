/**
 * Raw error → one plain-language line. The raw string is ALWAYS rendered
 * alongside the mapping wherever a persisted error is shown — friendliness
 * must never cost diagnosability.
 */
const MAPPINGS: { pattern: RegExp; friendly: string }[] = [
  {
    pattern: /timed? ?out|closed|cancell?ed|interaction_required/i,
    friendly: "The sign-in window was closed or timed out.",
  },
  {
    pattern: /failed to fetch|networkerror|network request|ssl|certificate/i,
    friendly: "Couldn't reach the server. Check your connection.",
  },
  {
    pattern: /401|unauthorized|invalid_grant|expired/i,
    friendly: "Your session ended. Sign in again.",
  },
  {
    pattern: /pkce|state mismatch|invalid_request/i,
    friendly: "The sign-in handshake didn't complete. Try again.",
  },
];

export function friendlyError(raw: string): string {
  for (const { pattern, friendly } of MAPPINGS) {
    if (pattern.test(raw)) {
      return friendly;
    }
  }

  return "Something went wrong. Try again.";
}
