/**
 * @jest-environment node
 */
// Node's environment provides a working WebCrypto (crypto.subtle + getRandomValues);
// jsdom's is unreliable for SHA-256, which PKCE needs.
import { webcrypto } from "node:crypto";

import {
  randomString,
  pkceChallenge,
  buildAuthorizeUrl,
  parseRedirect,
  tokenRequestBody,
  discover,
  signIn,
  getAccessToken,
  getIdToken,
  loadTokens,
  type OidcConfig,
} from "./oidcAuth";

/** Build an unsigned JWT whose payload carries the given exp (epoch seconds). */
function jwtWithExp(exp: number): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");

  return `${b64({ alg: "EdDSA", typ: "JWT" })}.${b64({ sub: "u", exp })}.sig`;
}

// jsdom does not expose WebCrypto's subtle; use Node's for SHA-256 + RNG.
if (!(globalThis.crypto && "subtle" in globalThis.crypto)) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

const CONFIG: OidcConfig = {
  issuer: "https://hub.ci.computer/api/auth",
  clientId: "ci-browser-extension",
  scopes: "openid profile email offline_access",
};

const AUTHZ = "https://hub.ci.computer/api/auth/oauth2/authorize";
const TOKEN = "https://hub.ci.computer/api/auth/oauth2/token";

const store: Record<string, unknown> = {};

function installBrowser(launch: (url: string) => string | undefined) {
  (global as { browser?: unknown }).browser = {
    identity: {
      getRedirectURL: jest.fn(() => "https://abcd.chromiumapp.org/"),
      launchWebAuthFlow: jest.fn(async ({ url }: { url: string }) =>
        launch(url),
      ),
    },
    storage: {
      local: {
        get: jest.fn(async (k: string) =>
          k in store ? { [k]: store[k] } : {},
        ),
        set: jest.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
        remove: jest.fn(async (k: string) => {
          delete store[k];
        }),
      },
    },
  };
}

/** Fetch mock: discovery doc for the well-known, tokens for the token endpoint. */
function installFetch(tokenJson: Record<string, unknown>) {
  const captured: { tokenBody?: string; tokenInit?: RequestInit } = {};
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/.well-known/openid-configuration")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          authorization_endpoint: AUTHZ,
          token_endpoint: TOKEN,
        }),
      };
    }

    if (url.includes("/oauth2/token")) {
      captured.tokenBody =
        typeof init?.body === "string" ? init.body : undefined;
      captured.tokenInit = init;

      return { ok: true, status: 200, json: async () => tokenJson };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  });
  (global as { fetch?: unknown }).fetch = fetchMock;

  return { fetchMock, captured };
}

beforeEach(() => {
  for (const k of Object.keys(store)) {
    delete store[k];
  }

  jest.restoreAllMocks();
});

describe("PKCE", () => {
  it("randomString returns a URL-safe value that varies", () => {
    const a = randomString();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(randomString());
  });

  it("pkceChallenge matches the RFC 7636 S256 test vector", async () => {
    expect(
      await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("authorize URL + redirect parsing", () => {
  it("builds the authorize URL with PKCE S256 params", () => {
    const url = new URL(
      buildAuthorizeUrl(AUTHZ, {
        clientId: "ci-browser-extension",
        redirectUri: "https://abcd.chromiumapp.org/",
        scopes: "openid email",
        state: "st-1",
        codeChallenge: "chal",
      }),
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("ci-browser-extension");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://abcd.chromiumapp.org/",
    );
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st-1");
  });

  it("parses code/state/error from the redirect", () => {
    expect(
      parseRedirect("https://abcd.chromiumapp.org/?code=C1&state=S1"),
    ).toEqual({
      code: "C1",
      state: "S1",
      error: undefined,
    });
    expect(
      parseRedirect("https://abcd.chromiumapp.org/?error=access_denied").error,
    ).toBe("access_denied");
  });

  it("tokenRequestBody form-encodes params", () => {
    expect(
      tokenRequestBody({ grant_type: "authorization_code", code: "a b" }),
    ).toBe("grant_type=authorization_code&code=a+b");
  });
});

describe("discover", () => {
  it("returns the endpoints from the well-known doc", async () => {
    installFetch({});
    const doc = await discover(CONFIG.issuer);
    expect(doc.authorization_endpoint).toBe(AUTHZ);
    expect(doc.token_endpoint).toBe(TOKEN);
  });
});

describe("signIn", () => {
  it("runs PKCE + launchWebAuthFlow + code exchange and stores tokens", async () => {
    // Echo the state back from the authorize URL so the CSRF check passes.
    installBrowser((url) => {
      const state = new URL(url).searchParams.get("state");

      return `https://abcd.chromiumapp.org/?code=AUTHCODE&state=${state}`;
    });
    const { captured } = installFetch({
      access_token: "AT",
      refresh_token: "RT",
      expires_in: 3600,
      id_token: "IT",
    });

    const tokens = await signIn(CONFIG);
    expect(tokens.access_token).toBe("AT");
    expect((await loadTokens())?.access_token).toBe("AT");

    // The exchange used the PKCE code_verifier + the returned code.
    const body = captured.tokenBody ?? "";
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=AUTHCODE");
    expect(body).toContain("code_verifier=");
    expect(body).toContain("client_id=ci-browser-extension");
  });

  it("rejects a state mismatch (CSRF guard)", async () => {
    installBrowser(
      () => "https://abcd.chromiumapp.org/?code=AUTHCODE&state=WRONG",
    );
    installFetch({ access_token: "AT", expires_in: 3600 });
    await expect(signIn(CONFIG)).rejects.toThrow(/state mismatch/);
  });

  // The extension has host permissions for the portal origins, so Chrome would
  // otherwise attach the portal session cookie to the exchange. CI-Portal's
  // better-auth only runs its trustedOrigins check on cookie-bearing requests,
  // and `chrome-extension://<id>` is not trusted — so a cookie here means 403
  // "Invalid origin". PKCE authenticates this call; nothing else may.
  it("sends no cookies on the token exchange", async () => {
    installBrowser((url) => {
      const state = new URL(url).searchParams.get("state");

      return `https://abcd.chromiumapp.org/?code=AUTHCODE&state=${state}`;
    });
    const { captured } = installFetch({ access_token: "AT", expires_in: 3600 });

    await signIn(CONFIG);
    expect(captured.tokenInit?.credentials).toBe("omit");
  });

  it("includes the response body in the token-request error", async () => {
    installBrowser((url) => {
      const state = new URL(url).searchParams.get("state");

      return `https://abcd.chromiumapp.org/?code=AUTHCODE&state=${state}`;
    });
    (global as { fetch?: unknown }).fetch = jest.fn(async (url: string) => {
      if (url.includes("/.well-known/openid-configuration")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            authorization_endpoint: AUTHZ,
            token_endpoint: TOKEN,
          }),
        };
      }

      return {
        ok: false,
        status: 403,
        text: async () => '{"message":"Invalid origin"}',
      };
    });

    await expect(signIn(CONFIG)).rejects.toThrow(/HTTP 403 — .*Invalid origin/);
  });
});

describe("getAccessToken", () => {
  it("returns the stored token while it is still valid", async () => {
    installBrowser(() => undefined);
    const { fetchMock } = installFetch({});
    store.oidcTokens = {
      access_token: "VALID",
      expires_at: Date.now() + 600_000,
    };
    expect(await getAccessToken(CONFIG)).toBe("VALID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when expired and a refresh_token is present", async () => {
    installBrowser(() => undefined);
    installFetch({
      access_token: "FRESH",
      refresh_token: "RT2",
      expires_in: 3600,
    });
    store.oidcTokens = {
      access_token: "OLD",
      refresh_token: "RT",
      expires_at: Date.now() - 1000,
    };
    expect(await getAccessToken(CONFIG)).toBe("FRESH");
  });

  it("returns null when there is no session", async () => {
    installBrowser(() => undefined);
    installFetch({});
    expect(await getAccessToken(CONFIG)).toBeNull();
  });
});

describe("getIdToken", () => {
  const now = Math.floor(Date.now() / 1000);

  it("returns the id_token (the JWKS-signed JWT) when it is unexpired", async () => {
    installBrowser(() => undefined);
    const { fetchMock } = installFetch({});
    const id = jwtWithExp(now + 3600);
    store.oidcTokens = {
      access_token: "opaque",
      id_token: id,
      expires_at: Date.now() + 600_000,
    };
    expect(await getIdToken(CONFIG)).toBe(id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when there is no id_token (e.g. a non-openid scope)", async () => {
    installBrowser(() => undefined);
    installFetch({});
    store.oidcTokens = {
      access_token: "opaque",
      expires_at: Date.now() + 600_000,
    };
    expect(await getIdToken(CONFIG)).toBeNull();
  });

  it("returns null when the id_token is expired and cannot be reissued (no refresh_token)", async () => {
    installBrowser(() => undefined);
    installFetch({});
    store.oidcTokens = {
      access_token: "opaque",
      id_token: jwtWithExp(now - 100),
      expires_at: Date.now() - 1000,
    };
    expect(await getIdToken(CONFIG)).toBeNull();
  });
});
