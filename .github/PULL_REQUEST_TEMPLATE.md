<!--
  Keep the parts that apply and delete the rest. The scrape-profile section is
  not optional if you touched src/scrapeProfiles/ — see below for why.
-->

## What and why

<!-- What changed, and what problem it solves. Link the issue. -->

## Verification

- [ ] `yarn lint`
- [ ] `yarn compile`
- [ ] `yarn test`
- [ ] Built and loaded unpacked, if the change is user-visible

---

## Adding or changing a scrape profile

A profile without a fixture is unverified: for most of this project's life
twelve of thirteen profiles had never had a selector executed against markup of
any kind, and five were registered but unreachable, and every test passed the
whole time.

- [ ] **Fixture committed** — `src/scrapeProfiles/__fixtures__/<slug>.{html,json}`
- [ ] **Scrubbed** — no real names, emails, account or order ids, auth material,
      or personal media URLs. See `__fixtures__/README.md`.
- [ ] `provenance` is honest: `captured` only if it came from the real page.
      `synthetic` is a floor, not proof, and should say so in `note`.
- [ ] `yarn scrape:check <domain>` passes
- [ ] Every selector has a `personalDataType` — it is what types the row on the
      server; without it the capture arrives anonymous

If the profile reads anything a user would not expect an extension to touch
(balances, holdings, health, location, private messages):

- [ ] Marked `sensitive: true`, and the opt-in gate verified to run **before**
      the page is read
- [ ] Disclosed in `CAPTURE.md`, `PRIVACY.md`, and `store-assets/STORE-LISTING.md`
      — under-disclosing a data category is a store-review takedown risk, not a
      paperwork nit
