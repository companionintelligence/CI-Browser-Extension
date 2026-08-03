# Running CI for this repo

Automatic workflow triggers in this repository are **gated**: pushing does not
start a GitHub-hosted run any more. Checks run on local hardware, and the
workflows that remain are started deliberately.

Why: GitHub Actions was costing the org $563/month, almost all of it hosted
compute for checks that run just as well on hardware we already own.

Starting a gated workflow needs the [`gh` CLI](https://cli.github.com) and push
access. `--ref` matters - the workflow file is read from that branch, so a
workflow that only exists on your feature branch must be dispatched against it.

Full cross-repo runbook: `CI-Local-CICD/RUNBOOK.md` (regenerate with
`ci-local docs`). This file is generated - do not hand-edit.

---

Default branch: `master`

### Test locally

```bash
ci-local run --repo CI-Browser-Extension
```

Equivalent to:

```bash
yarn install --immutable
yarn run lint
yarn run test
yarn run build
```

### Run a check workflow on GitHub

**Build and Test** — `build-and-test.yml`

```bash
gh workflow run build-and-test.yml --repo companionintelligence/CI-Browser-Extension --ref master
```

**Style canon lint** — `style-canon-lint.yml`

```bash
gh workflow run style-canon-lint.yml --repo companionintelligence/CI-Browser-Extension --ref master
```

**Verify Store Credentials** — `verify-store-credentials.yml`

```bash
gh workflow run verify-store-credentials.yml --repo companionintelligence/CI-Browser-Extension --ref master
```

### Still automatic

These run without being asked - no action needed:

- `release.yml` on push
