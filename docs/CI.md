# Running CI for this repo

Automatic workflow triggers are **off** in this repository. Every workflow runs
only when someone dispatches it, so a push or a pull request does not start a
GitHub-hosted run.

The gate is deliberate. `ci-local` applied it on 2026-08-01 (#85) to cut the
org-wide Actions bill, and it was applied again on 2026-10-08 (#111). Restoring
the automatic triggers is a policy change, not a docs change: `ci-local restore`
puts the original trigger blocks back.

Default branch: `master`

Full cross-repo runbook: `CI-Local-CICD/RUNBOOK.md`.

---

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

### Manual runs

Dispatch with the [`gh` CLI](https://cli.github.com) and push access. `--ref`
matters: the workflow file is read from that branch, so a workflow that only
exists on a feature branch must be dispatched against that branch.

**Build and Test** — `build-and-test.yml`. Lint, type check, tests with coverage,
and the Chrome, Firefox, Safari and Safari Mobile builds.

```bash
gh workflow run build-and-test.yml --repo companionintelligence/CI-Browser-Extension --ref master
```

**Style canon lint** — `style-canon-lint.yml`. Runs `yarn lint:canon`.

```bash
gh workflow run style-canon-lint.yml --repo companionintelligence/CI-Browser-Extension --ref master
```

**Verify Store Credentials** — `verify-store-credentials.yml`. Read-only check
that the store-publish secrets used by `release.yml` are valid. Run it after
adding or rotating a store secret; it never uploads or submits anything.

```bash
gh workflow run verify-store-credentials.yml --repo companionintelligence/CI-Browser-Extension --ref master
```

**Release** — `release.yml`. Publishes an existing `v*` tag to the stores. Push
the tag first, then dispatch the workflow with that tag. The dispatch is the
step that publishes; pushing the tag alone does not.

```bash
gh workflow run release.yml --repo companionintelligence/CI-Browser-Extension --ref master -f release_tag=vX.Y.Z
```

**Publish Existing Firefox Release** — `publish-firefox-existing.yml`. Submits
the Firefox package already attached to an existing `v*` release to Firefox
Add-ons (AMO), for when the Firefox submission of a release needs to be redone.
It does not rebuild from source.

```bash
gh workflow run publish-firefox-existing.yml --repo companionintelligence/CI-Browser-Extension --ref master -f release_tag=vX.Y.Z
```

**Build and Test (Deno)** — `build-and-test-deno.yml`. The parallel Deno
build/lint/test path added in #98. Manual until that path has had a human review
pass; it does not replace `build-and-test.yml`.

```bash
gh workflow run build-and-test-deno.yml --repo companionintelligence/CI-Browser-Extension --ref master
```
