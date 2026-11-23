import { SCRAPE_MATCH_PATTERNS } from "@/scrape/profiles";
import { extract, profileForUrl } from "@/scrape/scraper";
import { waitForSettled } from "@/scrape/readiness";
import { mayRunProfile, readScrapeConsent } from "@/lib/scrapeSettings";

/** How long a profile's `readySelector` may take to appear, unless it sets its own. */
const DEFAULT_READY_TIMEOUT_MS = 8_000;

/** The match count must hold still this long before the page counts as drawn. */
const READY_SETTLE_MS = 500;

export default defineContentScript({
  // Derived from the profile registry rather than hand-maintained. The two used
  // to be separate lists that drifted: five registered profiles (cnn, wsj,
  // quora, robinhood, airbnb) were missing from this array and could never run.
  matches: SCRAPE_MATCH_PATTERNS,
  main() {
    async function performScraping() {
      const currentUrl = window.location.href;
      const profile = profileForUrl(currentUrl);

      if (!profile) {
        return;
      }

      // Check BEFORE the page is read: the point of the gate is not to read
      // consent-gated data, not to read it and drop it afterwards. A profile that
      // declares no categories skips the storage read entirely, so it runs as it
      // always has.
      const consent = profile.dataCategories?.length
        ? await readScrapeConsent()
        : {};
      if (!mayRunProfile(profile, consent)) {
        return;
      }

      // A single-page app draws its content after load. Reading earlier sees an
      // empty shell and records nothing, so wait for the content first.
      if (profile.readySelector) {
        const ready = await waitForSettled(document, profile.readySelector, {
          timeoutMs: profile.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
          settleMs: READY_SETTLE_MS,
        });
        if (!ready) {
          console.warn(
            `[CI] ${profile.name}: ${profile.readySelector} never appeared, so nothing was captured.`,
          );

          return;
        }
      }

      const { result, diagnostics } = extract(document, currentUrl, consent);
      if (!result) {
        // Counts and selector names only, never page content, so this is safe to
        // log. A silent empty result is indistinguishable from a site redesign.
        const detail =
          diagnostics
            .map(
              (d) =>
                `${d.selector}: ${d.containersMatched} matched, ${d.itemsProduced} usable`,
            )
            .join("; ") || "no selectors ran";
        console.warn(`[CI] ${profile.name}: nothing captured (${detail}).`);

        return;
      }

      // The background is the only consumer. A second copy used to be written
      // to storage.local under a unique `scrapeData_<domain>_<ts>` key on every
      // scrape — never read, never pruned. Delivery failures are handled by the
      // background's retry queue.
      browser.runtime
        .sendMessage({ action: "DOMAIN_SCRAPE_DATA", data: result })
        .catch((error) => {
          console.error("Failed to send scraped data:", error);
        });
    }

    function scheduleScraping() {
      performScraping().catch((error) => {
        console.error("Scrape failed:", error);
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", scheduleScraping);
    } else {
      scheduleScraping();
    }

    // Streaming and social sites are SPAs: the URL changes without a document
    // load, so re-scrape when it does.
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        setTimeout(scheduleScraping, 1000);
      }
    }).observe(document.body, { childList: true, subtree: true });
  },
});
