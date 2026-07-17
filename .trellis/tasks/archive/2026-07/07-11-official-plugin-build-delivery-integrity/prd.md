# Official Plugin Build Delivery Integrity

## Goal

Guarantee that repeated Tuff plugin builds never embed prior generated archives and that CoreApp release packages always ship the current canonical official AI/translation plugin runtimes.

## Requirements

### Artifact-Clean Plugin Builds

- `tuff builder` must treat `dist/out`, `dist/build`, and prior top-level `*.tpex` files as generated output, never as source payload.
- Repeated builds must not add prior archives to `manifest._files`, `dist/build`, or the next `.tpex`.
- The canonical CLI core exporter and retained unplugin exporter must apply the same exclusion contract.

### Deterministic Official Plugin Delivery

- CoreApp release builds must build the CLI used by official plugin packaging, then build the canonical `touch-translation` and `touch-intelligence` packages before projecting runtime seeds.
- Projection must cover both official plugins from their canonical `dist/build` directories, replace stale generated seed files, preserve canonical versions, and package the result under Electron `Resources/bundled-plugins`.
- A release build must fail instead of silently shipping a missing, stale, version-inconsistent, or artifact-contaminated official plugin seed.

### Compatibility

- On packaged startup, bundled seeds install or update runtime code under `<runtime-root>/modules/plugins`; existing plugin `data` and `logs` survive replacement, and a newer identity-matching local plugin is never downgraded.
- Plugin manifest, widget precompile, permissions, signatures, existing CLI commands, and persisted user storage remain compatible.

## Acceptance Criteria

- [x] Builder regression fixtures prove a stale prior `.tpex` is absent from `dist/out`, `dist/build`, and `manifest._files` after rebuilding.
- [x] Building `touch-intelligence` twice produces a clean 1.0.3 payload without nested 1.0.2 archives or recursive size growth.
- [x] CoreApp official plugin sync updates both bundled manifests to their canonical versions and removes stale bundled files.
- [x] Build orchestration tests prove CLI prerequisites run before both official plugin builds and sync runs only after successful builds.
- [x] Focused CLI, sync, plugin, and packaged-seed verification passes.
- [x] Packaged macOS Resources contain both canonical seeds and after-pack verification rejects missing, mismatched, nested `dist`, or `.tpex` content.
- [x] A fresh isolated packaged profile installs both seeds before plugin module discovery and reports two official plugins during initial startup.

## Notes

- `apps/core-app/resources/bundled-plugins` is generated package input and Electron `Resources/bundled-plugins` is immutable release payload; canonical plugin packages under `plugins/` remain the source of truth.
