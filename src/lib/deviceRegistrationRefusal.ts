/**
 * A Memory that refuses this session's token on device registration (HTTP 401
 * or 403) refuses it again on every auth check, so automatic setup waits until
 * the session changes. The refusal is kept in storage, not memory, because the
 * MV3 service worker restarts about once a minute. Only a SHA-256 digest of the
 * token is stored.
 */

const REFUSAL_KEY = "deviceRegistrationRefusal";

interface Refusal {
  serverURL: string;
  tokenDigest: string;
}

export function isRegistrationRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /\(HTTP 40[13]\)/.test(message);
}

async function digest(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function recordRegistrationRefusal(
  serverURL: string,
  token: string,
): Promise<void> {
  const refusal: Refusal = { serverURL, tokenDigest: await digest(token) };

  await browser.storage.local.set({ [REFUSAL_KEY]: refusal });
}

export async function isRegistrationRefused(
  serverURL: string,
  token: string,
): Promise<boolean> {
  const stored = await browser.storage.local.get(REFUSAL_KEY);
  const refusal = stored[REFUSAL_KEY] as Refusal | undefined;

  if (!refusal) {
    return false;
  }

  return (
    refusal.serverURL === serverURL &&
    refusal.tokenDigest === (await digest(token))
  );
}

export async function clearRegistrationRefusal(): Promise<void> {
  await browser.storage.local.remove(REFUSAL_KEY);
}
