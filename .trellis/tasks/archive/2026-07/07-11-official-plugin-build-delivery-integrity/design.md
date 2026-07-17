# Official Plugin Build Delivery Integrity Design

## Data Flow

```text
CLI core build -> CLI entry build
  -> canonical official plugin builds
    -> artifact-clean dist/out + dist/build + current .tpex
      -> generated resources/bundled-plugins projection
        -> Electron Resources/bundled-plugins + after-pack verification
          -> synchronous fresh-profile install before PluginModule construction
```

## Ownership

- `packages/tuff-cli-core/src/exporter.ts` owns the canonical package staging contract.
- `packages/unplugin-export-plugin/src/core/exporter.ts` retains the same contract for direct legacy consumers.
- Canonical plugin directories under `plugins/` own plugin source, version, manifest, widgets, and package output.
- `apps/core-app/scripts/lib/touch-translation-runtime-sync.js` owns build-time projection into `apps/core-app/resources/bundled-plugins`; this generated directory is package input, not an independent source.
- `apps/core-app/scripts/build-target.js` owns ordering and fail-closed release orchestration; `scripts/build-target/after-pack.js` verifies the actual packaged Resources payload.
- `apps/core-app/src/main/modules/plugin/official-plugin-seed.ts` owns synchronous install/update into the runtime plugin root before `ModuleManager` construction.

## Artifact Exclusion

The staging backup loop classifies these top-level `outDir` entries as generated:

- `out`
- `build`
- any case-insensitive `*.tpex` file

Generated entries stay outside `out` and `build`. The current build may overwrite its target archive after compression, but no prior archive becomes an input or manifest file.

## Official Plugin Build Order

The release orchestrator runs commands synchronously and stops on the first non-zero exit:

1. build `@talex-touch/tuff-cli-core`;
2. build `@talex-touch/tuff-cli`;
3. build `@talex-touch/touch-translation-plugin`;
4. build `@talex-touch/touch-intelligence-plugin`;
5. sync both canonical `dist/build` directories into `resources/bundled-plugins`;
6. bundle plugin preludes, build/package CoreApp, and verify both packaged Resources seeds in `afterPack`.

This makes plugin output deterministic in a clean checkout and ensures plugin builders execute the just-built CLI implementation.

## Sync Semantics

For each required official plugin:

- require canonical `dist/build/manifest.json` and canonical `package.json`;
- validate plugin name/version agreement between canonical package and built manifest;
- remove the existing bundled seed directory before copying canonical build contents;
- write the canonical package version into the bundled package metadata;
- never copy canonical `dist/out`, `.tpex`, or the whole `dist` tree into the bundled runtime seed.

Optional runtime profile roots, when explicitly supplied by tests/tools, receive runtime files without deleting user data directories.

## Runtime Bootstrap Semantics

On packaged startup, before `ModuleManager` can discover plugins:

- enumerate and validate every directory in Electron `Resources/bundled-plugins`;
- install missing seeds into `<runtime-root>/modules/plugins`;
- cleanly replace older, corrupt, wrong-identity, or same-version/different-signature runtime code;
- preserve runtime `data` and `logs` directories during replacement;
- keep an identity-matching local plugin when its version is newer than the bundled seed.

Seed validation completes before any runtime mutation, and each replacement uses staging plus rollback so a copy failure does not leave a partial plugin directory.

## Compatibility And Rollback

- No persisted user profile schema or runtime transport changes; only official runtime code projection is added.
- Existing `syncTouchTranslationBundledRuntime` remains a compatibility wrapper while release orchestration uses the generic official-plugin API.
- Rollback is limited to staging exclusion, build orchestration, packaged Resources projection, and pre-module seed installation.
