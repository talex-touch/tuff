# Frontend Development Guidelines

> Project-specific frontend conventions for Tuff, CoreApp, Nexus, TuffEx, and official plugin surfaces.

---

## Overview

This repository is a pnpm monorepo. Frontend work usually lands in one of four places:

- `apps/core-app/src/renderer/src/` for the Electron renderer UI.
- `apps/nexus/app/` for the Nuxt docs, store, dashboard, and public web surfaces.
- `packages/tuffex/packages/components/src/` for reusable Vue component primitives.
- `plugins/<plugin>/src/` for official plugin UI surfaces.

Use these guidelines together with the package-level `AGENTS.md` files:

- `apps/core-app/AGENTS.md`
- `apps/nexus/AGENTS.md`
- `plugins/AGENTS.md`
- `docs/engineering/coreapp-ui-contract.md`

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Custom composables, lifecycle, data access | Filled |
| [State Management](./state-management.md) | Local state, Pinia, host/server state | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns, verification | Filled |
| [Type Safety](./type-safety.md) | TypeScript, runtime guards, typed transport | Filled |
| [Plugin Runtime Security](./plugin-runtime-security.md) | Privileged plugin handlers, views, preload, and Electron policy | Filled |

---

## Pre-Development Checklist

Before editing frontend code:

1. Read the package-level `AGENTS.md` for the target area.
2. Read [Directory Structure](./directory-structure.md) to place files in the existing ownership boundary.
3. Read [Component Guidelines](./component-guidelines.md) before changing Vue SFCs, UI primitives, accessibility, or i18n.
4. Read [Hook Guidelines](./hook-guidelines.md) before adding or changing a `use*` composable or browser lifecycle code.
5. Read [State Management](./state-management.md) before adding Pinia state, SDK subscriptions, caches, or host/server data mirrors.
6. Read [Type Safety](./type-safety.md) before changing payloads, event kinds, SDK domains, manifest shapes, or JSON evidence.
7. Read [Plugin Runtime Security](./plugin-runtime-security.md) before changing plugin windows, hosted plugin views, permission handlers, preload bridges, or plugin Electron preferences.
8. Read [Quality Guidelines](./quality-guidelines.md) before finishing, and run the smallest relevant tests plus `git diff --check`.

Also read shared thinking guides when the trigger applies:

- [Cross-Layer Thinking Guide](../guides/cross-layer-thinking-guide.md) for features spanning UI, transport, service, database, or plugin boundaries.
- [Code Reuse Thinking Guide](../guides/code-reuse-thinking-guide.md) before changing constants/config, adding helpers, or repeating payload-field logic.

---

## Hard Frontend Rules

- Prefer TuffEx primitives for new UI. CoreApp business components may remain as semantic composition layers, but new primitive behavior belongs in TuffEx.
- Do not add raw `ipcMain`, `ipcRenderer`, raw channels, broad preload exposure, or ad-hoc plugin runtime bridges.
- New interactive UI must use semantic controls with focus and keyboard behavior. Avoid new `div/span @click` debt.
- Plugins must fail closed when permission SDKs, clipboard SDKs, secret SDKs, or host capabilities are unavailable.
- New user-facing text must go through the owning message catalog or localized manifest path, not direct `window.$t` / `window.$i18n`.
- SQLite is the local business source of truth. JSON is only a local config/sync payload or a verifiable catalog/evidence artifact, not a replacement SoT.
