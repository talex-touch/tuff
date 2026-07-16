# Fix official plugin release build prerequisites

## Goal

Make clean-checkout release builds compile the unplugin exporter before Tuff CLI and launch pnpm safely on Windows Node 24.

## Requirements

- Clean-checkout release builds must build `@talex-touch/unplugin-export-plugin` before `@talex-touch/tuff-cli` resolves its exported Vite entry.
- Windows release builds on Node 24 must invoke the pnpm command through a supported Windows command path and must not fail with `spawnSync pnpm.cmd EINVAL`.
- Preserve deterministic, fail-fast prerequisite/plugin ordering and all existing bundled-plugin projection behavior.
- Do not weaken artifact validation or bypass failed package builds.

## Acceptance Criteria

- [x] Focused tests prove exporter-before-CLI ordering and Windows pnpm invocation behavior.
- [x] A clean-output official plugin toolchain build recreates `packages/unplugin-export-plugin/dist/vite.js` and completes.
- [x] CoreApp node type-check, focused tests, lint, and release quality gate pass.
- [ ] A fresh beta workflow completes all three platform builds and publishes GitHub/Nexus release assets.

## Notes

- Beta.7 workflow `29473031793` failed on all three platforms in `Build Tuff App`.
- macOS/Linux could not resolve `@talex-touch/unplugin-export-plugin/vite`; Windows failed while spawning `pnpm.cmd` directly.
- Node documentation requires Windows `.cmd` files to run through a shell or equivalent command host.
