# Tuff Core App

CoreApp is the Electron desktop application in the Tuff monorepo. It owns the
process model, local modules, preload boundary, renderer application, and
packaged application builds.

## Entrypoints

- [Main process](src/main/index.ts): starts Electron and the CoreApp lifecycle.
- [Preload](src/preload/index.ts): exposes the constrained renderer bridge.
- [Renderer](src/renderer/src/main.ts): mounts the Vue application.
- [Electron Vite configuration](electron.vite.config.ts):
  defines main, preload, renderer, and worker build inputs.

## Workspace setup

Run commands from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm core:dev
```

The root `core:dev` command delegates to the CoreApp workspace. The package also
provides scoped commands:

```bash
pnpm -C "apps/core-app" run dev
pnpm -C "apps/core-app" run lint
pnpm -C "apps/core-app" run test
pnpm -C "apps/core-app" run typecheck
pnpm -C "apps/core-app" run build
```

Platform release builds use `build:win`, `build:mac`, or `build:linux`.
Release and signing acceptance remain separate from a successful local build.

## Architecture

CoreApp is split across Electron boundaries:

- `src/main/` owns lifecycle, persistence, search/indexing, downloads, updates,
  plugins, and other privileged modules.
- `src/preload/` owns the narrow bridge between isolated renderer contexts and
  typed transport.
- `src/renderer/src/` owns Vue views, settings, CoreBox surfaces, and desktop
  interaction.
- Shared events, SDKs, and domain types live in `packages/utils`; reusable UI
  primitives live in `packages/tuffex`.

Maintained module documentation:

- [Download Center](src/main/modules/download/README.md)
- [Search and indexing runtime](src/main/modules/box-tool/search-engine/README.md)
- [Update regression checklist](../../docs/plan-prd/03-features/download-update/update-regression-checklist.md)

## Project documentation

- [Documentation index](../../docs/INDEX.md)
- [Engineering index](../../docs/engineering/README.md)
- [CoreApp UI contract](../../docs/engineering/coreapp-ui-contract.md)
- [Project planning index](../../docs/plan-prd/README.md)

## Contributing

Read the
[repository contribution guide](../../.github/docs/contribution/CONTRIBUTING.md)
before opening a change. Keep privileged behavior in the main process, preserve
the preload boundary, and use the smallest relevant package checks.

## License

CoreApp is distributed under the repository [MIT License](../../LICENSE).
