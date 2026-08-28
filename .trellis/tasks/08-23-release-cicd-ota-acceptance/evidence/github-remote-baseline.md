# GitHub Remote Baseline

## Scope

- Date: 2026-08-24 (America/Los_Angeles)
- Mode: read-only GitHub metadata and bounded artifact inspection
- Result: branch protection `pass`; remote release-quality/OTA evidence remains open

## Branch Protection

- Classic branch protection is active on `master`.
- Required checks are bound to GitHub Actions and contain:
  - `Check Not Allowed File Changes`
  - `Documentation Quality`
  - `PR Quality`
  - `Typecheck (workspace)`
  - `App suites (core-app)`
  - `App suites (nexus)`
  - `Integration suite (packages/test)`
- The latest five inspected PR commit SHAs and six inspected `master` commit SHAs
  all produced the complete seven-context set. Non-green commits retained their
  real failed or cancelled state rather than producing a soft pass.
- Admin enforcement and conversation resolution are enabled. Required-check
  strict mode is disabled; this is recorded as a non-blocking limitation.
- The repository's only ruleset is disabled, but the classic protection above
  is active and independently enforces the required checks.

## Release Run

- The latest inspected release run was `32445443318` for
  `v2.4.14-beta.14` at commit prefix `f5d6e80`.
- GitHub-hosted `windows-2022`, `ubuntu-24.04`, and `macos-26` jobs completed
  their platform builds and packaged-launch smoke.
- The workflow retained seven artifacts; the release retained 26 assets,
  including the release manifest, signature sidecars, and release summary.
- Annotated tag, workflow head SHA, manifest version/tag, and rollback target
  are consistent. Rollback targets `2.4.14-beta.13`.
- The release summary explicitly marks every downgrade/OTA evidence result as
  `static-only` with `downgradeEvidenceValidated=false`. Packaged launch is not
  counted as OTA replacement or startup-health evidence.

## Remaining Gate

- The local `build-and-release.yml` adds `release-quality`, but that change is
  not present in the remote workflow. The inspected beta.14 run therefore has
  no remote execution evidence for the new hard gate.
- No repository-level self-hosted runner is registered. Organization runner
  inventory was not visible to the current non-admin credential; existing
  GitHub-hosted runner execution is independently proven by the jobs above.
- No workflow was triggered and no local or remote configuration was changed
  during this inspection.

## Evidence Boundary

- Raw API responses, credentials, signed URLs, cookies, artifact payloads, and
  complete logs are intentionally excluded.
- This evidence closes required-check configuration only. It does not close
  production Gate E, post-fix macOS N/N+1, or Windows/Linux OTA acceptance.
