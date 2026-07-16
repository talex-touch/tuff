# Fix official plugin release build prerequisites

## Goal

Make clean-checkout release builds compile every workspace prerequisite before official plugins and launch pnpm safely on Windows Node 24.

## Requirements

- Clean-checkout release builds must build `@talex-touch/unplugin-export-plugin` before `@talex-touch/tuff-cli` resolves its exported Vite entry.
- Clean-checkout release builds must build `@talex-touch/tuffex` before `touch-translation` resolves `@talex-touch/tuffex/base.css` and component styles.
- Windows release builds on Node 24 must invoke the pnpm command through a supported Windows command path and must not fail with `spawnSync pnpm.cmd EINVAL`.
- CoreApp must own compatible `electron-builder` and Windows peer packages directly; clean installs must expose the package-local binary expected by `build-target.js`.
- CI must place `ELECTRON_BUILDER_CACHE` outside the repository so downloaded CommonJS helper scripts do not inherit the root `type: module` boundary.
- Electron packaging must use an explicit filesystem-safe executable name instead of deriving Linux targets from the scoped CoreApp package name.
- Beta packaging must retain the exact `-beta.N` version in every installer filename and updater metadata file; Windows must not relabel it as `SNAPSHOT.N`.
- Nexus release sync must select the platform-preferred artifact when GitHub publishes multiple files for one platform/architecture pair, including AppImage over Debian packages.
- CoreApp lint must exclude `resources/bundled-plugins/**`, which contains generated immutable package payloads rather than maintained source.
- Preserve deterministic, fail-fast prerequisite/plugin ordering and all existing bundled-plugin projection behavior.
- Do not weaken artifact validation or bypass failed package builds.

## Acceptance Criteria

- [x] Focused tests prove the full prerequisite order and Windows pnpm invocation behavior.
- [x] A clean-output official plugin toolchain build recreates exporter and TuffEx CSS outputs before building official plugins.
- [x] CoreApp node type-check, focused tests, lint, and release quality gate pass, including the Builder executable preflight.
- [x] A local macOS beta packaging smoke reaches `electron-builder` and produces a package artifact.
- [ ] A fresh beta workflow completes all three platform builds, preserves beta artifact metadata, and publishes the platform-preferred GitHub/Nexus release assets.

## Notes

- Beta.7 workflow `29473031793` failed on all three platforms in `Build Tuff App`.
- macOS/Linux could not resolve `@talex-touch/unplugin-export-plugin/vite`; Windows failed while spawning `pnpm.cmd` directly.
- Node documentation requires Windows `.cmd` files to run through a shell or equivalent command host.
- Beta.8 workflow `29473856584` passed the beta.7 failure points, then Linux exposed missing clean-checkout TuffEx CSS output.
- Beta.9 workflow `29474318864` completed official plugin and Electron Vite builds, then failed because `electron-builder` was no longer declared or installed.
- The local beta package smoke succeeded and produced `apps/core-app/dist/tuff.app.zip`; uncached lint then exposed missing generated-resource ignores.
- Beta.10 workflow `29475792730` reached Linux packaging, then `icon-tool.js` failed because the repository-local Builder cache inherited ESM semantics.
- Beta.11 workflow `29476486542` passed macOS and Windows; Linux reached AppImage assembly, then rejected the derived `@talex-touchcore-app` executable name.
- Beta.12 workflow `29477973821` completed every job and published ten GitHub assets, but verification exposed Windows `SNAPSHOT.12` updater metadata and a Nexus Linux pair overwritten from AppImage to Debian.
