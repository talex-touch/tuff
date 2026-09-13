# Local Release Preflight

## Scope

- Date: 2026-08-24 (America/Los_Angeles)
- Observed window: 03:18-03:23 PDT
- Worktree: current uncommitted multi-task batch
- Command: `corepack pnpm quality:release`
- Result: `pass` (`exit 0`)

## Stage Summary

| Stage | Result | Evidence |
| --- | --- | --- |
| Repository lint | pass | All configured CoreApp, Nexus, package, plugin and script ESLint scopes completed with zero errors. |
| Workspace typecheck | pass | TuffEx and unplugin builds completed; all configured workspace typechecks completed. |
| Utils targeted tests | pass | 3 files, 57 tests. |
| CoreApp targeted tests | pass | 3 files, 61 tests. |
| Nexus targeted tests | pass | 1 file, 2 tests. |
| Packaging preflight | pass | Electron Builder `26.15.3` resolved. |
| CoreApp production build | pass | Main, preload and renderer builds completed; the command exited zero. |

## Transient Build Attempt

An earlier overlapping attempt failed while resolving
`@talex-touch/tuffex/scroll/style.css`. TuffEx rebuilds its ignored `dist`
directory by removing it before regenerating component CSS, so another local
consumer can observe a temporary missing export during concurrent builds.

The page import, package export map and generated Scroll CSS were valid. An
isolated CoreApp production build passed, followed by the complete single-command
preflight above. The failed overlapping attempt is not counted as a pass and no
source workaround was added.

## Evidence Boundary

- This proves the local release preflight for the current worktree only.
- It does not prove production Gate E, GitHub required checks, a post-fix
  macOS N/N+1 OTA, or Windows/Linux runtime acceptance.
- Full logs, environment variables, signed URL queries, credentials and user
  profile data are intentionally excluded.

## Rerun 2026-08-28

- Observed window: 20:18-20:20 PDT.
- Command: `corepack pnpm quality:release`.
- Result: `pass` (`exit 0`).
- Stages observed: repository lint, workspace typecheck, targeted tests,
  Electron Builder version preflight and CoreApp production build completed.
- This rerun includes the new plugin docs-coverage guard in
  `manifest-boundary.test.ts`.
- Non-fatal build warnings remain in the same class as the prior run:
  browser-externalized Node modules, chunking notes, `lottie-web` eval warning
  and PostCSS `@charset` ordering warning. They did not fail the release gate.

## Rerun 2026-08-28 After Matrix And Privacy Gates

- Observed window: 20:39-20:43 PDT.
- Command: `corepack pnpm quality:release`.
- Result: `pass` (`exit 0`).
- Stages observed: repository lint, full workspace typecheck, targeted release
  tests, Electron Builder `26.15.3` preflight and CoreApp production build
  completed.
- Additional focused checks in the same batch:
  - `corepack pnpm plugins:validate` passed for 23 package-policy manifests and
    25 plugin directories.
  - `corepack pnpm privacy:inventory:verify` passed with 14 sensitive-data
    inventory entries and 38 structural evidence references.
  - workflow contract tests passed: `scripts/package-workflows.test.mjs` and
    `scripts/build-and-release-workflow.test.mjs` (40 tests total).
  - Nexus SDK-card/docs owner guard and telemetry privacy gate focused tests
    passed.
  - CoreApp Sentry telemetry-disabled outbox drain focused test passed.
- This remains local release preflight evidence only. It does not prove
  production Gate E, deployed Cloudflare Preview, post-fix macOS N/N+1 OTA, or
  Windows/Linux runtime acceptance.

## Rerun 2026-09-13 On Clean Committed HEAD

- Observed window: 05:43-05:53 PDT.
- Repository HEAD: `55da5867d` (`chore(repo): ignore root node-gyp build scratch`),
  branch `master`.
- Worktree state: clean (`git status --porcelain` empty, including untracked).
- Every `quality:release` stage was run as its own foreground command rather
  than as the single composite script, to attribute each exit code:

| Stage | Command | Exit | Duration |
| --- | --- | --- | --- |
| Repository lint | `pnpm lint` | 0 | 18s |
| Workspace typecheck | `pnpm typecheck:all` | 0 | 117s |
| Targeted tests | `pnpm test:targeted` | 0 | 6s |
| Packaging preflight | `pnpm -C apps/core-app exec electron-builder --version` | 0 | 1s |
| CoreApp production build | `pnpm -F @talex-touch/core-app run build` | 0 | 96s |

- Targeted tests observed `3 files / 64 tests` for CoreApp plus `2 tests` for
  Nexus; Electron Builder resolved `26.15.3`; the CoreApp renderer build
  finished with `built in 25.00s`.
- This is the first recorded `quality:release` pass on a fully committed,
  clean worktree rather than the earlier uncommitted multi-task batch.
- This remains local release preflight evidence only. It does not prove
  production Gate E, deployed Cloudflare Preview, post-fix macOS N/N+1 OTA, or
  Windows/Linux runtime acceptance.
