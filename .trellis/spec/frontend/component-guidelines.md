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

### Shell colour tokens

The app shell has one palette, `--shell-*` in `apps/core-app/src/renderer/src/styles/shell-tokens.scss`, defined across four blocks: `:root`, `.dark`, `html.contrast`, `html.dark.contrast`. Shell surfaces read tokens only — a hex literal or `rgba()` in a renderer component is a bug, because it survives the theme swap and the high-contrast accessibility mode.

- Four semantic hues exist — `primary`, `success`, `warning`, `danger`, `info` — each with a base ink, a `-soft` fill and a `-border`. A status chip is `-soft` fill plus same-hue base ink; that is the whole shape.
- Both contrast blocks re-point every hue to the tuffex contrast ramp (`--tx-color-*` and its `-light-9`) and replace the alpha `-border` with the solid base: a 24 %-alpha hairline disappears at high contrast.
- **Chip ink is measured against its own `-soft` fill, not against the page background** — that composite is the real reading surface and is what must clear AA 4.5:1. Two of the artboard's light-mode values missed it, so the palette carries darkened values with the measurement recorded in the file. Reproduce that check before adding or changing a hue, and record the number.
- Colour is additive to a text label, never the sole carrier of state.
- Reserve accent colour for primary buttons, switch-on, progress fill and selected state. An expected outcome does not get an error colour — a probe that runs and finds nothing is amber at most, because red on a routine result only teaches people to ignore red.

---

## Loading States

A skeleton is the default loading state, not an optional polish pass. Ship it with the first version of a view; do not leave it as follow-up work.

**When a skeleton applies**

- First load of a page or region whose layout is known before the data arrives.
- Not for a background refresh of already-rendered content: keep the content on screen. Replacing it with a skeleton is a regression, not a loading state.
- Not for a small local action: use the control's own pending state instead.
- Not when the layout depends on the data (unknown row counts, variable-shape results): use an empty state or a plain pending affordance.

**Match the real layout**

- The skeleton must mirror the loaded layout: same group count, same row count, same row height and spacing.
- A skeleton that does not match still shifts the page when content lands, which is the one thing it exists to prevent. "The page shows a skeleton" is not the bar; "nothing moves when data arrives" is.
- Build the skeleton from the same containers the loaded view uses, so the two cannot drift apart.

**Reuse the primitives**

- Settings-style rows: `TxRowSkeleton` from `@talex-touch/tuffex/skeleton`, with `rows`, `leading`, `description`, `trailing`, and `separated` describing the real row.
- CoreApp settings pages: `SettingSkeleton` (`components/settings/SettingSkeleton.vue`), which composes `SettingSection` + `TxRowSkeleton` and declares the real group structure.
- Free-form bars: `TxSkeleton`. App shell: `TxLayoutSkeleton`.
- Do not hand-roll placeholder `div`s or a local `@keyframes`. The shimmer, its timing, and the reduced-motion guard live in the `skeleton-surface` / `skeleton-keyframes` mixins in `packages/tuffex/packages/components/style/mixins.scss`; a component emits the keyframes once and applies the surface per placeholder element.
- Tune colour through `--tx-skeleton-base-color` rather than restyling the bars.

**Do not let it flash**

- Bind the skeleton through `useDeferredLoading` from `@talex-touch/tuffex/skeleton`. Data that arrives inside `delay` shows no skeleton at all, and a skeleton that does appear stays for `minDuration` instead of vanishing half-drawn.

**Accessibility**

- Skeletons are decorative: mark them `aria-hidden="true"` and keep focusable elements out of them.
- Animation must respect `prefers-reduced-motion: reduce`. The shared mixin already drops the motion while keeping the placeholder, since the placeholder is what holds the layout steady.

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
