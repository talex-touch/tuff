# Harden Dependabot and GitHub Actions reliability

## Goal

Make dependency automation and GitHub Actions deterministic: one authoritative Node/PNPM version, fresh-runner dependency installation, Dependabot runs that complete, and dependency PRs that can pass repository gates.

## Requirements

- GitHub Actions must derive PNPM from the root `package.json#packageManager` instead of maintaining workflow-local versions.
- GitHub Actions must derive Node from the repository `.node-version` instead of maintaining workflow-local versions.
- The Intelligence gate must install the frozen workspace dependency graph before running commands that require workspace binaries.
- The PR lockfile policy must reject foreign lockfiles while allowing the repository's canonical `pnpm-lock.yaml`.
- Dependabot version updates must not form one unbounded all-dependency group.
- Dependabot must run frequently enough to avoid a monthly update backlog and must also maintain GitHub Action dependencies.
- Read-only package CI must request only read access to repository contents.
- Existing package build, test, release, and publish commands must remain unchanged.

## Acceptance Criteria

- [x] No workflow passes an explicit PNPM version to `pnpm/action-setup`.
- [x] No workflow pins Node `24.0.0`; setup-node consumers use `.node-version`.
- [x] Reusable package CI no longer exposes Node or PNPM version inputs, and its usage documentation matches.
- [x] Intelligence Gates installs with `pnpm install --frozen-lockfile` before `mise run intelligence:verify` and uses the current major of `jdx/mise-action`.
- [x] PR Quality permits `pnpm-lock.yaml` changes but still rejects `package-lock.json` and `yarn.lock`.
- [x] Dependabot runs npm updates weekly without a catch-all version-update group, retains grouped security updates, and has a weekly `github-actions` entry.
- [x] Every package CI caller and the reusable package CI explicitly use `contents: read`.
- [x] Workflow YAML parses successfully and repository-local AI Docs and Intelligence verification commands pass.
- [x] The workspace contains no stale `10.32.1` or workflow-local `node-version: 24.0.0` configuration.

## Notes

- Scope is CI/dependency automation only. Do not change application behavior, package versions, publishing semantics, or the root lockfile.
- A remote Dependabot scheduled run cannot be reproduced locally; validate its configuration structurally and against the current documented option contract.
