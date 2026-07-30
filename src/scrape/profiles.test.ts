import {
  SCRAPE_MATCH_PATTERNS,
  SCRAPE_PROFILES,
  profileForDomain,
  registrableDomain,
} from "./profiles";

/**
 * Compile a manifest match pattern (`*://*.netflix.com/*`) to a RegExp, so the
 * invariant below can check patterns against real URLs the way the browser will.
 */
function matchPatternToRegExp(pattern: string): RegExp {
  const m = /^(\*|https?):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/.exec(pattern);
  if (!m) {
    throw new Error(`Unparseable match pattern: ${pattern}`);
  }

  const [, scheme, host, path] = m;
  const schemeRe = scheme === "*" ? "https?" : scheme;
  const hostRe = host.startsWith("*.")
    ? // "*.example.com" matches the bare domain AND any subdomain
      `(?:[^/]+\\.)?${host.slice(2).replace(/\./g, "\\.")}`
    : host === "*"
      ? "[^/]+"
      : host.replace(/\./g, "\\.");
  const pathRe = path
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${schemeRe}://${hostRe}${pathRe}$`);
}

describe("registrableDomain", () => {
  it("strips a leading www. and lowercases", () => {
    expect(registrableDomain("https://www.Netflix.com/browse")).toBe(
      "netflix.com",
    );
  });

  // The old implementation used `hostname.replace("www.", "")` — an unanchored
  // substring replace that mangled any host merely containing "www.".
  it("only strips www. at the start", () => {
    expect(registrableDomain("https://api.www.example.com/x")).toBe(
      "api.www.example.com",
    );
  });

  it("returns null for a non-URL", () => {
    expect(registrableDomain("not a url")).toBeNull();
  });
});

describe("profileForDomain", () => {
  it("resolves the bare domain", () => {
    expect(profileForDomain("https://netflix.com/browse")?.domain).toBe(
      "netflix.com",
    );
  });

  it("resolves subdomains to the same profile", () => {
    expect(profileForDomain("https://www.netflix.com/browse")?.domain).toBe(
      "netflix.com",
    );
    expect(profileForDomain("https://open.max.com/show")?.domain).toBe(
      "max.com",
    );
  });

  it("does not match a domain that merely ends with the same text", () => {
    expect(profileForDomain("https://notnetflix.com/x")).toBeUndefined();
    expect(profileForDomain("https://example.com/x")).toBeUndefined();
  });
});

describe("profile registry invariants", () => {
  it("registers every profile that ships", () => {
    // Guards against the JSON file existing but never being added to the
    // registry — half of the original bug.
    expect(SCRAPE_PROFILES.length).toBe(13);
  });

  it("gives every profile at least one match pattern and one selector", () => {
    for (const profile of SCRAPE_PROFILES) {
      expect(profile.matchPatterns.length).toBeGreaterThan(0);
      expect(Object.keys(profile.dataSelectors).length).toBeGreaterThan(0);
    }
  });

  it("classifies every selector with a personalDataType", () => {
    // This is what makes a scrape routable to a typed content row instead of an
    // anonymous page view.
    for (const profile of SCRAPE_PROFILES) {
      for (const [name, config] of Object.entries(profile.dataSelectors)) {
        expect(`${profile.domain}.${name}: ${config.personalDataType}`).toMatch(
          /: .+$/,
        );
        expect(config.personalDataType.trim().length).toBeGreaterThan(0);
      }
    }
  });

  // THE regression guard. cnn, wsj, quora, robinhood and airbnb were all
  // registered profiles whose domains were absent from the content script's
  // hand-maintained `matches`, so they could never run. Now that `matches` is
  // derived from these patterns, this asserts the derivation is actually
  // capable of reaching each profile's own target pages.
  it("can reach every profile's target URLs from its own match patterns", () => {
    for (const profile of SCRAPE_PROFILES) {
      const regexes = profile.matchPatterns.map(matchPatternToRegExp);
      const targets = Array.isArray(profile.targetUrl)
        ? profile.targetUrl
        : [profile.targetUrl];

      for (const target of targets) {
        // Turn the targetUrl glob into a concrete URL the profile expects to
        // run on: a wildcard in host position stands for a subdomain, and the
        // trailing path wildcard just drops.
        const concrete = target
          .replace(/:\/\/\*\./, "://sub.")
          .replace(/\*/g, "");
        const reachable = regexes.some((re) => re.test(concrete));

        expect(`${profile.domain} → ${concrete}: ${reachable}`).toBe(
          `${profile.domain} → ${concrete}: true`,
        );
      }
    }
  });

  it("exposes deduped, sorted match patterns for the manifest", () => {
    expect(SCRAPE_MATCH_PATTERNS).toEqual([...SCRAPE_MATCH_PATTERNS].sort());
    expect(new Set(SCRAPE_MATCH_PATTERNS).size).toBe(
      SCRAPE_MATCH_PATTERNS.length,
    );
    expect(SCRAPE_MATCH_PATTERNS).toContain("*://*.robinhood.com/*");
    expect(SCRAPE_MATCH_PATTERNS).toContain("*://*.cnn.com/*");
  });

  it("marks the brokerage profile sensitive and nothing else", () => {
    const sensitive = SCRAPE_PROFILES.filter((p) => p.sensitive).map(
      (p) => p.domain,
    );
    expect(sensitive).toEqual(["robinhood.com"]);
  });
});
