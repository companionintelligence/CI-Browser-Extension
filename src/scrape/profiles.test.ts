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

  /**
   * Two selectors in one profile that share a container match the SAME elements,
   * and every selector runs on every matched page — so each shared element is
   * captured twice, under two names. Since source ids are scoped per selector,
   * both land as separate rows rather than deduping.
   *
   * airbnb is the worst case: `wishlist` and `hosting` share a container but
   * carry DIFFERENT personalDataTypes, so a saved listing is filed as both a
   * travel preference and business activity.
   *
   * These four are pre-existing and are pinned rather than fixed, because
   * making the containers disjoint needs the real page markup to verify against
   * and guessing would risk breaking a selector that works. The point of the
   * test is that a NEW overlap fails immediately.
   */
  it("has no container overlap beyond the four known cases", () => {
    const overlaps: string[] = [];

    for (const profile of SCRAPE_PROFILES) {
      const entries = Object.entries(profile.dataSelectors).map(
        ([name, config]) =>
          [
            name,
            new Set(config.container.split(",").map((s) => s.trim())),
          ] as const,
      );

      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const [aName, a] = entries[i];
          const [bName, b] = entries[j];
          if ([...a].some((sel) => b.has(sel))) {
            overlaps.push(`${profile.domain}:${aName}+${bName}`);
          }
        }
      }
    }

    expect(overlaps.sort()).toEqual([
      "airbnb.com:wishlist+hosting",
      "disneyplus.com:watchlist+recommendations",
      "netflix.com:watchlist+recommendations",
      "primevideo.com:watchlist+recommendations",
    ]);
  });
});
