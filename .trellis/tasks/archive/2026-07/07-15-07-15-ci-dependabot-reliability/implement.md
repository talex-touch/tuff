# Implementation Plan

## Checklist

- [x] Read applicable Trellis quality and shared design guidelines.
- [x] Confirm current official contracts for pnpm action setup and Dependabot grouping/options.
- [x] Remove workflow-local PNPM and Node version duplication from reusable CI, PR CI, release, and package publish workflows.
- [x] Update reusable workflow documentation and add explicit read-only permissions to package CI callers.
- [x] Repair Intelligence Gates dependency setup and update mise-action.
- [x] Allow canonical PNPM lockfile changes in PR Quality.
- [x] Reconfigure Dependabot cadence, grouping, and GitHub Actions updates.
- [x] Validate YAML syntax and search for stale version pins.
- [x] Run `mise run ai-docs:verify` and `mise run intelligence:verify`.
- [x] Review the final diff for unchanged build/publish semantics.

## Validation Commands

```bash
pnpm exec prettier --check ".github/**/*.{yml,yaml,md}"
mise run ai-docs:verify
mise run intelligence:verify
```

Use the repository's existing changed-file lint/type-check gate if workflow Markdown/YAML is included by it. A scheduled Dependabot execution is verified after push from GitHub's Dependency Graph UI; rerunning an old job would use the old commit and is not valid evidence.

## Verification Results

- `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.12 ...`: all changed workflow YAML files passed.
- `pnpm exec prettier --check ...`: all changed workflow and Dependabot files passed.
- `pnpm install --frozen-lockfile && mise run intelligence:verify`: dependency installation and the full Intelligence gate passed.
- `mise run ai-docs:verify`: passed.
- `pnpm quality:pr`: 104 targeted tests passed, followed by successful core-app Node and web type-checks.
- `git diff --check`: passed.
- Static configuration checks found no explicit PNPM action version, stale `10.32.1`, or `node-version: 24.0.0`.
- No `.trellis/spec/` update is needed: the available spec layer is frontend-only, while the executable CI runtime and permission contracts are maintained in `.github/workflows/README.md`.

## Rollback Point

All changes are declarative and independent of application state. Revert the CI/dependabot change set if GitHub rejects a configuration after push.
