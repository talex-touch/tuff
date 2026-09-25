# Nexus Docs Templates

> The 模板 / Templates tab of the Nexus component docs: page-level compositions of tuffex components, one per page, each rendered inside the shared `TemplateFrame` stage. Established 2026-09-24 (task `09-23-nexus-docs-templates-tab`, 10 templates); batch 2 (`09-24-nexus-docs-templates-batch-2`) added five pages and a second style on five existing ones. Read this before adding a template, changing `TemplateFrame`, or touching the `templates` suite.

---

## 1. Scope / Trigger

- Adding a template page, a second style to an existing template page, or a new template group.
- Changing `apps/nexus/app/components/content/demos/TemplateFrame.vue`.
- Changing anything that renders templates: the `templates` suite in `docs-suites.ts` / `DocsSidebar.vue`, or the Template section of the docs page.

A template is a **docs-only** artefact: one demo SFC plus a zh and an en `.mdc`. It is not a tuffex export, has no barrel, and must not add tuffex source.

---

## 2. Registration chain (all of it, in one change)

| Step | File | What |
| --- | --- | --- |
| 1 | `content/docs/dev/components/template-<slug>.{zh,en}.mdc` | Flat file name (the taxonomy script globs `*.mdc`, no sub-directories). Frontmatter `category` is one of `TemplateApp` / `TemplateContent` / `TemplateAi` / `TemplateData` |
| 2 | `scripts/recategorize-component-docs.py` → `TAXONOMY` | Slug under its `Template*` group. The script errors on a doc with no entry **and** on an entry with no doc, so steps 1 and 2 land together |
| 3 | `app/components/DocsSidebar.vue` → `SECTION_ORDER['/docs/dev/components']` | Path inside the templates block (between the concepts pages and `base-suite`), in `TAXONOMY` order |
| 4 | `app/components/content/demos/Template<Name>Demo.vue` | The demo; root element is `<TemplateFrame>` |
| 5 | `app/components/content/demo-registry.ts` | One alphabetical line. It lands with the demo file: Vite resolves every dynamic `import()` in the registry when it transforms it, so a line pointing at a missing file breaks **every** demo on the dev server |

A new **group** additionally adds the category to `SUITE_CATEGORY_KEYS.templates`, `CATEGORY_SUITE_MAP`, `CATEGORY_I18N_KEY` (`app/utils/docs-suites.ts`) and `docsSidebar.categories.<key>` in both `i18n/locales/{zh,en}.ts`.

The suite itself has **no overview page**: `SUITES` gives it `standalonePages: []` and `entryPage: '/docs/dev/components/template-shell'`, and `suiteOverviewLink()` falls back to `entryPage`. It also has no `DocsComponentsGallery` band and no row in the hub's suite-overview table (see `component-guidelines.md` → TuffEx Suite Taxonomy).

---

## 3. Page contract (`template-<slug>.{zh,en}.mdc`)

```
## 场景 / Scenario
## 模板 / Template
### <style name>                ← one ### per style; a second style is a second ###
:::TuffDemoWrapper{demo="Template<Name>Demo" code-lang="vue" title=… description=…}
code: <condensed, truthful skeleton — layout + key component usage, no i18n scaffolding>
:::
## 组成 / Anatomy                ← table: region | components linked to their docs | role
## 交互要点 / Interactions
## 改造建议 / Adapting it
```

zh and en keep the same section count and order (`check-doc-translation-parity`). No `## API` / Props / Best Practices: the coverage test only binds exported component slugs.

> **Warning — an unquoted `: ` in a frontmatter value silently drops the page from its group.** `description: A launcher: search, keys and preview` is a YAML mapping error; the whole frontmatter parses to nothing, `category` becomes `null`, and the page lands in the sidebar's misc bucket of every suite. `check-mdc-fences`, `check-doc-parity` and the taxonomy script all pass it. Rephrase, or quote the value. Chinese full-width `：` is safe.

**A second style on an existing page.** Its `###` goes right after the first style's demo block, and the first style's text and demo stay byte-identical. The style is its own SFC, `Template<Chapter><Style>Demo` (registry line and all), with the same stage `height` as the first. Then, in both languages: one sentence in 场景 naming it; 组成 rows only for regions unique to it, suffixed 「（<风格名>）」 / ` (<style name>)`; 2–3 交互要点 bullets prefixed 「<风格名>：」 / `<Style name>: `; optionally one 改造建议 bullet. Two stages on one page share nothing — each `TemplateFrame` fires its own `@enter`, and only the expanded one holds the scroll lock.

---

## 4. `TemplateFrame` signature

```ts
// apps/nexus/app/components/content/demos/TemplateFrame.vue
defineProps<{ title: string, height?: number /* column stage height, default 540 */ }>()
defineEmits<{ enter: [] }>()   // once, when ≥35% of the stage is first on screen
defineSlots<{ default: (p: { expanded: boolean, width: number, height: number }) => unknown }>()
```

- `width` / `height` are the measured `.template-frame__body` content box (ResizeObserver, rounded px; `0` on the first frame — templates need a fallback).
- `.template-frame__body` is `container-type: inline-size; container-name: template` with a definite height in both states, an opaque `--tx-bg-color` background and the rounded clip.
- The frame is a helper, not a registry entry: it passes `check-demo-registry-orphans` only because every template imports it with `from './TemplateFrame.vue'`.

## 5. Behaviour matrix

| Situation | Behaviour | Why |
| --- | --- | --- |
| Expand clicked | The same instance moves under `<body>` via `<Teleport :disabled="!expanded">`; state survives; `html` scroll locked (scrollbar width padded back); focus → collapse button with `preventScroll` | A remount would lose the reader's selection / half-played timeline |
| Collapse / Esc / backdrop | Moves back, page scroll restored, focus → expand button | |
| Scroll offsets inside the stage, on either toggle | Snapshotted before the toggle, written back after `nextTick` and again on the next frame; a scroller that sat at its end goes back to its end | Moving a subtree resets every `scrollTop` to 0 and fires no scroll event (measured 600 → 0) |
| A live `Range` inside the stage (selection toolbars) | Collapses to the removal point on every toggle. The template keeps the boundary nodes and offsets and re-applies them before measuring | DOM removing steps: the Text nodes survive the move, the Range does not. The Copilot bar stayed at stale viewport rects until this was done |
| Content reflows at the new width | The restored px offset now shows other content; a template anchored to an element (a locked outline heading) re-aligns it from its own ResizeObserver | The frame restores offsets, not anchors |
| Esc while a menu/combobox trigger with `aria-expanded="true"` + `aria-haspopup`/`role="combobox"` has focus (checked with `closest`, the state sits on `.tx-popover__reference`) | Overlay stays; the popup closes | One press must not close two layers |
| Esc from an always-open combobox marked `data-template-esc="self"` that did not `preventDefault` | Overlay collapses | An inline result list is not a popup |
| Esc the template consumed (`event.defaultPrevented`) | Overlay stays | |
| Popover / tooltip / dialog / drawer / ⌘K opened while expanded | Stacks above the overlay | Overlay is a fixed `z-index: 1900`, under the tuffex allocator floor (2000); drawers seed 10000 |
| Site header | Covered by the overlay | `.docs-layout-root` / `.docs-layout-stage` are `isolation: isolate`, so the header's 10000 never leaves the docs layout's stacking context |
| Route change while expanded | Unmount restores scroll and drops observers | |
| `prefers-reduced-motion: reduce` | No fade on expand | |

The overlay **does not** take its z-index from the tuffex allocator on purpose: in a production build auto-registered components compile from tuffex source (`modules/tuffex-components.ts`) while `@talex-touch/tuffex/utils` resolves to dist, so they hold two separate allocators (see `tuffex-docs-sync.md` → Demos).

## 6. Template rules

- **Layout** with `@container template (…)`: `< 640` narrow, `640–959` docs column (≈782 px), `≥ 960` expanded (≈1000–1440 px). A template may add a finer step inside a band for one element that needs it (a search field collapsing to an icon under 760, a wide rail at `≥ 1200`); it does not start its own scale. Viewport `@media` and `TxGrid`/`TxGridLayout` breakpoints follow the window, not the stage.
- **Numbers CSS cannot reach** (chart / flowchart heights and node coordinates, `TxDataTable` `max-height`, rows per page, `TxTabs` placement) come from the slot's `width` / `height`.
- **Playback** starts from `@enter`, never `onMounted` (the docs wrapper mounts demos 240 px before they scroll in). `defineExpose({ resetDemo })` restarts it; reduced motion renders the final state with no timers; every timer, listener, observer and object URL is released on unmount; `watch(locale, resetDemo)`.
- **A safety gate waits.** A write/execute confirmation (`TxToolConfirmation`) is never auto-approved by a timer; show a "click Allow to continue" hint. Non-safety questionnaires may auto-pick the recommended answer after idle, cancelled by any reader input.
- **Page etiquette:** no `scrollIntoView`; no `focus()` reachable from autoplay; keyboard shortcuts on the template root, never `window`/`document` (`app.vue` owns ⌘K and `/` there; `TxSidebarNav` with a one-character `search-hint` hijacks the page's `/`).
- **Code in a template is left alone.** The frame's root and host carry `.not-prose`, which the docs page's inline-code copy, both of its code enhancers and `plugins/highlight.client.ts` skip (`tuffex-docs-sync.md` → Demos). For highlighted code, render through `TxStreamMarkdown`, not the page's highlight.js.
- **Always-dark surfaces** (an ops wall, slides over dark art): put `data-theme="dark"` on the scope — the attribute, not `.dark`, which also switches UnoCSS `dark:` variants — plus `color-scheme: dark`, and redeclare the tokens tuffex derives only at `:root`: `--tx-disabled-bg-color`, `--tx-disabled-text-color`, `--tx-disabled-border-color`, `--tx-chart-grid-line`, `--tx-skeleton-base-color`. Teleported popups leave the scope and follow the page theme.
- **Give focus back when a popup closes.** `TxCommandPalette`, `TxDropdownMenu` and `TxContextMenu` do not: after Esc, and after a menu item is chosen, focus is still inside the leaving panel (a hidden menuitem, the fading palette input), so a "only when it fell to `<body>`" check sees that element and does nothing. Restore to the trigger (`preventScroll`) when focus is on `<body>` *or* inside the closing panel, and check again after the leave transition; leave it alone when the chosen item moved focus on purpose. Focus stranded there also means Esc never reaches `TemplateFrame`, which listens on its host — measured: choose a workspace in an expanded template, press Esc, focus lands on `<body>` and the overlay stays open.
- **Feedback** through `TxToastPanel` inside the stage. A toast closes itself after 3–5 s, reduced motion included; pointer or focus on it holds it (it may carry 撤销 / 查看), re-arming ~2 s after both leave; while closed its wrapper is `inert`, so the hidden buttons leave the tab order and the accessibility tree. Transient flows may use the real `TxDrawer` / `TxModal` / `TxCommandPalette` (they teleport and cover the viewport — that is the component's behaviour). Banned: `toast()` + `TxToastHost`, `clearToasts()`, `TxTouchTip`, `TxBottomDialog` (force-scroll the page), `TxBlowDialog`, `TxMarkdownEditor` (its toolbar icons are the uninstalled `ri` set).
- **Components are auto-registered — never import `Tx*`.** Import only types / helpers from `@talex-touch/tuffex/<dir>`; `TxChart` and its series come from one `@talex-touch/tuffex/charts` import. Mixing an explicit component import with an auto-registered child splits provide/inject in production.
- **Content:** Tuff-flavoured bilingual mock data; third-party performance claims qualitative or labelled 示例数据 / sample data; images generated in code (SVG data URIs, gradients) or repo assets — no hot-links; `i-carbon-*` class literals written in the `.vue` file.

## 7. Good / Base / Bad

- **Good:** `TemplateAutomationDemo` — flowchart x from `width`, canvas height from `height`, run on `@enter` and on Run, reduced motion applies the chain synchronously, rail log wraps inside its own scroller, run history only at `≥ 960`.
- **Base:** `TemplateCmsDemo` — no playback (an admin screen is interactive), `resetDemo` restores data/filters and closes the drawer.
- **Bad:** a template that starts streaming in `onMounted`, calls `toast()`, binds ⌘K on `window`, and sizes its chart with `@media (min-width: 1280px)` — the reader misses the start, the toast never shows in production, ⌘K opens the site search too, and the expanded overlay keeps the column layout.

## 8. Verification required

```bash
cd apps/nexus
node build/check-demo-registry-orphans.mjs && node build/check-mdc-fences.mjs \
  && node build/check-doc-translation-parity.mjs && node build/check-icon-collections.mjs
python3 scripts/recategorize-component-docs.py        # must print "would update 0 file(s)"
curl -s 'http://[::1]:3200/api/docs/sidebar-components/en' | node -e \
  "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).filter(i=>/template-/.test(i.path)&&!i.category).map(i=>i.path)))"   # must print []
pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.app.json   # only the known errors in nuxt.config.ts / server/utils/cloudflare.ts
```

The dev server binds the IPv6 loopback; on this machine `127.0.0.1:3000` is a different app, so address it as `[::1]`. Evict `.nuxt/cache/nitro/functions/docs-sidebar-components/` (and `docs-page/` entries for edited pages) before trusting either.

> **Warning — a vue-tsc run with TS1128 in `.nuxt/types/typed-router-i18n.d.ts` checked nothing.** Two dev servers sharing one `.nuxt` rewrite that file at the same time and leave a duplicated tail. While any syntax error exists tsc skips semantic checking entirely, so the run looks nearly clean. Trim the tail after the last complete `export {}` and rerun.

Plus the icon-name check (`tuffex-docs-sync.md` → Gates) and, in a real browser, per template: column dark + light, expanded, a narrow container (< 640, e.g. a 560 px viewport), the core interactions, reduced motion for the scripted ones, and zero horizontal overflow inside `.template-frame__body`. When judging what is on screen, count by effective opacity / `visibility` / `inert`, not by presence: a closed `TxToastPanel` card stays mounted at opacity 0 inside an `inert` subtree, and a closed `TxDropdownMenu` panel stays mounted with `visibility: hidden`.

## 9. Wrong vs Correct

```vue
<!-- Wrong: plays before the reader arrives, and toasts through the dist store -->
<script setup lang="ts">
import { toast } from '@talex-touch/tuffex/utils'
onMounted(() => { startTimeline(); toast({ title: 'Done' }) })
</script>

<!-- Correct: plays on first visibility, feedback stays inside the stage -->
<template>
  <TemplateFrame :title="copy.title" @enter="startTimeline">
    <template #default="{ width, height }">
      <div class="tpl-root">
        <TxFlowchart :height="Math.max(360, height - 56)" :nodes="nodesFor(width)" :edges="edges" />
        <TxToastPanel :open="noticeOpen">{{ copy.done }}</TxToastPanel>   <!-- controlled; the template closes it -->
      </div>
    </template>
  </TemplateFrame>
</template>
```
