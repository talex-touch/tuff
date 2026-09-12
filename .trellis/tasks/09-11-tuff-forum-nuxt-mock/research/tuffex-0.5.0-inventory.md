# Research: @talex-touch/tuffex@0.5.0 as an npm consumer (for tuff-forum)

Evidence gathered 2026-09-11 by unpacking the published tarball (`npm pack @talex-touch/tuffex@0.5.0`, 2198 files, 11.6 MB unpacked) and cross-reading `packages/tuffex/packages/components/src` in this repo. Everything below was verified, not assumed.

> **Verify props against `node_modules`, not this repo's source.** The repo's
> `packages/tuffex/packages/components/src` is AHEAD of the published 0.5.0.
> A prop that exists in the source may not exist in the package this project
> installs — `CardItemProps.align` is exactly that case, and it type-checks
> against the repo but is `undefined` at runtime from npm. A full prop-name diff
> across the 38 components this forum uses found `align` to be the ONLY
> divergence (checked 2026-09-12), but re-check with:
> `diff <(grep -oE "^\s+[a-zA-Z]+\??:" node_modules/@talex-touch/tuffex/dist/es/<c>/src/types.d.ts) …`
> before relying on anything this file does not list.

## Package facts

- `exports`: `.`, `./style.css` (648 KB, full component CSS **and** contains every base token/rule), `./base.css` (35 KB tokens only), `./utils`, `./*` → `dist/es/*/index.js`, `./*/style.css` → self-contained per-component CSS (e.g. `tooltip/style.css` embeds base-surface/base-anchor rules).
- **`./vite` (on-demand style plugin) is NOT in the tarball** — README documents it but `dist/vite/` is absent in 0.5.0. Do not import `@talex-touch/tuffex/vite`.
- dist JS never side-effect-imports CSS. Styles must be imported by the host.
- Types: `dist/es/index.d.ts`, per-subpath `index.d.ts`, 212 `*.vue.d.ts` shipped → subpath imports are fully typed.
- Runtime deps (installed automatically): `@talex-touch/utils ^2.1.0` (only `@talex-touch/utils/env` is imported at runtime), `marked`, `dompurify`, `@floating-ui/vue`, `gsap`, `katex`, `mermaid`, `shiki`, codemirror, better-scroll, `@number-flow/vue`, `v-wave`, `yaml`.
- **Hazard**: `@talex-touch/utils@2.1.0` declares `peerDependencies.electron ^40||^41`. With `auto-install-peers=true` pnpm would download Electron. Keep `auto-install-peers=false` (machine default) and add `pnpm.peerDependencyRules.ignoreMissing: ["electron"]`.
- `peerDependencies.vue ^3.5.27`.

## Barrel shapes (for auto-registration)

- Most subpaths: `dist/es/<dir>/index.d.ts` has `export { TxFoo, TxBar };` plus `export type {...}` lines.
- `pagination`, `breadcrumb`, `steps`: `index.d.ts` is `export * from './src';` → names live in `dist/es/<dir>/src/index.d.ts`.
- Aggregate dirs to skip: `ai`, `base`, `pro`, `utils` (re-export other barrels → duplicate names), plus non-component `_virtual`, `packages`.
- Alias exports exist (`TuffInput`/`TxInput`, `TuffSelect`/`TxSelect`, `TuffSwitch`/`TxSwitch`, `TuffCheckbox`/`TxCheckbox`, `TuffIcon`/`TxIcon`). Registering both is harmless.
- Nexus reference implementation: `apps/nexus/modules/tuffex-components.ts` (scans src barrels with a textual regex, one-hop `export *` follow, throws on collisions).

## Icon classes the components themselves render

Tuffex renders icons as `<i class="i-carbon-…">` / `<i class="i-ri-…">` → the host MUST provide UnoCSS `presetIcons` + `@iconify-json/carbon` + `@iconify-json/ri` (+ `simple-icons` only for `TxOsIcon`, not needed). Complete static list compiled into dist (39, no dynamic templates):

```
i-carbon-add i-carbon-arrow-down i-carbon-arrow-left i-carbon-bot i-carbon-checkmark-filled i-carbon-checkmark-outline i-carbon-chevron-down i-carbon-chevron-left i-carbon-chevron-right i-carbon-circle-dash i-carbon-close i-carbon-close-filled i-carbon-close-outline i-carbon-cloud-offline i-carbon-data-base i-carbon-direction-straight-right i-carbon-growth i-carbon-incomplete i-carbon-information i-carbon-locked i-carbon-search i-carbon-view i-carbon-warning
i-ri-arrow-go-back-line i-ri-arrow-go-forward-line i-ri-bold i-ri-code-line i-ri-double-quotes-l i-ri-edit-2-line i-ri-eye-line i-ri-heading i-ri-image-line i-ri-italic i-ri-link i-ri-list-ordered i-ri-list-unordered i-ri-markdown-line i-ri-more-2-line i-ri-strikethrough
i-simple-icons-apple i-simple-icons-linux i-simple-icons-windows
```

UnoCSS's default pipeline excludes `node_modules`, so these classes are never extracted from the package. Plan: scan `node_modules/@talex-touch/tuffex/dist/es/**/*.js` at `uno.config.ts` load time and put the result in `safelist` (deterministic, survives version bumps). Also add `app/**/*.ts` to `content.pipeline.include` for icon names kept in data modules (Nexus does the same for `app/(data|composables|utils)`).

Carbon icon names validated against `@iconify-json/carbon` (2714 icons) for forum use — all exist except `trending-up` (use `growth` or `chart-line`).

## Global CSS behaviour

- `base.css`/`style.css` define tokens on `:root`, dark overrides on `.dark` and `[data-theme='dark']`, `html { color: var(--tx-text-color-primary) }`, `.fake-background`, `.tx-transition`. They **do not** reset `body` margin nor set `font-family` on `html/body` (`--tx-font-family` is only a token). Nexus resets body in `app.vue` `<style>`; tuff-forum cannot (no custom CSS) → use `@unocss/reset/tailwind-compat.css` (third-party, allowed) and utility classes referencing tokens (`bg-$tx-bg-color-page`, `text-$tx-text-color-primary`).
- Dark mode: `@nuxtjs/color-mode` with `classSuffix: ''` yields `html.dark` — matches Tuffex selectors. `TxMarkdownView`/`TxMarkdownEditor` `theme: 'auto'` observe `html.class` via MutationObserver.

## SSR

Top-level `window`/`document` reads exist in `drawer`, `markdown-editor`, `markdown-view`, `radio/radio-group-indicator`, `selection-actions`, `liquid`, `code-editor`. Nexus SSRs these from source successfully (guarded via `hasWindow()`), but a pure-mock forum with localStorage state gains nothing from SSR and risks hydration mismatches (spec forbids SSR output depending on localStorage/time/random). Decision: `ssr: false`.

## Component API cheat-sheet (verified props / slots / emits)

Layout
- `TxContainer` — fluid, responsive, maxWidth='1200px', padding small|medium|large|number, margin='auto'.
- `TxRow` — gutter number|{xs..xl}, align top|middle|bottom|stretch, justify start|end|center|space-*, wrap. `TxCol` — span=24, offset, xs/sm/md/lg/xl (cascades **up** from the nearest smaller declared breakpoint; falls back to span). Breakpoints: xs<640, sm<768, md<1024, lg<1280, xl.
- `TxFlex` — direction, gap=12, align, justify, wrap nowrap|wrap, inline. `TxStack` — direction vertical|horizontal, gap=12, align, justify, wrap:boolean, inline.
- `TxGrid` — cols number|{xs..xl}, rows, gap (number|{row,col}|responsive), minItemWidth, justify, align. `TxGridItem` — colSpan, rowSpan.
- `TxDivider` — direction, dashed, textPlacement, gradient; default slot = label.
- `TxSidebarNav` — items[{value,label,group?,icon?(class),badge?,action?{label},disabled?}], groups[{key,label}], v-model, v-model:query, workspace{name,description,initials}, searchPlaceholder, searchHint, actionLabel, filter, ariaLabel; slots workspace / item-icon{item,active} / footer; emits select(item), action, itemAction(item), workspaceClick. Width `--tx-bui-sidebar-nav-width` (240px).
- `TxNavBar` — 44px mobile bar; left/right slots are wrapped in `<button>` (do not nest interactive content). Use only as the mobile drawer header, or not at all.
- `TxLayoutSkeleton` — no props; app-shell placeholder.

Surfaces & list rows
- `TxCard` — variant solid|dashed|plain, background pure|mask|blur|glass|refraction, shadow none|soft|medium, size, radius, padding, clickable, loading, disabled; slots cover/header/default/footer; emits click.
- `TxCardItem` — title, subtitle, description, iconClass, avatarText, avatarUrl, avatarSize, avatarShape circle|rounded, clickable, active, disabled, role, tabindex; slots avatar/title/subtitle/right/description; emits click (root `div` with tabindex + Enter/Space). **No `align` prop in 0.5.0** (it exists only in the repo source — see the warning at the top). Title/subtitle are `white-space: nowrap; overflow: hidden`: a long title in a narrow row is cut mid-word unless the slot content gets `whitespace-normal`.
- `TxStatCard` — value, label, iconClass, clickable, insight{from,to,type percent|delta,color,iconClass,suffix,precision}, variant default|progress, progress, meta; slots label/value/meta.
- `TxGroupBlock` — name, description, defaultIcon, collapsible…; children `TxBlockLine{title,description,link}`, `TxBlockSwitch{title,description,v-model}`, `TxBlockInput{title,description,v-model,placeholder,inputType}`, `TxBlockSelect{title,description,v-model}` + `TxSelectItem` children, `TxBlockSlot{title,description}`.
- `TxDataTable` — columns[{key,title,dataIndex?,width,sortable,align,format}], data, rowKey, loading, emptyText, striped, hover, stickyHeader, maxHeight; slots `cell-<key>`{row,column,value,index}, `header-<key>`, empty, footer; emits rowClick({row,index}), sortChange.
- `TxCellLink` — href, label, external, muted, underline; emits `open({href,event})` and never navigates itself.

Navigation
- `TxTabs` — v-model = the child `TxTabItem`'s `name` string (name is both key and default label; `#name` slot customises the label), placement, borderless, autoHeight, indicatorVariant line|pill|block|dot|outline, animation; `TxTabItem{name,iconClass,disabled,activation}` default slot = panel content.
- `TxBreadcrumb` — items[{label,href?,icon?,disabled?}]; an item **with** href renders a real `<a>` (full reload in SPA) → omit href and handle `@click(item,index)` with `router.push`.
- `TxPagination` — v-model:currentPage, pageSize, total, showInfo, showFirstLast, prev/next/first/last labels; emits pageChange.
- `TxFilterChips` — v-model, items[{value,label,iconClass?,dot?,count?,disabled?}], role toolbar|tablist, indicator, ariaLabel; emits change.
- `TxCommandPalette` — v-model, commands[{id,title,description?,keywords?,icon?,shortcut?,disabled?}], placeholder, emptyText; emits select(item), open, close. Filters on title+description+keywords. **No built-in global hotkey** — host binds ⌘K / Ctrl+K.
- `TxDropdownMenu` — v-model, placement, trigger click|hover, closeOnSelect; slots trigger/default; `TxDropdownItem{disabled,danger,arrow}` emits select, slot right.

Content
- `TxMarkdownView` — content, sanitize=true, theme auto|light|dark.
- `TxMarkdownEditor` — v-model, placeholder, mode/defaultMode wysiwyg|source|preview, toolbar=true, toolbarActions[], minHeight=220, maxHeight, ariaLabel, linkPrompt; emits change, mode-change, focus, blur.
- `TxTimeline{layout}` › `TxTimelineItem{title,time,icon,color default|primary|success|warning|error,active}` default slot.
- `TxAvatar` — src, alt, name (→ initials), icon, size small|medium|large|xlarge|number, status online|offline|busy|away, shape circle|square|rounded, clickable; emits click; image error falls back. `TxAvatarGroup{max,size,overlap,overflowPopover}` wraps `TxAvatar` children.
- `TxTag` — label, icon, color, background, border, size sm|md, pill, variant outline|soft|plain, dot (colour), dotSize, count, closable, closeLabel; emits click, close.
- `TxBadge` — standalone span: variant default|primary|success|warning|error, value, color, dot, open. `TxStatusBadge{text,icon,status success|warning|danger|info|muted,size}`.
- `TxEmptyState` — variant empty|blank-slate|no-data|no-selection|search-empty|loading|offline|permission|error|guide|custom, title, description, icon, layout, align, size, surface plain|card, primaryAction{label,type,variant,size,icon}, secondaryAction; emits primary/secondary; slot actions.
- `TxSkeleton{variant text|rect|circle,width,height,lines,gap}`, `TxRowSkeleton{rows,leading,description,trailing,separated}`, `TxCardSkeleton`, `TxListItemSkeleton`, `useDeferredLoading(source,{delay=150,minDuration=400})` (all from `/skeleton`).
- `TxAlert{type,title,message,closable,showIcon}`; `TxKbd{size,tone}`; `TxTooltip{content,trigger}` (default slot trigger, `#content`); `TxPopover` (`#reference` + default); `TxCollapse`/`TxCollapseItem{title,name}`; `TxTuffLogoStroke{size,mode once|breathe|hover|loop}`.

Forms & actions
- `TxButton` — variant primary|secondary|ghost|danger|success|warning|info|flat|bare, size sm|md|lg, type, plain, round, circle, loading, disabled, icon (class → `<i>`), block, nativeType. `TxIconButton{icon,label(a11y),size xs|sm|md|lg,shape square|circle|pill,pressed,status,disabled}`. `TxCopyButton{text,copyLabel,copiedLabel,size}`.
- `TxInput` — v-model string|number, placeholder, type text|password|textarea|date|email|number, clearable, prefixIcon/suffixIcon (class); emits input/focus/blur/clear. `TxTextarea{v-model,rows,maxLength,showCount,resize,status}`.
- `TxSearchInput` — v-model, placeholder, clearable, remote, searchDebounce; emits search, clear.
- `TxSelect` — v-model (value|value[]), options[{value,label,disabled,icon,description}|{label,options}], placeholder, multiple, searchable, allowCreate, status — or `TxSelectItem{value,label,icon,description}` children.
- `TxTagInput` — v-model string[], placeholder, max, allowDuplicates, separators, confirmOnBlur; emits add/remove/change.
- `TxForm{model,rules,labelPosition left|right|top,labelWidth,size}` exposes `validate(): Promise<boolean>`, `resetFields()`, `clearValidate()`; `TxFormItem{label,prop,rules,required}` reads `model[prop]` via injection.
- `TxSwitch{v-model,label,labelPlacement,size,loading}`; `TxCheckbox{v-model,label,variant}`; `TxRadioGroup{v-model,type button|standard|card,direction}` › `TxRadio{value,label}`.
- Overlays: `TxDrawer{v-model:visible,title,size,direction,showHeader,showFooter,showClose,closeOnClickMask,maskEffect,mobileAdapt}` slots header{close,title}/default/footer{close}; `TxModal{v-model,title,width='480px'}` slots header/default/footer, Esc + mask close; `TxToastHost` (mount once in app.vue) + `toast({title,description,variant default|success|warning|danger,duration})` from `@talex-touch/tuffex/utils`. No confirm() helper exported → compose `TxModal` for confirmations.
- `TxIcon` — `name` starting with `i-` → class icon; builtin names: check, chevron-down, close, search, user, star, star-half.

## Nuxt stack versions (npm, 2026-09-11)

nuxt 4.5.2 (vite 8 + rolldown; engines node ^22.19||^24.11||>=26) · vue 3.5.42 · @unocss/nuxt / unocss 66.10.2 (exports presetWind3/presetWind4/presetIcons; bundles @unocss/reset) · @pinia/nuxt 1.0.2 + pinia 4.0.3 · @nuxtjs/color-mode 4.0.1 (options: classSuffix, classPrefix, dataValue, preference, fallback, storageKey) · @vueuse/nuxt 14.4.0 · @iconify-json/carbon 1.2.27 · @iconify-json/ri 1.2.10 · dayjs 1.11.23 · vitest 5.0.0（npm latest；项目选 ^3.2.7 求稳）· @nuxt/eslint 1.17.0 (eslint ^9||^10) · typescript 5.9.3 · vue-tsc 3.3.11.
