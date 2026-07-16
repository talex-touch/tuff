# Design

## Boundaries

The change is limited to `.github/dependabot.yml`, GitHub workflow definitions, and the workflow usage README. Root `package.json`, `.node-version`, `mise.toml`, package manifests, source code, and `pnpm-lock.yaml` remain unchanged.

## Runtime version contract

- `package.json#packageManager` is the PNPM source of truth. `pnpm/action-setup` is invoked without `with.version`, allowing it to resolve the declared package manager version.
- `.node-version` is the Node source of truth. `actions/setup-node` uses `node-version-file: .node-version`.
- The reusable package CI removes its `node-version` and `pnpm-version` inputs rather than preserving override paths that can drift.

## Intelligence gate data flow

1. Checkout the repository.
2. Install the toolchain through `jdx/mise-action@v4`.
3. Materialize the exact workspace dependency graph using `pnpm install --frozen-lockfile`.
4. Run `mise run intelligence:verify` with workspace binaries available.

## Dependabot scheduling contract

The npm update entry runs weekly with the existing pull-request limit. Security updates remain grouped because their candidate set is bounded by active advisories. The catch-all version-update group is removed so Dependabot can stop after producing the configured number of PRs instead of resolving every direct dependency before producing one group.

A separate weekly `github-actions` entry at `/` maintains action references. It uses the same open PR limit but does not share npm grouping.

## PR gate contract

`pnpm-lock.yaml` is canonical and accepted. `package-lock.json` and `yarn.lock` remain forbidden to prevent accidental mixed package-manager state.

## Permissions

Reusable package CI and every local caller declare `contents: read`. This keeps the effective permission boundary explicit regardless of repository defaults.

## Compatibility and rollback

The build/test/publish commands and trigger paths do not change. Rollback is a direct revert of workflow/config edits; no generated state or data migration is involved.
