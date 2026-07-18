# Plugin Package Policy - Implementation Plan

## Ordered Checklist

1. [ ] Inventory current Manifest/archive checks in CLI core, Nexus TPEX parser/storage and official plugin validation; record duplicates and compatibility fixtures.
2. [ ] Add shared policy types, limits, normalization and deterministic violation ordering under `packages/utils/plugin/`.
3. [ ] Implement `source-manifest`, `staged-package` and `registry-admission` profiles using existing SDK/permission registries.
4. [ ] Extend Nexus tar metadata parsing to preserve entry type, raw/normalized path, duplicates and bounded size totals before object extraction.
5. [ ] Wire CLI `validate --strict` and builder pre-compression staging to shared policy; fail with stable codes.
6. [ ] Wire Nexus preview and publish to integrity + registry-admission; validate expected plugin/version before upload/version persistence.
7. [ ] Migrate all canonical official plugin Manifests that fail the new source profile; do not add compatibility aliases.
8. [ ] Update Manifest/package documentation and frontend type-safety/plugin-security spec with the executable contract.

## Contract Tests

A test is required for each plausible policy bypass:

- missing/invalid identity, SemVer, SDK/category and permissions;
- legal UI-only plugin without `main`;
- packaged remote dev mode;
- traversal, absolute/UNC/drive/backslash/NUL paths;
- duplicate and case-fold collisions;
- symlink/hardlink/device/unknown entries;
- duplicate/nested Manifest;
- file count/per-file/expanded/compressed size limits;
- `_files` mismatch and expected Nexus identity/version mismatch;
- parity of CLI and Nexus first violation code.

## Verification Commands

```bash
corepack pnpm -C packages/utils exec vitest run __tests__/plugin/package-policy.test.ts
corepack pnpm -C packages/tuff-cli-core exec vitest run src/__tests__/validate.test.ts src/__tests__/builder-package-policy.test.ts
corepack pnpm -C apps/nexus exec vitest run server/utils/__tests__/tpex-integrity.test.ts server/utils/__tests__/tpex-policy.test.ts
corepack pnpm plugins:validate
corepack pnpm -C packages/utils run typecheck
corepack pnpm -C packages/tuff-cli-core run build
corepack pnpm -C apps/nexus run typecheck
corepack pnpm lint:changed
git diff --check
```

Use exact test paths after implementation; placeholders must be replaced before task completion.

## Risky Files

- `packages/tuff-cli-core/src/exporter.ts`: final staging and transitional `key.talex` behavior.
- `apps/nexus/server/utils/tpex.ts`: untrusted tar parsing, integer bounds and duplicate preservation.
- `apps/nexus/server/utils/pluginsStore.ts`: avoiding object/version half-writes.
- Shared SDK/permission version registries: reuse only; do not fork constants.

## Rollback Point

Keep the previous policy evaluator available only as an explicit Nexus policy version during shadow rollout. Archive path/type safety and identity/version mismatch remain non-disableable. Rollback must not restore preview/publish disagreement.
