# Official Plugin Build Delivery Integrity Implementation

## Order

1. Add generated-output classification to both exporter staging loops and cover stale `.tpex` fixtures.
2. Generalize canonical seed projection across translation and intelligence with clean replacement and version validation.
3. Add deterministic official-plugin build orchestration, package projected seeds as Electron extra resources, and fail after-pack verification on payload drift.
4. Install/update packaged seeds synchronously before `ModuleManager` construction while preserving plugin data/logs and newer local runtimes.
5. Run focused regressions, repeated plugin builds, a full CoreApp package, packaged Resources inspection, and a fresh-profile startup smoke.

## Focused Validation

```bash
pnpm --filter @talex-touch/tuff-cli-core exec vitest run src/__tests__/builder-widgets.test.ts
pnpm --filter @talex-touch/unplugin-export-plugin exec vitest run src/__tests__/index-bundling.test.ts
pnpm --filter @talex-touch/core-app exec vitest run scripts/lib/official-plugin-runtime-sync.test.ts
pnpm --filter @talex-touch/core-app exec vitest run src/main/modules/plugin/official-plugin-seed.test.ts scripts/build-target/after-pack.test.ts scripts/lib/official-plugin-runtime-sync.test.ts
pnpm --filter @talex-touch/core-app run typecheck:node
pnpm --filter @talex-touch/tuff-cli-core run build
pnpm --filter @talex-touch/tuff-cli run build
pnpm --filter @talex-touch/touch-intelligence-plugin run build
pnpm --filter @talex-touch/touch-intelligence-plugin run build
pnpm --filter @talex-touch/core-app exec node scripts/build-target.js --target=mac --type=beta --arch=arm64 --dir
```

## Review Gates

- Do not whitelist arbitrary output extensions; only generated Tuff archives and staging directories are excluded.
- Do not copy `dist` recursively into a runtime plugin seed.
- Do not silently continue after an official plugin build or version validation failure.
- Do not delete user profile logs, data, or storage while replacing build-time bundled seeds.
- Do not hand-maintain separate official plugin lists in multiple layers; export one list from the sync owner for build orchestration.

## Completion Evidence

- `@talex-touch/tuff-cli-core` builder regression: 10/10 tests passed.
- Retained `@talex-touch/unplugin-export-plugin` regression: 7/7 tests passed.
- CoreApp projection, after-pack, and synchronous runtime-seed regressions: 14/14 tests passed across 3 files.
- Canonical `touch-intelligence` was built twice at `1.0.3`; the second archive remained about 181 KiB and contained no stale `.tpex` in `dist/out`, `dist/build`, or `manifest._files`.
- Canonical projection and packaged Resources contain `touch-translation@1.0.11` and `touch-intelligence@1.0.3`, with no nested `.tpex` or `dist` tree.
- `build-target.js --target=mac --type=beta --arch=arm64 --dir` completed successfully; logs prove both official plugin builds, both projections, both after-pack verifications, and CoreApp packaging.
- A fresh one-shot packaged profile installed both seeds before module loading; PluginSystem discovered 2 plugins during initial startup and completed initial loading.
- File-level ESLint, CoreApp node typecheck, both exporter regressions, seed regressions, and JavaScript syntax checks passed.
