# Plugin Source Package Audit - Implementation Plan

## Ordered Checklist

1. [x] Inventory official/release-supported plugin workspaces and their actual scripts; define one explicit release-target registry with reasons for non-applicable gates.
2. [x] Refactor existing CoreApp official plugin build/seed tooling to consume the registry where ownership overlaps; avoid a second target list.
3. [x] Implement an isolated clean-build orchestrator with fixed prerequisite/target order and sanitized command records.
4. [x] Ensure generated `dist/out`, `dist/build` and stale `.tpex` inputs are removed from the isolated target before build.
5. [x] Execute declared build/test/typecheck/lint gates and stop on first failure.
6. [x] Run canonical CLI builder, package policy, security scan and signing; calculate final artifact and normalized inventory digests.
7. [x] Compare canonical build with any bundled projection by content, not version only.
8. [x] Emit machine-readable per-target and aggregate build audit records.
9. [x] Integrate the audit command into the plugin release workflow/CI without publishing.

## Contract Tests

- registry completeness and explicit non-applicable gates;
- exact build order and stop-on-failure;
- stale archive/generated output exclusion;
- dirty source policy and isolated output;
- Manifest/package version and identity mismatch;
- normalized content reproducibility versus container reproducibility;
- stale bundled projection detection;
- report sanitizer and digest cross-links.

## Verification Commands

```bash
corepack pnpm -C apps/core-app exec vitest run scripts/lib/official-plugin-runtime-sync.test.ts scripts/plugin-source-package-audit.test.ts
corepack pnpm -C packages/tuff-cli-core test
corepack pnpm plugins:validate
corepack pnpm plugins:release:audit
corepack pnpm lint:changed
git diff --check
```

The final plan must replace the audit command placeholder with its real script before completion.

## Risky Files

- Official build registry/order and CoreApp seed sync.
- Workspace scripts with divergent quality gates.
- Generated outputs under plugin roots; never delete canonical source or user data.
- Audit records must avoid full logs and host-private paths.

## Rollback

The orchestrator writes to isolated/versioned output and never advances a latest pointer. Rollback selects the previous audited artifact by digest and restores the previous registry/tooling commit; it does not reuse a failed build directory.
