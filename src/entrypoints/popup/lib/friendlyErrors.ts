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
  // Registration is checked before the generic 401 rule: a rejected token on
  // /api/devices means the Memory won't accept this account's sign-in, which
  // is a different fix (update/configure the server) from re-authenticating.
  {
    pattern: /create device.*\b(401|403|unauthorized|forbidden)\b/i,
    friendly:
      "Your Memory rejected this account's sign-in. It may be running an older version.",
  },
  {
    pattern: /create device.*\b(404|405)\b/i,
    friendly: "Your Memory doesn't offer device registration at that address.",
  },
  {
    pattern: /create device/i,
    friendly: "Your Memory refused to register this browser.",
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
