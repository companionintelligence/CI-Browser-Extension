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
  shouldUseTabAuthFlow,
  resolveRedirectUri,
  launchAuthViaTab,
  extensionOidcCallbackUri,
  prepareAuthorizeRequest,
  endpointsFromIssuer,
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

const SAFARI_CALLBACK = extensionOidcCallbackUri(CONFIG.issuer);

const AUTHZ = "https://hub.ci.computer/api/auth/oauth2/authorize";
const TOKEN = "https://hub.ci.computer/api/auth/oauth2/token";

const store: Record<string, unknown> = {};

function installBrowser(launch: (url: string) => string | undefined) {
  (global as { browser?: unknown }).browser = {
    runtime: {
      getURL: jest.fn(() => "chrome-extension://abcd/"),
    },
    identity: {
      getRedirectURL: jest.fn(() => "https://abcd.chromiumapp.org/"),
      launchWebAuthFlow: jest.fn(async ({ url }: { url: string }) =>
        launch(url),
      ),
    },
    tabs: {
      create: jest.fn(),
      remove: jest.fn(async () => undefined),
      onUpdated: { addListener: jest.fn(), removeListener: jest.fn() },
      onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
    },
    webNavigation: {
      onBeforeNavigate: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
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

function installSafariTabBrowser(via: "tabs" | "webNavigation" = "webNavigation") {
  type UpdatedListener = (tabId: number, changeInfo: { url?: string }) => void;
  type RemovedListener = (tabId: number) => void;
  type BeforeNavListener = (details: {
    tabId: number;
    url: string;
    frameId: number;
  }) => void;
  let onUpdated: UpdatedListener | undefined;
  let onRemoved: RemovedListener | undefined;
  let onBeforeNav: BeforeNavListener | undefined;

  (global as { browser?: unknown }).browser = {
    runtime: {
      getURL: jest.fn(() => "safari-web-extension://uuid-here/"),
    },
    // Safari: no usable identity intercept.
    identity: {},
    tabs: {
      create: jest.fn(async ({ url }: { url: string }) => {
        // Simulate Portal redirecting to the HTTPS extension callback.
        const state = new URL(url).searchParams.get("state");
        const redirect = `${SAFARI_CALLBACK}?code=AUTHCODE&state=${state}`;
        queueMicrotask(() => {
          if (via === "webNavigation") {
            onBeforeNav?.({ tabId: 42, url: redirect, frameId: 0 });
          } else {
            onUpdated?.(42, { url: redirect });
          }
        });

        return { id: 42 };
      }),
      remove: jest.fn(async () => undefined),
      onUpdated: {
        addListener: jest.fn((fn: UpdatedListener) => {
          onUpdated = fn;
        }),
        removeListener: jest.fn(),
      },
      onRemoved: {
        addListener: jest.fn((fn: RemovedListener) => {
          onRemoved = fn;
        }),
        removeListener: jest.fn(),
      },
    },
    webNavigation: {
      onBeforeNavigate: {
        addListener: jest.fn((fn: BeforeNavListener) => {
          onBeforeNav = fn;
        }),
        removeListener: jest.fn(),
      },
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
        prompt: "select_account",
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
    expect(url.searchParams.get("prompt")).toBe("select_account");
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

describe("prepareAuthorizeRequest", () => {
  it("builds authorize URL from issuer convention without network", async () => {
    installSafariTabBrowser();
    const prepared = await prepareAuthorizeRequest(CONFIG);
    expect(prepared.authorizeUrl).toContain(
      endpointsFromIssuer(CONFIG.issuer).authorization_endpoint,
    );
    expect(new URL(prepared.authorizeUrl).searchParams.get("prompt")).toBeNull();
    const withPicker = await prepareAuthorizeRequest(CONFIG, {
      prompt: "select_account",
    });
    expect(new URL(withPicker.authorizeUrl).searchParams.get("prompt")).toBe(
      "select_account",
    );
    expect(prepared.redirectUri).toBe(SAFARI_CALLBACK);
    expect(prepared.tokenEndpoint).toBe(
      endpointsFromIssuer(CONFIG.issuer).token_endpoint,
    );
    expect(prepared.verifier.length).toBeGreaterThan(10);
    expect(prepared.state.length).toBeGreaterThan(5);
  });
});

describe("Safari / tab auth flow", () => {
  it("uses the Portal HTTPS callback when identity is unavailable", () => {
    installSafariTabBrowser();
    expect(shouldUseTabAuthFlow()).toBe(true);
    expect(resolveRedirectUri(CONFIG)).toBe(SAFARI_CALLBACK);
    expect(SAFARI_CALLBACK).toBe(
      "https://hub.ci.computer/extension/oidc-callback",
    );
  });

  it("uses identity redirect when launchWebAuthFlow is present", () => {
    installBrowser(() => undefined);
    expect(shouldUseTabAuthFlow()).toBe(false);
    expect(resolveRedirectUri(CONFIG)).toBe("https://abcd.chromiumapp.org/");
  });

  it("captures the Portal callback from webNavigation.onBeforeNavigate", async () => {
    installSafariTabBrowser("webNavigation");
    const redirect = await launchAuthViaTab(`${AUTHZ}?state=st`, SAFARI_CALLBACK);
    expect(redirect).toContain("code=AUTHCODE");
    expect(redirect).toContain("state=st");
  });

  it("falls back to tabs.onUpdated when that fires first", async () => {
    installSafariTabBrowser("tabs");
    const redirect = await launchAuthViaTab(`${AUTHZ}?state=st`, SAFARI_CALLBACK);
    expect(redirect).toContain("code=AUTHCODE");
  });

  it("navigates a popup-opened tab instead of creating one", async () => {
    type BeforeNavListener = (details: {
      tabId: number;
      url: string;
      frameId: number;
    }) => void;
    let onBeforeNav: BeforeNavListener | undefined;
    const update = jest.fn(
      async (_id: number, props: { url: string }) => {
        const state = new URL(props.url).searchParams.get("state");
        queueMicrotask(() => {
          onBeforeNav?.({
            tabId: 99,
            url: `${SAFARI_CALLBACK}?code=AUTHCODE&state=${state}`,
            frameId: 0,
          });
        });

        return { id: 99 };
      },
    );
    (global as { browser?: unknown }).browser = {
      runtime: {
        getURL: jest.fn(() => "safari-web-extension://uuid-here/"),
      },
      identity: {},
      tabs: {
        create: jest.fn(async () => {
          throw new Error("should not create");
        }),
        update,
        remove: jest.fn(async () => undefined),
        onUpdated: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
        onRemoved: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      },
      webNavigation: {
        onBeforeNavigate: {
          addListener: jest.fn((fn: BeforeNavListener) => {
            onBeforeNav = fn;
          }),
          removeListener: jest.fn(),
        },
      },
      storage: {
        local: {
          get: jest.fn(async () => ({})),
          set: jest.fn(async () => undefined),
          remove: jest.fn(async () => undefined),
        },
      },
    };

    const redirect = await launchAuthViaTab(
      `${AUTHZ}?state=st`,
      SAFARI_CALLBACK,
      99,
    );
    expect(update).toHaveBeenCalled();
    expect(redirect).toContain("code=AUTHCODE");
  });

  it("runs PKCE + tab redirect + code exchange on Safari", async () => {
    installSafariTabBrowser();
    const { captured } = installFetch({
      access_token: "AT",
      refresh_token: "RT",
      expires_in: 3600,
      id_token: "IT",
    });

    const tokens = await signIn(CONFIG);
    expect(tokens.access_token).toBe("AT");
    const params = new URLSearchParams(captured.tokenBody ?? "");
    expect(params.get("redirect_uri")).toBe(SAFARI_CALLBACK);
    expect(params.get("code")).toBe("AUTHCODE");
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
