# Component Guidelines

> How Vue components are built in this project.

---

## Overview

Most UI is Vue 3 with TypeScript. CoreApp and plugins use Vue SFCs; Nexus uses Nuxt/Vue; TuffEx owns reusable primitives. Match the existing surface before introducing new structure.

---

## Component Structure

Use `<script setup lang="ts">` for new Vue SFCs unless the local file already uses another pattern.

For reusable TuffEx primitives:

```vue
<script setup lang="ts">
import type { FileUploaderEmits, FileUploaderProps } from './types'
import { computed, ref } from 'vue'

defineOptions({ name: 'TxFileUploader' })

const props = withDefaults(defineProps<FileUploaderProps>(), {
  multiple: true,
  disabled: false,
})

const emit = defineEmits<FileUploaderEmits>()
</script>
```

This pattern is used by `packages/tuffex/packages/components/src/file-uploader/src/TxFileUploader.vue`.

For smaller components, local interfaces are acceptable:

```ts
interface Props {
  title?: string
  name?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  arrowIcon: 'chevron-down',
})
```

See `packages/tuffex/packages/components/src/collapse/src/TxCollapseItem.vue`.

---

## Props And Emits

- Prefer typed `Props` / `Emits` interfaces or imported `types.ts` definitions.
- Use `withDefaults` for default prop values.
- Use `defineEmits` with explicit event signatures.
- For two-way TuffEx component state, follow existing `modelValue` / `update:modelValue` patterns and emit a secondary `change` event only when the component already uses that convention.
- Preserve public class names and event names when migrating semantic markup; many tests and downstream surfaces depend on class contracts.

---

## Composition

- CoreApp page-level business components may compose TuffEx primitives and local semantic components.
- New primitive behavior should go into TuffEx, not into CoreApp's legacy primitive directories.
- CoreApp business composition layers such as `TuffGroupBlock` can remain, but new interactive primitive logic should delegate to TuffEx.
- In Nexus pages, explicitly import custom components where the page already does so; do not rely on broad global component magic for new complex components.
- Plugin UI should use plugin SDK facades and should not bypass host permission or clipboard gates.

---

## Styling Patterns

- Use scoped styles in SFCs unless the owning package uses a documented global style entry.
- TuffEx primitives use stable BEM-like class names, CSS variables, and reset styles when a semantic element would otherwise inherit browser defaults.
- Prefer `@talex-touch/tuffex/base.css` plus component subpath styles in plugin UI; do not add a full `@talex-touch/tuffex/style.css` import unless working in an existing legacy full-style surface.
- Avoid changing visual class contracts while fixing semantics.

---

## Accessibility

Interactive controls must be semantic.

- Use native `button type="button"` for clickable action zones, headers, tabs, drop zones, and icon actions.
- Do not add new `div role="button"` or `span @click` debt for ordinary controls.
- Preserve or add `aria-label`, `aria-expanded`, `aria-controls`, `aria-pressed`, and disabled behavior where the control needs it.
- Reset button appearance with CSS instead of downgrading to non-semantic markup.

Current examples:

- `TxCollapseItem` uses a real `button` with `aria-expanded` and `aria-controls`.
- `TxFileUploader` uses a real drop-zone button and a real remove button.
- `docs/engineering/reports/coreapp-button-migration.md` records the current CoreApp button migration direction.

---

## I18n

- CoreApp user-facing text belongs in `apps/core-app/src/renderer/src/modules/lang/`.
- Nexus text belongs in the existing Nexus i18n locale files.
- Plugins can use localized manifest metadata or their local i18n setup.
- Do not directly access `window.$t` or `window.$i18n` in new CoreApp renderer code.
- Use shared localized value helpers when resolving plugin manifest text, such as `packages/utils/i18n/localized.ts`.

---

## Common Mistakes

- Replacing a native control with `div @click` to preserve styling.
- Adding a CoreApp-only primitive when a TuffEx primitive already exists.
- Changing class names during semantic migrations without updating focused tests.
- Reading browser-only state in Nexus SSR paths.
- Using browser-native clipboard APIs inside plugin UI instead of plugin clipboard SDK gates.
