# Scrape profile fixtures

A fixture is a saved copy of a page a profile runs on, plus the extraction we
expect from it. Every profile in the registry must have one, and the test suite
fails if any is missing.

## What a fixture does and does not prove

**It proves** the engine extracts correctly, that a profile's `container` and
`fields` selectors are mutually consistent, that transforms behave, and that a
change to `scraper.ts` has not broken extraction.

**It does not prove the selectors match the live site.** That is the important
caveat. A fixture written by reading the profile's own selectors is circular:
it can only confirm the profile agrees with itself.

Fixtures therefore carry a `provenance`:

| provenance | meaning |
|---|---|
| `captured` | Saved from the real logged-in page, then scrubbed. Proves the selectors matched the site **on the capture date**. |
| `synthetic` | Hand-written to model the page's structure. Proves engine + internal consistency only. A floor, not proof. |

Prefer `captured`. A `synthetic` fixture is a placeholder that should be
replaced the next time someone is signed in to that site.

## Layout

```
__fixtures__/
  <slug>.html      the page
  <slug>.json      { url, provenance, capturedAt?, expect: { <selector>: minItems } }
```

`url` must be a URL the profile actually matches — the test scrapes the fixture
*as if* it were served at that URL, so a wrong URL means the profile won't run
and the test will tell you.

`expect` names the selectors this fixture covers and the minimum number of items
each must yield. A selector omitted from `expect` is one this page doesn't
exercise (e.g. a watchlist selector on a viewing-history page) — that is fine
and expected; the test only checks what the fixture claims to cover.

## Capturing a real fixture

1. Sign in and open the page the profile targets.
2. **DevTools → Elements → right-click `<html>` → Copy → Copy outerHTML.**
   Not "Save page as", which pulls down assets and rewrites markup.
3. **Scrub it** (below), then save as `<slug>.html`.
4. Write `<slug>.json` with `provenance: "captured"` and today's date.
5. `yarn scrape:check <slug>` prints the per-selector diagnostic — iterate until
   the counts look right, then encode them as `expect`.

### Scrubbing — required before committing

A captured page contains your account. Remove:

- Names, email addresses, avatars, profile ids, account numbers
- Auth material: `<script>` blocks with tokens, `data-*` attributes carrying
  session ids, anything that looks like a JWT
- `<img src>` pointing at personal media — replace with `https://example.test/x.jpg`
- Anything identifying in URLs (order ids, share links, referral codes)

Replace with obvious fakes (`Ada Lovelace`, `ada@example.test`) rather than
deleting, so the structure that the selectors depend on stays intact.

Fixtures are committed to a private repo, but treat them as if they were
public — that is the standard the scrubbing has to meet.
