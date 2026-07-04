# Directory Structure

> How frontend code is organized in this project.

---

## Overview

Keep frontend changes inside the owning surface. This repo already separates desktop UI, web UI, reusable primitives, and plugin UI; do not create cross-cutting folders for one feature unless the package already exposes that layer.

---

## Main Areas

### CoreApp Renderer

Use `apps/core-app/src/renderer/src/` for Electron renderer UI.

- Views live under `views/`, usually grouped by product area such as `views/base/settings/`, `views/base/intelligence/`, `views/box/`, and `views/assistant/`.
- Reusable renderer components live under `components/`, with domain folders such as `components/intelligence/`, `components/plugin/`, and `components/download/`.
- Renderer-side state shared across views lives under `stores/`; example: `apps/core-app/src/renderer/src/stores/plugin.ts`.
- UI-only helpers for a feature stay near the owning view when they are not shared globally; examples include `views/base/settings/app-index-manager-display.ts` and `views/base/settings/login-recovery-display.ts`.
- Cross-view or cross-layer renderer modules live under `modules/`; do not add private scanning, transport, or storage paths that bypass existing modules.

### Nexus

Use `apps/nexus/app/` for the Nuxt site.

- Routes live in `pages/`.
- Layouts live in `layouts/`.
- Reusable UI lives in `components/`.
- Shared route or browser lifecycle logic lives in `composables/` or `utils/`; examples: `composables/useDocEngagementTracker.ts` and `utils/route-locale-chunks.ts`.
- Browser-only code must be isolated with `import.meta.client`, `ClientOnly`, or an equivalent SSR guard.

### TuffEx

Use `packages/tuffex/packages/components/src/<component>/` for reusable component primitives.

The current component package shape is:

```text
packages/tuffex/packages/components/src/<component>/
  src/
    Tx<Component>.vue
    types.ts
  __tests__/
    <component>.test.ts
  index.ts
```

Examples:

- `packages/tuffex/packages/components/src/collapse/src/TxCollapseItem.vue`
- `packages/tuffex/packages/components/src/file-uploader/src/TxFileUploader.vue`
- `packages/tuffex/packages/components/src/collapse/__tests__/collapse.test.ts`

### Official Plugins

Use `plugins/<plugin>/` for official plugin manifests, prelude/runtime code, and optional UI surfaces.

- Keep plugin UI under `src/components/`, `src/pages/`, or the plugin's existing local structure.
- Use the plugin SDK and declared permissions; do not add host-specific runtime bridges from a plugin.
- Manifest, prelude, and surface code must keep trust boundaries explicit.

---

## Module Organization

- Keep display-only formatters close to the view that owns the display contract.
- Put shared SDK, transport, permission, i18n, and payload types in `packages/utils` or the existing package that already owns that contract.
- Put reusable visual primitives in TuffEx, not in CoreApp feature folders.
- Keep tests next to the owning feature when the repo already does so.
- Do not mix CoreApp, Nexus, packages, plugins, and docs in one implementation slice unless the feature explicitly crosses those boundaries and the task documents the data flow.

---

## Naming Conventions

- Vue components use PascalCase filenames: `TxFileUploader.vue`, `SettingFileIndex.vue`, `IntelligenceAuditPage.vue`.
- Composables use `use*` names: `useShortcutCopy`, `useDocEngagementTracker`.
- Pinia stores use `use*Store`: `usePluginStore`.
- Domain display helpers use descriptive kebab or domain names near the owner: `indexing-source-diagnostics-display.ts`, `app-index-manager-display.ts`.
- Tests generally sit beside the feature and end in `.test.ts`; TuffEx tests live under component-local `__tests__/`.

---

## Examples

- CoreApp global renderer state: `apps/core-app/src/renderer/src/stores/plugin.ts`.
- CoreApp local composable: `apps/core-app/src/renderer/src/views/base/settings/components/useShortcutCopy.ts`.
- Nexus client lifecycle composable: `apps/nexus/app/composables/useDocEngagementTracker.ts`.
- TuffEx primitive and test: `packages/tuffex/packages/components/src/collapse/src/TxCollapseItem.vue` and `packages/tuffex/packages/components/src/collapse/__tests__/collapse.test.ts`.
- Shared localized value helpers: `packages/utils/i18n/localized.ts`.

---

## Common Mistakes

- Adding a new CoreApp primitive instead of using TuffEx or extending TuffEx.
- Placing shared domain payloads inside a renderer view folder.
- Letting a plugin directly call browser or host APIs instead of using plugin SDK gates.
- Adding Nexus browser-only logic to SSR paths without `import.meta.client` or `ClientOnly`.
- Treating generated chunks, raw evidence, or local profile output as source files.
