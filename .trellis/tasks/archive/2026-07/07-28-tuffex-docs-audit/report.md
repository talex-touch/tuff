# TuffEx 组件全量审计报告

审计日期 2026-07-28 · 范围 119 个审计单元（114 组件目录 ∪ 118 组文档）· 只读审计，未修改任何源码

## 1. 执行摘要

| 项 | 值 |
|---|---|
| 审计单元 | 119（29 分片，0 失败）|
| 投入 | 87 个 agent · 8.69M token · 3689 次工具调用 · 60 分钟 |
| 原始 findings | 525 |
| 对抗验证淘汰 | 9 |
| D5 标尺错误作废 | 104 |
| **最终 findings** | **421** |
| 人工抽检 | 7/7 CONFIRMED |

| 严重度 | 数量 | 含义 |
|---|---|---|
| high | 59 | 会让使用者写出跑不通/行为错误的代码 |
| medium | 272 | 信息缺失或不一致，不直接致错 |
| low | 90 | 文档范式与精炼度问题 |

| 维度 | 数量 |
|---|---|
| D1 文档↔源码 API 一致性 | 56 |
| D2 Demo 有效性 | 69 |
| D3 中英对等 | 17 |
| D4 组件代码质量 | 214 |
| D5 文档范式 | 65 |

| 问题类型 Top 12 | 数量 |
|---|---|
| `logic-bug` | 82 |
| `a11y` | 70 |
| `stale-demo-code` | 51 |
| `missing-export` | 30 |
| `type-mismatch` | 29 |
| `d5-frontmatter` | 25 |
| `type-leak` | 21 |
| `d5-bloat` | 19 |
| `undocumented-api` | 17 |
| `d5-shallow-api` | 13 |
| `lang-drift` | 10 |
| `invalid-demo-usage` | 8 |

## 2. 核心结论

**最大的问题不是文档写得不好，是组件源码本身。** 421 条 findings 里 214 条（51%）是 D4 组件代码质量，
其中 82 条 `logic-bug`、70 条 `a11y`、30 条 `missing-export`。文档问题反而是次要的。

三个系统性缺陷模式（跨多个组件重复出现）：

1. **`provide()` 传快照而非 computed** — TxForm、TxDropdownMenu 等把 `props.x` 直接塞进 provide，
   而同文件其他字段都用 `computed()`。父组件改 prop 后子组件收不到，是典型的 Vue 响应式失效。
2. **`disabled` guard 覆盖不全** — 同一组件的部分事件处理器有 `if (props.disabled) return`，部分没有（TxCard 即为此例）。
3. **交互式 div 缺可访问性** — `clickable` 卡片、行可点表格等用裸 `<div>`/`<tr>` + `@click`，
   无 `tabindex` / `role` / 键盘处理，键盘和读屏用户完全无法操作。70 条 a11y findings 大多属此类。

## 3. 跨组件共性问题（→ 汇总 issue）

详见 `baseline.md` 与 `baseline-sections.md`（机械核对，非 agent 判断）：

| 问题 | 规模 |
|---|---|
| 孤儿 demo 文件（从未被注册引用的死代码）| **137** / 443（30%）|
| 文档缺 frontmatter 字段（status/since/tags/category）| 23 个文档 |
| 文档臃肿（zh > 400 行）| 14 个，最长 `card` 1802 行 |
| 自定义二级标题（应降级为 `###`）| **205 个**，其中 186 个只出现 1 次 |
| 缺事实标准段 | 见 `baseline-sections.md` §A |

**文档范式已有事实标准，只是从未被写成规范强制执行**（按 118 个 zh 文档覆盖率倒推）：

| 段名 | 覆盖 |
|---|---|
| `## 审阅说明` | 117/118 |
| `## Source` | 116/118 |
| `## 最佳实践` | 115/118 |
| `## API` | 115/118 |
| `## 交互契约` | 101/118 |
| `## 基础用法` | 97/118 |

## 4. 按问题类型索引

### `logic-bug` — 82 条 / 57 个组件

涉及：`ai-elements` · `alert` · `auto-sizer` · `avatar` · `badge` · `base-anchor` · `base-surface` · `breadcrumb` · `button` · `card` · `chat-composer` · `collapse` · `command-palette` · `container` · `context-menu` · `copy-button` · `data-table` · `date-picker` · `dialog` · `dropdown-menu` · `file-uploader` · `flat-dropdown` · `flat-input` · `flat-select` · `flip-overlay` · `form` · `gradual-blur` · `grid` · `grid-layout` · `group-block` · `keyframe-stroke-text` · `markdown-editor` · `markdown-view` · `modal` · `nav-bar` · `number-input` · `pagination` · `picker` · `progress-bar` · `radio` · `rating` · `scroll` · `search-select` · `select` · `sortable-list` · `splitter` · `stagger` · `stat-card` · `steps` · `tabs` · `tag-input` · `timeline` · `toast` · `tooltip` · `transition` · `tree-select` · `version-capsule`

### `a11y` — 70 条 / 64 个组件

涉及：`agents` · `ai-elements` · `avatar` · `base-anchor` · `breadcrumb` · `card` · `card-item` · `chat` · `chat-composer` · `command-palette` · `copy-button` · `corner-overlay` · `data-table` · `date-picker` · `dialog` · `drawer` · `flat-button` · `flat-dropdown` · `flat-radio` · `flat-select` · `flip-overlay` · `form` · `fusion` · `gradient-border` · `group-block` · `icon` · `icon-button` · `image-gallery` · `image-uploader` · `input` · `layout-skeleton` · `loading-overlay` · `markdown-editor` · `modal` · `nav-bar` · `number-input` · `pagination` · `picker` · `popover` · `radio` · `rating` · `search-select` · `segmented-slider` · `select` · `skeleton` · `slider` · `spinner` · `splitter` · `stat-card` · `status-badge` · `steps` · `tab-bar` · `tabs` · `tag` · `textarea` · `toast` · `tooltip` · `transfer` · `transition` · `tree` · `tree-select` · `typing-indicator` · `version-capsule` · `virtual-list`

### `stale-demo-code` — 51 条 / 44 个组件

涉及：`alert` · `auto-sizer` · `avatar` · `avatar-variants` · `base-anchor` · `base-surface` · `button` · `card` · `cascader` · `command-palette` · `container` · `context-menu` · `drawer` · `flat-button` · `flat-input` · `flat-radio` · `flat-select` · `fusion` · `gradient-border` · `gradual-blur` · `icon-button` · `image-gallery` · `index` · `layout-skeleton` · `loading-overlay` · `loading-state` · `markdown-view` · `progress-bar` · `rating` · `search-empty` · `search-input` · `select` · `skeleton` · `slider` · `sortable-list` · `stat-card` · `status-badge` · `steps` · `switch` · `tabs` · `timeline` · `toast` · `transfer` · `version-capsule`

### `missing-export` — 30 条 / 30 个组件

涉及：`agents` · `avatar` · `base-anchor` · `card-item` · `cascader` · `chat` · `collapse` · `command-palette` · `context-menu` · `date-picker` · `divider` · `flat-button` · `flat-input` · `flat-radio` · `gradual-blur` · `grid` · `icon-button` · `image-gallery` · `kbd` · `popover` · `progress` · `radio` · `rating` · `skeleton` · `splitter` · `stack` · `stagger` · `tab-bar` · `timeline` · `tooltip`

### `type-mismatch` — 29 条 / 24 个组件

涉及：`auto-sizer` · `base-anchor` · `base-surface` · `button` · `dialog` · `drawer` · `dropdown-menu` · `error-state` · `flat-radio` · `foundations` · `glass-surface` · `grid` · `group-block` · `icon` · `icon-button` · `loading-state` · `pagination` · `radio` · `rating` · `segmented-slider` · `timeline` · `tooltip` · `version-capsule` · `virtual-list`

### `d5-frontmatter` — 25 条 / 25 个组件

涉及：`agents` · `avatar-variants` · `card-item` · `context-menu` · `date-picker` · `dropdown-menu` · `glass-surface` · `gradual-blur` · `index` · `markdown-view` · `outline-border` · `picker` · `rating` · `scroll` · `search-input` · `skeleton` · `splitter` · `stat-card` · `tab-bar` · `tabs` · `text-transformer` · `tooltip` · `transition` · `tuff-logo-stroke` · `version-capsule`

### `type-leak` — 21 条 / 21 个组件

涉及：`blank-slate` · `card-item` · `code-editor` · `collapse` · `context-menu` · `error-state` · `gradual-blur` · `grid` · `guide-state` · `loading-state` · `no-data` · `no-selection` · `offline-state` · `search-empty` · `search-input` · `search-select` · `sortable-list` · `stagger` · `tab-bar` · `tabs` · `virtual-list`

### `d5-bloat` — 19 条 / 18 个组件

涉及：`auto-sizer` · `avatar-variants` · `base-anchor` · `blank-slate` · `card` · `container` · `context-menu` · `flip-overlay` · `fusion` · `glass-surface` · `grid` · `group-block` · `index` · `layout-skeleton` · `select` · `slider` · `tabs` · `text-transformer`

### `undocumented-api` — 17 条 / 15 个组件

涉及：`base-surface` · `code-editor` · `context-menu` · `data-table` · `dropdown-menu` · `flip-overlay` · `floating` · `icon` · `input` · `radio` · `scroll` · `stat-card` · `tabs` · `tag` · `utils`

### `d5-shallow-api` — 13 条 / 13 个组件

涉及：`button` · `data-table` · `drawer` · `flat-select` · `flex` · `glow-text` · `kbd` · `keyframe-stroke-text` · `search-select` · `segmented-slider` · `stack` · `tag-input` · `typing-indicator`

### `lang-drift` — 10 条 / 10 个组件

涉及：`button` · `dropdown-menu` · `glow-text` · `group-block` · `loading-overlay` · `popover` · `scroll` · `search-select` · `stat-card` · `transition`

### `invalid-demo-usage` — 8 条 / 6 个组件

涉及：`flat-dropdown` · `rating` · `segmented-slider` · `slider` · `stack` · `tree-select`

### `lang-parity` — 7 条 / 6 个组件

涉及：`avatar-variants` · `card` · `cascader` · `empty-state` · `segmented-slider` · `transfer`

### `d5-no-purpose` — 7 条 / 7 个组件

涉及：`alert` · `card` · `input` · `offline-state` · `segmented-slider` · `switch` · `tree`

### `stale-source-ref` — 6 条 / 6 个组件

涉及：`checkbox` · `dialog` · `switch` · `timeline` · `tree-select` · `typing-indicator`

### `orphan-demo` — 5 条 / 5 个组件

涉及：`avatar-variants` · `glow-text` · `popover` · `scroll` · `stack`

### `i18n-hardcoded` — 2 条 / 2 个组件

涉及：`cascader` · `image-uploader`

### `dead-code` — 2 条 / 2 个组件

涉及：`chat-composer` · `floating`

### `dead-css-var` — 1 条 / 1 个组件

涉及：`fusion`

### `dead-prop` — 1 条 / 1 个组件

涉及：`form`

### `broken-mdc-block` — 1 条 / 1 个组件

涉及：`spinner`

### `behavior-mismatch` — 1 条 / 1 个组件

涉及：`spinner`

### `type-drift` — 1 条 / 1 个组件

涉及：`spinner`

### `dead-demo-branch` — 1 条 / 1 个组件

涉及：`spinner`

### `i18n-default` — 1 条 / 1 个组件

涉及：`select`

### `d5-fence-mismatch` — 1 条 / 1 个组件

涉及：`toast`

### `broken-mdc-fence` — 1 条 / 1 个组件

涉及：`loading-overlay`

### `doc-behavior-mismatch` — 1 条 / 1 个组件

涉及：`floating`

### `redundant-logic` — 1 条 / 1 个组件

涉及：`skeleton`

### `unlinked-demo` — 1 条 / 1 个组件

涉及：`flex`

### `misleading-demo` — 1 条 / 1 个组件

涉及：`outline-border`

### `undocumented-behavior` — 1 条 / 1 个组件

涉及：`outline-border`

### `missing-emits-declaration` — 1 条 / 1 个组件

涉及：`permission-state`

### `css-precedence` — 1 条 / 1 个组件

涉及：`container`

### `hallucinated-api` — 1 条 / 1 个组件

涉及：`switch`


## 5. 按组件索引

### 🟡 `agents` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `a11y` · D4 · CONFIRMED
  - Disabled `TxAgentItem` rows lose `role="option"` because `TxCardItem` only applies its `role` prop when `clickable` is true, so a `role="listbox"` container ends up holding role-less `<div>`s that still carry `aria-selected` and `aria-disabled` — invalid ARIA, and it contradicts the docs' own interaction contract.
  - 证据：`packages/tuffex/packages/components/src/agents/src/TxAgentItem.vue:41`
  - 建议：Either always pass the role through (change TxCardItem.vue:49 `:role="clickable ? role : undefined"` to `:role="role"`), or have `TxAgentItem` keep the row focusable-and-labelled when disabled (`role="option"` + `tabindex="-1"` + `aria-disabled`). Add an assertion to agents.test.ts that a disabled row still reports `role === 'option'`.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `AgentsListGroup` is defined in `agents/src/types.ts` and named in both docs' type-contract notes, but `agents/index.ts` re-exports only `AgentItemProps` and `AgentsListProps`, so it cannot be imported from the package.
  - 证据：`packages/tuffex/packages/components/src/agents/index.ts:10`
  - 建议：Add `AgentsListGroup` to the type import on line 1 and to the `export type { ... }` on line 10 of agents/index.ts (and it will then flow through components.ts → the package root), or drop it from the Review Notes in agents.zh.mdc:106 / agents.en.mdc:106 if it is meant to stay internal.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - agents.zh.mdc / .en.mdc frontmatter is missing `status` and `since` (only title / description / category / tags / syncStatus / verified are present).
  - 证据：`apps/nexus/content/docs/dev/components/agents.zh.mdc:4`
  - 建议：Add `status:` and `since:` to both agents.zh.mdc and agents.en.mdc frontmatter, using copy-button.zh.mdc:5-6 (`status: beta` / `since: 1.0.0`) as the template.

### 🟡 `ai-elements` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `a11y` · D4 · PLAUSIBLE
  - TxAiMessage puts `aria-hidden="true"` on the wrapper that hosts the `avatar` slot, and labels the typing indicator with `aria-label` on a role-less `<div>`, so the documented "AI is typing" state is never announced in the polite live region.
  - 证据：`packages/tuffex/packages/components/src/ai-elements/src/TxAiMessage.vue:78`
  - 建议：Give the typing indicator `role="status"` (or render visually-hidden text) so the label is exposed — `aria-label` on a generic div is ignored by AT. Separately, move `aria-hidden="true"` from the slot wrapper (line 63) onto the fallback `<img>`/initial `<span>` only, so a custom `avatar` slot containing interactive or meaningful content is not removed from the a11y tree.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - TxAiConversation renders TxAiMessage without forwarding the `default` and `avatar` slots, so the message customization the docs recommend is unreachable through the conversation component.
  - 证据：`packages/tuffex/packages/components/src/ai-elements/src/TxAiConversation.vue:40`
  - 建议：Forward scoped slots, e.g. `<template #default="slotProps"><slot name="message" v-bind="slotProps" /></template>` and the same for `avatar`, and document them under "TxAiConversation Slots". Today ai-elements.en.mdc:107 tells readers to "Use the `default` slot for tool cards or attachments", but the only documented entry point (TxAiConversation, the sole demo) drops those slots.

### 🔴 `alert` — 3 条（high 1 / medium 1 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxAlert's close `<button>` has no `type="button"`, so it defaults to `type="submit"` and submits any enclosing `<form>` when the alert is dismissed.
  - 证据：`packages/tuffex/packages/components/src/alert/src/TxAlert.vue:56`
  - 建议：Add `type="button"` to the close button, matching `TxButton`/`TxIconButton` which both bind `:type="nativeType"` with a `'button'` default (button/src/button.vue:236, icon-button/src/TxIconButton.vue:61). 36 of 40 Tuffex components with a raw `<button>` already set `type="button"`; TxAlert is one of the outliers.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Alert Variants inline example wraps the four alerts in `<div class="tuff-demo-stack">`, but the real demo uses a bare `<div>` with no class — and `tuff-demo-stack` is defined nowhere in the repo (it appears only in these two doc files).
  - 证据：`apps/nexus/content/docs/dev/components/alert.zh.mdc:26`
  - 建议：Either drop the class from the inline code in alert.zh.mdc:26 and alert.en.mdc:26 so it matches AlertAlertVariantsDemo.vue:6-11, or better, use `<TxStack :gap="12">` in both the inline code and the demo file so readers see a real, spaced layout rather than a phantom utility class.
- **[low]** `d5-no-purpose` · D5 · PLAUSIBLE
  - The opening line under `# Alert 警告` only enumerates features (语义颜色、可选前置图标、标题/正文插槽、可选关闭按钮) instead of stating why the component exists or when not to use it.
  - 证据：`apps/nexus/content/docs/dev/components/alert.zh.mdc:14`
  - 建议：Lead with intent, e.g. "当反馈属于页面某个区域的上下文状态（校验失败、待人工复核、只读提示）时使用 Alert；瞬时、全局的操作反馈请用 Toast。" The `## 最佳实践` bullets at lines 115-119 already contain this material — promote one or two sentences up. Mirror in alert.en.mdc:14.

### 🔴 `auto-sizer` — 4 条（high 1 / medium 2 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxAutoSizer reads durationMs/easing/width/height/rounding/immediate/rafBatch/observeTarget once at setup and passes them by value into useAutoResize/useFlip, so none of these documented props are reactive after mount.
  - 证据：`packages/tuffex/packages/components/src/auto-sizer/src/TxAutoSizer.vue:52`
  - 建议：Either make the underlying utils accept getters/refs (e.g. useAutoResize(outer, inner, () => ({ durationMs: props.durationMs, ... })) and read opt lazily instead of the one-shot `const opt: Required<UseAutoResizeOptions> = {...}` copy at auto-resize.ts:70), or add a watch that re-invokes the utils on prop change. If reactivity is intentionally out of scope, document these props as mount-time-only in the Props table.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The Expose table types `size` as `Ref<{ width, height } | null>` and `outerEl` as `Ref<HTMLElement | null>`, but defineExpose unwraps refs, so consumers receive the plain value / element — the component's own test asserts the unwrapped shape.
  - 证据：`apps/nexus/content/docs/dev/components/auto-sizer.zh.mdc:449`
  - 建议：Change the documented types to `{ width: number; height: number } | null` and `HTMLElement | null` in both auto-sizer.zh.mdc and auto-sizer.en.mdc (line 449/451), matching auto-sizer.test.ts:163-164 (`expect(exposed.size).toEqual({ width: 12, height: 8 })`, `expect(exposed.outerEl).toBe(wrapper.element)`).
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - All 7 AutoSizer demo files mutate state directly and carry an undeclared `ref="sizerRef"`, while every inline `code:` block in the docs wraps mutations in `sizerRef.value?.action?.(...)` — the exact pattern Best Practices tells readers to use.
  - 证据：`apps/nexus/app/components/content/demos/AutoSizerAutoSizerHeightDemo.vue:6`
  - 建议：Update the demo files to declare `const sizerRef = ref<any>(null)` and wrap mutations in `sizerRef.value?.action?.(() => { ... })` so the rendered demo matches the published snippet, or drop the `action()` wrapper from the inline snippets and the Best Practices bullet. Also remove the dangling `ref="sizerRef"` binding in the demos that keep the direct-mutation form.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - auto-sizer.zh.mdc is 483 lines with 7 demos, and three of them (height, height-for-dropdown, height-for-dialog) demonstrate the identical `:width="false" :height="true"` API with only cosmetic chrome differences.
  - 证据：`apps/nexus/content/docs/dev/components/auto-sizer.zh.mdc:134`
  - 建议：Keep one height-only demo (the Tabs one) plus the width-only and TextTransformer demos; delete the dropdown and dialog variants or collapse them into a single "container content" demo. That brings the doc under the 400-line target.

### 🔴 `avatar` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxAvatarGroup's scoped `.tx-avatar-group__item` border/radius rules never apply to user-supplied avatars, because slot content does not carry the group's scope id — only the internally generated `+N` avatar gets styled.
  - 证据：`packages/tuffex/packages/components/src/avatar/src/TxAvatarGroup.vue:86`
  - 建议：Wrap the rule in Vue's `:slotted()` pseudo-class (`:slotted(.tx-avatar-group__item) { ... }`) in addition to the plain selector, or move the border to an inline style object injected via `cloneVNode` alongside `marginLeft`/`zIndex`. Verified empirically: mounting TxAvatarGroup renders slotted avatars with only `data-v-40eab63d` (TxAvatar's own scope) while the `+1` avatar carries both `data-v-40eab63d data-v-d0423723`, so `.tx-avatar-group__item[data-v-d0423723]` matches only the overflow chip. This also makes the documented `--tx-avatar-group-border` variable (avatar.en.mdc:193) inert for real avatars.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - `AvatarSizesDemo.vue` renders four image avatars and omits the `:size="56"` custom numeric size case that the doc's inline snippet advertises as the point of the example.
  - 证据：`apps/nexus/app/components/content/demos/AvatarSizesDemo.vue:3`
  - 建议：Update AvatarSizesDemo.vue to match the documented snippet (`name="Small"` … plus `<TxAvatar :size="56" name="Custom Size" />`), so the only demonstration of the custom-size normalization path (TxAvatar.vue:27-49) is actually rendered. Doc snippet: avatar.zh.mdc:42-46 / avatar.en.mdc:42-46.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `AvatarShape` and `AvatarPresetSize` are public prop types but are not re-exported from avatar/index.ts, so consumers cannot type a `shape` value from the package entry.
  - 证据：`packages/tuffex/packages/components/src/avatar/index.ts:10`
  - 建议：Add `AvatarShape` (and `AvatarPresetSize`) to both `avatar/index.ts:10` and `avatar/src/index.ts:3`. Confirmed against the built `packages/tuffex/dist/es/avatar/index.d.ts:81`, which even references `import('./src/types').AvatarShape` internally while never exporting the name.
- **[medium]** `a11y` · D4 · CONFIRMED
  - `clickable` TxAvatar attaches a click handler to a plain `<div>` with no `role="button"`, `tabindex`, or Enter/Space handler, so the interaction is mouse-only.
  - 证据：`packages/tuffex/packages/components/src/avatar/src/TxAvatar.vue:125`
  - 建议：When `clickable` is true, bind `role="button"`, `:tabindex="0"` and `@keydown.enter/@keydown.space.prevent="handleClick"` on the root (the sibling TxCardItem already does exactly this at TxCardItem.vue:49-52). The docs acknowledge the gap as an "Accessibility boundary" (avatar.en.mdc:211) but the prop still ships a non-reachable affordance.
- **[low]** `stale-demo-code` · D2 · PLAUSIBLE
  - `AvatarBasicDemo.vue` renders the GitHub image avatar without the `alt="GitHub user"` shown in the doc snippet, contradicting the page's own "always provide meaningful alt" best practice.
  - 证据：`apps/nexus/app/components/content/demos/AvatarBasicDemo.vue:13`
  - 建议：Add `alt="GitHub user"` to AvatarBasicDemo.vue:13 and to the five image avatars in AvatarGroupDemo.vue:3-7, so the rendered demos match avatar.zh.mdc:26 and honor the guidance at avatar.en.mdc:200.

### 🟡 `avatar-variants` — 5 条（high 0 / medium 2 / low 3）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - 内联示例声明了 'All' 分类页签且 activeTab 默认 'All'（isActive 对所有卡片返回 true），但页面实际渲染的 AvatarVariantsAvatarVariantsGalleryDemo.vue 没有 All 页签、默认只显示 Status 分类，读者复制代码得到的交互与所见完全不同。
  - 证据：`apps/nexus/content/docs/dev/components/avatar-variants.zh.mdc:24`
  - 建议：内联代码同步为真实 demo 的 setup（tabs 无 All、activeTab 默认 'Status'、isActive 为严格相等），zh/en 两份都要改；或者反过来给真实 demo 补回 All 页签。
- **[medium]** `lang-parity` · D3 · CONFIRMED
  - 英文文档正文首段被清洗成空句：只剩 "`TxAvatar` + `TxOutlineBorder` + `TxCornerOverlay` “”"，中文同位置是完整的设计目的陈述，英文读者拿不到任何页面用途说明。
  - 证据：`apps/nexus/content/docs/dev/components/avatar-variants.en.mdc:10`
  - 建议：把英文首段补成 frontmatter description 的完整句式，例如 "A recipe gallery that composes TxAvatar, TxOutlineBorder, and TxCornerOverlay into status, activity, platform, system, social, and contextual avatar badges."，并删掉遗留的全角引号。
- **[low]** `orphan-demo` · D2 · PLAUSIBLE
  - apps/nexus/app/components/content/demos/AvatarVariantsGalleryDemo.vue（979 行）未在 demo-registry.ts 注册、无任何引用，是文档内联代码的来源版本，与真正渲染的 AvatarVariantsAvatarVariantsGalleryDemo.vue 形成两份会漂移的副本。
  - 证据：`apps/nexus/app/components/content/demos/AvatarVariantsGalleryDemo.vue:7`
  - 建议：删除未注册的 AvatarVariantsGalleryDemo.vue（或反向：保留它并让 demo-registry 指向它、删掉双前缀那份），确保 gallery 只有一份来源。
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - zh/en 各 1014 行，其中约 979 行是整份 gallery demo 源码（含全部 <style>）被原样内联进 code: 块，远超 400 行标尺。
  - 证据：`apps/nexus/content/docs/dev/components/avatar-variants.zh.mdc:17`
  - 建议：内联代码只保留 2-3 个代表性配方（Status dot / Platform badge / Ring），其余引导读者看 <TuffDocSourceLink /> 指向的 demo 源码；样式块整体移除。
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - frontmatter 只有 title / description / category / syncStatus / verified，缺 status、since、tags 三个字段，与同目录 corner-overlay、grid、status-badge 的 8 字段范式不一致。
  - 证据：`apps/nexus/content/docs/dev/components/avatar-variants.zh.mdc:5`
  - 建议：zh/en 都补 `status: beta`、`since: 1.0.0`、`tags: [avatar, badge, recipes]`，与其余组件文档保持同一套字段。

### 🔴 `badge` — 1 条（high 1 / medium 0 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - Combining `dot` with a custom `color` produces an invisible dot: `color` forces `--tx-badge-text: #ffffff` and `.tx-badge__dot` paints itself with `currentColor`, so the 8px dot is filled white and completely covers the `--tx-badge-bg` it was supposed to show.
  - 证据：`packages/tuffex/packages/components/src/badge/src/TxBadge.vue:93`
  - 建议：Make the dot paint from the background token instead of the text token, e.g. `.tx-badge__dot { background: var(--tx-badge-dot, var(--tx-badge-bg, currentColor)); }`, or skip the `--tx-badge-text: #ffffff` override in `customStyle` (TxBadge.vue:14) when `props.dot` is true. Add a test asserting `<TxBadge dot color="#ef4444" />` renders a visible dot color.

### 🟡 `base-anchor` — 7 条（high 0 / medium 6 / low 1）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The `panelCard` row types the prop as `Partial<TxCardProps>`, but the real type is `BaseAnchorPanelCardProps` — a `Partial<Pick<TxCardProps, ...>>` restricted to 15 glass/mask/refraction keys — and any `variant`/`background`/`shadow`/`radius`/`padding` passed through it is silently overwritten by the dedicated props.
  - 证据：`apps/nexus/content/docs/dev/components/base-anchor.zh.mdc:329`
  - 建议：Change the type cell in both zh:329 and en:329 to `BaseAnchorPanelCardProps` and add a sentence that it is a whitelist of glass/mask/refraction keys only, and that `variant / background / shadow / radius / padding` must go through `panelVariant / panelBackground / panelShadow / panelRadius / panelPadding` because `panelCardProps` (TxBaseAnchor.vue:198-205) spreads `panelCard` first and then overrides those five keys.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The `modelValue` row lists default `false`, but `withDefaults` sets it to `undefined`, and that `undefined` is the sentinel that selects uncontrolled mode — a reader who follows the doc and binds a literal `false` gets a permanently-closed anchor.
  - 证据：`apps/nexus/content/docs/dev/components/base-anchor.zh.mdc:307`
  - 建议：Set the default cell to `undefined` in zh:307 / en:307 and note that leaving `modelValue` unset keeps the anchor uncontrolled (internal state), whereas passing any boolean — including `false` — switches it to controlled mode, per `open`'s getter at TxBaseAnchor.vue:58.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The "多种动画 / Multiple Animations" section inlines a single `boom` anchor, while the demo actually rendered above it (`BaseAnchorAnimationDemo.vue`) builds four anchors over `['transfer', 'boom', 'opacity', 'none']` with a per-mode `resolveAnimation()`, so the snippet does not reproduce what the reader sees.
  - 证据：`apps/nexus/app/components/content/demos/BaseAnchorAnimationDemo.vue:52`
  - 建议：Replace the inline snippet at zh:131-157 / en:131-157 with the demo's actual shape — a `v-for="mode in modes"` over the four types bound to `:animation="resolveAnimation(mode)"` — or retitle the section to "聚焦缩放 / Focus Scale" so the heading matches the one-mode snippet.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `base-anchor/index.ts` only re-exports `BaseAnchorProps` / `BaseAnchorAnimationOptions` / `BaseAnchorAnimationType`, so the four type names the Props table uses as prop types — `BaseAnchorPlacement`, `BaseAnchorClassValue`, `BaseAnchorVirtualReference`, and the real `panelCard` type `BaseAnchorPanelCardProps` — cannot be imported by any consumer.
  - 证据：`packages/tuffex/packages/components/src/base-anchor/index.ts:8`
  - 建议：Extend line 8 to `export type { BaseAnchorAnimationOptions, BaseAnchorAnimationType, BaseAnchorClassValue, BaseAnchorPanelCardProps, BaseAnchorPlacement, BaseAnchorProps, BaseAnchorSurfaceMotionAdaptation, BaseAnchorVirtualReference }` so every type named in the docs' Props table is reachable from the package entry (`packages/components/src/components.ts:7` only forwards this file).
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The `size` middleware writes `style.maxWidth = props.maxWidth` unconditionally, so an explicit `width` larger than the default `maxWidth` of 360 is silently clamped — `:width="480"` renders a 360px panel, and neither the `width` nor `maxWidth` doc row mentions the interaction.
  - 证据：`packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue:155`
  - 建议：Skip the `maxWidth` write when `props.width > 0` (an explicit width is a deliberate override), or keep the clamp and state it in both docs: "`width` is still bounded by `maxWidth`; raise `maxWidth` alongside any `width` above 360".
- **[medium]** `a11y` · D4 · CONFIRMED
  - `prefers-reduced-motion: reduce` is honoured only on the liquid path — `prefersReducedMotion()` has exactly one caller, inside `prepareLiquid` — so the default `transfer` animation plus `boom` and `opacity` still run their full GSAP timelines for users who asked for reduced motion.
  - 证据：`packages/tuffex/packages/components/src/base-anchor/src/TxBaseAnchor.vue:573`
  - 建议：Consult the same `reducedMotion` flag in `useBaseAnchorMotion.animateOpen` / `animateClose` (e.g. treat it as `type === 'none'` and go straight to `finishOpen` / `finishClose`), and widen the doc bullet at zh:405 / en:405 from "`liquid` snaps to its end state" to cover every animation type.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - The zh doc is 429 lines (over the 400-line ceiling) with 8 demos, of which the drip/bead treatment alone occupies lines 159-253 — five paragraphs of filter-internals prose plus two near-identical menu demos that differ only by one `animation.type` value.
  - 证据：`apps/nexus/content/docs/dev/components/base-anchor.zh.mdc:211`
  - 建议：Keep one drip/bead demo with a type toggle, cut the motion-internals paragraphs (zh:211-215 / en:211-215) down to one sentence on observable behaviour, and move the derivation rationale to the source comments in `base-anchor-liquid.ts`, where `peelSlopeAt` / `fillSlopeAt` already document it.

### 🔴 `base-surface` — 6 条（high 1 / medium 5 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - In autoDetect mode the MutationObserver ends the motion state whenever ANY observed ancestor's inline style mutates without a transform, so an unrelated style change on <body>/<html> cancels the fallback while the surface is still transforming.
  - 证据：`packages/tuffex/packages/components/src/base-surface/src/base-surface-motion.ts:288`
  - 建议：Track which element started the motion (or count active transform sources) and only call onTransformEnd() when that same element loses its transform. At minimum, guard the else-branch with `mutation.target === el` so ancestor style writes cannot cancel an in-flight fallback.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The CSS Variables table stops at `--tx-surface-fake-index` and omits ~10 variables the component actually emits/consumes (`--tx-surface-mask-opacity-percent`, `--tx-surface-motion-cover-opacity`, `--tx-surface-refraction-edge-opacity`, `--tx-surface-refraction-streak-angle`, the `refraction-*-weight` set, `--tx-surface-fake-bg`, `--tx-surface-fake-opacity`, plus the theme hook `--tx-surface-refraction-mask-color`), contradicting the Review Notes claim that the table now records every runtime variable.
  - 证据：`apps/nexus/content/docs/dev/components/base-surface.zh.mdc:253`
  - 建议：Either extend the table with the remaining emitted variables (mark internal ones as "internal, do not override") and add `--tx-surface-refraction-mask-color` as the documented theming hook, or soften the Review Notes claim to "public/overridable variables only". Apply the same edit to base-surface.en.mdc:253.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - `refractionStrength`, `refractionAngle` and `refractionProfile` are documented with default `-` (implying no effect when unset), but the component substitutes concrete fallbacks 62, -24 and 'filmic' via toFinite/toEnum whenever the refraction model is active.
  - 证据：`apps/nexus/content/docs/dev/components/base-surface.zh.mdc:207`
  - 建议：Document the effective defaults: `refractionStrength` -> `62`, `refractionAngle` -> `-24`, `refractionProfile` -> `'filmic'`, and note that passing any one of the three switches the component from raw channel offsets to the derived refraction model (`shouldUseRefractionModel`, TxBaseSurface.vue:160). Mirror in base-surface.en.mdc:207-208.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The "模式对比 / Mode Comparison" section claims five modes and the real BaseSurfaceModesDemo renders five surfaces, but the inline snippet stops at `glass` and never shows `mode="refraction"`.
  - 证据：`apps/nexus/content/docs/dev/components/base-surface.zh.mdc:42`
  - 建议：Append the refraction surface to the snippet so it matches BaseSurfaceModesDemo.vue:47 (`<TxBaseSurface mode="refraction" :blur="11" :displace="0.8" :distortion-scale="-200" ...>`). Same fix in base-surface.en.mdc:42.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The motion-fallback prose says clicking the button makes "blur and glass cards" degrade to mask, but BaseSurfaceFallbackDemo renders six cards across blur/glass/refraction and half of them intentionally pass `:moving="false"` so they do NOT degrade — the whole point of the demo (side-by-side with/without fallback) is invisible in the docs.
  - 证据：`apps/nexus/content/docs/dev/components/base-surface.zh.mdc:122`
  - 建议：Rewrite the prose to describe the actual A/B grid (blur/glass/refraction × with-fallback/no-fallback) and update the snippet to show two surfaces differing only in `:moving`, matching BaseSurfaceFallbackDemo.vue:46-53 and :158. Mirror in base-surface.en.mdc:122.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `fake` pseudo-element rendering only emits `--tx-surface-fake-bg`/`--tx-surface-fake-opacity` for pure and mask modes, so `fake` combined with blur/glass/refraction silently renders an empty `::before` (invalid `background: var(--tx-surface-fake-bg)`) while the normal layers still paint — and the appearance flips only when motion fallback happens to switch activeMode to mask.
  - 证据：`packages/tuffex/packages/components/src/base-surface/src/TxBaseSurface.vue:646`
  - 建议：Either restrict `fake` at runtime (warn/no-op the `tx-base-surface--fake` class for blur/glass/refraction) or always emit a sensible `--tx-surface-fake-bg` fallback. Also state the pure/mask-only limitation in the "Fake 伪元素模式" doc section (base-surface.zh.mdc:96).

### 🟡 `blank-slate` — 2 条（high 0 / medium 1 / low 1）

- **[medium]** `type-leak` · D4 · CONFIRMED
  - TxBlankSlate.vue declares no `defineEmits`, so the documented `primary`/`secondary` events exist only through attribute fallthrough onto the inner TxEmptyState — `TxBlankSlateInstance['$emit']` has no signature and IDE/vue-tsc give no completion or checking for `@primary`/`@secondary`.
  - 证据：`packages/tuffex/packages/components/src/blank-slate/src/TxBlankSlate.vue:9`
  - 建议：Add `const emit = defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')" @secondary="emit('secondary')"` on the TxEmptyState in the template), export a `BlankSlateEmits` alias from blank-slate/src/types.ts alongside `BlankSlateProps`, and add a blank-slate.test.ts case asserting the events reach the wrapper. The same gap exists in the sibling TxNoData wrapper, so fix both together.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - The same review sentence ("已人工核对 TxBlankSlate.vue、types.ts 与 blank-slate.test.ts") appears twice — once directly under the H1 intro and again as the first bullet of `## 审阅说明`; the `## Source` section then lists the same three files a third time.
  - 证据：`apps/nexus/content/docs/dev/components/blank-slate.zh.mdc:15`
  - 建议：Delete the standalone sentence at blank-slate.zh.mdc:15 (and blank-slate.en.mdc:15) so the H1 is followed only by the design-purpose paragraph, and let `## Source` be the single place that enumerates the component/types/coverage paths.

### 🔴 `breadcrumb` — 2 条（high 1 / medium 1 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - The default `separatorIcon` value `'chevron-right'` is not a TxIcon builtin and has no `i-` prefix, so the documented default separator renders an empty `<i class="chevron-right">` with no visible glyph.
  - 证据：`packages/tuffex/packages/components/src/breadcrumb/src/TxBreadcrumb.vue:12`
  - 建议：TxIcon's `builtinIcons` map (TxIcon.vue:43-68) contains only `chevron-down`, `close`, `search`, `user`, `star`, `star-half`; any other bare name falls through to `return { type: 'class', value: name }` (TxIcon.vue:84) and renders `<i class="chevron-right">`, which is not a valid UnoCSS utility. Change the default to `'i-carbon-chevron-right'` (matching TxPagination.vue:17 `nextIcon: 'i-carbon-chevron-right'`) or add a `chevron-right` entry to TxIcon's builtinIcons, and update the documented default in breadcrumb.zh.mdc:91 / breadcrumb.en.mdc:91 and the contract line ':82'. Also strengthen breadcrumb.test.ts so it asserts a rendered separator glyph, not just the `.tx-breadcrumb__separator` count.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Breadcrumb items without `href` — the documented 'manual click target' pattern — render as a plain `<span>` carrying a click handler, with no `tabindex`, `role="button"`, or keydown handler, so they are unreachable by keyboard.
  - 证据：`packages/tuffex/packages/components/src/breadcrumb/src/TxBreadcrumb.vue:43`
  - 建议：`isInteractive` (line 21-23) requires `item.href`, so every no-href, non-current, non-disabled item becomes a `<span>` with `@click="handleClick(...)"` (line 52) and no focusability. The basic-usage demo relies on exactly this (`{ label: 'Library' }` with `@click`), so its middle crumb cannot be activated without a mouse. Render clickable no-href items as `<button type="button">` (or add `tabindex="0"`, `role="button"`, and an Enter/Space keydown handler) while keeping current/disabled items as inert `<span>`.

### 🔴 `button` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxSplitButton's `ignoreNextMenuClick` guard is set on `pointerdown` but only cleared inside the `click` handler, so an aborted press (pointerdown on the menu button, pointer released elsewhere) leaves the flag stuck `true` and silently swallows the next keyboard activation of the menu trigger.
  - 证据：`packages/tuffex/packages/components/src/button/src/split-button.vue:76`
  - 建议：Reset the flag defensively: clear `ignoreNextMenuClick` on `pointerup`/`pointercancel` (or on a global `pointerup` listener) rather than relying on a matching `click`, and have the keydown handlers call `toggleMenu()` directly instead of routing through `handleMenuClick()`.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The `variant` row documents default `'-'` (none), but button.vue falls back to `secondary` whenever neither `variant` nor `type` is set, so an unset `variant` always renders `variant-secondary`.
  - 证据：`apps/nexus/content/docs/dev/components/button.zh.mdc:164`
  - 建议：Set the `variant` default cell to `'secondary'` (effective) in both button.zh.mdc and button.en.mdc, and note that a `type` value only participates when `variant` is unset — matching `normalizedVariant` in button.vue:91-110.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Split Button snippet binds `:loading="splitLoading"` and `@click="handleRun"` with no `<script setup>` block, while ButtonSplitDemo.vue names the ref `loading`; the snippet cannot run as written and the identifier does not match the demo.
  - 证据：`apps/nexus/content/docs/dev/components/button.zh.mdc:322`
  - 建议：Rename `splitLoading` to `loading` and add the demo's `<script setup>` (the `loading` ref plus the async `handleRun`) to the snippet in both button.zh.mdc and button.en.mdc.
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - In the Primary + Ghost example the English snippet labels the ghost button "Learn More" while the Chinese snippet says "次要操作" and ButtonPrimaryGhostDemo.vue renders "Secondary action" / "次要操作", so the en doc alone describes a different affordance than what the demo shows.
  - 证据：`apps/nexus/content/docs/dev/components/button.en.mdc:350`
  - 建议：Change the en snippet label to `Secondary action` to match ButtonPrimaryGhostDemo.vue and the zh snippet.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Most Props descriptions only restate the prop name/type (`按钮尺寸`, `是否块级（撑满容器）`, `是否朴素按钮`, `图标类名`, `震动类型`) without saying when to set them or what changes visually.
  - 证据：`apps/nexus/content/docs/dev/components/button.zh.mdc:177`
  - 建议：Rewrite each shallow row to state the decision: e.g. `size` → "密度层级；工具栏/表格内联操作用 sm，页面主操作用 md，营销页 CTA 用 lg"; mirror the change in button.en.mdc.

### 🔴 `card` — 7 条（high 1 / medium 4 / low 2）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `onMouseLeave` is missing the `if (props.disabled) return` guard that `onMouseMove` has, so a disabled card with `inertial` still flips `surfaceMoving` to true and drives TxBaseSurface motion state — contradicting the documented contract that disabled blocks pointer-driven motion updates.
  - 证据：`packages/tuffex/packages/components/src/card/src/TxCard.vue:389`
  - 建议：Add `if (props.disabled) return` as the first statement of `onMouseLeave` (line 371), mirroring `onMouseMove` at line 338. Concretely: render `<TxCard disabled inertial background="glass" />`, hover it, then move the pointer off. `onMouseMove` is fully blocked by the disabled guard so `motionX/motionY` stay 0, but `onMouseLeave` still sets `surfaceMoving.value = true`, which forwards `moving=true` to `TxBaseSurface`. That fires `base-surface-motion.ts:339` (`hideRefractionEdge()` + `startRefractionMaskPeakRamp()`) and, for non-refraction modes, `base-surface-motion.ts:328` (`startSettleTimer()` when `needsFallback`), degrading the glass surface to the cheap fallback mask. One frame later `tickFrame` settles and resets it to false, producing a visible flicker on a card that should be inert.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline code for `CardCardBackgroundsScrollDemo` is 27 lines behind the real demo file: it omits the entire `refractionTone` feature (the `RefractionTone` type, the `tone` field on all 7 presets, the `refractionTone` ref, the tone `TxRadioGroup` control, and the `:refraction-tone` binding on `TxCard`).
  - 证据：`apps/nexus/content/docs/dev/components/card.zh.mdc:601`
  - 建议：Regenerate the inline `code:` block from `apps/nexus/app/components/content/demos/CardCardBackgroundsScrollDemo.vue` (808 lines) — the doc snippet is stuck at 781 lines. This matters because `refractionTone` is a documented prop (zh/en line 1669) yet the string `refractionTone` appears exactly once in each doc — only in the Props table, never in any inline example. A reader copying the flagship backgrounds demo gets a version that cannot exercise tone at all, and the demo's meta line still reads `bg={{ bg }} · {{ refractionProfile }}` instead of the real `bg={{ bg }} · {{ refractionProfile }} / {{ refractionTone }}`. The same staleness exists identically in card.en.mdc.
- **[medium]** `lang-parity` · D3 · CONFIRMED
  - The zh Props row for `loadingSpinnerSize` omits the effective default of `12` that the en row documents, and the same zh rows for `clickable`/`loading`/`disabled`/`inertial` drop the behavioral detail present in en.
  - 证据：`apps/nexus/content/docs/dev/components/card.zh.mdc:1678`
  - 建议：Bring the zh row in line with en:1678 ("Spinner size in px. Defaults to `12` when omitted."), which matches `resolvedSpinnerSize` in TxCard.vue:93-97. The gap is systematic across zh rows 1676-1682: zh `disabled` says only "是否禁用" while en:1679 states it "blocks card click emission and pointer-driven motion updates"; zh `inertialRebound` omits the `0..1` clamp that en:1682 states. Also normalize formatting — zh rows 1654-1666 wrap prop names in backticks but rows 1667-1682 do not, an inconsistency absent from en.
- **[medium]** `lang-parity` · D3 · CONFIRMED
  - The zh doc has a stray marketing sentence rendered *inside* the Vue code block of the Layout Examples section, after `</template>`, referencing the obsolete product name "TouchX UI"; the en doc does not have it.
  - 证据：`apps/nexus/content/docs/dev/components/card.zh.mdc:1782`
  - 建议：Delete line 1782. It sits between `</template>` (line 1780) and the closing `---` (line 1783) of a `:::TuffCodeBlock{lang="vue"}` block, so it renders as syntax-highlighted Vue source — prose leaked into a code sample. It is also the sole reason zh is 1802 lines vs en's 1800. The name "TouchX UI" is stale for this library (TuffEx); the only other occurrences repo-wide are in container.zh.mdc / container.en.mdc, which should be swept separately.
- **[medium]** `a11y` · D4 · CONFIRMED
  - A `clickable` card renders `cursor: pointer` and emits `click` from a bare `<div>` with no `tabindex`, `role="button"`, or keydown handler, so the interaction is entirely keyboard- and screen-reader-inaccessible; `disabled` also never sets `aria-disabled`.
  - 证据：`packages/tuffex/packages/components/src/card/src/TxCard.vue:462`
  - 建议：When `clickable` is true, bind `:tabindex="disabled ? -1 : 0"`, `role="button"`, `:aria-disabled="disabled || undefined"`, and add `@keydown.enter.prevent="onClick"` / `@keydown.space.prevent="onClick"` routed through the same `onClick` guard. `grep -c 'tabindex|role=|keydown|aria-disabled'` over TxCard.vue returns 0, confirming none of these exist. The docs acknowledge the div is non-semantic (zh:1705) but that guidance does not make a keyboard user able to activate a card built with `clickable` + `@click`, which is the component's own advertised selection/navigation pattern.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - card.zh.mdc is 1802 lines — over 4.5x the 400-line guideline — and the header/footer slots alone are re-demonstrated by three separate demos.
  - 证据：`apps/nexus/content/docs/dev/components/card.zh.mdc:1`
  - 建议：Collapse the redundant slot demos: `CardBasicSlotsDemo` (line 58), `CardHeaderDemo` (line 234), and `CardHeaderFooterActionsDemo` (line 277) all demonstrate the same header/footer slot API. Keep `CardBasicSlotsDemo` and drop the other two sections. The single largest contributor is the 781-line inline snippet for `CardCardBackgroundsScrollDemo` at line 450 — since `TuffDemoWrapper` already renders the live demo from the demo file, consider truncating that inline `code:` block to the essential `<template>` usage rather than mirroring all 808 lines of preset scaffolding.
- **[low]** `d5-no-purpose` · D5 · PLAUSIBLE
  - The intro line under `# Card 卡片` is a feature enumeration rather than a design-purpose statement — it never says when to reach for Card or when not to.
  - 证据：`apps/nexus/content/docs/dev/components/card.zh.mdc:13`
  - 建议：Replace the feature list with 1-3 sentences on why the component exists and when to choose it. The material for this already lives further down in `## 选型建议（TxBaseSurface vs TxCard）` at line 1642 ("需要更高封装与业务直出：优先用 TxCard … 需要底层材质细调：改用 TxBaseSurface") — hoist that trade-off into the intro so the reader learns the Card-vs-BaseSurface boundary immediately instead of 1600 lines in. Apply the same edit to card.en.mdc line 13.

### 🟡 `card-item` — 4 条（high 0 / medium 3 / low 1）

- **[medium]** `type-leak` · D4 · CONFIRMED
  - TxCardItem 的 `click` emit 声明为 `MouseEvent`，但 Enter 键路径用 `$event as any` 把 KeyboardEvent 从同一通道抛出，消费方按 MouseEvent 用（clientX / instanceof）会拿到错的东西。
  - 证据：`packages/tuffex/packages/components/src/card-item/src/TxCardItem.vue:52`
  - 建议：把 emit 签名改成 `(e: 'click', event: MouseEvent | KeyboardEvent): void`，去掉 `as any`；并在文档 Events 表把 payload 写成 `MouseEvent | KeyboardEvent`，而不是现在这句含糊的“Enter 激活在运行时复用同一事件通道”。
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `CardItemAvatarShape` 只在 src/types.ts 里导出，card-item/index.ts 只 re-export 了 `CardItemProps`，而包入口是 `export * from './card-item/index'`，外部无法 `import type { CardItemAvatarShape }`——但文档 Source 段把它当成可用类型宣传。
  - 证据：`packages/tuffex/packages/components/src/card-item/index.ts:8`
  - 建议：按 empty-state/index.ts 的写法（同时导出 EmptyStateAlign / EmptyStateSize 等）补上 `CardItemAvatarShape`：`import type { CardItemAvatarShape, CardItemProps } from './src/types'` 并 `export type { CardItemAvatarShape, CardItemProps }`。
- **[medium]** `a11y` · D4 · CONFIRMED
  - clickable 行只绑定了 Enter，没有 Space 键；`disabled` 时也只移除 tabindex、不设 `aria-disabled`，而文档 Interaction Contract 又建议传 `role="button"`，此时 ARIA button 规范要求 Enter 与 Space 都能激活。
  - 证据：`packages/tuffex/packages/components/src/card-item/src/TxCardItem.vue:49`
  - 建议：补 `@keydown.space.prevent` 走同一激活路径（Space 需要 preventDefault 阻止页面滚动），并在 `clickable && disabled` 时输出 `aria-disabled="true"`；文档「交互契约」相应补一条 Space 激活说明。
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - card-item 的 zh/en frontmatter 只有 6 个字段，缺 `status` 与 `since`（同组的 error-state、group-block 都有；组件文档集里 95/118 的 zh 文档带 status）。
  - 证据：`apps/nexus/content/docs/dev/components/card-item.zh.mdc:5`
  - 建议：在 zh/en frontmatter 补 `status:`（如 `stable` 或 `beta`）和 `since:`（首次发布版本号），凑齐 title/description/category/status/since/tags/syncStatus/verified 8 字段。

### 🟡 `cascader` — 4 条（high 0 / medium 3 / low 1）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - `CascaderCascaderDemo.vue` initializes `options` to an empty array, so the rendered demo shows two empty cascaders, while the doc's inline code block ships a full Zhejiang/Jiangsu option tree.
  - 证据：`apps/nexus/app/components/content/demos/CascaderCascaderDemo.vue:4`
  - 建议：Port the option tree from cascader.zh.mdc:27-55 into the demo file, and change the model refs to match the documented shapes (`value1 = ref<CascaderValue>(undefined)`, `value2 = ref<CascaderPath[]>([])`) instead of the current `ref('')`, which is not a valid `CascaderValue` for the `multiple` instance.
- **[medium]** `lang-parity` · D3 · PLAUSIBLE
  - The zh intro is a one-line feature list copied from the frontmatter description, dropping the single-vs-multiple value shape and the "search is local to the loaded tree" contract that the en intro states.
  - 证据：`apps/nexus/content/docs/dev/components/cascader.zh.mdc:13`
  - 建议：Translate the three-sentence en intro (cascader.en.mdc:13) into zh: state that single mode stores one path array, multiple mode stores an array of path arrays, search only covers already-loaded nodes, and `load` fires for non-leaf nodes without `children`.
- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - `CascaderPath` / `CascaderKey` are documented as part of the public value contract but `cascader/index.ts` only re-exports `CascaderEmits`, `CascaderNode`, `CascaderProps`, `CascaderValue`, so consumers cannot import them.
  - 证据：`packages/tuffex/packages/components/src/cascader/index.ts:8`
  - 建议：Add `CascaderKey` and `CascaderPath` to the `export type { ... }` list in `cascader/index.ts` (they already exist in src/types.ts:3-4), since cascader.en.mdc:171 tells readers `CascaderValue` is `CascaderPath | CascaderPath[]`.
- **[low]** `i18n-hardcoded` · D4 · PLAUSIBLE
  - TxCascader mixes hardcoded locales: the `placeholder` default is Chinese (`'请选择'`) while the panel strings `Search`, `No results`, `Loading`, and `aria-label="Clear"` are hardcoded English.
  - 证据：`packages/tuffex/packages/components/src/cascader/src/TxCascader.vue:16`
  - 建议：Pick one default locale (English, matching the rest of the panel) and expose the panel strings as props (e.g. `searchPlaceholder`, `emptyText`, `loadingText`) so apps can localize; the en doc currently has to document `'请选择'` as the default (cascader.en.mdc:148).

### 🟡 `chat` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `missing-export` · D4 · CONFIRMED
  - `ChatMessageAttachment` (and `ChatMessageRole`) are documented as public data models in the `## API` → `Data Models` section but are not re-exported from `chat/index.ts`, so consumers of `@talex-touch/tuffex/chat` cannot import the attachment type they are told to construct.
  - 证据：`packages/tuffex/packages/components/src/chat/index.ts:32`
  - 建议：Add `ChatMessageAttachment`, `ChatMessageAttachmentImage`, and `ChatMessageRole` to the `import type { ... } from './src/types'` list and to the `export type { ... }` block in `chat/index.ts`, matching the `#### ChatMessageAttachment` table documented at chat.zh.mdc:69 / chat.en.mdc:69.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Attachment thumbnails render as a `<button>` whose only child is `<img :alt="a.name || ''">`; when `ChatMessageAttachment.name` is omitted (documented as optional) the button has no accessible name at all, so screen-reader users hear an unlabeled button.
  - 证据：`packages/tuffex/packages/components/src/chat/src/TxChatMessage.vue:88`
  - 建议：Give the thumbnail button a deterministic label, e.g. `:aria-label="a.name || 'Open image attachment'"` on the `<button>` while keeping `alt=""` on the decorative `<img>`, and document the fallback label in the `ChatMessageAttachment.name` row so hosts know when to supply it.

### 🟡 `chat-composer` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `maxRows` is declared and defaulted to 6 but never referenced anywhere in TxChatComposer; the textarea is bound only to `minRows`, so setting `maxRows` has no effect.
  - 证据：`packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue:124`
  - 建议：Either implement auto-grow between minRows and maxRows (bind a computed max-height from `maxRows * lineHeight`) or remove `maxRows` from ChatComposerProps and both Props tables; a prop documented as "reserved for consumers" (zh line 51) is indistinguishable from a broken one.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The composer textarea has no accessible name — only a placeholder — and because TxChatComposer keeps default attribute fallthrough, an `aria-label` passed by the host lands on the root `<div>` instead of the textarea.
  - 证据：`packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue:122`
  - 建议：Add an `ariaLabel` prop (or set `inheritAttrs: false` and `v-bind="$attrs"` on the textarea) so hosts can name the field, defaulting to the placeholder text; document it in the Props table of both language files.
- **[low]** `dead-code` · D4 · PLAUSIBLE
  - `textareaRef` is created and bound but never used — the file contains a `void textareaRef.value` no-op statement — and the component exposes nothing, so hosts cannot refocus the composer after send.
  - 证据：`packages/tuffex/packages/components/src/chat/src/TxChatComposer.vue:60`
  - 建议：Delete the `void` statement and add `defineExpose({ focus: () => textareaRef.value?.focus(), blur: () => textareaRef.value?.blur() })`, then document an `Expose` table in both language files (the Best Practices already assume hosts drive the composer after send).

### 🟡 `checkbox` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `stale-source-ref` · D1 · CONFIRMED
  - The `## Source` / Review Notes sections claim `checkbox.test.ts` verifies keyboard toggles, but the test file contains no keydown/keyup trigger at all (only `trigger('click')`).
  - 证据：`apps/nexus/content/docs/dev/components/checkbox.en.mdc:188`
  - 建议：Either add a keyboard test to `checkbox.test.ts` (Enter/Space on the native button, plus a disabled case) or drop 'keyboard toggles' from the coverage claim in both checkbox.en.mdc:188 and checkbox.zh.mdc:188 and instead note that keyboard activation is inherited from the native `<button>` element.

### 🟡 `code-editor` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The runtime registers a `Mod-Shift-f` keymap that runs `format()`, but neither doc mentions the shortcut even though Best Practices tells users to "keep keyboard shortcuts enabled for power users".
  - 证据：`packages/tuffex/packages/components/src/code-editor/src/TxCodeEditorRuntime.vue:572`
  - 建议：Add a bullet to the Interaction Contract in both files: `Cmd/Ctrl+Shift+F` runs `format()` inside the editor (and note it is swallowed even when formatting is unavailable, since the keymap handler always returns true).
- **[medium]** `type-leak` · D4 · CONFIRMED
  - TxCodeEditorToolbar declares `defineEmits(['action'])` (untyped) even though `CodeEditorToolbarEmits` is defined and exported, so consumers receive `any` for the action key.
  - 证据：`packages/tuffex/packages/components/src/code-editor/src/TxCodeEditorToolbar.vue:38`
  - 建议：Use `const emit = defineEmits<CodeEditorToolbarEmits>()` (and `defineProps<CodeEditorToolbarProps>()` with withDefaults instead of the runtime object at line 27) so the documented `CodeEditorToolbarActionKey` payload is enforced; the toolbar demo currently has to cast `$event as CodeEditorToolbarActionKey` (CodeEditorToolbarDemo.vue:67).

### 🟡 `collapse` — 3 条（high 0 / medium 3 / low 0）

- **[medium]** `missing-export` · D4 · CONFIRMED
  - collapse/index.ts re-exports the raw SFCs with no `withInstall` wrapper, no `.install` method and no default export, so the library's global `install()` (which calls `app.use()` over every export of components.ts) skips TxCollapse/TxCollapseItem with a Vue plugin warning and never registers them — unlike drawer/stagger/tree which all expose `install`.
  - 证据：`packages/tuffex/packages/components/src/collapse/index.ts:1`
  - 建议：Mirror the sibling pattern: `const Collapse = withInstall(TxCollapse)`, `const CollapseItem = withInstall(TxCollapseItem)`, export both plus `TxCollapseInstance`/`TxCollapseItemInstance` types and a default export, so `app.use(TuffEx)` and the `@talex-touch/tuffex/collapse` subpath both resolve.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The collapse height animation never runs: `.tx-collapse-item__content` has no explicit height at rest, so the transition interpolates between `height: 0` and `height: auto`, which CSS cannot animate — the panel snaps open/closed despite the docs claiming "过渡类负责高度动画" / "transition classes animate height".
  - 证据：`packages/tuffex/packages/components/src/collapse/src/TxCollapseItem.vue:139`
  - 建议：Use JS transition hooks (`@enter`/`@leave` on the `<Transition>` that set `el.style.height = el.scrollHeight + 'px'` then back to `0`), or switch to `grid-template-rows: 0fr → 1fr` on a wrapper, so the disclosure actually animates. Alternatively drop the height transition and document that the panel toggles instantly.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `CollapseContext` is public API but is provided incorrectly: `accordion` is unwrapped to a plain boolean at setup time so it is a permanently stale snapshot when the prop changes, and `activeNames` is typed as `{ value: string[] }` instead of `Ref<string[]>`, hiding the reactive contract from anyone writing a custom collapse item.
  - 证据：`packages/tuffex/packages/components/src/collapse/src/TxCollapse.vue:83`
  - 建议：Provide `accordion: computed(() => props.accordion)` (or the whole `props` via `toRefs`) and retype `CollapseContext` as `{ activeNames: Ref<string[]>; accordion: ComputedRef<boolean>; handleItemClick: (name: string) => void }`, then use a typed `InjectionKey<CollapseContext>` instead of the raw `'collapse'` string.

### 🔴 `command-palette` — 6 条（high 1 / medium 5 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `onKeydown` bails out before the `Escape` branch whenever the filtered command list is empty, so pressing Escape after typing a query with no matches does not close the palette — contradicting the documented "`Escape` closes the overlay" contract.
  - 证据：`packages/tuffex/packages/components/src/command-palette/src/TxCommandPalette.vue:177`
  - 建议：Move the `Escape` (and ideally the composition guard's non-navigation keys) handling above the `if (!filteredCommands.value.length) return` early return so Escape always calls `close()`, then keep the empty-list guard only around the ArrowDown/ArrowUp/Enter branches.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline `code:` block for `CommandPaletteCommandPaletteDemo` shows a `tx-demo`/`TxCard` layout with 4 commands, while the real demo file renders a two-column `command-palette-demo` preview panel with i18n `labels` and 5 commands (it adds `sync-settings`).
  - 证据：`apps/nexus/content/docs/dev/components/command-palette.zh.mdc:80`
  - 建议：Regenerate the inline `code:` block from `apps/nexus/app/components/content/demos/CommandPaletteCommandPaletteDemo.vue` (or trim the demo to match the doc), so the rendered preview and the shown source describe the same command set and layout.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The command list has no listbox semantics: items are plain `<button>` elements whose active state is only a CSS class, with no `role="listbox"`/`role="option"`/`aria-selected`/`aria-activedescendant`, no accessible name on the search `<input>`, and no `aria-label` on the `role="dialog"` overlay.
  - 证据：`packages/tuffex/packages/components/src/command-palette/src/TxCommandPalette.vue:241`
  - 建议：Give the list container `role="listbox"` with a generated id, give each item `role="option"` + `:aria-selected="index === activeIndex"` + a stable id, wire `aria-controls` and `:aria-activedescendant` on the input, add `aria-label` (or `aria-labelledby` pointing at the input) to the overlay dialog, and set `role="combobox"`/`aria-label` on the input.
- **[medium]** `a11y` · D4 · CONFIRMED
  - `disabled` commands only receive an `is-disabled` CSS class — the `<button>` keeps no `disabled`/`aria-disabled` attribute, so it stays Tab-focusable and clickable, and ArrowUp/ArrowDown stop on it where Enter silently does nothing.
  - 证据：`packages/tuffex/packages/components/src/command-palette/src/TxCommandPalette.vue:243`
  - 建议：Add `:aria-disabled="cmd.disabled"` and `:tabindex="cmd.disabled ? -1 : 0"` on the item button, and make the ArrowUp/ArrowDown handlers skip entries whose `disabled` is true so keyboard focus never parks on an unselectable command.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `CommandPaletteClassValue` is declared and exported in `src/types.ts` and named in both docs' Props type column and Source section, but `index.ts` re-exports only `CommandPaletteEmits`/`CommandPaletteItem`/`CommandPaletteProps`, so consumers cannot import it from the package entry.
  - 证据：`packages/tuffex/packages/components/src/command-palette/index.ts:8`
  - 建议：Add `CommandPaletteClassValue` to the type re-export list in `index.ts` (and to the top-level components barrel) so the type named in the docs is actually importable.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - Closing the palette clears the internal `query` ref without emitting `update:query`, so a parent listening on `@update:query` retains the last typed string and never learns the search box was reset.
  - 证据：`packages/tuffex/packages/components/src/command-palette/src/TxCommandPalette.vue:62`
  - 建议：Route the reset through `onInput('')` or add an explicit `emit('update:query', '')` next to `query.value = ''` in the close branch so the emitted query always mirrors the internal state.

### 🔴 `container` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxCol breakpoint spans do not cascade upward: `map[bp] ?? props.span` falls back to the raw `span` default (24) instead of the nearest smaller breakpoint, so any column that declares only xs/sm/md collapses to 100% width at lg/xl.
  - 证据：`packages/tuffex/packages/components/src/container/src/TxCol.vue:72`
  - 建议：Cascade downward from the active breakpoint before falling back to `span` (e.g. `props[bp] ?? props.lg ?? props.md ?? props.sm ?? props.xs ?? props.span`), and update container.test.ts:113-116 which currently locks in the collapsing behavior.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline code shown for `ContainerContainerDemo` is a plain 2-column Left/Right grid, but the real demo file renders a titled header plus three breakpoint-driven cards with `max-width="680px"`, `:padding="18"` and an object gutter.
  - 证据：`apps/nexus/content/docs/dev/components/container.zh.mdc:23`
  - 建议：Replace the inline `code:` block in both container.zh.mdc and container.en.mdc with the actual template from apps/nexus/app/components/content/demos/ContainerContainerDemo.vue (lines 37-60), or simplify the demo to match the snippet.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - TxRow's responsive gutter fallback chain `g[bp] ?? g.md ?? g.sm ?? g.xs` is non-monotonic — with the documented `{ xs: 8, sm: 16, md: 24, lg: 32 }` object the gutter is 32px at lg but shrinks back to 24px at xl.
  - 证据：`packages/tuffex/packages/components/src/container/src/TxRow.vue:44`
  - 建议：Walk the breakpoint list downward from the active breakpoint (xl -> lg -> md -> sm -> xs) so a missing larger breakpoint inherits the largest defined smaller one, keeping gutters monotonic as the viewport grows.
- **[medium]** `css-precedence` · D4 · CONFIRMED
  - `fluid` and `responsive` used together silently cancel `fluid`: `.tx-container.is-responsive` has equal specificity to `.is-fluid` but is declared later, so max-width is re-capped at 640/768/1024/1280px instead of `none`.
  - 证据：`packages/tuffex/packages/components/src/container/src/TxContainer.vue:73`
  - 建议：Either scope the responsive rules with `.tx-container.is-responsive:not(.is-fluid)` so `fluid` always wins, or document in the props table that `fluid` is ignored when `responsive` is set.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - container.zh.mdc is 428 lines and demonstrates the same TxRow/TxCol span+gutter API in six near-identical code blocks (基础栅格 / 栅格间距 / 响应式栅格 / 页面布局 / 卡片布局 / 常见布局模式).
  - 证据：`apps/nexus/content/docs/dev/components/container.zh.mdc:384`
  - 建议：Keep one basic grid example plus one responsive example, and drop 页面布局 / 卡片布局 / 常见布局模式 (or move them to a separate layout-recipes page) to bring the page under ~250 lines.

### 🔴 `context-menu` — 8 条（high 2 / medium 4 / low 2）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxContextMenu renders its internal TxContextMenuPanel without `outside-guard`, so `data-tx-context-menu-layer` is never emitted and `closeOnAnyPointerDown` closes the menu even when the pointerdown lands inside the menu itself.
  - 证据：`packages/tuffex/packages/components/src/context-menu/src/TxContextMenu.vue:328`
  - 建议：Pass `outside-guard` (or hardcode `data-tx-context-menu-layer="true"` on the panel root) when TxContextMenu owns the panel, so `isEventInsideMenuLayer` at TxContextMenu.vue:208 can actually match. Verified empirically: with `closeOnAnyPointerDown: true`, the mounted panel's `data-tx-context-menu-layer` is `null`, and dispatching `pointerdown` on a menu item emits `update:modelValue` `[[true],[false]]` — the menu closes before the item's click/select can run, contradicting the docs' "Closes on any non-menu pointer down" (context-menu.en.mdc:308).
- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxContextMenuPanel provides `closeOnSelect` as a one-time snapshot of the prop value, so changing `closeOnSelect` on TxContextMenu or TxContextMenuPanel after mount has no effect on child items.
  - 证据：`packages/tuffex/packages/components/src/context-menu/src/TxContextMenuPanel.vue:80`
  - 建议：Provide a reactive value, e.g. `provide(TX_CONTEXT_MENU_INJECTION_KEY, { close, closeOnSelect: computed(() => props.closeOnSelect) })` (updating `ContextMenuContext` to `Ref<boolean>`/getter), or provide a `getCloseOnSelect()` accessor. Today a host that toggles `:close-on-select` at runtime (e.g. entering a multi-step flow) still gets the mount-time behavior in TxContextMenuItem.vue:38.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - TxContextMenuPanel exposes `focusFirstItem()` via defineExpose, but the docs only document a "TxContextMenu Exposes" table and list nothing for the panel.
  - 证据：`packages/tuffex/packages/components/src/context-menu/src/TxContextMenuPanel.vue:83`
  - 建议：Add a `### TxContextMenuPanel Exposes` table after context-menu.zh.mdc:352 / .en.mdc:352 documenting `focusFirstItem: () => void` — it is the only way a host embedding a standalone panel in TxPopover can move focus into the menu, and TxContextMenu itself relies on it at TxContextMenu.vue:233.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline ContextMenu snippet drops `:anchor-mode`, `:toggle-on-reference-click="false"` and `reference-full-width` that the real demo needs for the submenu, and declares `animationMode`/`lastAction` state that the snippet template never renders.
  - 证据：`apps/nexus/content/docs/dev/components/context-menu.zh.mdc:106`
  - 建议：Sync the inline `code:` block with ContextMenuContextMenuDemo.vue:143-154 (add `:toggle-on-reference-click="false"`, `reference-full-width`, `:offset="8"`) and either render the animation/anchor-mode selectors and the `lastAction` status line, or delete those unused refs from the snippet. As written, a reader copying the snippet gets a submenu whose reference click toggles the popover against the `@select="popoverOpen = true"` handler. Same in context-menu.en.mdc:106.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - context-menu/index.ts re-exports only the four Props interfaces; the public union types `ContextMenuTrigger`, `ContextMenuAnchorMode`, `ContextMenuPanelVariant/Background/Shadow`, `ContextMenuPoint` and `ContextMenuOpenTarget` are unreachable from `@talex-touch/tuffex/context-menu`.
  - 证据：`packages/tuffex/packages/components/src/context-menu/index.ts:23`
  - 建议：Add the missing type re-exports (and `ContextMenuContext` if the injection contract is public). Confirmed against the built entry `packages/tuffex/dist/es/context-menu/index.d.ts:553`, which exports the same four names only — so a consumer typing `const mode: ContextMenuAnchorMode` after `import type { ... } from '@talex-touch/tuffex/context-menu'` fails, even though the docs' Review Notes (context-menu.zh.mdc:420) claim these enums are part of the type contract.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `ContextMenuPanelProps.role` is typed as a bare `string`, and any value other than `'menu'` silently disables `focusFirstItem` and all arrow/Home/End keyboard navigation.
  - 证据：`packages/tuffex/packages/components/src/context-menu/src/TxContextMenuPanel.vue:42`
  - 建议：Narrow the type to a union (e.g. `role?: 'menu' | 'listbox' | 'none'`) and either make `getEnabledItems` query the matching item role (`[role="menuitem"]` vs `[role="option"]`) or document the 'menu'-only keyboard contract in the Props table (context-menu.zh.mdc:351 currently just says "ARIA role" with no warning).
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both context-menu.zh.mdc and context-menu.en.mdc frontmatter omit `status`, `since`, and `tags`, unlike every other component page in this shard.
  - 证据：`apps/nexus/content/docs/dev/components/context-menu.zh.mdc:5`
  - 建议：Add `status`, `since`, and `tags` between `category: Navigation` (line 4) and `syncStatus` in both language files so the frontmatter matches the 8-field standard used by avatar/ai-elements/layout-skeleton (e.g. `status: beta`, `since: 1.0.0`, `tags: [menu, contextmenu, overlay]`).
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - context-menu.zh.mdc is 426 lines with ~283 lines of demo/prose before `## API`, including seven `## 常见用法` sub-snippets that re-demonstrate the same props already covered by the main demo.
  - 证据：`apps/nexus/content/docs/dev/components/context-menu.zh.mdc:157`
  - 建议：Trim `## 常见用法` to the two patterns not visible in the main demo (`trigger="manual"` and panel-in-Popover), rename `## 基础与组合场景` → `## Usage` / `## Examples`, and nest the top-level `## Slots` (line 378) under `## API` so the page follows the standard Usage → Examples → API (Props/Events/Slots/Expose) → Source order.

### 🟡 `copy-button` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `logic-bug` · D4 · PLAUSIBLE
  - In the `execCommand` fallback path, `document.body.removeChild(textarea)` is only reached on the success path — if `document.execCommand('copy')` throws, the hidden textarea stays appended to `<body>` forever, accumulating one orphan node per failed attempt.
  - 证据：`packages/tuffex/packages/components/src/copy-button/src/TxCopyButton.vue:59`
  - 建议：Wrap the select/execCommand block in `try { ... } finally { document.body.removeChild(textarea) }` so the node is always removed, then throw `new Error('Copy command failed')` from the `try` when `ok` is false.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Copy success is communicated only by swapping the visible label and the button's own `aria-label` (`buttonLabel`), with no live region, so a screen-reader user who activates the button gets no announcement that the copy happened.
  - 证据：`packages/tuffex/packages/components/src/copy-button/src/TxCopyButton.vue:102`
  - 建议：Add a visually-hidden `<span role="status" aria-live="polite">` inside the button (or as a sibling) that renders `copiedLabel` only while `copied` is true, and document it in the Interaction Contract sections of copy-button.zh.mdc:37-43 / copy-button.en.mdc:37-43.

### 🟡 `corner-overlay` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `a11y` · D4 · CONFIRMED
  - 覆盖层节点硬编码 aria-hidden="true" 且无法关闭，但文档明确建议在 overlay 插槽里放可聚焦的 <button>，会产生「可聚焦元素位于 aria-hidden 子树内」的 WCAG 4.1.2 违规。
  - 证据：`packages/tuffex/packages/components/src/corner-overlay/src/TxCornerOverlay.vue:56`
  - 建议：把 aria-hidden 与 overlayPointerEvents 联动（:aria-hidden="overlayPointerEvents === 'auto' ? undefined : 'true'"），或新增 overlayDecorative?: boolean 显式控制；同步修改 zh/en 文档「可点击覆盖层」示例说明。

### 🔴 `data-table` — 5 条（high 2 / medium 2 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `rowClick` is emitted from the `<tr>` click handler, so ticking the row-selection checkbox also fires `rowClick` — a `selectable` table whose `@rowClick` navigates will navigate on every selection.
  - 证据：`packages/tuffex/packages/components/src/data-table/src/TxDataTable.vue:332`
  - 建议：Add `@click.stop` to the `tx-data-table__cell--select` `<td>` (line 335), or make `emitRowClick` bail when `event.target` is inside the select cell. Verified: clicking `.tx-data-table__cell--select .tx-checkbox` emits both `update:selectedKeys: [[1]]` and `rowClick: [{row:{id:1,...},index:0}]`.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - The `defaultSort` watcher compares by reference, so passing an inline object literal silently reverts the user's chosen sort on any unrelated parent re-render — and no `sortChange` is emitted for the revert, desyncing remote-sort consumers.
  - 证据：`packages/tuffex/packages/components/src/data-table/src/TxDataTable.vue:31`
  - 建议：Watch a stable derived key (e.g. `() => [props.defaultSort?.key, props.defaultSort?.order]`) instead of the object identity, or only apply `defaultSort` once on setup. Verified: with `:default-sort="{ key: 'name', order: 'asc' }"` inline, a user click sets `aria-sort="descending"` and rows `['Bob','Alice']`; bumping an unrelated parent ref flips it back to `aria-sort="ascending"` / `['Alice','Bob']` while `sortChange` still only ever emitted `{key:'name',order:'desc'}`.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The public `interactiveRows` prop is absent from both the zh and en `### TxDataTable Props` tables, even though it is the only way to make `rowClick` keyboard-reachable and is exercised by the component test.
  - 证据：`packages/tuffex/packages/components/src/data-table/src/types.ts:45`
  - 建议：Add a row to both Props tables: `| interactiveRows | boolean | false | 让整行可聚焦并支持 Enter/Space 触发 rowClick；只要绑定了 rowClick 就应该开启 |` — and cross-reference it from the `rowClick` event row so readers know mouse-only rows are the default.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Rows emit `rowClick` on every click but only receive `tabindex`/keydown handling when `interactiveRows` is set, so the documented `rowClick` event is mouse-only by default.
  - 证据：`packages/tuffex/packages/components/src/data-table/src/TxDataTable.vue:331`
  - 建议：Derive interactivity from whether a `rowClick` listener is attached (`!!attrs.onRowClick`) so keyboard access is automatic, or stop emitting `rowClick` from the pointer handler when `interactiveRows` is false. Verified: with default props, clicking a row emits `rowClick` while `row.attributes('tabindex')` is `undefined`.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - The `fixed` column description only restates the type and never mentions that TxDataTable itself never sets `overflow-x: auto` — sticky columns require the consumer to supply an external horizontal scroll container.
  - 证据：`apps/nexus/content/docs/dev/components/data-table.zh.mdc:123`
  - 建议：Rewrite as "何时设" guidance and add a Best Practices bullet: the root only switches from `overflow: hidden` to `overflow: visible` when fixed columns exist (TxDataTable.vue:384-386), so wrap the table in your own `overflow-x: auto` container or the sticky offsets have nothing to stick against.

### 🔴 `date-picker` — 4 条（high 1 / medium 2 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxDatePicker silently clamps an out-of-range `modelValue` into `localParts` for display but never emits `update:modelValue`, so the parent keeps the invalid date while the UI shows a different one.
  - 证据：`packages/tuffex/packages/components/src/date-picker/src/TxDatePicker.vue:144`
  - 建议：In `setFromModel` (and the `watch([minDate, maxDate])` clamp at line 154), compare the clamped result against the incoming string and emit `update:modelValue` + `change` when they differ, so the parent model converges with the rendered date. Add a test asserting `<TxDatePicker :model-value="'2024-12-31'" min="2025-05-10" />` emits `'2025-05-10'` — the current test (date-picker.test.ts:107) only asserts the inner picker value.
- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - `DatePickerVariant` is declared and referenced by the documented `variant` prop union but `date-picker/index.ts` re-exports only `DatePickerEmits` and `DatePickerProps`.
  - 证据：`packages/tuffex/packages/components/src/date-picker/index.ts:8`
  - 建议：Add `DatePickerVariant` to the type re-export so the doc's Source claim (date-picker.en.mdc:148: "types.ts exports DatePickerProps, DatePickerEmits, and DatePickerVariant") holds at the package entry consumers actually import from.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The field calendar puts `role="gridcell"` buttons directly inside a `role="grid"` container with no `role="row"` layer, and each cell's only accessible name is the bare day number while the weekday header is `aria-hidden`.
  - 证据：`packages/tuffex/packages/components/src/date-picker/src/TxDatePicker.vue:451`
  - 建议：Wrap each week of 7 cells in a `role="row"` element (ARIA requires gridcell to be owned by a row), give cells `:aria-label="cell.key"` so the full `YYYY-MM-DD` is announced, and expose the weekday header as a `role="row"` of `columnheader`s instead of `aria-hidden`.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both date-picker docs are missing the `status`, `since`, and `tags` frontmatter fields (only title/description/category/syncStatus/verified are present).
  - 证据：`apps/nexus/content/docs/dev/components/date-picker.zh.mdc:5`
  - 建议：Add `status: beta`, `since: 1.0.0`, and `tags: [date-picker, form, calendar]` to both date-picker.zh.mdc and date-picker.en.mdc so the frontmatter matches the 8-field standard used by cascader/flat-input/switch.

### 🔴 `dialog` — 5 条（high 1 / medium 4 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `TxBottomDialog`'s auto-click countdown (`DialogButton.time`) schedules chained setTimeouts inside a `watchEffect` that are never cleared on unmount or when `btns` changes, so the button's `onClick` still fires after the dialog has been closed.
  - 证据：`packages/tuffex/packages/components/src/dialog/src/TxBottomDialog.vue:120`
  - 建议：Track the pending timeout ids in a module-scoped array, clear them at the start of each `watchEffect` run via `onWatcherCleanup`/`onInvalidate`, and clear them again in `onUnmounted` (which today only removes the scroll listener at line 153). Add a test that mounts with `btns: [{ time: 2, onClick }]`, unmounts after 1s, advances timers past 2s and asserts `onClick` was not called.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - Both locale docs state that plain `message` "preserves line breaks through component styles", but `TxBottomDialog`'s `&__content` block sets no `white-space` rule (unlike Blow/Popper/TouchTip which all set `white-space: pre-line`), so newlines collapse in the bottom dialog.
  - 证据：`apps/nexus/content/docs/dev/components/dialog.en.mdc:185`
  - 建议：Add `white-space: pre-line;` to `.tx-bottom-dialog__content` (TxBottomDialog.vue:263-268) so the documented contract holds for all four variants, or scope the doc sentence (and the identical claim in dialog.zh.mdc:185/265) to the variants that actually do it.
- **[medium]** `type-mismatch` · D1 · PLAUSIBLE
  - `TouchTipProps.buttons` is declared non-optional in types.ts, but both locale API tables list it with default `[]` and mark only `close` as required, so readers will believe `buttons` can be omitted.
  - 证据：`packages/tuffex/packages/components/src/dialog/src/types.ts:205`
  - 建议：Either make it `buttons?: TouchTipButton[]` in types.ts (the component already supplies `buttons: () => []` via withDefaults) or mark it *required* / *必填* in the TxTouchTip Props tables at dialog.en.mdc:245 and dialog.zh.mdc:245.
- **[medium]** `stale-source-ref` · D1 · CONFIRMED
  - `BottomDialogProps.stay` and `.icon` carry JSDoc promising behavior the template never implements (auto-close timer, icon rendering); the published docs correctly call them "reserved"/"not rendered", so IDE intellisense contradicts the docs.
  - 证据：`packages/tuffex/packages/components/src/dialog/src/types.ts:96`
  - 建议：Update both JSDoc blocks to match dialog.en.mdc:193/196 ("Reserved auto-close duration prop; current runtime does not start a timer from `stay` alone" and "Legacy icon class prop; not rendered by the current template"), mark them `@deprecated`, or implement them in TxBottomDialog.vue.
- **[medium]** `a11y` · D4 · CONFIRMED
  - `TxBlowDialog` sets `aria-labelledby` only; its default content region carries no id and the dialog has no `aria-describedby`, so screen readers never announce the message — contradicting the doc claim that Blow and Popper both use stable internal ids for their title/content regions.
  - 证据：`packages/tuffex/packages/components/src/dialog/src/TxBlowDialog.vue:168`
  - 建议：Mirror TxPopperDialog: add `id="tx-blow-dialog-content"` to the content div and `:aria-describedby="message || messageHtml ? 'tx-blow-dialog-content' : undefined"` on the root. While there, switch both Blow and Popper to `useId()` like Bottom/TouchTip do — the hard-coded ids collide when two dialogs stack (which the `index`/z-index-manager API explicitly supports).

### 🟡 `divider` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `missing-export` · D4 · CONFIRMED
  - TxDivider declares its props and the `DividerGradient` union inline in the SFC and index.ts exports only the component plus `TxDividerInstance`, so consumers cannot import `DividerProps` / `DividerGradient` — unlike every sibling in this shard (flex, auto-sizer, pagination, transition all ship a types.ts).
  - 证据：`packages/tuffex/packages/components/src/divider/index.ts:6`
  - 建议：Add `packages/tuffex/packages/components/src/divider/src/types.ts` exporting `DividerGradient` and `DividerProps`, have TxDivider.vue use `defineProps<DividerProps>()` (replacing the inline `type DividerGradient = ...` at TxDivider.vue:4), and re-export both types from index.ts.

### 🔴 `drawer` — 4 条（high 1 / medium 2 / low 1）

- **[high]** `a11y` · D4 · CONFIRMED
  - When `visible` is false the drawer root is marked `aria-hidden="true"` but is never removed from the layout (no `inert`, no `display:none` — only `pointer-events:none` plus an off-screen transform), so the built-in close button and all slot content stay in the keyboard tab order inside an aria-hidden subtree.
  - 证据：`packages/tuffex/packages/components/src/drawer/src/TxDrawer.vue:225`
  - 建议：Bind `:inert="!display"` on the root (and/or add `visibility: hidden` to the non-`--visible` state after the transition ends) so focusable descendants leave the tab sequence whenever the drawer is closed. Add a test that mounts with `visible: false`, focuses a slot button, and asserts focus does not land inside `.tx-drawer`.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The `zIndex` Props row documents default `1998`, but the component has no `withDefaults` entry for it and falls back to the runtime z-index manager seeded at `DRAWER_Z_INDEX_SEED = 10000`; drawer.test.ts asserts the rendered value is `10001`, so `1998` is only the dead CSS `var()` fallback that is never used.
  - 证据：`apps/nexus/content/docs/dev/components/drawer.zh.mdc:294`
  - 建议：Change the default cell in both drawer.zh.mdc and drawer.en.mdc to `auto (allocated from the shared z-index manager, currently starting at 10001)` and note that setting `zIndex` explicitly also reseeds the manager via `refreshZIndex`.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `### Slots / effects / mobile / close controls` inline sample only demonstrates the header/footer slots plus `mask-effect="opacity"` and `panel-transparent`, while the referenced DrawerSlotsEffectsDemo.vue actually renders nine drawers covering all three mask effects, `show-header`/`show-footer` off, `mobile-adapt` on/off, and the `close-on-click-mask`/`close-on-press-escape`/`show-close` combination — a reader copying the snippet gets none of the mobile or close-control behavior the heading promises.
  - 证据：`apps/nexus/content/docs/dev/components/drawer.zh.mdc:92`
  - 建议：Either narrow the heading to "Header / Footer slots" and move mask/mobile/close coverage into their own snippets, or extend the inline `code:` block to include the `:mobile-adapt="false"` and `:close-on-click-mask="false" :close-on-press-escape="false" :show-close="false"` drawers that the demo file actually renders. Apply the same fix to drawer.en.mdc line 92.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Several Props rows only restate the prop name (`visible` → '控制抽屉可见性', `title` → '头部显示的标题', `zIndex` → '自定义 z-index') without saying when to set them or what happens if you do not.
  - 证据：`apps/nexus/content/docs/dev/components/drawer.zh.mdc:292`
  - 建议：Rewrite these descriptions to state the decision, e.g. `zIndex`: '仅在需要与非 TuffEx 的第三方浮层共存时手动指定；默认由共享 z-index 管理器分配，多个 Drawer 会自动叠加'. Same for `title` (also the a11y fallback label when showHeader=false) and `visible`.

### 🔴 `dropdown-menu` — 7 条（high 1 / medium 5 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxDropdownMenu provides `closeOnSelect` as a snapshot primitive instead of a getter/computed, so changing `:close-on-select` after mount never reaches TxDropdownItem.
  - 证据：`packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue:112`
  - 建议：Provide a reactive value: `provide('txDropdownMenu', { close, get closeOnSelect() { return props.closeOnSelect } })` (or provide a `computed(() => props.closeOnSelect)` and unwrap in TxDropdownItem), and add a test that flips `closeOnSelect` with `setProps` after mount.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The en Props table documents `animation` default as `{ type: 'transfer', duration: 180 }`, but the code default is `() => ({})` (and the zh table says `{}`), so en/zh and code all disagree.
  - 证据：`apps/nexus/content/docs/dev/components/dropdown-menu.en.mdc:134`
  - 建议：Change the en default cell to `{}` to match `withDefaults(..., { animation: () => ({}) })` in TxDropdownMenu.vue:13, and note in the description that the effective animation comes from BaseAnchor defaults when the object is empty.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - Both docs list `modelValue` default `false`, but the code default is `undefined`; passing a literal `false` switches the menu into controlled mode where it can never open, while omitting it uses internal state.
  - 证据：`packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue:9`
  - 建议：Document the default as `undefined` and add one line to the Interaction Contract: omitting `modelValue` keeps open state internal (uncontrolled); passing a boolean makes the menu fully controlled and the host must handle `update:modelValue`.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - Keyboard menu navigation (auto-focus of the first enabled item on open, ArrowDown/ArrowUp/Home/End roving focus, skipping aria-disabled items) is implemented and unit-tested but absent from both docs' Interaction Contract, which only mentions the ARIA roles.
  - 证据：`packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue:69`
  - 建议：Add two bullets to the Interaction Contract (zh line 190 / en line 190): the first enabled item receives focus when the menu opens, and ArrowDown/ArrowUp wrap around while Home/End jump to the ends, skipping disabled items.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - TxDropdownMenu hardcodes `:max-width="360"` on the Popover, so a documented `minWidth` above 360 is silently clamped and there is no prop to widen the panel.
  - 证据：`packages/tuffex/packages/components/src/dropdown-menu/src/TxDropdownMenu.vue:126`
  - 建议：Either expose a `maxWidth` prop (defaulting to 360) forwarded to TxPopover, or document the hard 360px cap next to `minWidth` in both Props tables so consumers know menus cannot exceed it (BaseAnchor writes `style.maxWidth` which overrides the computed width).
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - The zh page's lead paragraph is a verbatim copy of its frontmatter description ("基于 Popover 的下拉菜单（Windows 风格）"), while the en lead explains trigger slot, v-model control, and TxDropdownItem usage.
  - 证据：`apps/nexus/content/docs/dev/components/dropdown-menu.zh.mdc:10`
  - 建议：Translate the en lead into zh: 说明 TxDropdownMenu 从 trigger 插槽渲染紧凑操作菜单、用 v-model 控制开合、菜单行使用 TxDropdownItem，并删除对 description 的重复。
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both dropdown-menu files ship only 5 of the 8 standard frontmatter fields — `status`, `since`, and `tags` are missing.
  - 证据：`apps/nexus/content/docs/dev/components/dropdown-menu.zh.mdc:4`
  - 建议：Add `status`, `since`, and `tags: [dropdown, menu, popover]` to both zh and en frontmatter to match the chat-composer/textarea baseline.

### 🟡 `empty-state` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `lang-parity` · D3 · PLAUSIBLE
  - The zh doc's opening line just repeats the frontmatter `description` verbatim, dropping the en doc's two-sentence design guidance (which surfaces/panes it is for, and the "pick a preset variant first, override copy only when local context needs it" rule).
  - 证据：`apps/nexus/content/docs/dev/components/empty-state.zh.mdc:13`
  - 建议：Translate empty-state.en.mdc:13 into the zh doc, e.g. "`TxEmptyState` 为页面、表格、详情面板和引导流程渲染紧凑的反馈面板。常见状态先选预设 `variant`，只有本地上下文需要更具体的文案时才覆盖文字、图标或操作。"

### 🟡 `error-state` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - Props 表把 `actionSize` 的默认值写成「继承值 / inherited」，但 TxEmptyState 的 withDefaults 明确给了 `actionSize: 'small'`，读者无法从文档得知生成按钮实际是 small。
  - 证据：`apps/nexus/content/docs/dev/components/error-state.zh.mdc:88`
  - 建议：把 `actionSize` 默认值改成 `'small'`（zh/en 同步）；`iconSize` 同理写清实际来源 `small=28 / medium=36 / large=44`，而不是「继承值」。
- **[medium]** `type-leak` · D4 · CONFIRMED
  - TxErrorState 只有 `defineProps`，没有 `defineEmits`，文档 Events 表声明的 `primary` / `secondary` 在组件类型上不存在（运行时靠 attrs fallthrough 才生效），模板类型检查下 `<TxErrorState @primary="...">` 无类型支撑。
  - 证据：`packages/tuffex/packages/components/src/error-state/src/TxErrorState.vue:9`
  - 建议：加 `const emit = defineEmits<EmptyStateEmits>()` 并在模板里显式 `@primary="emit('primary')" @secondary="emit('secondary')"`（EmptyStateEmits 已从 ../../empty-state 导出）；同族的 TxNoData / TxSearchEmpty / TxNoSelection 有同样问题，建议一并处理。

### 🔴 `file-uploader` — 2 条（high 1 / medium 1 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `onDrop` never checks the `multiple` prop, so a `TxFileUploader` configured with `:multiple="false"` still accepts an unlimited number of dropped files (up to `max`), unlike the native picker path.
  - 证据：`packages/tuffex/packages/components/src/file-uploader/src/TxFileUploader.vue:105`
  - 建议：In `onDrop`, slice the dropped list to 1 when `props.multiple === false` (e.g. `const files = props.multiple ? all : all.slice(0, 1)`), and document the drop-vs-picker parity in the Interaction Contract section of both docs.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `onDragLeave` clears `dropActive` on any bubbled dragleave from a child node, so the `is-dragging` highlight flickers while the cursor crosses the inner button/span boundaries of the drop zone.
  - 证据：`packages/tuffex/packages/components/src/file-uploader/src/TxFileUploader.vue:96`
  - 建议：Use a drag-enter/leave depth counter, or ignore the event when `e.relatedTarget` is still contained by the root element (`if (rootEl.contains(e.relatedTarget as Node)) return`).

### 🟡 `flat-button` — 3 条（high 0 / medium 3 / low 0）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Basic Usage snippet wraps the buttons in `<div class="tuff-demo-row">` (a real class deep-styled by TuffDemoWrapper.vue:451), but FlatButtonFlatButtonDemo.vue uses bare `<div v-if="locale === 'zh'">` with no class, so the rendered demo loses the row layout/gap the snippet promises.
  - 证据：`apps/nexus/content/docs/dev/components/flat-button.zh.mdc:26`
  - 建议：Add `class="tuff-demo-row"` to both locale branches in apps/nexus/app/components/content/demos/FlatButtonFlatButtonDemo.vue (lines 6 and 18) so the live demo matches the documented markup in both flat-button.zh.mdc:26 and flat-button.en.mdc:26.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The loading state exposes nothing to assistive tech: the button gets no `aria-busy`, and the decorative spinner SVG has no `aria-hidden="true"`, so a screen reader user only perceives that the button became disabled with no explanation — despite the docs asserting an accessibility review.
  - 证据：`packages/tuffex/packages/components/src/flat-button/src/TxFlatButton.vue:47`
  - 建议：Bind `:aria-busy="loading || undefined"` on the `<button>` and add `aria-hidden="true"` (or `role="presentation"`) to the spinner wrapper/SVG. Then extend the accessibility bullet in flat-button.zh.mdc:120 / .en.mdc:120 to state the loading contract instead of only the disabled one.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - flat-button/index.ts exports only the component value — no props interface, no `TuffFlatButtonInstance` type, and it hand-rolls `.install` instead of using the shared `withInstall`, unlike every sibling in this shard (base-surface, search-empty and search-select all export their types).
  - 证据：`packages/tuffex/packages/components/src/flat-button/index.ts:8`
  - 建议：Extract the inline `defineProps` shape into `src/types.ts` as `FlatButtonProps`, switch to `withInstall(...)` for consistency, and export `{ FlatButtonProps }` plus `export type TuffFlatButtonInstance = InstanceType<typeof TuffFlatButton>` so external consumers can type props and template refs.

### 🔴 `flat-dropdown` — 3 条（high 2 / medium 1 / low 0）

- **[high]** `invalid-demo-usage` · D2 · CONFIRMED
  - Both the inline doc example and the real FlatDropdownBasicDemo pass `variant="default"` to `TxButton`, but `'default'` is not part of `ButtonProps['variant']` ('primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'info' | 'flat' | 'bare'), so the button renders an unstyled `variant-default` class.
  - 证据：`apps/nexus/app/components/content/demos/FlatDropdownBasicDemo.vue:15`
  - 建议：Change to `:variant="open ? 'primary' : 'secondary'"` (the value `normalizedVariant` falls back to when nothing is set) in the demo and in the `code:` blocks at flat-dropdown.zh.mdc:32 and flat-dropdown.en.mdc:32.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - `closeOnClickOutside` is wired up for every trigger mode, so a `trigger="manual"` dropdown still closes itself on an outside click, contradicting both docs and the types.ts JSDoc which say manual mode leaves dismissal entirely to the host.
  - 证据：`packages/tuffex/packages/components/src/flat-dropdown/src/TxFlatDropdown.vue:236`
  - 建议：Gate the pointerdown listener on the trigger mode: `if (props.closeOnClickOutside && props.trigger !== 'manual')`, matching the contract stated in flat-dropdown.zh.mdc:75 / .en.mdc:75 and types.ts:42 ("click & hover triggers"). Add a test covering `trigger: 'manual'` + outside pointerdown asserting no `close` emit.
- **[medium]** `a11y` · D4 · CONFIRMED
  - `TxFlatDropdown` emits zero ARIA: the trigger wrapper has no `aria-expanded`/`aria-haspopup`/`aria-controls` and the floating panel has no `role` or `id`, so assistive tech gets no signal that a panel opened.
  - 证据：`packages/tuffex/packages/components/src/flat-dropdown/src/TxFlatDropdown.vue:265`
  - 建议：Generate a panel id with `useId()`, put `:aria-expanded="open"`, `aria-haspopup="true"` and `:aria-controls="panelId"` on the reference div (or expose them through `triggerSlotProps` so consumers can bind them to their own button), and give the panel `:id="panelId"`. Document the resulting slot props in the Slots table of both locale docs.

### 🔴 `flat-input` — 3 条（high 1 / medium 2 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - Caps Lock detection uses keypress-era charCode logic on a `keydown` event, so any unshifted letter key (keyCode 65-90) turns the "Caps Lock" hint on even when Caps Lock is off, and the 97-122 branch is dead code.
  - 证据：`packages/tuffex/packages/components/src/flat-input/src/FlatInput.vue:47`
  - 建议：Replace the keyCode heuristic with `capsLockOn.value = e.getModifierState?.('CapsLock') ?? false` and also handle `keyup`. Update flat-input.test.ts:85-89, which currently locks in the wrong behavior by asserting the hint appears for `{ keyCode: 65, shiftKey: false }`.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Basic Usage inline code shows two fields (text + password) while the rendered `FlatInputFlatInputDemo` also renders a third `area :non-win="true"` textarea.
  - 证据：`apps/nexus/app/components/content/demos/FlatInputFlatInputDemo.vue:30`
  - 建议：Add the `note` ref and the textarea line to the inline `code:` block in flat-input.zh.mdc:22-32 and flat-input.en.mdc:22-32 so the copyable snippet matches what the reader sees rendered.
- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - `flat-input/index.ts` exports only the component (plus the `TxFlatInput` alias) — there is no `types.ts` and no exported `FlatInputProps` / instance type, so downstream wrappers cannot type the props that the doc's API table describes.
  - 证据：`packages/tuffex/packages/components/src/flat-input/index.ts:9`
  - 建议：Extract the inline `defineProps` shape (FlatInput.vue:10-17) into `src/types.ts` as `FlatInputProps` / `FlatInputEmits`, re-export them from index.ts, and add `export type TxFlatInputInstance = InstanceType<typeof FlatInput>` to match the pattern used by cascader/date-picker.

### 🟡 `flat-radio` — 4 条（high 0 / medium 4 / low 0）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - `modelValue` is a required prop in `TxFlatRadioProps` (no `?`), but both docs list its default as `-` with no required marker, while `TxFlatRadioItem.value` in the same page is correctly marked 必填/required.
  - 证据：`apps/nexus/content/docs/dev/components/flat-radio.zh.mdc:229`
  - 建议：Change the Default cell to `*必填*` / `*required*` in both flat-radio.zh.mdc and flat-radio.en.mdc, or make the prop optional in types.ts if an uncontrolled group should be allowed.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - FlatRadioKeyboardDemo tells users of the single-select group to "confirm with Enter/Space", but `handleKeydown` only handles Enter/Space when `props.multiple` is true, so both keys are no-ops in single mode.
  - 证据：`apps/nexus/app/components/content/demos/FlatRadioKeyboardDemo.vue:20`
  - 建议：Change the single-mode hint to "focus with Tab, arrow keys select immediately" (matching TxFlatRadio.vue:206 and the docs' keyboard table), or make Enter/Space re-select the current value in single mode.
- **[medium]** `a11y` · D4 · CONFIRMED
  - In `multiple` mode the arrow-key cursor `focusedValue` is tracked internally but never rendered or exposed — it is not provided to items, not styled, and not surfaced via `aria-activedescendant`, so keyboard users move an invisible cursor before Enter/Space toggles an item they cannot identify.
  - 证据：`packages/tuffex/packages/components/src/flat-radio/src/TxFlatRadio.vue:222`
  - 建议：Add `focusedValue` to the provided `TxFlatRadioContext`, render an `is-focused` outline on the matching item, give items stable ids and set `aria-activedescendant` on the container so the virtual focus is both visible and announced.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `TxFlatRadioSize` and `TxFlatRadioContext` are declared in src/types.ts but omitted from the flat-radio barrel's type re-export list, even though `FLAT_RADIO_KEY` itself is exported — consumers can inject the context but cannot type it or type a `size` variable.
  - 证据：`packages/tuffex/packages/components/src/flat-radio/index.ts:10`
  - 建议：Extend the export to `export type { TxFlatRadioContext, TxFlatRadioItemProps, TxFlatRadioProps, TxFlatRadioSize, TxFlatRadioValue }` so `export * from './flat-radio/index'` in components.ts surfaces them package-wide.

### 🔴 `flat-select` — 6 条（high 2 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `selectedLabel` is only ever overwritten when the new `modelValue` matches a registered item, so clearing the selection (setting v-model back to `''`) leaves the trigger showing the previously selected label instead of the placeholder.
  - 证据：`packages/tuffex/packages/components/src/flat-select/src/TxFlatSelect.vue:194`
  - 建议：Change the watcher body to `selectedLabel.value = entry ? entry.label : ''` so an unmatched/cleared model value resets the label and re-applies the `is-placeholder` class and `displayText` fallback.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - `handleClick` builds the committed label from `props.label || String(props.value)`, ignoring the default slot, so the documented "default slot overrides label" path makes the trigger display the raw value (e.g. `signed`) after selection instead of the slotted content.
  - 证据：`packages/tuffex/packages/components/src/flat-select/src/TxFlatSelectItem.vue:27`
  - 建议：Read the rendered label from `itemRef.value.textContent` (or require `label` when a custom slot is used) so `handleSelect` and `registerItem` propagate the slot text to the trigger; alternatively document that `label` is mandatory whenever the default slot is used.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - FlatSelectBasicDemo.vue hardcodes the Chinese placeholder "选择格式" and adds a TxCard "selected:" readout, neither of which appears in the zh or en inline snippet; the en doc shows `placeholder="Select format"` while the live demo renders Chinese.
  - 证据：`apps/nexus/app/components/content/demos/FlatSelectBasicDemo.vue:9`
  - 建议：Localise the placeholder via `useI18n()` (as EmptyEmptyDemo.vue does) and either add the TxCard readout to the doc snippets or drop it from the demo so the copy-pasteable code matches what renders.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `close()` schedules a bare 200 ms `setTimeout` that is never stored or cleared, so a trigger click during the closing animation is swallowed (toggle still sees `isOpen === true` and re-closes) and the timer keeps running after unmount.
  - 证据：`packages/tuffex/packages/components/src/flat-select/src/TxFlatSelect.vue:125`
  - 建议：Keep the handle in a `closeTimer` ref, clear it at the top of `open()` and in `onBeforeUnmount`, and let `open()` cancel a pending close so a rapid click reopens the dropdown instead of being dropped.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The trigger carries `role="combobox"` but the options have no `id` and the trigger has no `aria-activedescendant`, so ArrowUp/ArrowDown navigation (which keeps DOM focus on the trigger) is never announced by screen readers; the `role="listbox"` container also has no accessible name.
  - 证据：`packages/tuffex/packages/components/src/flat-select/src/TxFlatSelect.vue:222`
  - 建议：Give each `TxFlatSelectItem` a derived id (e.g. `${dropdownId}-opt-${value}`), bind `:aria-activedescendant` on the trigger to the currently highlighted option id while open, and add `aria-label`/`aria-labelledby` on the listbox div.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Every row in the TxFlatSelect Props table restates the type instead of explaining when to set it ("绑定值", "占位文本", "是否禁用"), and the Events table gives `update:modelValue` and `change` the same description with no note on how they differ.
  - 证据：`apps/nexus/content/docs/dev/components/flat-select.zh.mdc:149`
  - 建议：Rewrite each description to say when/how to use it (e.g. `disabled` → "整组禁用；触发器变为 disabled button，下拉不再展开，键盘导航同时失效") and state that `change` fires together with `update:modelValue` on every commit including ArrowUp/ArrowDown navigation.

### ⚪ `flex` — 2 条（high 0 / medium 0 / low 2）

- **[low]** `unlinked-demo` · D2 · PLAUSIBLE
  - The two `## 组合示例` examples (wrapping toolbar, reverse direction) are plain ```vue fences with no TuffDemoWrapper, while an unreferenced `FlexBasicDemo.vue` duplicating FlexFlexDemo sits in the demos directory.
  - 证据：`apps/nexus/content/docs/dev/components/flex.zh.mdc:35`
  - 建议：Convert the two composition snippets into real demo files rendered through `:::TuffDemoWrapper` so they are type-checked and previewable, and delete the orphan `apps/nexus/app/components/content/demos/FlexBasicDemo.vue` (identical markup to FlexFlexDemo but without the i18n branch).
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Every Props-table description simply restates the CSS property the prop maps to ("CSS `flex-direction` 值。", "CSS `align-items` 值。") without saying when to set it or which values are expected.
  - 证据：`apps/nexus/content/docs/dev/components/flex.zh.mdc:73`
  - 建议：Rewrite descriptions to convey usage, e.g. `align`: "align-items on the cross axis; use `center` for icon+label rows, keep `stretch` when children should share the tallest height" and note that `align`/`justify` are untyped strings so any CSS keyword is accepted.

### 🟡 `flip-overlay` — 5 条（high 0 / medium 4 / low 1）

- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - `defineExpose({ close })` is a public instance method (index.ts even types `TxFlipOverlayInstance` with it) but neither the zh nor en doc has an `### Expose` table under `## API`.
  - 证据：`packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue:609`
  - 建议：Add an `### Expose` sub-section after `### Slots` in both flip-overlay.zh.mdc and flip-overlay.en.mdc documenting `close(): void` — including that it runs the full close animation and still emits `update:modelValue(false)`, so the parent must own the `v-model`.
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxFlipOverlay is a modal card (body scroll lock + full-screen mask) but renders no `role="dialog"`/`aria-modal`, has no Escape-to-close handler, and never traps or restores focus.
  - 证据：`packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue:629`
  - 建议：Add `role="dialog" aria-modal="true"` on the card, wire `aria-labelledby`/`aria-describedby` to the built-in header title/desc nodes, add a keydown listener that routes Escape through the same guard as `handleMaskClick` (so `preventAccidentalClose` still warns), and move focus into the card on open / restore it to `source` on close.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `maskClassName` appends `props.maskClass` twice — once token-split, then again as the whole string — so a custom mask class is emitted duplicated in the DOM.
  - 证据：`packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue:165`
  - 建议：Delete the second `if (props.maskClass) classes.push(props.maskClass)` block at lines 164-165; the split-and-push at lines 153-159 already covers single and multi-token values. With `mask-class="a b"` the current code renders `class="TxFlipOverlay-Mask a b a b"`.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `triggerBlockedCloseWarning` relies on a brace-less `if (hasWindow())` whose body is only the reflow read, and the false→true toggle happens synchronously in the same tick, so Vue never flushes the removed class and a repeated blocked close plays no warning animation.
  - 证据：`packages/tuffex/packages/components/src/flip-overlay/src/TxFlipOverlay.vue:302`
  - 建议：Add braces to make the intent explicit and restart the animation on a real DOM boundary: set `blockedCloseWarning.value = false`, `await nextTick()`, force the reflow on `cardRef.value`, then set it back to `true` — otherwise clicking the mask twice within the 720ms window (preventAccidentalClose=true) gives the user no second visual feedback.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - flip-overlay is the only doc of 118 using a `## 设计要点` / `## Design Notes` section, and it re-explains `globalMask`, stacking and `preventAccidentalClose` a third and fourth time after the Props table, `## 交互契约` and `## 审阅说明`.
  - 证据：`apps/nexus/content/docs/dev/components/flip-overlay.zh.mdc:47`
  - 建议：Fold the 15 bullets of `## 设计要点` into the Props table descriptions (source/rotate/surface/border/randomTilt) and `## 交互契约` (mask ownership, stacking thresholds, preventAccidentalClose), then delete the section so the doc follows the same 基础用法 → API → 交互契约 → 最佳实践 → 审阅说明 → Source skeleton as the other 117 docs. `preventAccidentalClose` currently appears at lines 64, 85, 135 and 149.

### 🟡 `floating` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `doc-behavior-mismatch` · D1 · CONFIRMED
  - Both language docs state pointer coordinates are measured from the container's top-left corner, but `syncPointerOffset()` subtracts `rect.width/2` and `rect.height/2`, i.e. the origin is the container **centre** — so readers computing expected offsets get double the real value and the wrong sign on the left/top half.
  - 证据：`apps/nexus/content/docs/dev/components/floating.en.mdc:66`
  - 建议：Change floating.en.mdc:66 and floating.zh.mdc:66 to say the offset is measured from the container centre (`TxFloating.vue:92-93`: `pointerOffset.x = pointerClient.x - rect.left - rect.width / 2`). The test suite already names this contract explicitly ('keeps elements at rest while the pointer sits on the container centre').
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The Interaction Contract omits three shipped behaviours — the built-in `prefers-reduced-motion` media query that stops all motion, the `IntersectionObserver` that parks the RAF loop off-screen, and the capture-phase `scroll` + `resize` listeners — and Best Practices instead tells users to wire reduced-motion into `disabled` themselves.
  - 证据：`apps/nexus/content/docs/dev/components/floating.en.mdc:110`
  - 建议：Document `TxFloating.vue:240-246` (`setupMotionPreference()` calls `window.matchMedia('(prefers-reduced-motion: reduce)')` and reacts to `change`), `TxFloating.vue:203-223` (visibility observer), and expand line 65's listener list to include `scroll` (capture) and `resize` (`TxFloating.vue:182-183`). Then rewrite the Best Practice to say reduced-motion is already honoured automatically and `disabled` is only for app-level opt-out.
- **[low]** `dead-code` · D4 · PLAUSIBLE
  - `TxFloatingElement.register()` falls back to `0.01` when `props.depth` is nullish, but `withDefaults` already sets `depth: 1`, so the fallback is unreachable and the two competing defaults contradict the documented `depth` default of `1`.
  - 证据：`packages/tuffex/packages/components/src/floating/src/TxFloatingElement.vue:22`
  - 建议：Drop the `?? 0.01` and pass `props.depth` directly, since line 12 already declares `depth: 1` in `withDefaults`.

### 🔴 `form` — 4 条（high 1 / medium 3 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxForm passes `props.model` / `props.rules` into `provide()` as one-time snapshots (every other context entry is a computed), so any change to the `rules` object identity never reaches TxFormItem.
  - 证据：`packages/tuffex/packages/components/src/form/src/TxForm.vue:51`
  - 建议：Provide getters/computeds instead of raw values, e.g. `model: computed(() => props.model)` and `rules: computed(() => props.rules)`, and update `FormContext` in context.ts plus the `form?.rules?.[prop]` / `form.model[prop]` reads in TxFormItem.vue to unwrap `.value`. Concretely reproducible today: the shipped demo apps/nexus/app/components/content/demos/FormFormDemo.vue:45 builds `rules` from a locale-dependent `computed`, so after switching the docs site to English the required-field error still renders the Chinese message '请输入名称'.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `labelPosition="right"` is a documented, typed value but no stylesheet rule exists for `tx-form--label-right` / `tx-form-item--label-right`, so it renders identically to `left`.
  - 证据：`packages/tuffex/packages/components/src/form/src/TxFormItem.vue:146`
  - 建议：Add `.tx-form-item--label-right .tx-form-item__label { text-align: right; }` (and the matching `.tx-form--label-right` rule in TxForm.vue) so the third documented value has an effect, or drop `'right'` from `FormLabelPosition` in types.ts and from both Props tables.
- **[medium]** `dead-prop` · D4 · CONFIRMED
  - `TxForm`'s `disabled` and `size` props are pushed into the form context but nothing in the library injects them — TxFormItem is the only consumer of `TX_FORM_CONTEXT_KEY` and it reads only `labelPosition`/`labelWidth`, so `<TxForm disabled>` has zero effect.
  - 证据：`packages/tuffex/packages/components/src/form/src/TxFormItem.vue:124`
  - 建议：Either make TxFormItem apply the context `disabled`/`size` (e.g. render `fieldset[disabled]` or an `is-disabled` class and a size modifier), or state plainly in both Props tables that `disabled`/`size` are context-only values that no TuffEx input currently consumes, so `disabled` must be passed to each control.
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxFormItem's `<label>` has no `for`, the control gets no `aria-invalid`, and the error `<div>` has no `role="alert"`/`aria-live`, so validation failures are never announced to screen readers.
  - 证据：`packages/tuffex/packages/components/src/form/src/TxFormItem.vue:133`
  - 建议：Generate a stable id (e.g. `useId()`), expose it through the item slot props so controls can bind `:id`/`:aria-describedby`/`:aria-invalid`, bind `for` on the `<label>`, and add `role="alert"` to the error node. Then extend the Review Notes beyond the current `for`/`id` caveat.

### 🟡 `foundations` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The "Primary font stack" block does not match `--tx-font-family` in variables.scss (the page's declared single source of truth); the stack shown is the Nexus site's own `body` font from app.vue.
  - 证据：`apps/nexus/content/docs/dev/components/foundations.zh.mdc:25`
  - 建议：Replace the block in both zh/en with the real token: `--tx-font-family: "Inter", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;` (variables.scss:276), and if the Nexus body stack (app.vue:529) is intentionally different, call it out as a docs-site override rather than presenting it as the Tuffex token.

### 🟡 `fusion` — 4 条（high 0 / medium 2 / low 2）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline `code:` snippets for five Fusion demos (TwoButtons, TwoOptions, TwoChips, TwoStatusDots, TwoIconButtons) show a `ref<Record<Variant, boolean>>` seeded to all `true` with different variant hint strings, while the demos actually rendered (`FusionFusion*Demo.vue`) use `reactive<...>` seeded to all `false` with different hints.
  - 证据：`apps/nexus/content/docs/dev/components/fusion.zh.mdc:211`
  - 建议：The doc's inline snippet is a byte-for-byte copy of the orphaned `apps/nexus/app/components/content/demos/FusionTwoButtonsDemo.vue` (lines 1-17), while `TuffDemoWrapper{demo="FusionFusionTwoButtonsDemo"}` renders `FusionFusionTwoButtonsDemo.vue` whose setup block is `reactive<Record<FusionVariantKey, boolean>>({ membrane: false, glass: false, gummy: false })` with hints 'Soft gradient blend' / 'Translucent blur' / 'Vibrant tint'. Readers see all three fusions un-fused on screen while the code says they start fused. Regenerate the inline snippets from the `FusionFusion*Demo.vue` files and delete the 9 orphaned `Fusion*Demo.vue` duplicates (FusionBasicDemo, FusionButtonTooltipDemo, FusionTwoButtonsDemo, FusionTwoOptionsDemo, FusionTwoChipsDemo, FusionTwoStatusDotsDemo, FusionTwoIconButtonsDemo, FusionAvatarBadgeDemo, FusionChipIconDemo, FusionMiniCardFabDemo), which are referenced by zero doc pages and are the source of this drift.
- **[medium]** `a11y` · D4 · PLAUSIBLE
  - `trigger="click"` attaches a click handler to a bare root `<div>` with no `role`, `tabindex`, or keydown handler, so the click-toggle mode is entirely keyboard-inaccessible.
  - 证据：`packages/tuffex/packages/components/src/fusion/src/TxFusion.vue:83`
  - 建议：The root element (lines 78-84) is a `<div class="tx-fusion">` with `@mouseenter`/`@mouseleave`/`@click` and no interactive semantics. A keyboard-only user can never toggle a `trigger="click"` Fusion, and the base demo (fusion.zh.mdc:73) ships exactly that configuration. When `trigger === 'click'`, add `role="button"`, `tabindex="0"`, `:aria-pressed="active"`, and an Enter/Space keydown handler that calls `onClick`; leave the root inert for `hover`/`manual`. Alternatively, document `trigger="click"` as decorative-only and route activation through a real control in the slots.
- **[low]** `dead-css-var` · D4 · PLAUSIBLE
  - `--tx-fusion-blur` is written into the stage inline style but no CSS rule in the component consumes it, so consumers who override the variable to tune blur get no effect (blur only reaches the DOM via the SVG `stdDeviation` attribute).
  - 证据：`packages/tuffex/packages/components/src/fusion/src/TxFusion.vue:66`
  - 建议：Grepping `tx-fusion-blur` across the repo returns only this line, the compiled dist copies, and the assertion at fusion.test.ts:31 — the scoped `<style>` block (lines 107-166) uses `--tx-fusion-duration`, `--tx-fusion-easing`, and `--tx-fusion-gap` but never `--tx-fusion-blur`. Either delete the dead variable (and its test assertion), or reword fusion.zh.mdc:1487 / fusion.en.mdc:1487 which currently implies blur is applied through the CSS variable ('`gap` 和 `blur` 会写入像素单位 CSS 变量') so readers do not try to theme it from outside.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - fusion.zh.mdc is 1513 lines (3.8x the 400-line ceiling) with 10 demos, and the same prop combination `trigger="hover" :gap :duration="260" :blur="19" :alpha="29" :alpha-offset="-10"` is re-demonstrated in 7 of them with only cosmetic slot-content differences.
  - 证据：`apps/nexus/content/docs/dev/components/fusion.zh.mdc:103`
  - 建议：Lines 103-1443 are one 1340-line run of nine near-identical 'Real-world Scenario' demos (Button+Tooltip, Two Buttons, Two Options, Two Chips, Two Status Dots, Two Icon Buttons, Avatar+Badge, Chip+Icon, Mini Card+FAB), each embedding 60-230 lines of inline style. Keep 2-3 that teach distinct API behaviour (one `direction="y"`, one `trigger="manual"` + `v-model`, one showing `alpha`/`blur` tuning) and move the rest to a gallery page or drop them. Apply the same trim to fusion.en.mdc, which is also 1513 lines.

### 🟡 `glass-surface` — 3 条（high 0 / medium 1 / low 2）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The Props table documents `mixBlendMode` as plain `string`, but `GlassSurfaceProps` declares an 18-member string-literal union ('normal' | 'multiply' | ... | 'plus-lighter').
  - 证据：`apps/nexus/content/docs/dev/components/glass-surface.zh.mdc:451`
  - 建议：Replace the type cell with the real union (or `CSSProperties['mixBlendMode']`-style shorthand listing the allowed values) in both glass-surface.zh.mdc and glass-surface.en.mdc, so readers know arbitrary strings are rejected by TS.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - glass-surface.zh.mdc is 499 lines because the second demo's inline `code:` block duplicates ~325 lines of demo markup (the whole slider control panel) verbatim.
  - 证据：`apps/nexus/content/docs/dev/components/glass-surface.zh.mdc:52`
  - 建议：Trim the inline snippet to the TxGlassSurface binding plus 2-3 representative TxSlider controls and let TuffDemoWrapper's source link carry the full file; target < 400 lines for the zh doc.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - glass-surface frontmatter has only title/description/category/syncStatus/verified — `status`, `since`, and `tags` are missing in both zh and en.
  - 证据：`apps/nexus/content/docs/dev/components/glass-surface.zh.mdc:4`
  - 建议：Add `status: beta`, `since: 1.0.0`, `tags: [glass, effect, backdrop-filter]` to both files, matching the complete 8-field frontmatter already used by no-data.zh.mdc and tag.zh.mdc.

### 🟡 `glow-text` — 3 条（high 0 / medium 1 / low 2）

- **[medium]** `lang-drift` · D3 · PLAUSIBLE
  - The zh intro paragraph only repeats the frontmatter description, while the en intro adds concrete mode-selection guidance ("Use mode=\"text-clip\" when the shine should be clipped to glyphs; keep the default adaptive mode for container-level shimmer").
  - 证据：`apps/nexus/content/docs/dev/components/glow-text.zh.mdc:13`
  - 建议：Translate the en opening paragraph into zh so both languages state what the component is for and which mode to pick, e.g. "`TxGlowText` 为文本、徽章、图片预览等紧凑表面叠加扫光。需要扫光裁切到字形时使用 `mode=\"text-clip\"`，容器级微光保持默认的 `adaptive`。"
- **[low]** `orphan-demo` · D2 · PLAUSIBLE
  - GlowTextBasicDemo.vue and GlowTextImageDemo.vue exist in the demos directory but are referenced by no doc or component (the docs use GlowTextGlowTextDemo / GlowTextGlowTextOnImageDemo / GlowTextGlowTextCasesDemo).
  - 证据：`apps/nexus/app/components/content/demos/GlowTextBasicDemo.vue:1`
  - 建议：Delete GlowTextBasicDemo.vue and GlowTextImageDemo.vue, or rename the doc's `demo="GlowTextGlowTextDemo"` / `demo="GlowTextGlowTextOnImageDemo"` references to the shorter names and delete the duplicated files instead.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Several zh Props descriptions only restate the type or unit (`angle` → "扫光角度(deg)", `bandSize` → "高光带宽度(%)", `tag` → "外层渲染标签") without saying when to change them.
  - 证据：`apps/nexus/content/docs/dev/components/glow-text.zh.mdc:131`
  - 建议：Pull the guidance already present in 最佳实践 into the table, e.g. `bandSize` → "高光带宽度百分比；文本场景建议 24-40，图片/卡片可放宽到 40+", `tag` → "文本用默认 `span`，卡片/图片/徽章容器改为 `div`".

### 🟡 `gradient-border` — 2 条（high 0 / medium 1 / low 1）

- **[medium]** `a11y` · D4 · CONFIRMED
  - The rotating gradient runs as an unconditional `infinite` CSS animation with no `@media (prefers-reduced-motion: reduce)` guard, so every instance keeps animating for users who have requested reduced motion.
  - 证据：`packages/tuffex/packages/components/src/gradient-border/src/TxGradientBorder.vue:72`
  - 建议：Wrap the animation in a `@media (prefers-reduced-motion: no-preference)` block, or add `@media (prefers-reduced-motion: reduce) { .tx-gradient-border::before { animation: none; } }` so the border settles at a static gradient angle, and document the behavior in the docs' Best Practices.
- **[low]** `stale-demo-code` · D2 · PLAUSIBLE
  - `GradientBorderGradientBorderDemo.vue` calls `useI18n()` only to branch on `locale`, but the `v-if="locale === 'zh'"` and `v-else` blocks render byte-identical `TxGradientBorder` markup, so the branching is dead code.
  - 证据：`apps/nexus/app/components/content/demos/GradientBorderGradientBorderDemo.vue:6`
  - 建议：Delete the `useI18n()` call and the locale branch, leaving a single `TxGradientBorder` block — or give the zh branch actually localized inner copy so the branch earns its keep.

### 🔴 `gradual-blur` — 7 条（high 2 / medium 4 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - The `isVisible` watcher returns a cleanup closure, but Vue ignores a watch callback's return value (cleanup must go through the third `onCleanup` argument), so the `onAnimationComplete` timer is never cancelled and fires again on every viewport re-entry and even after unmount.
  - 证据：`packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue:334`
  - 建议：Change the signature to `(newVisible, _old, onCleanup) => { ... onCleanup(() => clearTimeout(timeout)) }`, and also clear any pending timer in `onUnmounted`.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - `duration` is documented as a free-form CSS time string but is converted to milliseconds with `parseFloat(duration) * 1000`, so a valid `duration="300ms"` schedules `onAnimationComplete` 300000 ms (5 minutes) later.
  - 证据：`packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue:332`
  - 建议：Parse the unit: `const ms = /ms$/.test(d) ? parseFloat(d) : parseFloat(d) * 1000`. Alternatively narrow the documented `duration` type to seconds-only strings and state that constraint in the Props table row for `duration`.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The en doc's Positions snippet shows fully English body copy, but GradualBlurPositionsDemo.vue hardcodes mixed Chinese text (no i18n branch), so English readers see "Headline content stays sharp，向上滚动时才看到模糊层。" rendered next to an all-English code block.
  - 证据：`apps/nexus/app/components/content/demos/GradualBlurPositionsDemo.vue:10`
  - 建议：Localise the demo with `useI18n()` the way EmptyEmptyDemo.vue does (a `labels` computed keyed off `locale`), or replace all four paragraphs with the English strings used in gradual-blur.en.mdc so the rendered demo matches whichever snippet is shown.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The resize listener and IntersectionObserver are wired only inside `onMounted` and torn down behind `if (config.value.responsive)`, so toggling `responsive`/`animated` after mount either silently disables the feature or leaks the debounced resize handler on unmount.
  - 证据：`packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue:310`
  - 建议：Unconditionally `window.removeEventListener('resize', debouncedResize)` in `onUnmounted`, and add `watch(() => config.value.responsive, ...)` / `watch(() => config.value.animated, ...)` to attach or detach the listener and IntersectionObserver when those props change.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `gradual-blur/index.ts` re-exports only `GradualBlurProps`, so the `GradualBlurPosition`, `GradualBlurCurve`, `GradualBlurAnimated` and `GradualBlurTarget` union types declared in `src/types.ts` are unreachable from the package barrel.
  - 证据：`packages/tuffex/packages/components/src/gradual-blur/index.ts:8`
  - 建议：Extend the line to `export type { GradualBlurAnimated, GradualBlurCurve, GradualBlurPosition, GradualBlurProps, GradualBlurTarget }` so consumers building wrapper components can type `position`/`curve`/`target` values.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `config` is cast `as Required<GradualBlurProps>` even though `width`, `hoverIntensity`, `mobileHeight`, `preset` etc. have no defaults, so downstream code reads `config.value.hoverIntensity` as `number` when it is actually `undefined` at runtime.
  - 证据：`packages/tuffex/packages/components/src/gradual-blur/src/TxGradualBlur.vue:128`
  - 建议：Type the merged object as `Required<Pick<GradualBlurProps, keyof typeof DEFAULT_CONFIG>> & GradualBlurProps` instead of `Required<GradualBlurProps>`, so the optional-and-undefined props keep their `| undefined` and the existing truthiness checks stay type-correct.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both gradual-blur.zh.mdc and gradual-blur.en.mdc frontmatter omit the required `status` and `since` fields (only title/description/category/tags/syncStatus/verified are present), unlike the other four components in this shard.
  - 证据：`apps/nexus/content/docs/dev/components/gradual-blur.zh.mdc:5`
  - 建议：Insert `status: beta` and `since: <first shipping version>` between `category: Effects` and `tags:` in both locale files so the frontmatter matches the 8-field standard.

### 🔴 `grid` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxGrid 的 resolveResponsive 回退顺序是 `v[bp] ?? v.md ?? v.sm ?? v.xs ?? v.lg ?? v.xl`，把 md/sm/xs 排在 lg/xl 之前，导致视口变大时列数/间距反而变小。
  - 证据：`packages/tuffex/packages/components/src/grid/src/TxGrid.vue:74`
  - 建议：改成按断点降序回退（当前断点未定义时取最近的更小断点，再取更大断点），例如 const order = ['xs','sm','md','lg','xl']，从当前 bp 索引向左查找、再向右查找；并在 grid.test.ts 里补一条“只声明部分断点、窗口宽度 1400”的用例。
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - 文档「类型定义 / Types」块声明的 ResponsiveValue<T> 与 GapValue 在代码库中完全不存在（源码只有 TxGrid.vue 内部的 `Partial<Record<Breakpoint, T>>`），且 ResponsiveValue<T> 的字段被写成 number，与同页 `gap: ResponsiveValue<number | string>` 自相矛盾。
  - 证据：`apps/nexus/content/docs/dev/components/grid.zh.mdc:242`
  - 建议：在 grid/src/types.ts 里真正定义并导出 Breakpoint / Responsive<T> / GridGap（`type Responsive<T> = Partial<Record<Breakpoint, T>>`），文档改用与源码同名的类型；若维持文档写法，至少把字段类型改成 `xs?: T` 等。
- **[medium]** `missing-export` · D4 · CONFIRMED
  - grid/index.ts 只导出组件与别名，未导出任何类型（无 GridProps / GridItemProps / Breakpoint / Responsive），外部无法对 TxGrid 的 props 做类型标注，与 corner-overlay、status-badge 等同级组件的导出约定不一致。
  - 证据：`packages/tuffex/packages/components/src/grid/index.ts:13`
  - 建议：把 TxGrid / TxGridItem 的 props 抽到 grid/src/types.ts（GridProps、GridItemProps、Breakpoint、Responsive、GridGap），在 index.ts 加 `export type { ... }` 并补 TxGridInstance / TxGridItemInstance，改用 withInstall 统一安装方式。
- **[medium]** `type-leak` · D4 · CONFIRMED
  - TxGrid 的 justify / align（以及 TxGridItem 的 justifySelf / alignSelf）在源码里是裸 string，而文档 Props 表承诺 `'start' | 'end' | 'center' | 'stretch'` 四值联合，实际拼错值不会有任何类型报错。
  - 证据：`packages/tuffex/packages/components/src/grid/src/TxGrid.vue:16`
  - 建议：把四个对齐 prop 收敛为 `type GridAlign = 'start' | 'end' | 'center' | 'stretch'`（若需自定义可用 `GridAlign | (string & {})`），并在文档「交互契约」补一句 justify/align 映射的是 justify-items / align-items，而非 justify-content / align-content。
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - 全页 11 个静态 TuffCodeBlock 但只有 1 个可运行 demo，仅 gap 一个 prop 就被「统一间距 / 不同方向间距 / 响应式间距」三个小节重复演示。
  - 证据：`apps/nexus/content/docs/dev/components/grid.zh.mdc:89`
  - 建议：把三个 gap 小节压成一个代码块（同时展示数字、{row,col}、响应式三种写法），并把「响应式列数」升级为真实 TuffDemoWrapper，让断点行为可被实际观察。

### 🟡 `grid-layout` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `cancelColor()` early-returns when `interactive` is false, so spotlight variables written while `interactive` was true (`--tx-grid-op: 0.2`) are never cleared if the prop is toggled off while the pointer is inside the grid — items stay permanently lit.
  - 证据：`packages/tuffex/packages/components/src/grid-layout/src/TxGridLayout.vue:44`
  - 建议：Remove the `!props.interactive` guard from `cancelColor()` (keep it only in `handleMove`) and additionally `watch(() => props.interactive, v => { if (!v) cancelColor() })` so switching to static mode always resets `--tx-grid-op` to `0`. The existing test at grid-layout.test.ts:72 sidesteps this by manually calling `removeProperty('--tx-grid-op')`, so add an assertion covering the toggle-while-hovered path.

### 🔴 `group-block` — 6 条（high 1 / medium 3 / low 2）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxGroupBlock 的 `collapsed` prop 对首屏渲染完全无效：`resolveDefaultExpand()` 的 `!props.collapsed` 分支是死代码，因为 `defaultExpand` 在 withDefaults 里被赋了 `true`，`typeof props.defaultExpand === 'boolean'` 永远成立。
  - 证据：`packages/tuffex/packages/components/src/group-block/src/TxGroupBlock.vue:62`
  - 建议：把 `defaultExpand` 的 withDefaults 默认值去掉（保持 `undefined`），让 `resolveDefaultExpand()` 能真正回退到 `!props.collapsed`；或者在初始化时显式判断 `props.collapsed !== undefined` 优先。同时修正 types.ts:46-47 的 JSDoc（“When provided, initial expanded state follows this unless user has interacted”），当前实现只在 `collapsed` 发生变化时的 watcher 里生效，挂载时根本不读它。
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - TxBlockSlot Props 表说 `active` 会「切换行的激活视觉状态与图标状态」，但模板 class 绑定只有 `tx-block-slot--disabled`，SCSS 里也没有任何 active 样式规则，`active` 实际只影响 `currentIcon` 和 `icon`/`default` 插槽的作用域参数。
  - 证据：`apps/nexus/content/docs/dev/components/group-block.zh.mdc:464`
  - 建议：二选一：要么在 TxBlockSlot 模板补 `'tx-block-slot--active': active` 并在 SCSS 里实现激活态；要么把 zh/en 描述改成「切换到 activeIcon，并把 `active` 透传给 `icon` / `default` 插槽作用域；不改变行背景等视觉样式」，同时给 `## 激活态与标签` demo 加一句说明。
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - zh 与 en 的 frontmatter description 及正文首段语义漂移：en 讲「用来组织 settings / account options / 紧凑偏好行」并给出使用场景，zh 只重复了一句「可折叠分组容器，带有平滑动画效果」，强调点变成了动画。
  - 证据：`apps/nexus/content/docs/dev/components/group-block.zh.mdc:13`
  - 建议：把 zh frontmatter description 与首段对齐 en 语义，例如「用于组织设置、账号选项与紧凑偏好行的可折叠分组容器，统一图标、标签与控件布局」；首段不要与 frontmatter description 逐字重复。
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxBlockSlot 的可点击根节点是裸 `div` + `@click`，没有 role / tabindex / 键盘处理；guidance 模式的 TxBlockSwitch 只剩一个 `aria-hidden` 箭头，整行导航对键盘和读屏用户完全不可达。
  - 证据：`packages/tuffex/packages/components/src/group-block/src/TxBlockSlot.vue:64`
  - 建议：参考同包的 TxGroupBlock（用真实 `<button>` 叠层）或 TxBlockLine（link 时渲染 `button type="button"`）：在有 `click` 监听/guidance 时给根节点加 `role="button"`、`tabindex="0"`、`aria-disabled`，并绑定 Enter/Space；文档「交互契约」补充键盘激活说明。
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - 单个 zh 文档 613 行，把 6 个组件（GroupBlock / BlockLine / BlockSlot / BlockInput / BlockSelect / BlockSwitch）的 15 个 demo 和 18 张 API 表塞在一起，仅 `## API` 段就横跨 404-563 行。
  - 证据：`apps/nexus/content/docs/dev/components/group-block.zh.mdc:404`
  - 建议：拆分为 group-block（容器）与 block-rows（行组件）两篇，或至少把 BlockLine/BlockSlot/BlockInput/BlockSelect/BlockSwitch 拆到独立 .mdc；BlockSwitch 的 4 个 demo（basic/loading/disabled/guidance）可合并为 1 个带开关的组合 demo。
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - 文档顶部有一段顶层 `<script setup lang="ts">` 声明了 notifications / language / theme / autoUpdate 等 10 个 ref 和 handleClick，但所有 demo 都是通过 `::TuffDemoWrapper{demo="..."}` 加 `code: |` 字符串渲染的，这些变量在文档里没有任何消费者。
  - 证据：`apps/nexus/content/docs/dev/components/group-block.zh.mdc:15`
  - 建议：删除 zh/en 文档顶部的 `<script setup>` 块（第 15-29 行）——真实状态都在 demos/GroupBlock*.vue 里；组件文档集里还有 file-uploader、image-uploader 等 11 篇有同样的残留，可一并清理。

### 🟡 `guide-state` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `type-leak` · D4 · PLAUSIBLE
  - TxGuideState documents `primary` / `secondary` events but declares no `defineEmits`, so they only reach listeners through attribute fallthrough and are absent from the component's typed public contract (`TxGuideStateInstance` / volar template checking).
  - 证据：`packages/tuffex/packages/components/src/guide-state/src/TxGuideState.vue:9`
  - 建议：Add `const emit = defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')" @secondary="emit('secondary')"` on `<TxEmptyState>`) so the documented events are type-checked and survive any future change to `inheritAttrs` or the root node structure.

### 🟡 `icon` — 5 条（high 0 / medium 5 / low 0）

- **[medium]** `type-mismatch` · D1 · PLAUSIBLE
  - The `icon` prop is documented as type `ITuffIcon`, but `TxIcon.vue` declares `icon?: TxIconSource | null` — `ITuffIcon` is an unrelated type living in `@talex-touch/utils/types/icon.ts` and is never imported by the icon component.
  - 证据：`apps/nexus/content/docs/dev/components/icon.zh.mdc:192`
  - 建议：Change the type cell to `TxIconSource | null` in both icon.zh.mdc:192 and icon.en.mdc:192, matching `TxIcon.vue:13` and the type actually re-exported from `icon/index.ts`. If the intent is to say the two shapes are compatible, say so in the description instead of naming the wrong type.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The `size` prop is documented with default `16`, but `TxIcon.vue` defaults it to `undefined`, which leaves `font-size` unset so the icon inherits the parent's font size instead of rendering at 16px.
  - 证据：`apps/nexus/content/docs/dev/components/icon.zh.mdc:201`
  - 建议：Set default to `-` (inherit) and note in the description that omitting `size` makes the icon size follow the parent `font-size` (`TxIcon.vue:30` `size: undefined`, template line 246 `fontSize: size ? \`${size}px\` : undefined`). Update both zh and en.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The Props table omits the public `alt` and `empty` props even though the doc's own Slots table and Best Practices sections tell readers to use them.
  - 证据：`apps/nexus/content/docs/dev/components/icon.zh.mdc:190`
  - 建议：Add rows for `alt` (`string`, default `''`, maps to the root `title` attribute — see TxIcon.vue:242) and `empty` (`string`, default `''`, image URL used as the fallback when no icon resolves — see TxIcon.vue:249) to both icon.zh.mdc and icon.en.mdc.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The "TxStatusIcon API (Lite)" table omits `colorful`, whose default on TxStatusIcon is `true` — the opposite of TxIcon's `false` — so callers get colorful SVG rendering they never asked for and have no documented way to discover it.
  - 证据：`packages/tuffex/packages/components/src/icon/src/TxStatusIcon.vue:14`
  - 建议：Add `colorful` (default `true`) and `size` (default `18`, vs TxIcon's inherit) rows to the TxStatusIcon table at icon.zh.mdc:219-235 / icon.en.mdc:219-235, and call out that TxStatusIcon flips the `colorful` default relative to TxIcon.
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxIcon unconditionally renders `role="img"` with `:title="alt"`, and `alt` defaults to `''`, so every decorative icon becomes a nameless image node that screen readers announce as an unlabeled graphic.
  - 证据：`packages/tuffex/packages/components/src/icon/src/TxIcon.vue:242`
  - 建议：Render `role="img"` only when `alt` is non-empty, and emit `aria-hidden="true"` (with no `role`/`title`) otherwise, so decorative icons drop out of the accessibility tree. This also makes the doc's Accessibility note at icon.zh.mdc:294 actually enforceable.

### 🟡 `icon-button` — 4 条（high 0 / medium 4 / low 0）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The `size` prop accepts `'xs' | 'sm' | 'md' | 'lg'` and ships a dedicated `.tx-icon-button--xs` rule (24px/4px radius), but both docs list only `'sm' | 'md' | 'lg'`, so the smallest size is invisible to readers.
  - 证据：`packages/tuffex/packages/components/src/icon-button/src/TxIconButton.vue:13`
  - 建议：Update the Props table type cell to `'xs' \| 'sm' \| 'md' \| 'lg'` in icon-button.zh.mdc:57 and icon-button.en.mdc:57 and mention the 24px xs size for dense toolbars.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline snippet shows a single circle star button, while IconButtonIconButtonDemo actually renders four buttons that also exercise `shape="square"`, `shape="pill" size="lg"`, and `disabled` — three variants the revealed code never mentions.
  - 证据：`apps/nexus/content/docs/dev/components/icon-button.zh.mdc:30`
  - 建议：Expand the `code:` block in icon-button.zh.mdc / .en.mdc to include all four buttons from apps/nexus/app/components/content/demos/IconButtonIconButtonDemo.vue (lines 21-32), or trim the demo to the single pinned toggle.
- **[medium]** `a11y` · D4 · CONFIRMED
  - `label` defaults to `''`, which makes `ariaLabel` `undefined`, so an icon-only `TxIconButton` with no label renders a button whose only child is `aria-hidden` — it has no accessible name and no dev warning fires.
  - 证据：`packages/tuffex/packages/components/src/icon-button/src/TxIconButton.vue:32`
  - 建议：Emit a dev-mode `console.warn` when `!props.label` and no default slot is supplied (mirroring the TxFlatRadioItem context warning at TxFlatRadioItem.vue:17), so the docs' "纯图标操作必填" contract is actually enforced.
- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - icon-button declares its props inline in the SFC with no src/types.ts and exports no `TxIconButtonProps`, so consumers wrapping the component (unlike file-uploader and flat-radio) cannot reuse or extend its prop types.
  - 证据：`packages/tuffex/packages/components/src/icon-button/index.ts:6`
  - 建议：Extract the prop shape into `src/types.ts` as `TxIconButtonProps`, consume it via `defineProps<TxIconButtonProps>()`, and add `export type { TxIconButtonProps }` to the barrel.

### 🟡 `image-gallery` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `a11y` · D4 · CONFIRMED
  - All user-facing strings are hardcoded English with no prop/slot override — the thumbnail `aria-label` template `Open {label} preview`, the `Image N` fallback, the `Previous image`/`Next image` labels, the visible `Prev`/`Next` button text and the `Preview` modal title fallback — so a Chinese app announces English to screen readers and shows English chrome.
  - 证据：`packages/tuffex/packages/components/src/image-gallery/src/TxImageGallery.vue:89`
  - 建议：Add optional `labels` props (e.g. `previousLabel`, `nextLabel`, `openLabelFormatter`, `fallbackTitle`) or named slots for the footer controls, defaulting to today's English strings, and document them in the Props table of both locale docs.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `image-gallery/index.ts` exports the component and its types but omits `TxImageGalleryInstance`, unlike every sibling audited here (empty, flat-select, gradual-blur, segmented-slider), so consumers cannot type a template ref to the gallery.
  - 证据：`packages/tuffex/packages/components/src/image-gallery/index.ts:8`
  - 建议：Add `export type TxImageGalleryInstance = InstanceType<typeof TxImageGallery>` after the type re-export, matching the pattern in packages/tuffex/packages/components/src/empty/index.ts line 9.
- **[low]** `stale-demo-code` · D2 · PLAUSIBLE
  - The inline snippet declares two items with non-existent local paths (`/images/one.png`, `/images/two.png`) while ImageGalleryImageGalleryDemo.vue renders three remote picsum images, so `:start-index="1"` means "last image" in the snippet but "middle image" in what the reader sees.
  - 证据：`apps/nexus/content/docs/dev/components/image-gallery.zh.mdc:22`
  - 建议：Align the snippet with the demo: list all three items (`one`/`two`/`three`) and use the same `https://picsum.photos/seed/talex-gallery-*` URLs, so `:start-index="1"` demonstrates the same clamping behaviour the reader observes.

### 🟡 `image-uploader` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `a11y` · D4 · CONFIRMED
  - The per-image remove button is `opacity: 0` and is only revealed by `.tx-image-uploader__item:hover`; there is no `:focus-visible` / `:focus-within` rule, so a keyboard user who tabs onto the remove button focuses a completely invisible control.
  - 证据：`packages/tuffex/packages/components/src/image-uploader/src/TxImageUploader.vue:209`
  - 建议：Add `.tx-image-uploader__remove:focus-visible, .tx-image-uploader__item:focus-within .tx-image-uploader__remove { opacity: 1; }` alongside the existing hover rule at line 213, and give the button a visible focus ring.
- **[medium]** `i18n-hardcoded` · D4 · CONFIRMED
  - The add tile label `Upload` and the `Remove {name}` aria-label are hardcoded English string literals in the template, and the component exposes neither slots nor label props, so a zh-locale host cannot localize the only visible text the component renders.
  - 证据：`packages/tuffex/packages/components/src/image-uploader/src/TxImageUploader.vue:115`
  - 建议：Add optional `uploadText?: string` and `removeLabel?: (name?: string) => string` props (or an `add` slot) defaulting to the current English strings, and document them in the Props table of image-uploader.zh.mdc / .en.mdc — the Slots table currently states no customization point exists at all.

### 🟡 `index` — 3 条（high 0 / medium 1 / low 2）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - Several inline `code:` snippets on the hub page reference variables that the snippet never declares — the Workflow Panel snippet binds `:columns="columns" :data="rows"` while its `<script setup>` only declares `query`, `selectedKeys`, `automationEnabled`; the Data Operations and Permission Orchestration snippets have the same problem with `columns`/`pagedRows`/`page`/`rows` and `scopeNodes`/`teamNodes`/`resources`.
  - 证据：`apps/nexus/content/docs/dev/components/index.zh.mdc:54`
  - 建议：Either add the missing declarations to each snippet (the real demo defines them — ComponentsWorkflowPanelDemo.vue:66 `const columns = computed<DataTableColumn<WorkflowRow>[]>(...)` and :78 `const filteredRows = computed(...)`), or trim the snippets to the sub-tree that is actually self-contained. Apply to index.zh.mdc lines 44-56 / 164-170 / 185-195 and the matching index.en.mdc blocks.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - index.zh.mdc / index.en.mdc frontmatter has only title / description / syncStatus / verified — `category`, `status`, `since`, and `tags` are all absent.
  - 证据：`apps/nexus/content/docs/dev/components/index.zh.mdc:4`
  - 建议：Add `category: Overview`, `status:`, `since:`, and `tags: [hub, index, components]` to both hub files so the hub page is classified consistently with the component pages it indexes.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - index.zh.mdc is 467 lines and embeds 11 composed `TuffDemoWrapper` blocks with full inline code, turning what the doc itself calls an index page ('本页是组件文档索引和组合 Demo 指南') into the longest non-component page in the directory.
  - 证据：`apps/nexus/content/docs/dev/components/index.zh.mdc:463`
  - 建议：Keep 2-3 representative composed demos (Lineup + Workflow Panel) on the hub and move the other eight (Dashboard Sparkline, Operations Status, Recovery States, Feedback Task Center, Search Filters, Data Operations, Permission Orchestration, Release Policy, Navigation Shell) onto a dedicated composition-patterns page linked from `## 教程路径`, which already references each of them by name.

### 🟡 `input` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - TxInput renders a CapsLock warning badge whenever `type="password"` is focused and CapsLock is on, but neither the Props/Events/Slots tables nor the `## 审阅说明` / `## Review Notes` contract sections mention this behavior anywhere.
  - 证据：`packages/tuffex/packages/components/src/input/src/TxInput.vue:155`
  - 建议：Add a bullet to the Review Notes / 审阅说明 contract list in both input.zh.mdc and input.en.mdc: "`type=\"password\"` shows a CapsLock indicator while focused and CapsLock is active; the flag resets on blur." Consider also adding a demo under Input Types that exercises it.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The CapsLock warning is conveyed only by a decorative SVG plus a hardcoded English `title="CapsLock is on"`, with no `aria-live`/`role="status"` and no i18n hook, so screen-reader users and non-English UIs get no warning at all.
  - 证据：`packages/tuffex/packages/components/src/input/src/TxInput.vue:155`
  - 建议：Give the span `role="status"` + `aria-live="polite"` and an `aria-label`, and expose the message text via a prop (e.g. `capsLockText`) or the library's locale layer instead of a hardcoded English string — the clear button at line 165 already uses an explicit `aria-label`, so follow that pattern.
- **[low]** `d5-no-purpose` · D5 · PLAUSIBLE
  - input.zh.mdc and input.en.mdc jump straight from the `# Input 输入` heading to `## 基础用法` with no design-purpose sentence explaining why the component exists or when to prefer `TxSearchInput` — that guidance is buried at the bottom under 最佳实践.
  - 证据：`apps/nexus/content/docs/dev/components/input.zh.mdc:14`
  - 建议：Insert 1-3 sentences between the title and the first section, e.g. "轻量文本输入，用于表单行、工具栏和列表筛选。需要 Enter 搜索或防抖远程搜索时改用 TxSearchInput;需要数字步进器时用 TxNumberInput。" Mirror it in input.en.mdc.

### 🟡 `kbd` — 2 条（high 0 / medium 1 / low 1）

- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - kbd has no `src/types.ts` and `index.ts` exports neither a `Kbd` install alias nor a `KbdProps` type, so consumers cannot type a wrapper's props — unlike spinner/form/flip-overlay which all export their props interfaces.
  - 证据：`packages/tuffex/packages/components/src/kbd/index.ts:6`
  - 建议：Add `src/types.ts` with `export interface KbdProps { size?: 'sm' | 'md'; tone?: 'default' | 'primary' }`, switch TxKbd.vue to `withDefaults(defineProps<KbdProps>(), {...})`, and export `Kbd` (withInstall alias) plus `KbdProps` from index.ts to match the sibling components; then add them to the `## Source` export-alias bullet.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Both Props rows only restate the prop name/type ('快捷键 token 尺寸', '视觉色调') without saying when to pick `md` over `sm` or `primary` over `default`.
  - 证据：`apps/nexus/content/docs/dev/components/kbd.zh.mdc:46`
  - 建议：Rewrite the descriptions with usage guidance, e.g. size: '`sm` 用于行内帮助与菜单快捷键；`md` 用于独立快捷键卡片或空状态提示'; tone: '`primary` 仅用于页面主快捷键，同屏不超过一组'. Mirror the wording in kbd.en.mdc lines 45-46.

### 🟡 `keyframe-stroke-text` — 2 条（high 0 / medium 1 / low 1）

- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The rendered glyph size does not equal `fontSize`: the root SVG's CSS height is pinned to `fontSize` while the viewBox height is `bbox.height + 2 * max(4, strokeWidth * 3)`, so the whole drawing is uniformly rescaled and grows/shrinks whenever `strokeWidth` or the text's bbox changes.
  - 证据：`packages/tuffex/packages/components/src/keyframe-stroke-text/src/TxKeyframeStrokeText.vue:45`
  - 建议：Set the root height from the measured viewBox (e.g. expose `--tx-kf-view-height` and use `height: calc(var(--tx-kf-font-size) * var(--tx-kf-view-ratio))`), or drop the fixed `height: var(--tx-kf-font-size)` on line 119 and size the SVG from the viewBox so raising `strokeWidth` from 2 to 10 no longer visually shrinks the text.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Most zh Props descriptions only restate the type (`strokeColor` → "描边动画颜色", `fillColor` → "最终填充颜色", `fontWeight` → "SVG 字重") and give no guidance on when to change them.
  - 证据：`apps/nexus/content/docs/dev/components/keyframe-stroke-text.zh.mdc:68`
  - 建议：Add the "when to set" angle already implied by 最佳实践, e.g. `strokeColor` → "描边阶段的轮廓色，深色背景上应选高对比色，否则第一段动画几乎不可见", `strokeWidth` → "描边宽度，同时决定 viewBox padding；超过 3 会明显影响布局尺寸".

### 🟡 `layout-skeleton` — 4 条（high 0 / medium 2 / low 2）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The "Dashboard Data Operations" section renders `ComponentsDataOperationsDemo` (a full DataTable + pagination + selection dashboard) but its inline `code:` block shows only `<div style="height: 190px;"><TxLayoutSkeleton /></div>`.
  - 证据：`apps/nexus/content/docs/dev/components/layout-skeleton.zh.mdc:79`
  - 建议：Either replace the inline snippet with the real composition from ComponentsDataOperationsDemo.vue (DataTable + TxPagination + the skeleton region), or drop this whole section from layout-skeleton docs and keep the shared dashboard demo on a composition page. Same divergence exists at layout-skeleton.en.mdc:79.
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxLayoutSkeleton renders 15+ empty pulsing divs with no `aria-hidden`, `role="status"` or `aria-busy`, so assistive tech sees a meaningless node cluster and no loading announcement.
  - 证据：`packages/tuffex/packages/components/src/layout-skeleton/src/TxLayoutSkeleton.vue:10`
  - 建议：Add `aria-hidden="true"` to the root (the shapes are purely decorative) and let the host own the live-region status, or add `role="status" aria-busy="true" aria-label="Loading"` to the root. Then document the chosen contract in the `## Interaction Contract` section (layout-skeleton.en.mdc:69-73), which currently only describes counts.
- **[low]** `a11y` · D4 · PLAUSIBLE
  - The `tx-skeleton-pulse` opacity animation runs infinitely with no `prefers-reduced-motion` guard, unlike 10 other tuffex components that already honor the media query.
  - 证据：`packages/tuffex/packages/components/src/layout-skeleton/src/TxLayoutSkeleton.vue:127`
  - 建议：Add `@media (prefers-reduced-motion: reduce) { .tx-layout-skeleton__line, .tx-layout-skeleton__circle { animation: none; } }` to the scoped style block, matching the pattern already used in TxBaseAnchor.vue, TxFloating.vue and TxGlowText.vue.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - The same zero-prop usage `<TxLayoutSkeleton />` is demonstrated four times (Demo, 基础用法 code block, 后台数据运维面板, 组合示例) across a component that has no props at all.
  - 证据：`apps/nexus/content/docs/dev/components/layout-skeleton.zh.mdc:31`
  - 建议：Collapse to one `## Usage` snippet plus at most one `## Examples` composition (the TxCard pairing). Delete the `## 基础用法` TuffCodeBlock at line 31-41 (byte-identical to the demo at line 21-30) and the `## 后台数据运维面板` section, which repeats the identical snippet a third time.

### 🟡 `loading-overlay` — 4 条（high 0 / medium 4 / low 0）

- **[medium]** `broken-mdc-fence` · D2 · CONFIRMED
  - The `ComponentsFeedbackTaskCenterDemo` block opens with a 2-colon `::TuffDemoWrapper` but is closed with a 3-colon `:::` at line 96 in both zh and en, leaving an unmatched container fence that swallows the trailing `## 最佳实践` / `## 审阅说明` / `## Source` sections.
  - 证据：`apps/nexus/content/docs/dev/components/loading-overlay.zh.mdc:84`
  - 建议：Change line 84 to `:::TuffDemoWrapper{...}` so the opening fence matches the `:::` closer on line 96, matching the two demo blocks already at lines 24 and 39 in the same file. Apply the identical fix to loading-overlay.en.mdc:84.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline `code:` for `ComponentsFeedbackTaskCenterDemo` shows only a `TxLoadingOverlay` wrapping two `TxProgressBar`s, but the block's own title/description promise "Toast / Tooltip / Spinner" and the real demo renders `TxToastHost`, `TxTooltip`, `TxStatusBadge`, `TxTag`, `TxSpinner`, and `TuffSwitch`.
  - 证据：`apps/nexus/content/docs/dev/components/loading-overlay.en.mdc:88`
  - 建议：Either trim the block description to what the snippet actually shows ("local LoadingOverlay over a progress list"), or extend the inline snippet with the `TxToastHost` / `TxTooltip` / `TxSpinner` pieces from apps/nexus/app/components/content/demos/ComponentsFeedbackTaskCenterDemo.vue lines 99-140 so the snippet matches its own caption.
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - The zh intro paragraph is a verbatim repeat of the frontmatter `description` ("用于在内容区域或全屏展示加载遮罩。") while the en intro states when to reach for the component; the zh reader gets no design-purpose guidance.
  - 证据：`apps/nexus/content/docs/dev/components/loading-overlay.zh.mdc:13`
  - 建议：Replace line 13 with a translation of the en intro, e.g. "当内容已经存在、只需要在加载/保存/同步期间临时阻塞时使用 LoadingOverlay；首屏内容尚未存在时改用 TxLoadingState。"
- **[medium]** `a11y` · D4 · PLAUSIBLE
  - The fullscreen overlay is a plain `<div>` with no `role="status"`/`aria-busy`, no focus trap, and no keyboard blocking, so Tab still reaches the page behind it — contradicting the doc's guidance to use `fullscreen` for flows "that cannot continue in parallel".
  - 证据：`packages/tuffex/packages/components/src/loading-overlay/src/TxLoadingOverlay.vue:40`
  - 建议：Add `role="status"` + `aria-live="polite"` on the overlay card and `aria-busy="true"` on the local container; for the fullscreen branch either apply `inert` to `document.body` children while open or set `tabindex="-1"` on the overlay and focus it, so keyboard users are actually blocked as the Best Practices section claims (loading-overlay.en.mdc:101).

### 🟡 `loading-state` — 3 条（high 0 / medium 3 / low 0）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The Props table claims `icon={null}` hides the icon area, but combined with the documented `loading` prop the spinner still renders, so the two documented props contradict each other.
  - 证据：`apps/nexus/content/docs/dev/components/loading-state.zh.mdc:55`
  - 建议：Either fix `TxEmptyState.showSpinner` (line 118) to also require `props.icon !== null`, or amend both docs to read "pass `null` to hide the icon area — has no effect while `loading` is true". Verified: `mount(TxLoadingState, { props: { icon: null, loading: true } })` still renders `.tx-empty-state__icon` containing a `.tx-spinner`.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The "Dashboard Recovery States" section's inline code shows a `<TxLoadingState>`, but `ComponentsRecoveryStatesDemo` initialises `mode` to `'empty'`, so the embedded demo first paints a `TxEmptyState variant="no-data"` instead.
  - 证据：`apps/nexus/app/components/content/demos/ComponentsRecoveryStatesDemo.vue:5`
  - 建议：On the LoadingState page either default the demo to `mode = 'loading'`, or change the inline `code:` block to show the segmented-control composition (`v-if="mode === 'loading'"` plus the empty/error branches) so the code block matches what the reader actually sees.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - TxLoadingState documents `primary`/`secondary` events but declares no `defineEmits`, so they exist only as untyped attribute fallthrough to TxEmptyState and are absent from the component's public emit contract.
  - 证据：`packages/tuffex/packages/components/src/loading-state/src/TxLoadingState.vue:9`
  - 建议：Add `defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')"` / `@secondary="emit('secondary')"`), and export a `LoadingStateEmits` alias from `src/types.ts` next to `LoadingStateProps`. Verified: `@primary` does fire at runtime (1 call) via fallthrough, but because it is not a declared emit, a typo like `@primry` compiles silently and the handler would break if the wrapper ever gained `inheritAttrs: false` or a second root node.

### 🟡 `markdown-editor` — 3 条（high 0 / medium 3 / low 0）

- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `resolveAutoTheme` reads theme signals off both `document.documentElement` and `document.body`, but `setupThemeObserver` only observes `documentElement`, so a body-driven dark-mode toggle never updates the editor.
  - 证据：`packages/tuffex/packages/components/src/markdown-editor/src/TxMarkdownEditor.vue:386`
  - 建议：Also observe `document.body` with the same `attributeFilter: ['class','data-theme']`, or drop the body checks from `resolveAutoTheme` (lines 360/366) so the read and watch surfaces match. Verified with `theme="auto"`: adding `.dark` to `document.body` leaves `data-theme="light"`, while adding `.dark` to `documentElement` correctly flips it to `dark`.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The WYSIWYG surface declares `role="textbox"` but has no `aria-label`/`aria-labelledby`, and the source `<textarea>` is likewise unnamed, so both editing surfaces announce with no accessible name.
  - 证据：`packages/tuffex/packages/components/src/markdown-editor/src/TxMarkdownEditor.vue:519`
  - 建议：Add an `ariaLabel` prop (defaulting to something like "Markdown editor") and bind it to both the `role="textbox"` div (line 519) and the `<textarea>` (line 530); document it in the Props table. Verified: `surface.attributes('aria-label')` and `aria-labelledby` are both `undefined`, as is the textarea's `aria-label`.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The mode switcher uses `role="tablist"` / `role="tab"` but the editing surfaces carry no `role="tabpanel"` and the tabs have no `aria-controls`, producing an incomplete tab pattern.
  - 证据：`packages/tuffex/packages/components/src/markdown-editor/src/TxMarkdownEditor.vue:492`
  - 建议：Either add `:id`/`aria-controls` pairs plus `role="tabpanel"` (and roving `tabindex`) on the three surfaces, or drop the tablist/tab roles and expose the buttons as a plain toggle group with `aria-pressed`. Verified: tab attrs render as `{role:'tab', aria-selected:'true'|'false'}` with no `aria-controls`, and `wrapper.findAll('[role="tabpanel"]').length` is `0`.

### 🔴 `markdown-view` — 4 条（high 1 / medium 2 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - DOMPurify is only imported inside `onMounted` when `sanitize` is initially true, so flipping `sanitize` from false to true at runtime leaves `sanitizer` null and renders an empty body forever.
  - 证据：`packages/tuffex/packages/components/src/markdown-view/src/TxMarkdownView.vue:120`
  - 建议：Move the dompurify import into a `watch(() => props.sanitize, …, { immediate: true })` that loads the sanitizer whenever sanitize becomes true (guarding against double import), and add a test that mounts with `sanitize: false` then `setProps({ sanitize: true })` and asserts the markdown is still rendered.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Theme Preview inline snippet renders two bare TxMarkdownView instances inside `grid md:grid-cols-2` with an undefined `richContent`, while MarkdownViewLightDarkDemo.vue wraps each view in explicit light (#fff) and dark (#0d1117) panels — copying the snippet renders dark markdown on a light page.
  - 证据：`apps/nexus/content/docs/dev/components/markdown-view.zh.mdc:68`
  - 建议：Sync the snippet with the demo in both language files: include the `richContent` definition and the two wrapper elements carrying matching light/dark backgrounds, since the component only themes its own text and never paints a surface.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `marked.setOptions({ gfm, breaks })` runs in setup on the shared global `marked` singleton, so every TxMarkdownView instance mutates parser config app-wide for any other `marked` consumer.
  - 证据：`packages/tuffex/packages/components/src/markdown-view/src/TxMarkdownView.vue:16`
  - 建议：Stop mutating the global: use a per-component instance (`const parser = new Marked({ gfm: true, breaks: true })`) or pass options per call (`marked.parse(src, { gfm: true, breaks: true })`) so host apps that configure `marked` differently are not silently overridden.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both markdown-view files are missing the `status` and `since` frontmatter fields.
  - 证据：`apps/nexus/content/docs/dev/components/markdown-view.zh.mdc:5`
  - 建议：Add `status: stable` (or the accurate value) and `since: 1.0.0` to both zh and en frontmatter.

### 🔴 `modal` — 2 条（high 1 / medium 1 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxModal's visibility watcher is not `immediate`, so a modal mounted with `modelValue: true` never focuses the overlay, never records `previouslyFocusedElement`, and therefore Escape (bound as `@keydown.esc` on the overlay) cannot dismiss it and focus is never restored on close.
  - 证据：`packages/tuffex/packages/components/src/modal/src/TxModal.vue:51`
  - 建议：Add `immediate: true` to the `watch(visible, ...)` options (guarding `document` access for SSR), or move the open-side logic into `onMounted` as well. Add a regression test that mounts with `modelValue: true` and asserts `document.activeElement === overlay`; the existing focus test only covers the false->true transition, and the Escape test dispatches the event directly on the overlay element so it masks the bug.
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxModal declares `aria-modal="true"` but implements no focus trap, so Tab from inside the dialog walks straight into the page behind it while assistive tech is told the background is inert.
  - 证据：`packages/tuffex/packages/components/src/modal/src/TxModal.vue:74`
  - 建议：Add a `@keydown.tab` handler on the overlay that cycles focus between the first/last tabbable descendants (or apply `inert` to the app root while open), and document the behavior in the Interaction Contract section alongside the existing focus-restore bullet (modal.en.mdc:74).

### 🟡 `nav-bar` — 3 条（high 0 / medium 3 / low 0）

- **[medium]** `a11y` · D4 · CONFIRMED
  - The left/right zone buttons carry hardcoded English `aria-label`s that override the slot content's accessible name, so the documented "Save" right-slot example is announced to screen readers as "Navigation right action", and there is no prop to supply a localized label.
  - 证据：`packages/tuffex/packages/components/src/nav-bar/src/TxNavBar.vue:94`
  - 建议：Only apply a fallback `aria-label` when the corresponding slot is absent (e.g. `:aria-label="slots.right ? undefined : rightLabel"`), and add `backLabel` / `leftLabel` / `rightLabel` props so apps can localize the built-in "Back" string at line 68.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Because `left`/`right` slot content is always wrapped in a native `<button>`, any consumer placing a button or link in those zones emits invalid nested interactive markup — the component's own test does exactly that with `<button class="custom-left">Menu</button>`, contradicting the docs' "do not nest another interactive button" rule.
  - 证据：`packages/tuffex/packages/components/src/nav-bar/__tests__/nav-bar.test.ts:53`
  - 建议：Either render the action zones as a plain `<div>` when a slot is provided (and let the slot own the interactive element), or add a `leftAsButton`/`rightAsButton` escape hatch; update the test fixtures to use `<span>`/`<TxIcon>` so they no longer encode the anti-pattern the docs forbid.
- **[medium]** `logic-bug` · D4 · PLAUSIBLE
  - `zIndex` writes `--tx-nav-bar-z-index` and applies `z-index` on the base `.tx-nav-bar` rule, but `position` is only set (to `sticky`) under `.is-fixed`, so with the default `fixed: false` the documented `zIndex` prop is inert on a statically positioned element.
  - 证据：`packages/tuffex/packages/components/src/nav-bar/src/TxNavBar.vue:113`
  - 建议：Move the `z-index` declaration inside the `&.is-fixed` block (or add `position: relative` to the base rule) so the prop actually has an effect, and note in the Props table that `zIndex` only applies when `fixed` is true.

### 🟡 `no-data` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `type-leak` · D4 · CONFIRMED
  - TxNoData documents `primary`/`secondary` events but never calls `defineEmits`, so they are untyped and only reach TxEmptyState through single-root attribute fallthrough.
  - 证据：`packages/tuffex/packages/components/src/no-data/src/TxNoData.vue:9`
  - 建议：Add `const emit = defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')" @secondary="emit('secondary')"`), so `<TxNoData @primary="...">` is type-checked by Volar and keeps working if the template ever gains a second root or sets `inheritAttrs: false`.

### 🟡 `no-selection` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `type-leak` · D4 · PLAUSIBLE
  - The docs list `primary` and `secondary` as TxNoSelection events, but TxNoSelection.vue declares no `defineEmits`; the events only reach the caller through attribute fallthrough, so they are absent from the component's typed public surface and are untested.
  - 证据：`packages/tuffex/packages/components/src/no-selection/src/TxNoSelection.vue:9`
  - 建议：Add `const emit = defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')" @secondary="emit('secondary')"`) on the inner `TxEmptyState`, then add an emit-forwarding case to no-selection.test.ts.

### 🔴 `number-input` — 3 条（high 1 / medium 2 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - The `displayValue` setter clamps and rounds on every keystroke and `v-model` writes the result straight back into the DOM input, so with `:min="10"` typing the first digit of "50" is instantly rewritten to "10" and the intended value can never be typed.
  - 证据：`packages/tuffex/packages/components/src/number-input/src/TxNumberInput.vue:56`
  - 建议：Keep a local raw string buffer while the field is focused and emit the parsed-but-unclamped value on input; apply `normalizeValue` (clamp + precision) only in `handleBlur` and `stepBy`, which already re-normalize.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `handleBlur` unconditionally re-commits and emits `update:modelValue` + `change` even when the user never edited the field, so a focus/tab-away round trip marks forms dirty and fires a spurious `change`.
  - 证据：`packages/tuffex/packages/components/src/number-input/src/TxNumberInput.vue:106`
  - 建议：Compare the normalized result against `props.modelValue` and skip `commitValue` when unchanged; also stop emitting `change` from the per-keystroke setter so `change` keeps native commit semantics, and document that in the Events table.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Both step buttons carry hardcoded English aria-labels ("Decrease value" / "Increase value") with no prop or slot to localize them, and `inheritAttrs: false` routes all fallthrough attrs to the input, so consumers cannot override them either.
  - 证据：`packages/tuffex/packages/components/src/number-input/src/TxNumberInput.vue:136`
  - 建议：Add `decreaseLabel` / `increaseLabel` string props (defaulting to the current English strings, mirroring how TxFileUploader exposes `buttonText`/`dropText`/`hintText`) and document them in the Props table.

### ⚪ `offline-state` — 2 条（high 0 / medium 0 / low 2）

- **[low]** `type-leak` · D4 · PLAUSIBLE
  - `TxOfflineState` documents `primary` / `secondary` events but declares no `defineEmits`, so they are absent from the component's emits typing and `wrapper.emitted('primary')` is always undefined — the handlers only fire because `onPrimary` falls through as an attr onto the root `TxEmptyState`.
  - 证据：`packages/tuffex/packages/components/src/offline-state/src/TxOfflineState.vue:9`
  - 建议：Add `const emit = defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')"`), so the events are part of the typed public API and testable via `emitted()`. I verified with a throwaway vitest that a parent `@primary` handler does fire (1 call) but `wrapper.emitted()` contains no `primary` entry. The same pattern affects all nine empty-state wrappers.
- **[low]** `d5-no-purpose` · D5 · PLAUSIBLE
  - The maintainer review note ("已人工核对 …TxOfflineState.vue、types.ts 与 offline-state.test.ts") is pasted directly under the H1 in the design-purpose slot, and the same information is repeated in `## 审阅说明 / Review Notes` at line 89.
  - 证据：`apps/nexus/content/docs/dev/components/offline-state.zh.mdc:15`
  - 建议：Delete line 15 (and the equivalent offline-state.en.mdc:15); the coverage claim already lives in the Review Notes and `## Source` sections. Keep only the purpose sentence at line 13 under the H1.

### 🟡 `outline-border` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `undocumented-behavior` · D1 · CONFIRMED
  - `clipShape="squircle"` combined with `clipMode="clipPath"` silently falls back to `inset(0 round var(--tx-outline-radius))` (a plain rounded rect), but the docs only call out the rounded/rect fallback and advertise `squircle` as a first-class clip shape.
  - 证据：`packages/tuffex/packages/components/src/outline-border/src/TxOutlineBorder.vue:148`
  - 建议：Add a bullet to the Interaction Contract in both languages: `clipShape="squircle"` is only honoured by `clipMode="mask"`; under `clipPath` it degrades to a rounded inset. Alternatively emit an actual squircle `path()` in `resolveClipPath`.
- **[medium]** `misleading-demo` · D2 · CONFIRMED
  - The Mask Clipping demo pairs `variant="ring"` with `clip-shape="hexagon"`, but the ring is a `box-shadow` on the root (which keeps `border-radius: 9999px` from the default `shape="circle"`) while only the inner content layer is hexagon-masked, so the outline does not follow the hexagon.
  - 证据：`apps/nexus/app/components/content/demos/OutlineBorderMaskClipDemo.vue:6`
  - 建议：Either drop the ring from this demo (`variant="border"` has the same problem — use no outline, or a hexagon-shaped drop-shadow filter) or state in the doc's Mask note that ring/border outlines always follow `border-radius` and cannot trace `clipShape="hexagon"`. Update the identical snippet in outline-border.zh.mdc:40-48 and .en.mdc:40-48.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - outline-border.zh.mdc and .en.mdc frontmatter is missing the `status` and `since` fields.
  - 证据：`apps/nexus/content/docs/dev/components/outline-border.zh.mdc:5`
  - 建议：Add `status: stable` (or the correct maturity) and `since: 1.0.0` to both language files to complete the 8-field frontmatter.

### 🟡 `pagination` — 4 条（high 0 / medium 4 / low 0）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The Props table documents `prevIcon` default `'chevron-left'` and `nextIcon` default `'chevron-right'`, but withDefaults sets `'i-carbon-chevron-left'` / `'i-carbon-chevron-right'` — copying the documented value produces a blank icon.
  - 证据：`apps/nexus/content/docs/dev/components/pagination.zh.mdc:68`
  - 建议：Change the documented defaults to `'i-carbon-chevron-left'` / `'i-carbon-chevron-right'` (see TxPagination.vue:16-17, asserted by pagination.test.ts:18-19) in both pagination.zh.mdc and pagination.en.mdc, and note that the value is a UnoCSS icon class consumed by TxIcon.
- **[medium]** `type-mismatch` · D1 · PLAUSIBLE
  - `total` is documented with default `0`, but withDefaults does not provide a default for it, so the runtime value is `undefined` — which matters because `totalPages` branches on `if (props.total)` and silently falls back to `totalPages`.
  - 证据：`apps/nexus/content/docs/dev/components/pagination.zh.mdc:60`
  - 建议：Change the documented default to `-` / `undefined` in both locales and say explicitly that omitting `total` (or passing `0`) makes the component fall back to `totalPages`, per TxPagination.vue:24-29.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - When `currentPage` exceeds the computed page count (e.g. after a filter change), the Previous/First buttons stay enabled because they only check `currentPage <= 1`, but handlePageChange rejects the resulting page — the user sees enabled controls that do nothing and no active page.
  - 证据：`packages/tuffex/packages/components/src/pagination/src/TxPagination.vue:71`
  - 建议：Clamp reads of the current page, e.g. `const safePage = computed(() => Math.min(Math.max(props.currentPage, 1), totalPages.value))`, use it for the active class, aria-current, and disabled checks, and emit a corrective `update:currentPage` when the incoming prop is out of range — instead of relying on the Best Practices note that tells callers to reset to 1 themselves.
- **[medium]** `a11y` · D4 · CONFIRMED
  - All accessible names are hardcoded English string literals (`aria-label="Pagination"`, `"First page"`, `"Previous page"`, `"Next page"`, `"Last page"`) with no prop or slot to override, so screen-reader users in a zh UI get English-only navigation labels.
  - 证据：`packages/tuffex/packages/components/src/pagination/src/TxPagination.vue:88`
  - 建议：Add optional label props (e.g. `ariaLabel`, `prevLabel`, `nextLabel`, `firstLabel`, `lastLabel`) to `PaginationProps` defaulting to the current English strings, bind them in the template, and document them in the Props table alongside the existing `info` slot guidance.

### 🟡 `permission-state` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `missing-emits-declaration` · D4 · PLAUSIBLE
  - The docs list `primary` and `secondary` as component events, but `TxPermissionState.vue` declares no `defineEmits`; the handlers only reach `TxEmptyState` through single-root attribute fallthrough, so they are absent from the component's typed emit surface.
  - 证据：`packages/tuffex/packages/components/src/permission-state/src/TxPermissionState.vue:9`
  - 建议：Add `const emit = defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')" @secondary="emit('secondary')"` on `<TxEmptyState>`), so IDE completion, devtools and the docs agree — and so forwarding survives a future `inheritAttrs: false` or an added wrapper element. Also add an emit-forwarding assertion to permission-state.test.ts.

### 🔴 `picker` — 6 条（high 3 / medium 2 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `visibleItemCount` only feeds the scroller padding variable; the column viewport height is hardcoded to 5 rows in CSS, so any value other than 5 makes the snapped row and the computed index disagree by one row.
  - 证据：`packages/tuffex/packages/components/src/picker/src/TxPicker.vue:447`
  - 建议：Drive the viewport height from the same source as the padding, e.g. add `'--tx-picker-visible-count': visibleCount` to the inline style on `.tx-picker__columns` and change the rule to `height: calc(var(--tx-picker-item-height) * var(--tx-picker-visible-count, 5))`. Add a test asserting that `visibleItemCount: 7` yields a 7-row track height and still resolves index N from scrollTop N*itemHeight.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - Inline mode (`popup=false`) never performs an initial scroll sync, so a picker mounted with a non-first `modelValue` shows the wrong option under the highlight band.
  - 证据：`packages/tuffex/packages/components/src/picker/src/TxPicker.vue:236`
  - 建议：Call `syncScrollPositions('auto')` from an `onMounted` hook (or add `{ immediate: true }` to the modelValue/columns watchers guarded by `popup === false`), so inline pickers scroll to the selected index on first render.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - `disabled` does not block scroll-driven value changes: `onScroll` has no disabled guard and the scroller keeps `overflow-y: auto`, so a disabled picker still emits `update:modelValue` and `change` on wheel/trackpad scroll.
  - 证据：`packages/tuffex/packages/components/src/picker/src/TxPicker.vue:168`
  - 建议：Return early from `onScroll` (and `setValueAt`) when `props.disabled` is true, and add `pointer-events: none` / `overflow: hidden` to `.is-disabled .tx-picker__scroller` so a disabled picker is truly inert. Cover it with a test that scrolls a disabled picker and asserts no emits.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The `columns` watcher re-normalizes `localValue` without emitting `update:modelValue`, so when columns change and the current value becomes invalid, the parent's v-model silently keeps the stale/invalid value.
  - 证据：`packages/tuffex/packages/components/src/picker/src/TxPicker.vue:81`
  - 建议：After normalizing on a columns change, compare with `props.modelValue` and emit `update:modelValue` (and `change`) when the normalized array differs, so the parent state matches what the picker displays.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Each column scroller declares `role="listbox"` but its children are plain `<button>` elements with no `role="option"`/`aria-selected`, the listbox itself is `tabindex="-1"`, and there is no arrow-key handling.
  - 证据：`packages/tuffex/packages/components/src/picker/src/TxPicker.vue:306`
  - 建议：Give the option buttons `role="option"` with `:aria-selected="localValue[colIndex] === opt.value"`, make the listbox focusable (`tabindex="0"`) with `aria-activedescendant`, and handle ArrowUp/ArrowDown/Home/End to move the selection. Apply to both the inline (line 306) and popup (line 358) render paths.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - picker.zh.mdc and picker.en.mdc frontmatter is missing `status`, `since`, and `tags` (only title/description/category/syncStatus/verified are present).
  - 证据：`apps/nexus/content/docs/dev/components/picker.zh.mdc:4`
  - 建议：Add `status: beta`, `since: 1.0.0`, and `tags: [picker, wheel, form, selection]` to both language files so Picker matches the 8-field frontmatter standard used by checkbox and progress-bar.

### 🟡 `popover` — 4 条（high 0 / medium 3 / low 1）

- **[medium]** `lang-drift` · D3 · CONFIRMED
  - The zh Events table collapses all three event descriptions to bare verbs ("打开" / "关闭" / "v-model 更新") and drops the controlled-vs-uncontrolled semantics that the en table spells out.
  - 证据：`apps/nexus/content/docs/dev/components/popover.zh.mdc:212`
  - 建议：Translate the en descriptions rather than abbreviating: `open` → "内部或非受控状态打开时触发", `close` → "内部或非受控状态关闭时触发", `update:modelValue` → "Popover 请求变更打开状态时触发（受控/非受控均会发出）", matching popover.en.mdc:212-214.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Neither TxPopover's reference wrapper nor the TxBaseAnchor panel carries `aria-expanded`, `aria-haspopup`, `aria-controls`, or a panel `role`/`id`, so keyboard and screen-reader users get no signal that the trigger opens a popover and the body-teleported panel is announced out of context.
  - 证据：`packages/tuffex/packages/components/src/popover/src/TxPopover.vue:200`
  - 建议：Bind `aria-haspopup="dialog"`, `:aria-expanded="open"`, and `:aria-controls="panelId"` on `.tx-popover__reference`, and give the TxBaseAnchor panel a matching `:id` plus `role="dialog"`/`role="tooltip"`. TxBaseAnchor currently only sets `aria-hidden="true"` on the arrow and liquid decorations (TxBaseAnchor.vue:913, 927, 1072) — nothing on the panel itself.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `PopoverPlacement` is the documented type of the `placement` prop but is not re-exported from `popover/index.ts`, so `import type { PopoverPlacement }` from the package entry fails.
  - 证据：`packages/tuffex/packages/components/src/popover/index.ts:8`
  - 建议：Change to `export type { PopoverPlacement, PopoverProps }`. `src/types.ts:3` already exports `PopoverPlacement`, and `components.ts:76` only forwards whatever `popover/index.ts` re-exports, so today the type name in the docs table (popover.zh.mdc:181) is unimportable.
- **[low]** `orphan-demo` · D2 · PLAUSIBLE
  - `PopoverVisualEffectsDemo.vue` is dead: no doc references it and it is absent from `demo-registry.ts`, which only registers the near-identical `PopoverPopoverVisualEffectsDemo`.
  - 证据：`apps/nexus/app/components/content/demo-registry.ts:209`
  - 建议：Delete `apps/nexus/app/components/content/demos/PopoverVisualEffectsDemo.vue` (89 lines, superseded by the 122-line PopoverPopoverVisualEffectsDemo), or register it and reference it from a doc section that needs it.

### 🟡 `progress` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - `progress/index.ts` exports only the component value — no props type and no `TuffProgressInstance` — because `TxProgress.vue` declares props inline instead of in a `src/types.ts`, unlike every sibling in this shard (stat-card / tag-input / transfer / text-transformer all export `XxxProps` plus `TxXxxInstance`).
  - 证据：`packages/tuffex/packages/components/src/progress/index.ts:8`
  - 建议：Extract the prop shape into `progress/src/types.ts` as `ProgressProps`, use the shared `withInstall` helper instead of the hand-rolled `.install` assignment, and export `ProgressProps` + `TuffProgressInstance` from `index.ts`.

### 🟡 `progress-bar` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The '后台运营进度 / Dashboard Operations Progress' inline snippet shows three bare `TxProgressBar`s, but the referenced `ComponentsOperationsStatusDemo` renders a full dashboard (header, TuffSwitch, TxButton, 3x TxStatCard, 3x TxStatusBadge) and uses `mask-variant="dashed"` on the first bar.
  - 证据：`apps/nexus/content/docs/dev/components/progress-bar.zh.mdc:58`
  - 建议：Either replace this entry with a ProgressBar-owned demo (e.g. a new `ProgressBarOperationsDemo`) whose snippet matches 1:1, or paste the real `ComponentsOperationsStatusDemo` progress section verbatim (including `mask-variant="dashed"`) and state in prose that the surrounding dashboard chrome is omitted.
- **[medium]** `logic-bug` · D4 · PLAUSIBLE
  - The `complete` watcher lacks `immediate: true`, so a bar mounted already at 100 (e.g. `<TxProgressBar :percentage="100" />` for an already-finished task) never emits `complete`, contradicting the documented 'emitted once per completion cycle when resolved progress reaches 100'.
  - 证据：`packages/tuffex/packages/components/src/progress-bar/src/TxProgressBar.vue:199`
  - 建议：Add `{ immediate: true }` to the watcher (the loading/indeterminate guard already prevents spurious emits), or document explicitly that `complete` only fires on a transition into 100 and never on initial mount. Add a test mounting at `percentage: 100`.
- **[low]** `stale-demo-code` · D2 · PLAUSIBLE
  - The Segments snippet omits `indicator-effect="sparkle"` and `mask-background="glass"`, which the real `ProgressBarSegmentsDemo` uses, so the rendered bar has a sparkle indicator and glass track that the copyable code does not produce.
  - 证据：`apps/nexus/app/components/content/demos/ProgressBarSegmentsDemo.vue:18`
  - 建议：Add `indicator-effect="sparkle"` and `mask-background="glass"` to the inline snippet in progress-bar.zh.mdc:47 and .en.mdc:47, or remove them from the demo so code and render match.

### 🔴 `radio` — 5 条（high 1 / medium 4 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - A standalone `TxRadio` (used outside a `TxRadioGroup`) is completely inert: `select()` returns early when no group is injected, so clicking never emits `click` and never renders a checked state — yet `TxRadio`/`Radio` are public exports and the docs describe the `type` prop as the "standalone visual style when the radio is not controlled by a group".
  - 证据：`packages/tuffex/packages/components/src/radio/src/TxRadio.vue:35`
  - 建议：Either (a) support ungrouped use by falling back to a local `modelValue`/`checked` prop and still emitting `click`, or (b) drop the standalone claim: reword the `type` row in radio.zh.mdc:235 / radio.en.mdc:235 to "visual style; inherited from the parent group when present" and add an explicit note that `TxRadio` must be nested inside `TxRadioGroup`.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - Three conflicting default values are declared for `stiffness`/`damping`: types.ts JSDoc says 85/10, `withDefaults` in TxRadioGroup.vue uses 110/12 (what the docs table states), and radio-group-indicator.ts uses dead `?? 150` / `?? 8` fallbacks.
  - 证据：`packages/tuffex/packages/components/src/radio/src/types.ts:17`
  - 建议：Update the JSDoc on types.ts:17 and :19 to 110 and 12 to match `withDefaults` (TxRadioGroup.vue:17-18), and delete the unreachable `?? 150` / `?? 8` fallbacks in radio-group-indicator.ts:64-65 so there is a single source of truth.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The button-group indicator is pointer-draggable (a `cursor: grab` hit area captures pointerdown and on release selects the nearest enabled radio, emitting update:modelValue/change), but neither the Interaction Contract nor the Keyboard table mentions dragging at all.
  - 证据：`packages/tuffex/packages/components/src/radio/src/radio-group-indicator.ts:587`
  - 建议：Add a bullet to `## 交互契约` / `## Interaction Contract` (radio.zh.mdc:184, radio.en.mdc:184) describing the drag-to-select gesture: the indicator can be dragged horizontally in `type="button"` groups, and releasing snaps to and selects the nearest enabled radio; disabled groups ignore pointerdown.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `TxRadioType` and `TxRadioIndicatorVariant` are declared in src/types.ts but never re-exported from radio/index.ts, so consumers cannot import them — the docs' own playground snippet and the real demo both have to redeclare the unions by hand.
  - 证据：`packages/tuffex/packages/components/src/radio/index.ts:10`
  - 建议：Change line 1 and line 10 to also pull through `TxRadioType` and `TxRadioIndicatorVariant`, then replace the hand-written `type GroupType` / `type IndicatorVariant` unions in radio.zh.mdc:166-167, radio.en.mdc:166-167, and RadioRadioGroupPlaygroundDemo.vue:7-8 with the imported types.
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxRadioGroup implements no roving tabindex: every child renders as a natively focusable `<button role="radio">` with no `tabindex`, so Tab steps through every option instead of entering the group once and using arrow keys, violating the ARIA radiogroup pattern the component otherwise adopts.
  - 证据：`packages/tuffex/packages/components/src/radio/src/TxRadio.vue:50`
  - 建议：Bind `:tabindex="isChecked ? 0 : -1"` on the radio button (falling back to the first enabled radio when nothing is checked) so only one item is in the tab order, and document the resulting Tab-in/arrow-to-move behavior next to the existing keyboard bullet at radio.en.mdc:190.

### 🔴 `rating` — 7 条（high 1 / medium 5 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxRating never syncs `hoverValue` back from `modelValue`, so in interactive (non-readonly/non-disabled) mode an externally changed `modelValue` is not reflected in the rendered stars.
  - 证据：`packages/tuffex/packages/components/src/rating/src/TxRating.vue:73`
  - 建议：Add `watch(() => props.modelValue, v => { hoverValue.value = v })` (or make `filledStars` fall back to `props.modelValue` when no hover is active), so programmatic score changes and half-star click results render immediately without requiring a mouseleave.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - `RatingProps`/`RatingIcon` in types.ts is not what the component actually declares — TxRating.vue re-declares a local `Props` with a `RatingIconValue` that omits `TxIconSource.color`, so the documented `icon: string | TxIconSource` type is wider than the real prop type.
  - 证据：`packages/tuffex/packages/components/src/rating/src/TxRating.vue:14`
  - 建议：Delete the local `Props`/`Emits`/`RatingIconValue` declarations and use `withDefaults(defineProps<RatingProps>(), ...)` / `defineEmits<RatingEmits>()` from `./types`, so the exported public type is the component's real contract and cannot drift again.
- **[medium]** `invalid-demo-usage` · D2 · CONFIRMED
  - `RatingRatingDemo.vue` binds `ref('')` (a string) to `v-model` of a `number` `modelValue` while `show-text` is on, which crashes rendering with `rating.toFixed is not a function`.
  - 证据：`apps/nexus/app/components/content/demos/RatingRatingDemo.vue:4`
  - 建议：Either delete the file (no doc references it — it is an orphan alongside GlassSurfaceControlsDemo.vue) or change it to `const score = ref(3.5)`. Verified by probe: mounting TxRating with `modelValue: ''` and `showText: true` throws `$setup.rating.toFixed is not a function`.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `## 样式定制` prose promises three appearances (orange / green readonly / violet compact) but the inline code block shows only one TxRating; the same truncation applies to RatingIconDemo (2 of 3) and RatingAnimationDemo (2 of 3).
  - 证据：`apps/nexus/content/docs/dev/components/rating.zh.mdc:36`
  - 建议：Regenerate the inline `code:` blocks from the actual demo files (RatingStyleDemo/RatingIconDemo/RatingAnimationDemo) so all three variants — including the `#text` slot usage in the readonly green example — appear in the copied snippet.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `rating/index.ts` re-exports the raw SFC without `withInstall`, so `TxRating` has no `install()` and no default export — the library-level `install()` in components/src/index.ts silently fails to register it globally.
  - 证据：`packages/tuffex/packages/components/src/rating/src/index.ts:1`
  - 建议：Mirror tag/tuff-logo-stroke: `const Rating = withInstall(TxRating); export { Rating, TxRating }; export default Rating`, and also re-export the `RatingIcon` type (currently only `RatingEmits`/`RatingProps` leave `src/index.ts`, so `RatingIcon` is unreachable from the package entry despite the docs' Source section naming it).
- **[medium]** `a11y` · D4 · CONFIRMED
  - `getStarAriaChecked` marks every star at or below the score as `aria-checked="true"`, so a `role="radiogroup"` reports N simultaneously checked radios instead of exactly one.
  - 证据：`packages/tuffex/packages/components/src/rating/src/TxRating.vue:131`
  - 建议：Either make `aria-checked` exclusive (`Math.ceil(rating) === star`) and add arrow-key roving-tabindex navigation, or drop the radio roles and expose the group as a single `role="slider"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`. Also make the hardcoded English `aria-label="Rate N stars"` (line 206) overridable/localizable.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - rating frontmatter is missing `status`, `since`, and `tags` in both rating.zh.mdc and rating.en.mdc.
  - 证据：`apps/nexus/content/docs/dev/components/rating.zh.mdc:4`
  - 建议：Add `status: beta`, `since: 1.0.0`, `tags: [rating, star, feedback]` to both files to complete the 8-field frontmatter.

### 🔴 `scroll` — 6 条（high 2 / medium 2 / low 2）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - The prop watcher uses `{ deep: true }` and includes `props.options`, so a consumer passing an inline object literal (`:options="{ ... }"`) triggers a full BetterScroll destroy + re-init on every parent re-render, resetting scroll position and re-attaching the wheel listener.
  - 证据：`packages/tuffex/packages/components/src/scroll/src/TxScroll.vue:509`
  - 建议：Drop `{ deep: true }` (a deep watcher always fires its callback when the effect re-runs, regardless of value equality) and instead watch a stable serialized signature of `props.options`, or diff the previous/next option objects and skip re-init when nothing meaningful changed.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - BetterScroll positions are reported via `Math.abs()`, so with the default `bounce: true` an upward overscroll (positive `bs.y`) is emitted as a positive `scrollTop`, making "is scrolled" detection fire while the content is actually above the top.
  - 证据：`packages/tuffex/packages/components/src/scroll/src/TxScroll.vue:250`
  - 建议：Clamp instead of taking the absolute value: emit `Math.max(0, -pos.y)` / `Math.max(0, -pos.x)` (and the same in `getScrollInfo()` at line 413) so bounce overscroll past the top reports `scrollTop: 0` rather than a mirrored positive offset.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - `options.useTransition` is intercepted locally by `getTransitionOverride()` (BetterScroll gets `useTransition: false` injected on macOS when `wheel` and `bounce` are on, unless the caller explicitly supplies the key), but neither doc mentions this — only `wheelOvershoot` is documented as locally consumed.
  - 证据：`packages/tuffex/packages/components/src/scroll/src/scroll-wheel.ts:88`
  - 建议：Extend the `options` row (both languages) to list every locally-interpreted key: `wheelOvershoot` (consumed, never forwarded) and `useTransition` (defaulted to `false` on macOS when `wheel && bounce`, overridable by explicitly passing it).
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - The zh Props table descriptions have drifted behind the en ones: zh `options` says only "BetterScroll 初始化参数（兜底，会覆盖部分默认值）" and drops the `wheelOvershoot` interception that en documents; `noPadding`, `wheel`, `bounce`, `direction`, `scrollbar*` and `pullDown*` rows are likewise reduced to bare labels in zh.
  - 证据：`apps/nexus/content/docs/dev/components/scroll.zh.mdc:276`
  - 建议：Re-translate the en Props table into scroll.zh.mdc row by row so behavioral details (`wheelOvershoot` consumed locally, ctrl-wheel ignored, native vs BetterScroll threshold semantics) exist in both languages.
- **[low]** `orphan-demo` · D2 · PLAUSIBLE
  - Six legacy scroll demo files (`ScrollBasicDemo`, `ScrollBounceScrollbarDemo`, `ScrollChainingDemo`, `ScrollHorizontalDemo`, `ScrollNativeDemo`, `ScrollPullDownUpDemo`) are unreferenced anywhere under `apps/nexus/content` or `apps/nexus/app`; the docs use the parallel `ScrollScroll*` variants instead.
  - 证据：`apps/nexus/app/components/content/demos/ScrollBasicDemo.vue:1`
  - 建议：Delete the six unreferenced `Scroll*Demo.vue` files (or repoint the docs at them and delete the `ScrollScroll*` duplicates) so there is exactly one demo file per documented example; also drop the unused `const i = ref('')` and the identical zh/en branches in ScrollScrollDemo.vue.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both scroll doc files are missing the `status`, `since`, and `tags` frontmatter fields that every sibling component doc (command-palette, gradient-border, nav-bar) carries — only `title`, `description`, `category`, `syncStatus`, and `verified` are present.
  - 证据：`apps/nexus/content/docs/dev/components/scroll.zh.mdc:5`
  - 建议：Add `status: beta`, `since: 1.0.0`, and `tags: [scroll, layout, better-scroll, virtual]` to both scroll.zh.mdc and scroll.en.mdc so the 8-field frontmatter contract holds across the component docs.

### 🟡 `search-empty` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The "基础用法 / Basic Usage" snippet shows only `title` and `description`, but SearchEmptySearchEmptyDemo.vue also passes `surface="card"` and a `:primary-action` — so the rendered demo has a bordered card and a "Reset filters" button that appear nowhere in the code the reader is shown.
  - 证据：`apps/nexus/content/docs/dev/components/search-empty.zh.mdc:22`
  - 建议：Either add `surface="card"` and `:primary-action="{ label: '重置筛选', type: 'primary', icon: 'i-carbon-reset' }"` to the snippet, or strip them from SearchEmptySearchEmptyDemo.vue so the plain variant is the basic demo and the card+action variant stays exclusive to the Dashboard Filter Toolbar section. Same fix in search-empty.en.mdc:22.
- **[medium]** `type-leak` · D4 · PLAUSIBLE
  - The documented `primary` / `secondary` events are never declared — TxSearchEmpty.vue has only defineProps and no defineEmits, so the events reach the host purely through attribute fallthrough into TxEmptyState, giving no emit typing on TxSearchEmptyInstance and no template type-checking (a typo like `@primry` compiles and silently does nothing).
  - 证据：`packages/tuffex/packages/components/src/search-empty/src/TxSearchEmpty.vue:9`
  - 建议：Add `const emit = defineEmits<EmptyStateEmits>()` and forward explicitly (`@primary="emit('primary')" @secondary="emit('secondary')"`), re-export `SearchEmptyEmits` from index.ts, and add a test asserting `wrapper.emitted('primary')` fires when the stubbed EmptyState emits it — the current suite (search-empty.test.ts) never exercises the documented events.

### 🟡 `search-input` — 4 条（high 0 / medium 3 / low 1）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `SearchInput (remote)` inline snippet shows an `async onSearch` that awaits a 200ms fetch, filters a fixed 12-item result list and sets `open.value = true`, but the real `SearchInputSearchInputRemoteDemo.vue` runs synchronously, synthesizes 3 results from the term and never opens the popover from `onSearch` — so the rendered demo can never show the snippet's `Loading...` or `No results` states.
  - 证据：`apps/nexus/content/docs/dev/components/search-input.zh.mdc:66`
  - 建议：Make `SearchInputSearchInputRemoteDemo.vue` async (await a short timer, toggle `loading`, set `open = true` after results arrive, and filter a fixed candidate list so an empty-result case is reachable), then copy that implementation verbatim into the inline `code:` blocks of search-input.zh.mdc and search-input.en.mdc.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `后台筛选工具栏` / `Dashboard Filter Toolbar` inline snippet passes `remote` with no `@search` listener and no `:search-debounce`, teaching a no-op pattern, whereas the real `ComponentsSearchFiltersDemo.vue` wires `:search-debounce="180"` and `@search="onSearch"` and also filters by scope, not just keyword.
  - 证据：`apps/nexus/content/docs/dev/components/search-input.zh.mdc:147`
  - 建议：Update the inline snippet in both languages to mirror the real demo: add `:search-debounce="180"` and `@search="onSearch"` with a small `onSearch` handler, and include the scope-aware `filteredRecords` predicate — or drop `remote` from the snippet if the point is purely local filtering.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `inputRef` is typed `ref<any>`, so the publicly exposed `getValue()` resolves to `any` at the call site even though both docs declare it as `() => string`; `setValue`/`focus`/`blur`/`clear` are likewise unchecked optional-chained `any` calls.
  - 证据：`packages/tuffex/packages/components/src/search-input/src/TxSearchInput.vue:19`
  - 建议：Type the ref as `ref<InstanceType<typeof TuffInput> | null>(null)` (or a narrow local interface `{ focus(): void; blur(): void; clear(): void; setValue(v: string): void; getValue(): string }`) so the exposed helpers keep the signatures promised in the `### Expose` table at search-input.zh.mdc:181-187.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both search-input.zh.mdc and search-input.en.mdc frontmatter contain only `title`, `description`, `category`, `syncStatus`, `verified` — the `status`, `since`, and `tags` fields required by the 8-field standard are missing (chat, grid-layout, and tree-select in the same shard all have them).
  - 证据：`apps/nexus/content/docs/dev/components/search-input.zh.mdc:5`
  - 建议：Add `status: beta`, `since: 1.0.0`, and `tags: [search, input, form]` to the frontmatter of both search-input.zh.mdc and search-input.en.mdc so the page participates in status/version filtering and tag-based navigation like its sibling Form components.

### 🔴 `search-select` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - The selectedOption watcher early-returns when the option is not found, so resetting `modelValue` externally (or setting a value absent from `options`) leaves the previously selected label stranded in the input, desyncing the visible text from the bound value.
  - 证据：`packages/tuffex/packages/components/src/search-select/src/TxSearchSelect.vue:52`
  - 建议：Replace the early return with an explicit reset: when `opt` is undefined and `props.modelValue` is empty/unknown, set `inputText.value = ''` (or keep the raw query only while the panel is open). Add a test that mounts with a selection, sets `modelValue` to '' via `setProps`, and asserts the input value is cleared.
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - The zh intro claims the dropdown was migrated to a `TxPopover → TxTooltip → TxBaseAnchor` chain, which has no en counterpart (en says "hosted by TxPopover with full-width reference anchoring") and is not backed by source — TxPopover.vue imports and renders TxBaseAnchor directly, with no TxTooltip in between.
  - 证据：`apps/nexus/content/docs/dev/components/search-select.zh.mdc:15`
  - 建议：Replace the zh sentence with a translation of the en one ("下拉层由 TxPopover 承载，参考元素全宽锚定，且不响应参考元素点击切换"), matching TxPopover.vue:5 (`import { TxBaseAnchor } from '../../base-anchor'`) and TxSearchSelect.vue:179-180 (`:reference-full-width="true"`, `:toggle-on-reference-click="false"`).
- **[medium]** `a11y` · D4 · PLAUSIBLE
  - The dropdown has no combobox semantics and no keyboard path: the reference wrapper/input carries no role="combobox"/aria-expanded/aria-controls, option rows have no role="option", and the only key handler is `@keydown.enter="onEnter"` which merely emits `search` — so ArrowDown/ArrowUp/Enter-to-select/Escape do nothing and options are mouse-only.
  - 证据：`packages/tuffex/packages/components/src/search-select/src/TxSearchSelect.vue:188`
  - 建议：Add an `activeIndex` ref driven by ArrowDown/ArrowUp, make Enter pick the active option (falling back to `emitSearch` in remote mode), close on Escape, and wire `role="combobox" aria-expanded aria-controls aria-activedescendant` on the input plus `role="listbox"`/`role="option" aria-selected` on the panel and rows. The docs' claim that slots are internal "so keyboard and Popover behavior stay consistent" (search-select.en.mdc:187) currently has nothing behind it.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `inputRef` is typed `ref<any>`, so the publicly exposed `focus()`, `blur()` and `clear()` methods are unchecked optional-chained calls into an untyped instance — a rename in TxInput would break them silently at runtime.
  - 证据：`packages/tuffex/packages/components/src/search-select/src/TxSearchSelect.vue:36`
  - 建议：Type it as `ref<InstanceType<typeof TuffInput> | null>(null)` (or import the input's exported instance type) so `inputRef.value?.focus?.()` is validated at compile time, and drop the defensive `?.()` on methods the input actually exposes.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Most zh Props descriptions only restate the prop name (`占位`, `禁用`, `可清空`, `loading 状态`, `下拉最大高度`) with no guidance on when or how to set them, while the en table for the same rows carries full explanations — the zh table is a strictly degraded copy.
  - 证据：`apps/nexus/content/docs/dev/components/search-select.zh.mdc:146`
  - 建议：Translate the en descriptions (search-select.en.mdc:146-159) into the zh table so each row states intent, e.g. `clearable` -> "显示输入框清除按钮，并允许清空已选值（清空会同时发出 update:modelValue 与 change）". While there, replace the `panelBackground` en description "Card background style" with a real one for parity.

### 🔴 `segmented-slider` — 7 条（high 2 / medium 3 / low 2）

- **[high]** `invalid-demo-usage` · D2 · CONFIRMED
  - SegmentedSliderSegmentedSliderDemo.vue passes `const segments = ref('')` (an empty string) into `:segments`, so the demo referenced by both zh and en docs renders an empty track with zero segments instead of the documented Small/Medium/Large/XL slider.
  - 证据：`apps/nexus/app/components/content/demos/SegmentedSliderSegmentedSliderDemo.vue:4`
  - 建议：Replace lines 4-5 with the working implementation that already exists in the orphaned apps/nexus/app/components/content/demos/SegmentedSliderBasicDemo.vue: `const value = ref(1)` and the four-entry `segments` array ({value:0,label:'Small'} ... {value:3,label:'XL'}), matching the doc snippet.
- **[high]** `invalid-demo-usage` · D2 · CONFIRMED
  - SegmentedSliderSegmentedSliderCustomDemo.vue initialises `priceSegments`/`ratingSegments`/`priceValue`/`ratingValue` as empty strings, so the 'Custom Options' demo renders two blank tracks instead of the Free/Pro/Team/Enterprise and 1-5 star sliders shown in the doc code block.
  - 证据：`apps/nexus/app/components/content/demos/SegmentedSliderSegmentedSliderCustomDemo.vue:4`
  - 建议：Restore the real data from SegmentedSliderCustomDemo.vue: `priceValue = ref('pro')` with the four plan segments and `ratingValue = ref(3)` with the five star segments, exactly as the doc snippet in segmented-slider.zh.mdc lines 55-70 declares.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The Source/Review section and the test both document "auto-selects the first segment when modelValue is null", but `SegmentedSliderProps.modelValue` is typed `number | string` (default `0`), so the `props.modelValue == null` branch is unreachable for any type-correct consumer.
  - 证据：`packages/tuffex/packages/components/src/segmented-slider/src/types.ts:7`
  - 建议：Either widen the type to `modelValue?: number | string | null` and drop the `0` default (so the documented auto-select path is reachable), or delete the dead `onMounted` auto-select block plus the corresponding claim in the Source section of both docs.
- **[medium]** `lang-parity` · D3 · CONFIRMED
  - Both segmented-slider demos branch on `locale === 'zh'` but the `v-else` (English) branch duplicates the Chinese copy verbatim ("当前值", "价格档位选择", "评分选择", "星"), while the en doc snippets show "Current value", "Price tier selection", "Rating selection", "stars".
  - 证据：`apps/nexus/app/components/content/demos/SegmentedSliderSegmentedSliderDemo.vue:23`
  - 建议：Replace the duplicated `v-if`/`v-else` blocks with a single template plus a `labels` computed keyed off `locale` (as EmptyEmptyDemo.vue does), using the English strings from segmented-slider.en.mdc for the non-zh branch.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Each segment button contains only an empty `<span class="dot">` when `showLabels` is false or a segment has no `label`, leaving the buttons with no accessible name; selection state is also exposed as `aria-pressed` (toggle-button semantics) with no radiogroup role and no arrow-key navigation.
  - 证据：`packages/tuffex/packages/components/src/segmented-slider/src/TxSegmentedSlider.vue:96`
  - 建议：Always bind `:aria-label="segment.label ?? String(segment.value)"` on the segment button, wrap the track in `role="radiogroup"` with `role="radio"` + `:aria-checked` on each segment, and add ArrowLeft/ArrowRight (ArrowUp/ArrowDown when `vertical`) keydown handling.
- **[low]** `d5-no-purpose` · D5 · PLAUSIBLE
  - The zh doc's opening line is a verbatim copy of the frontmatter `description` ("用于在预定义的离散选项中进行选择的分段滑块组件。") and gives no design purpose, unlike the en doc which explains when to reach for it.
  - 证据：`apps/nexus/content/docs/dev/components/segmented-slider.zh.mdc:13`
  - 建议：Translate the en opening instead: state that TxSegmentedSlider maps a finite value list onto a slider track, that it is for discrete values that must stay visible while selecting, and that TxSlider/TxSelect are the alternatives for continuous or long lists.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - The zh Props table descriptions only restate the type ("是否禁用", "是否显示标签", "是否垂直排列", "分段选项数组"), whereas the en table explains behaviour ("Prevents click and keyboard selection changes", "Renders a vertical track with bottom-to-top progress").
  - 证据：`apps/nexus/content/docs/dev/components/segmented-slider.zh.mdc:163`
  - 建议：Port the en descriptions into zh: e.g. `disabled` → "禁用后点击与键盘选择都不再触发 update:modelValue"; `vertical` → "改为垂直轨道，进度自下而上"; `showLabels` → "仅在 segment 提供 label 时显示文字".

### 🔴 `select` — 6 条（high 2 / medium 2 / low 2）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - hasVisibleOptions ignores the local search filter in slot mode, so a `searchable` select built from TuffSelectItem never renders the documented `emptyText` empty state when the query matches nothing.
  - 证据：`packages/tuffex/packages/components/src/select/src/TxSelect.vue:198`
  - 建议：In slot mode compute visibility from the same query used by TxSelectItem (e.g. track a reactive count of visible children, or have TxSelectItem report its `visible` state back through the injected context) so `<div v-else-if="!hasVisibleOptions">` can render `emptyText`. Add a test that types a non-matching query into `.tuff-select__search input` with slot items and asserts `No results` is shown.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - With `multiple` + `searchable` + `options`, two search inputs render at once and the in-panel search box is completely inert because option filtering reads `multiInput` while the panel box writes `searchQuery`.
  - 证据：`packages/tuffex/packages/components/src/select/src/TxSelect.vue:162`
  - 建议：Either suppress the panel search box when `isMultiInputEnabled` is true (change `v-if="searchable && !isEditable"` at line 665 to also exclude multi-input mode), or make `activeQuery`/the provided context query fall back to whichever of `multiInput`/`searchQuery` is non-empty. Cover the `multiple + searchable + options` combination in select.test.ts — the existing create test at line 222 omits `options` so it never hits this path.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `## 远程搜索` / `## Remote Search` inline snippet declares options via `:options="options"` plus `:loading` / `loading-text`, but SelectSelectRemoteSearchableDemo.vue actually registers options with `<TuffSelectItem v-for>` children and passes no loading props — a different registration path than the rendered demo.
  - 证据：`apps/nexus/content/docs/dev/components/select.zh.mdc:103`
  - 建议：Rewrite the inline snippet to mirror SelectSelectRemoteSearchableDemo.vue (slot `TuffSelectItem` children driven by the `search` handler), or change the demo to the `options` prop form so the copy-pasteable snippet and the live demo demonstrate the same remote pattern.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The dropdown list has no `role="listbox"`, options carry no `role="option"`/`aria-selected` (TxCardItem's `role` prop is never passed), and the single-select trigger input has no `role="combobox"`/`aria-expanded` — only the multi-select trigger declares combobox semantics.
  - 证据：`packages/tuffex/packages/components/src/select/src/TxSelect.vue:673`
  - 建议：Add `role="listbox"` to `.tuff-select__list`, pass `role="option"` plus `:aria-selected="isValueSelected(opt.value)"` to the TxCardItem options (and to TxSelectItem), and give the single-select TuffInput trigger `role="combobox"`, `aria-haspopup="listbox"` and `:aria-expanded="isOpen"` to match the multi trigger at line 572-574.
- **[low]** `i18n-default` · D4 · PLAUSIBLE
  - The `placeholder` prop defaults to the hardcoded Chinese string `'请选择'` while every other text default in the same withDefaults block is English (`'Search'`, `'Add item'`, `'Loading...'`, `'No results'`), which is why the English doc has to document a Chinese default.
  - 证据：`packages/tuffex/packages/components/src/select/src/TxSelect.vue:19`
  - 建议：Change the default to `'Please select'` for consistency with the other English defaults (and update select.zh.mdc:350 / select.en.mdc:350), or route all five text defaults through the library's locale mechanism.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - select.zh.mdc is 440 lines with 9 separate demo sections (基础选择 / 本地过滤 / 远程搜索 / 多选标签 / 自助创建 / 分组与自定义下拉 / 状态边框 / 禁用状态 / 滚动面板), exceeding the 400-line budget.
  - 证据：`apps/nexus/content/docs/dev/components/select.zh.mdc:297`
  - 建议：Merge the low-signal single-prop demos (状态边框 / 禁用状态 / 滚动面板) into one "变体与状态" example under `## Examples`, leaving 4-5 demos that each show a distinct interaction model (single, local filter, remote, multiple+create).

### 🟡 `skeleton` — 5 条（high 0 / medium 2 / low 3）

- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - The `## Source` section claims types.ts exports `SkeletonProps` and `SkeletonVariant`, but `skeleton/index.ts` re-exports only `SkeletonProps`, so `SkeletonVariant` is unreachable from the package entry.
  - 证据：`packages/tuffex/packages/components/src/skeleton/index.ts:12`
  - 建议：Change to `export type { SkeletonProps, SkeletonVariant }`. `src/types.ts:1` defines `SkeletonVariant` and `components.ts:87` only forwards `skeleton/index.ts`, so the claim at skeleton.zh.mdc:141 / skeleton.en.mdc:141 is currently false for consumers.
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxSkeleton renders bare empty `<div>`s with no `aria-busy`, `role="status"`, or `aria-hidden`, so a screen reader hears nothing during loading and the placeholder nodes are silently exposed in the accessibility tree.
  - 证据：`packages/tuffex/packages/components/src/skeleton/src/TxSkeleton.vue:55`
  - 建议：Add `role="status"` + `aria-busy="true"` (with an sr-only loading label) on `.tx-skeleton`, or at minimum `aria-hidden="true"` on the shimmer items so they do not pollute the a11y tree. Then document the choice in the `## 交互契约` section (skeleton.zh.mdc:87).
- **[low]** `stale-demo-code` · D2 · PLAUSIBLE
  - `SkeletonSkeletonDemo.vue` wraps identical markup in a `locale === 'zh'` / `v-else` branch, so the i18n scaffolding is pure noise — both branches render the same two `TxSkeleton` elements.
  - 证据：`apps/nexus/app/components/content/demos/SkeletonSkeletonDemo.vue:6`
  - 建议：Drop the `useI18n()` import and the locale branch, leaving a single `<div>` with the two skeletons — matching the doc's inline code at skeleton.zh.mdc:24-27 exactly. Same applies to SkeletonCardPlaceholderDemo.vue:6-15.
- **[low]** `redundant-logic` · D4 · PLAUSIBLE
  - `itemStyle` branches on `props.variant === 'text'` but both branches call the identical expression `toCssUnit(props.height)`, making the ternary dead code that hides an unimplemented text-variant height rule.
  - 证据：`packages/tuffex/packages/components/src/skeleton/src/TxSkeleton.vue:25`
  - 建议：Reduce to `const height = toCssUnit(props.height)`, or implement the intended text-variant behavior (e.g. line-height-derived height) and add a test for it in skeleton.test.ts.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - The body restates `status: beta` as a blockquote line `> **状态**：Beta`, duplicating frontmatter that the doc shell already renders.
  - 证据：`apps/nexus/content/docs/dev/components/skeleton.zh.mdc:15`
  - 建议：Delete the `> **状态**：Beta` line (and `> **Status**: Beta` at skeleton.en.mdc:15) and let the `status: beta` frontmatter field be the single source of truth; keep only the one-line purpose sentence.

### 🔴 `slider` — 5 条（high 2 / medium 2 / low 1）

- **[high]** `invalid-demo-usage` · D2 · CONFIRMED
  - SliderSliderElasticTooltipDemo.vue is a gutted skeleton: all 24 state refs are initialized to `''`/`false` and the entire preset system (`presets`, `applyPreset`, `watch(preset, ...)`) documented in the 200-line inline code block is absent, so `:tooltip-tilt="tiltMode === 'on'"` is permanently false and the 'Elastic Tooltip' playground demonstrates nothing.
  - 证据：`apps/nexus/app/components/content/demos/SliderSliderElasticTooltipDemo.vue:12`
  - 建议：Port the real state from slider.zh.mdc lines 111-315 into the demo file: type each ref (`tiltMode = ref<'on'|'off'>('on')`, `tooltipDistortSkewDeg = ref(8)`, etc.), add the six `Preset` objects plus `applyPreset()` and `watch(preset, applyPreset, { immediate: true })`. Numeric props like `tooltipJellyFrequency` must be numbers, not `''`, or `Math.max(0, '')` silently zeroes the effect.
- **[high]** `invalid-demo-usage` · D2 · CONFIRMED
  - SliderSliderFormatValueDemo.vue binds `:format-value` to `ref('')` (a string) while `SliderProps.formatValue` is typed `(value: number) => string`, so `displayValue` falls through to `String(clampedValue)` and the '格式化显示 / Formatted Display' section renders an unformatted number instead of the documented `30%`.
  - 证据：`apps/nexus/app/components/content/demos/SliderSliderFormatValueDemo.vue:4`
  - 建议：Replace with the function from the doc's inline block: `const formatValue = (next: number) => `${next}%`` and `const value = ref(30)`. Note this only avoids a crash because `''` is falsy — any truthy string would make `props.formatValue(clampedValue.value)` throw at TxSlider.vue:108.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - SliderSliderDemo / SliderSliderShowValueDemo / SliderSliderDisabledDemo all initialize the v-model ref to `''` instead of the documented `ref(30)` / `ref(60)` / `ref(42)`; `Number.isFinite('')` is false so TxSlider clamps to `min` (0) and the demo's `Value: {{ value }}` line renders blank.
  - 证据：`apps/nexus/app/components/content/demos/SliderSliderDemo.vue:4`
  - 建议：Initialize each demo ref with the numeric value shown in the doc's inline `code:` block (30 / 60 / 42). Also collapse the identical `v-if="locale === 'zh'"` / `v-else` branches in these four files — both arms render byte-identical markup.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The `<input type="range">` has no accessible name and no `aria-valuetext`: `SliderProps` exposes no `ariaLabel`/`ariaLabelledby`, and because the root element is `<div class="tx-slider">` with default `inheritAttrs`, a consumer-supplied `aria-label` lands on that unlabelled wrapper div instead of the input.
  - 证据：`packages/tuffex/packages/components/src/slider/src/TxSlider.vue:573`
  - 建议：Add `ariaLabel?: string` / `ariaLabelledby?: string` to SliderProps and bind them onto the input, and bind `:aria-valuetext="tooltipText"` so screen readers announce `35%` rather than the bare number when `formatValue`/`tooltipFormatter` is set. Alternatively set `inheritAttrs: false` and `v-bind="$attrs"` on the input.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - slider.zh.mdc is 817 lines (4th longest doc in the component set) because the Elastic Tooltip section inlines a 570-line `code:` block containing six preset objects, and a second 50-line cross-component 'Release Policy' demo is embedded in the Slider page.
  - 证据：`apps/nexus/content/docs/dev/components/slider.zh.mdc:105`
  - 建议：Trim the inline `code:` block to the ~20 lines that show the tooltip-tilt props actually being bound and link to the demo source for the preset table; move the `ComponentsReleasePolicyDemo` composite (lines 686-740) to a cross-component recipes page and leave a one-line link here.

### 🔴 `sortable-list` — 3 条（high 1 / medium 2 / low 0）

- **[high]** `logic-bug` · D4 · PLAUSIBLE
  - `onDrop` never checks `props.disabled`, so a drop that lands while `disabled` is true still emits `update:modelValue` and `reorder`, even though both locale docs state that disabled mode blocks "drop reordering, and emitted reorder events".
  - 证据：`packages/tuffex/packages/components/src/sortable-list/src/TxSortableList.vue:69`
  - 建议：Add `if (props.disabled) { draggingId.value = null; overId.value = null; return }` at the top of `onDrop`. The existing test 'blocks drag and drop while disabled' only passes because dragstart was blocked first (draggingId is null); add a case that starts a drag, flips `disabled` to true via setProps, then dispatches drop and asserts no emits.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The live demo `SortableListSortableListDemo.vue` initialises `const list = ref([])`, so the rendered demo is an empty list with nothing to drag, while the doc's inline `code:` block shows a 3-item list that also demonstrates the `dragging` slot prop.
  - 证据：`apps/nexus/app/components/content/demos/SortableListSortableListDemo.vue:4`
  - 建议：Seed the demo with the same three items the docs show (`{ id: 'one', title: 'One' }`, …) and render `{{ item.title }}` plus the `dragging` class binding, matching sortable-list.zh.mdc:25-40 / .en.mdc:25-40 so the demo actually exercises drag reordering.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `TxSortableList.vue` is not declared `generic`, so `SortableListProps` collapses to the non-generic default and the `item` slot prop is typed `{ id: string }` — the documented usage `{{ item.title }}` does not typecheck, and the reorder path is cast through `move(items.value as any, ...)`.
  - 证据：`packages/tuffex/packages/components/src/sortable-list/src/TxSortableList.vue:9`
  - 建议：Declare the SFC as `<script setup lang="ts" generic="T extends SortableListItem">` and use `defineProps<SortableListProps<T>>()` / `defineEmits<SortableListEmits<T>>()`, which also removes the `as any` cast at line 85 and makes the `item.title` examples in both locale docs type-safe.

### 🟡 `spinner` — 5 条（high 0 / medium 2 / low 3）

- **[medium]** `behavior-mismatch` · D1 · CONFIRMED
  - The Interaction Contract claims the spinner inherits ambient text color via `currentColor`, but `.tx-spinner` hard-sets `color: var(--tx-text-color-secondary, #909399)` on its own root, so a parent's `color` never tints it.
  - 证据：`packages/tuffex/packages/components/src/spinner/src/TxSpinner.vue:151`
  - 建议：Either change the rule to `color: inherit` (or `var(--tx-spinner-color, currentColor)`) so ambient color really cascades, or fix the bullet in spinner.zh.mdc:121 / spinner.en.mdc:121 to say the spinner defaults to the secondary text color and must be tinted by setting `color` on the `TxSpinner` element itself (e.g. `<TxSpinner style="color: var(--tx-color-primary)" />`).
- **[medium]** `broken-mdc-block` · D2 · CONFIRMED
  - The `后台行内等待` / `Dashboard Inline Waiting` demo block opens with a 2-colon `::TuffDemoWrapper` but closes with a 3-colon `:::`, unlike every other demo block in the same file which uses `:::`/`:::`.
  - 证据：`apps/nexus/content/docs/dev/components/spinner.zh.mdc:127`
  - 建议：Change line 127 of spinner.zh.mdc and line 127 of spinner.en.mdc to `:::TuffDemoWrapper{...}` so the opening fence matches the `:::` closer on line 137; otherwise the YAML `code:` payload and the closing fence risk rendering as literal text/thematic breaks instead of a demo.
- **[low]** `dead-demo-branch` · D2 · PLAUSIBLE
  - SpinnerSpinnerDemo.vue and SpinnerSpinnerSizesDemo.vue wrap byte-identical markup in `v-if="locale === 'zh'"` / `v-else` branches, and two extra unreferenced copies (SpinnerBasicDemo.vue, SpinnerSizesDemo.vue) exist that are in neither demo-registry.ts nor any doc.
  - 证据：`apps/nexus/app/components/content/demos/SpinnerSpinnerDemo.vue:6`
  - 建议：Drop the `useI18n()` import and the duplicated locale branches from both demos (leaving a single `<TxSpinner />` / sizes row), and delete the orphaned SpinnerBasicDemo.vue and SpinnerSizesDemo.vue which no doc or registry entry references.
- **[low]** `type-drift` · D4 · PLAUSIBLE
  - TxSpinner.vue declares props with the runtime object form and never imports the `SpinnerProps` interface that types.ts exports and the docs advertise, so the published type is a hand-maintained duplicate that can silently drift from the runtime contract.
  - 证据：`packages/tuffex/packages/components/src/spinner/src/TxSpinner.vue:8`
  - 建议：Replace the runtime object with `withDefaults(defineProps<SpinnerProps>(), { size: 16, strokeWidth: 2, fallback: false, visible: true })` and import the type from `./types`, so the exported `SpinnerProps` becomes the single source of truth the Props table is checked against.
- **[low]** `a11y` · D4 · PLAUSIBLE
  - The spinner root carries `aria-live="polite"` but never contains text and exposes no label prop, so the live region can never announce anything; there is also no `role="status"`.
  - 证据：`packages/tuffex/packages/components/src/spinner/src/TxSpinner.vue:40`
  - 建议：Add an optional `label` prop rendered as a visually-hidden `<span>` inside the root (plus `role="status"`), or drop `aria-live` from the empty root and document that `aria-busy` belongs on the region being loaded — the current markup makes the live region a no-op that the Review Notes only partly discloses.

### 🔴 `splitter` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `snapValue()` is applied *after* `clamp(v, min, max)` and only re-clamps to `0..1`, so any `snap` step that is not an exact divisor of `min`/`max` emits ratios outside the documented `[min, max]` window — including `0`, which fully collapses pane A.
  - 证据：`packages/tuffex/packages/components/src/splitter/src/TxSplitter.vue:41`
  - 建议：Re-clamp after snapping, e.g. `const next = clamp(snapValue(clamp(v, min, max)), min, max)`, or snap to the nearest in-range step (`Math.round((v-min)/s)*s + min`). I verified the defect with a throwaway vitest: `min=0.1, max=0.9, snap=0.3` + pointerdown at x=4/width=400 emits `0`; `min=0.25, max=0.75, snap=0.2` + pointerdown at x=396 emits `0.8`. Also fix splitter.en.mdc:49-50 / splitter.zh.mdc:49-50, which claim min/max are the 'Minimum/Maximum emitted ratio'.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `SplitterDirection` is defined in types.ts and is the declared type of the `direction` prop, but `splitter/index.ts` only re-exports `SplitterEmits` and `SplitterProps`, so external consumers cannot import it from the package entry or the `@talex-touch/tuffex/splitter` subpath.
  - 证据：`packages/tuffex/packages/components/src/splitter/index.ts:8`
  - 建议：Add `SplitterDirection` to the type re-export (`export type { SplitterDirection, SplitterEmits, SplitterProps }`). Confirmed unreachable: `dist/es/splitter/index.d.ts` does not export it either, and splitter.zh.mdc:96 advertises it as a public type.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The separator is focusable and arrow-key resizable but exposes no `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, so assistive tech announces "Resize separator" with no position feedback while the user steps the ratio.
  - 证据：`packages/tuffex/packages/components/src/splitter/src/TxSplitter.vue:158`
  - 建议：Bind `:aria-valuenow="Math.round(value * 100)"`, `:aria-valuemin="Math.round(min * 100)"`, `:aria-valuemax="Math.round(max * 100)"` on the bar (a focusable `role="separator"` is a widget and ARIA requires these). The docs already flag the gap at splitter.en.mdc:89 — fix the component rather than only documenting it.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `onPointerDown` registers only `pointermove` / `pointerup`; there is no `pointercancel` handler and the bar has no `touch-action: none`, so a browser-cancelled pointer (touch scroll, gesture takeover) leaves `dragging=true` and the window listeners attached — the splitter then keeps resizing on every subsequent pointer move with no button held.
  - 证据：`packages/tuffex/packages/components/src/splitter/src/TxSplitter.vue:82`
  - 建议：Also listen for `pointercancel` (and `lostpointercapture`) and route it to `endDrag()`; add `touch-action: none` to `.tx-splitter__bar` so touch drags resize instead of scrolling.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both splitter docs omit the `status` and `since` frontmatter fields that the rest of the component docs carry (compare empty-state/floating/offline-state, which all have `status: beta` and `since: 1.0.0`).
  - 证据：`apps/nexus/content/docs/dev/components/splitter.zh.mdc:5`
  - 建议：Add `status:` and `since:` to splitter.zh.mdc and splitter.en.mdc frontmatter so the 8-field contract (title/description/category/status/since/tags/syncStatus/verified) holds.

### 🟡 `stack` — 4 条（high 0 / medium 2 / low 2）

- **[medium]** `invalid-demo-usage` · D2 · PLAUSIBLE
  - The "行内堆叠 / Inline Stack" example nests `<TxStack>` inside a `<p>`, but TxStack's root is a `<div>` (TxStack.vue:30) — invalid HTML that browsers fix by closing the `<p>` early, so the example does not render as the inline flow it demonstrates.
  - 证据：`apps/nexus/content/docs/dev/components/stack.zh.mdc:51`
  - 建议：Replace `<p>` with `<span>` (or a `<div>` with `display: inline`) in both stack.zh.mdc:51 and stack.en.mdc:51, or give TxStack a `tag`/`as` prop so `inline` can render a `<span>` root and legitimately live inside a paragraph.
- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - `## Source` claims types.ts exports `StackProps` and `StackDirection`, but `stack/index.ts` re-exports only `StackProps`, so `StackDirection` cannot be imported from the package entry.
  - 证据：`packages/tuffex/packages/components/src/stack/index.ts:8`
  - 建议：Change to `export type { StackDirection, StackProps }`. `src/types.ts:1` defines `StackDirection` and `components.ts:92` only forwards `stack/index.ts`, so the Source claim at stack.zh.mdc:125 / stack.en.mdc:125 does not hold for consumers.
- **[low]** `orphan-demo` · D2 · PLAUSIBLE
  - `StackBasicDemo.vue` is a dead duplicate of `StackStackDemo.vue` — it is not referenced by any doc and not registered in `demo-registry.ts`, which only lists `StackStackDemo`.
  - 证据：`apps/nexus/app/components/content/demo-registry.ts:260`
  - 建议：Delete `apps/nexus/app/components/content/demos/StackBasicDemo.vue`; its template is byte-for-byte the non-localized half of StackStackDemo.vue and it can only drift out of sync.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - The `align` and `justify` Props rows only restate their CSS mapping ("CSS `align-items` 值") without telling readers when to set them or what the supported values are — and the underlying type is an unconstrained `string`.
  - 证据：`apps/nexus/content/docs/dev/components/stack.zh.mdc:79`
  - 建议：Either narrow the types in `stack/src/types.ts:6-7` to a union (`'stretch' | 'flex-start' | 'center' | 'flex-end' | 'baseline'`) and document that union, or keep `string` but add guidance such as "横向操作行常用 `center`；表单区块保持默认 `stretch` 让子元素等宽". Same for `justify` at line 80.

### 🔴 `stagger` — 4 条（high 1 / medium 3 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxStagger's normalizedChildren does not flatten the Fragment VNode produced by a template `v-for`, so no child ever receives `--tx-stagger-index` and the stagger delay silently degrades to zero for the exact usage shown in every doc example and in StaggerStaggerDemo.vue.
  - 证据：`packages/tuffex/packages/components/src/stagger/src/TxStagger.vue:30`
  - 建议：Flatten Fragment children before indexing (mirror Vue's getTransitionRawChildren, or recursively expand vnodes whose `type === Fragment` into their `children`) so cloneVNode applies `--tx-stagger-index` to the real element vnodes. Add a regression test that mounts a host component using `<div v-for=... :key=...>` inside TxStagger and asserts index 0/1/2 on the rendered children.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The `appear` prop (default `true`, documented as "Enables appear transition after mount") can never fire: both `name` and `appear` are withheld as `undefined` on the first render, and by the time `isMounted` flips true the wrapped TransitionGroup's own transition state is already mounted, so the appear hooks are permanently skipped.
  - 证据：`packages/tuffex/packages/components/src/stagger/src/TxStagger.vue:53`
  - 建议：Either pass `name`/`appear` on the initial render (the leakage the deferral guards against is already prevented because TransitionGroup consumes them as props, not fallthrough attrs — the existing 'does not leak transition props' test passes with `appear: false`), or drop the `appear` prop and document that TxStagger only animates enter/leave after mount.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - `StaggerEasing` is defined and used by `StaggerProps.easing` but stagger/index.ts only re-exports `StaggerProps`, so the union type is unreachable from the package entry (`components.ts` does `export * from './stagger/index'`) even though the docs' ## Source section advertises it.
  - 证据：`packages/tuffex/packages/components/src/stagger/index.ts:8`
  - 建议：Change to `export type { StaggerEasing, StaggerProps }` and import `StaggerEasing` from './src/types' alongside `StaggerProps`, so consumers typing an `easing` binding can import it from '@talex-touch/tuffex'.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `easing` is declared as a runtime `{ type: String }` option, so the component's inferred public prop type is `string`, not the `'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear'` union that both docs' Props tables advertise — annotating `setup(props: StaggerProps)` does not change the component's external prop typing.
  - 证据：`packages/tuffex/packages/components/src/stagger/src/TxStagger.vue:15`
  - 建议：Use `easing: { type: String as PropType<StaggerEasing>, default: 'ease-out' }` (and `tag: { type: String as PropType<string> }` stays fine) so template type-checking rejects invalid easing values and matches the documented union.

### 🟡 `stat-card` — 6 条（high 0 / medium 5 / low 1）

- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - `hasInsight` returns false whenever the progress variant is active, so passing both `insight` and `progress`/`variant="progress"` silently drops the trend block — the docs only state that `insight` falls back when `from`/`to` are non-finite.
  - 证据：`packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue:36`
  - 建议：Add a sentence to the intro paragraph and the `insight` prop row in both zh/en docs: `insight` and the progress variant are mutually exclusive; when `progress`/`variant="progress"` is set, `insight` is ignored.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline snippet for `ComponentsOperationsStatusDemo` shows one stat card, one badge and one progress bar, while the rendered 262-line demo is a full panel with a `TuffSwitch` header, three progress-variant cards and three progress bars using `flow-effect`, `indicator-effect` and `mask-variant`.
  - 证据：`apps/nexus/content/docs/dev/components/stat-card.zh.mdc:179`
  - 建议：Either sync the inline `code:` block with the real demo (at least the three metric cards it describes in the prose) or drop the inline snippet and let TuffDemoWrapper source the code from the demo file.
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - The EN `value` prop description claims numeric values "can animate through NumberFlow when available", but `TxStatCard.vue` has no NumberFlow dependency at all (it formats with `Intl.NumberFormat`); the ZH row correctly says "会使用默认数字格式化".
  - 证据：`apps/nexus/content/docs/dev/components/stat-card.en.mdc:205`
  - 建议：Rewrite the EN row to match the code and the ZH doc: "Primary value; numbers are formatted with the built-in number formatter. Use the `value` slot to render NumberFlow or custom units yourself."
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `.tx-stat-card:hover` sets `cursor: pointer` for every card, which makes the `--clickable` rule redundant and gives non-clickable cards a false click affordance, contradicting the documented `clickable` contract ("Enables hover/press states").
  - 证据：`packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue:353`
  - 建议：Scope the hover block to `.tx-stat-card--clickable:hover` (or at least remove `cursor: pointer` from the generic `:hover` rule) so only `clickable` cards signal interactivity.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The card root hardcodes the English group name `aria-label="Stat card"`, so every card in a dashboard is announced identically and the `label` prop never reaches the accessible name.
  - 证据：`packages/tuffex/packages/components/src/stat-card/src/TxStatCard.vue:215`
  - 建议：Derive the group name from content — e.g. `:aria-label="label"` (falling back to an `ariaLabel` prop) or `aria-labelledby` pointing at the rendered `.tx-stat-card__label` node — so each card is distinguishable and localizable.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both zh and en frontmatter are missing `status`, `since` and `tags`, leaving only 5 of the 8 standard fields.
  - 证据：`apps/nexus/content/docs/dev/components/stat-card.zh.mdc:5`
  - 建议：Add `status: beta`, `since: 1.0.0` and `tags: [stat, metric, dashboard]` to both stat-card docs so the card is filterable and its maturity is visible.

### 🟡 `status-badge` — 2 条（high 0 / medium 2 / low 0）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - ComponentsOperationsStatusDemo 的内联示例只有 4 行（3 个徽标 + 1 个进度条），而实际渲染的 demo 是含 TxStatCard / TuffSwitch / TxButton / 三条 TxProgressBar 的完整看板，正文提到的 TxStatCard 在示例代码里根本不出现。
  - 证据：`apps/nexus/content/docs/dev/components/status-badge.zh.mdc:43`
  - 建议：要么把内联 code 换成 ComponentsOperationsStatusDemo.vue 里 operations-demo__badges + operations-demo__cards 的真实片段（含 TxStatCard），要么把这个大看板 demo 换成一个只演示徽标组合的小 demo，让「看到的」和「读到的」一致。
- **[medium]** `a11y` · D4 · PLAUSIBLE
  - TxStatusBadge 根节点是带 @click 的 div 且只有 role="status"，没有 tabindex / keydown / button 语义，点击态徽标键盘完全不可达。
  - 证据：`packages/tuffex/packages/components/src/status-badge/src/TxStatusBadge.vue:117`
  - 建议：新增 clickable 类 prop：为 false 时保持 role="status" 且不绑定 click；为 true 时渲染 <button type="button">（或补 tabindex="0" + role="button" + Enter/Space keydown），并在文档「交互契约」里写清楚只有 clickable 模式才发 click。

### 🔴 `steps` — 4 条（high 1 / medium 3 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxSteps injects `direction` and `size` into the provide object as one-time snapshots of `props.direction` / `props.size`, so child TxStep instances never react to those props changing after mount.
  - 证据：`packages/tuffex/packages/components/src/steps/src/TxSteps.vue:25`
  - 建议：Provide reactive getters instead of raw values, e.g. `direction: computed(() => props.direction)` and `size: computed(() => props.size)` (or provide `props` itself via `reactive(toRefs(props))`), and unwrap them in TxStep's `direction`/`size` computeds. Verified: mounting with `direction="horizontal" size="medium"` then `setProps({ direction: 'vertical', size: 'large' })` moves the root to `tx-steps--vertical tx-steps--large` while children stay `tx-step--horizontal tx-step--medium`, producing a half-vertical layout.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The single demo's inline `code:` block shows only the 3-step numeric horizontal example, while `StepsStepsDemo.vue` also renders a second vertical, string-keyed TxSteps that is the only demonstration of `direction`, `size`, `status="completed"`, `icon`, and `disabled`.
  - 证据：`apps/nexus/app/components/content/demos/StepsStepsDemo.vue:49`
  - 建议：Extend the `code:` blocks in steps.zh.mdc (lines 22-28) and steps.en.mdc to include the vertical string-keyed block, or split the demo into two `::TuffDemoWrapper` sections (`## Usage` numeric + `## Examples` vertical/string-keyed) so every rendered behaviour has matching source.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The clickable step `<button>` (`.tx-step__head`) wraps only the number/icon; `title` and `description` render in a sibling `.tx-step__content` div, so the button's accessible name is just the step number.
  - 证据：`packages/tuffex/packages/components/src/steps/src/TxStep.vue:108`
  - 建议：Either move `.tx-step__content` inside the `<component :is>` head, or add `:aria-label="title"` / `aria-describedby` linking the head to the title node. Verified: `head.text()` is `"1"` and `head.attributes('aria-label')` is `undefined` for a step with `title="Start" description="Collect basics"`, so screen-reader users tabbing the steps hear only "1, button", "2, button".
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The small/large vertical connector-line rules use a descendant combinator (`.tx-step--small .tx-step--vertical`) but both modifier classes sit on the same `.tx-step` element, so those offsets are dead CSS.
  - 证据：`packages/tuffex/packages/components/src/steps/src/TxStep.vue:239`
  - 建议：Change lines 239 and 245 to compound selectors: `.tx-step--small.tx-step--vertical .tx-step__line` and `.tx-step--large.tx-step--vertical .tx-step__line`. Verified from rendered markup: a step renders `class="tx-step tx-step--horizontal tx-step--medium ..."` — both modifiers on one node — so the documented `StepsStepsDemo` block using `direction="vertical" size="small"` keeps the medium offsets (left 11px / top 24px / height 24px) instead of (9px / 20px / 20px).

### 🟡 `switch` — 5 条（high 0 / medium 4 / low 1）

- **[medium]** `hallucinated-api` · D1 · CONFIRMED
  - The Interaction Contract claims the root renders `tabindex="0"` when enabled and `tabindex="-1"` when disabled, but TxSwitch renders a native `<button>` with no tabindex at all — switch.test.ts asserts `tabindex` is undefined in both states.
  - 证据：`apps/nexus/content/docs/dev/components/switch.zh.mdc:177`
  - 建议：Rewrite lines 177-178 (and switch.en.mdc:177-178) to describe what TxSwitch.vue:41-53 actually renders: a native `<button type="button" role="switch">` with `aria-checked` / `aria-disabled` / the native `disabled` attribute, which is focusable when enabled and removed from the tab order by `disabled` — no explicit tabindex is set.
- **[medium]** `stale-source-ref` · D1 · CONFIRMED
  - Review Notes claim `switch.test.ts` covers "keyboard emissions" and "disabled tabindex state", but the test file has no Enter/Space keydown case and instead asserts tabindex is never rendered.
  - 证据：`apps/nexus/content/docs/dev/components/switch.zh.mdc:246`
  - 建议：Either add real keyboard cases to switch.test.ts (native button click semantics for Enter/Space) or correct the coverage line in both zh/en to say the suite covers aria state, size classes, click emission, and disabled blocking only.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Custom Colors inline code shows two switches overridden via `.custom-switch--success/.custom-switch--warning` classes, while the real demo renders three switches (success/warning/violet) styled through a `--switch-demo-color` CSS variable on `:deep(.tuff-switch.is-active)`.
  - 证据：`apps/nexus/app/components/content/demos/SwitchCustomColorDemo.vue:56`
  - 建议：Replace the inline snippet in switch.zh.mdc:125-149 / switch.en.mdc:125-149 with the demo's actual pattern (per-wrapper `--switch-demo-color` custom property + `:deep(.tuff-switch.is-active)`), including the third violet example, so the documented override technique is the one shipped.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The "Labels Before and After" inline code declares `const autoSync = ref(true)` but never uses it and renders a single label row, while the real demo renders a second card row bound to `autoSync`.
  - 证据：`apps/nexus/content/docs/dev/components/switch.zh.mdc:107`
  - 建议：Add the second `<label>` row (label + state text + `<TuffSwitch v-model="autoSync" />`) to the inline snippet in both zh/en, or drop the unused `autoSync` ref — as written the snippet has a dangling variable and does not match the two-row demo.
- **[low]** `d5-no-purpose` · D5 · PLAUSIBLE
  - `# Switch 开关` is immediately followed by `## 基础用法` with no design-purpose statement explaining when to use a switch versus a checkbox.
  - 证据：`apps/nexus/content/docs/dev/components/switch.zh.mdc:14`
  - 建议：Insert 1-3 sentences after the H1 in both zh/en stating the purpose (immediate-effect boolean setting, no form submission semantics, prefer Checkbox for multi-select/submitted values) — the material already exists buried in `## 最佳实践` line 237.

### 🟡 `tab-bar` — 4 条（high 0 / medium 2 / low 2）

- **[medium]** `missing-export` · D4 · CONFIRMED
  - `TabBarValue` is named in both docs as the payload type of `update:modelValue` / `change`, but `tab-bar/index.ts` re-exports only `TabBarEmits`, `TabBarItem`, and `TabBarProps`, so callers cannot type their handler parameter with it.
  - 证据：`packages/tuffex/packages/components/src/tab-bar/index.ts:8`
  - 建议：Add `TabBarValue` to the re-export list. Confirmed unreachable from the built entry (`dist/es/tab-bar/index.d.ts` only references it via `import('./src/types')`), while tab-bar.en.mdc:68-69 documents it as the public payload type.
- **[medium]** `a11y` · D4 · CONFIRMED
  - Each item declares `role="tab"` inside `role="tablist"` but there is no `aria-controls`/tabpanel association and no arrow-key roving focus, so screen readers announce "tab 1 of 3" while ArrowLeft/ArrowRight do nothing; the `role="tablist"` on the `<nav>` also destroys the navigation landmark.
  - 证据：`packages/tuffex/packages/components/src/tab-bar/src/TxTabBar.vue:56`
  - 建议：Either implement the full APG tablist pattern (roving `tabindex`, ArrowLeft/ArrowRight/Home/End keydown handling, `aria-controls` per tab, `aria-orientation="horizontal"` on the list) or drop the tab roles and keep the semantics of a `<nav>` with `aria-current="page"` on the active button — which is what bottom navigation actually is.
- **[low]** `type-leak` · D4 · PLAUSIBLE
  - `withDefaults` casts the `modelValue` default through `as any` even though `''` is already assignable to `TabBarValue = string | number`, silently disabling type checking on that default.
  - 证据：`packages/tuffex/packages/components/src/tab-bar/src/TxTabBar.vue:8`
  - 建议：Replace with `modelValue: ''` (no cast). If the intent was "no selection", prefer making `modelValue` genuinely optional/`undefined` so no tab matches, instead of an empty string sentinel.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both tab-bar docs omit the `status` and `since` frontmatter fields required by the 8-field standard.
  - 证据：`apps/nexus/content/docs/dev/components/tab-bar.zh.mdc:5`
  - 建议：Add `status: beta` (or the real maturity) and `since: 1.0.0` to tab-bar.zh.mdc and tab-bar.en.mdc frontmatter.

### 🔴 `tabs` — 8 条（high 1 / medium 5 / low 2）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxTabs' exposed `size()` always returns `undefined` because it reads `.value` off an already-unwrapped ref: TxAutoSizer `defineExpose`s `size` as a `Ref<AutoResizeSize | null>`, and Vue's expose proxy runs `proxyRefs`, so `autoSizerRef.value.size` is already the plain `{ width, height }` object.
  - 证据：`packages/tuffex/packages/components/src/tabs/src/TxTabs.vue:282`
  - 建议：Change to `size: () => autoSizerRef.value?.size` (the expose proxy already unwraps the ref). Also fix the test stub at tabs.test.ts:27, which exposes a plain `{ value: { width: 320, height: 180 } }` object instead of a real `ref()` — that fake is the only reason `expect(wrapper.vm.size()).toEqual({...})` at tabs.test.ts:308 passes today. Switch the stub to `size: ref({ width: 320, height: 180 })` so the test actually reproduces the runtime path.
- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - TxTabItem declares a public `active` prop (`TabItemProps & { active?: boolean }`, default `false`) that is missing from both the doc's `### TxTabItem 属性` table and the exported `TabItemProps` interface, so standalone TxTabItem users can't discover the only prop that drives the `is-active` styling.
  - 证据：`packages/tuffex/packages/components/src/tabs/src/TxTabItem.vue:9`
  - 建议：Either move `active?: boolean` into `TabItemProps` in tabs/src/types.ts and add a row to the TxTabItem props tables in tabs.zh.mdc:532-539 / tabs.en.mdc:532-539 explaining that TxTabs sets it automatically and it is only set manually when using TxTabItem standalone, or keep it internal and document it as such.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline `code:` block for `ComponentsNavigationShellDemo` is a ~24-line stub that omits nearly everything the rendered 338-line demo shows — no `nav-min-width`/`indicator-motion`/`auto-height`/`animation` props, empty DropdownMenu, an empty self-closing TxDrawer with no body or footer, and none of the ProgressBar/StatusBadge/Tag/Switch content.
  - 证据：`apps/nexus/content/docs/dev/components/tabs.zh.mdc:474`
  - 建议：Replace the hand-written snippet in tabs.zh.mdc:445-477 and tabs.en.mdc with the real template from apps/nexus/app/components/content/demos/ComponentsNavigationShellDemo.vue (at minimum the `<TxTabs>` block at lines 140-172 with its actual `:nav-min-width="176"`, `indicator-variant="pill"`, `indicator-motion="glide"`, `auto-height` and `:animation` bindings), or have TuffDemoWrapper read the demo source directly instead of duplicating it.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The inline `code:` for `TabsIndicatorVariantsMotionsDemo` shows only a `motion` select and a Next button, while the rendered demo also has a `content` motion select and an indicator on/off toggle bound to `:show-indicator`, and uses a different animation config than the snippet.
  - 证据：`apps/nexus/content/docs/dev/components/tabs.zh.mdc:144`
  - 建议：Sync the snippet with TabsIndicatorVariantsMotionsDemo.vue: add the `contentMotion` TuffSelect (demo lines 96-105) and the `showIndicator` toggle (lines 107-112), and correct the binding to `:show-indicator="showIndicator"` plus `:animation="{ indicator: { durationMs: 350 }, content: { type: contentMotion, durationRatio: 0.5 } }"` (demo lines 144-147).
- **[medium]** `a11y` · D4 · CONFIRMED
  - TxTabs/TxTabItem expose no tab semantics at all — no `role="tablist"` on `.tx-tabs__nav-inner`, no `role="tab"`/`aria-selected` on the tab buttons, no `role="tabpanel"`/`aria-labelledby` on the panel, and no arrow-key roving focus; active state is conveyed by the `is-active` CSS class only.
  - 证据：`packages/tuffex/packages/components/src/tabs/src/TxTabItem.vue:33`
  - 建议：Add `role="tab"`, `:aria-selected="active"`, `:tabindex="active ? 0 : -1"` and an `id`/`aria-controls` pairing to TxTabItem's button; add `role="tablist"` + `:aria-orientation` to the `.tx-tabs__nav-inner` div (TxTabs.vue:738) and `role="tabpanel"` + `aria-labelledby` to `.tx-tabs__select-slot` (TxTabs.vue:687); implement ArrowLeft/Right (horizontal) and ArrowUp/Down (vertical) roving navigation. Note tabs.test.ts:110 currently asserts `role` is undefined, so that assertion must be updated too.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - The exported `TabsProps`/`TabsAnimation`/`TabsEmits` types in tabs/src/types.ts are never imported by TxTabs.vue — the runtime component declares `animation` as `PropType<any>` and `placement`/`indicatorVariant`/`indicatorMotion` as plain `String`, so consumers get zero compile-time checking on the props the docs describe as unions.
  - 证据：`packages/tuffex/packages/components/src/tabs/src/TxTabs.vue:80`
  - 建议：Type the runtime props against the exported interface: `placement: { type: String as PropType<TabsProps['placement']>, default: 'left' }`, same for `indicatorVariant`/`indicatorMotion`, and `animation: { type: Object as PropType<TabsAnimation>, default: undefined }`. Also declare `emits` via `TabsEmits` and add an `expose` type so `TxTabsInstance` actually surfaces the documented `refresh`/`flip`/`action`/`size` methods (tabs.zh.mdc:523-530 documents them but `InstanceType<typeof TxTabs>` in tabs/index.ts:33 does not include them).
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both tabs.zh.mdc and tabs.en.mdc frontmatter omit `status`, `since`, and `tags`, carrying only title/description/category/syncStatus/verified — unlike blank-slate and timeline in the same folder, which have all eight fields.
  - 证据：`apps/nexus/content/docs/dev/components/tabs.zh.mdc:5`
  - 建议：Add `status: stable` (or the accurate value), `since: 1.0.0`, and `tags: [navigation, tabs, layout]` to the frontmatter of both tabs.zh.mdc and tabs.en.mdc so the component index/filters can classify Tabs consistently with its siblings.
- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - tabs.zh.mdc is 624 lines with 7 demos, each under its own ad-hoc `##` heading (`## 动态内容尺寸（manual, rich content）`, `## 布局方向（placement）`, `## 高度跟随内容（animation.size）`, `## 关闭动画（indicator/content）`, `## 后台导航配置组合`) instead of a single `## Examples` section, and the animation API is re-demonstrated across four of them.
  - 证据：`apps/nexus/content/docs/dev/components/tabs.zh.mdc:163`
  - 建议：Collapse the five ad-hoc example headings into one `## Examples` with `###` subsections, and merge the three animation demos (Dynamic Content, Auto Size, Disable Animations) into a single toggle-driven example — that alone drops the file well under 400 lines. Apply the same restructure to tabs.en.mdc to keep parity.

### 🟡 `tag` — 3 条（high 0 / medium 3 / low 0）

- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - The `pill` prop (declared in TagProps, defaulted in TxTag.vue, and covered by tag.test.ts) is absent from the Props table in both tag.zh.mdc and tag.en.mdc.
  - 证据：`apps/nexus/content/docs/dev/components/tag.zh.mdc:131`
  - 建议：Add a row `| \`pill\` | \`boolean\` | \`false\` | 使用全圆角胶囊外形（根节点加 \`.pill\` class）；用于筛选芯片等需要与方角标签区分的场景。 |` to both zh and en tables (mirror the existing `pill?: boolean` at tag/src/types.ts:51).
- **[medium]** `a11y` · D4 · CONFIRMED
  - Every TxTag root renders `role="status"`, which is an implicit `aria-live="polite"` region — a list of tags turns each tag into a live region and screen readers re-announce them on any content change.
  - 证据：`packages/tuffex/packages/components/src/tag/src/TxTag.vue:116`
  - 建议：Drop `role="status"` from the default rendering (a tag is static metadata, not a status message). If a live-region variant is genuinely needed, gate it behind an explicit prop such as `announce` / `role` and document it; also give clickable tags `role="button"` + `tabindex="0"` + keydown handling instead of a bare span click.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The close button's accessible name is the hardcoded English string `Remove tag` on an inner element, so it cannot be localized or overridden by attribute fallthrough in the bilingual (zh/en) docs and app.
  - 证据：`packages/tuffex/packages/components/src/tag/src/TxTag.vue:128`
  - 建议：Add a `closeAriaLabel?: string` prop defaulting to `'Remove tag'` and bind it (`:aria-label="closeAriaLabel"`), then document it in the Props table so zh consumers can pass '移除标签'.

### 🔴 `tag-input` — 4 条（high 2 / medium 1 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `splitBySeparators` builds a regex character class without escaping `-`, so `separators: [',', '-', ' ']` throws `SyntaxError: Range out of order in character class` on every keystroke, and `[',', '-', ';']` silently produces the range `[,-;]` that eats digits `0-9`, `.`, `/`, `:`.
  - 证据：`packages/tuffex/packages/components/src/tag-input/src/TxTagInput.vue:78`
  - 建议：Add `-` (and `^`) to the escape set, e.g. `s.replace(/[-.*+?^${}()|[\]\\]/g, '\\$&')`, or drop the character-class approach entirely and split with a plain loop / `separators.reduce((acc, sep) => acc.flatMap(part => part.split(sep)), [value])` so multi-character separators also work.
- **[high]** `logic-bug` · D4 · CONFIRMED
  - `removeTag` filters by value, so with `allowDuplicates: true` closing one duplicate chip deletes every copy of that tag instead of just the clicked one.
  - 证据：`packages/tuffex/packages/components/src/tag-input/src/TxTagInput.vue:65`
  - 建议：Pass the row index from the `v-for` into `removeTag(tag, index)` and splice by index (`const next = tags.value.slice(); next.splice(index, 1)`), keeping the `remove` payload as the tag value.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The chip `v-for` keys on the tag string itself, so enabling `allowDuplicates` produces duplicate Vue keys (dev warning plus incorrect DOM reuse when a duplicate is removed).
  - 证据：`packages/tuffex/packages/components/src/tag-input/src/TxTagInput.vue:129`
  - 建议：Use `v-for="(tag, index) in tags" :key="`${index}-${tag}`"` (or an internal id list) so duplicates stay uniquely keyed.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - Every row in the props table only restates the type name (`disabled` → "禁用", `max` → "最大数量", `separators` → "分隔符") without saying when or how to set it, even though the useful guidance already exists further down in 最佳实践.
  - 证据：`apps/nexus/content/docs/dev/components/tag-input.zh.mdc:107`
  - 建议：Fold the 最佳实践 guidance into the table descriptions, e.g. `max`: "设为流程真正需要的最小上限；达到上限后内部输入框禁用且占位文本隐藏"; `separators`: "帮助文案里提到的每个分隔符都要加入；Enter 始终确认当前输入".

### ⚪ `text-transformer` — 2 条（high 0 / medium 0 / low 2）

- **[low]** `d5-bloat` · D5 · PLAUSIBLE
  - The zh doc is 470 lines and spends five separate top-level sections (基础用法 / 与 AutoSizer 搭配 / 长文本 / 标题+副标题 / 状态文本) on near-identical demos that all re-demonstrate the same `durationMs` + `blurPx` + `TxAutoSizer.action()` pattern.
  - 证据：`apps/nexus/content/docs/dev/components/text-transformer.zh.mdc:329`
  - 建议：Collapse the five sections into one `## Examples` with at most two demos (a basic toggle and one AutoSizer composition), and move the long-text/title/status variations into short prose notes; drop the duplicated duration/blur slider scaffolding from every snippet.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both zh and en frontmatter omit `status` and `since`, so the component shows no maturity or availability signal (the other four components in this shard except stat-card declare `status: beta` / `since: 1.0.0`).
  - 证据：`apps/nexus/content/docs/dev/components/text-transformer.zh.mdc:6`
  - 建议：Add `status: beta` and `since: 1.0.0` to both `text-transformer.zh.mdc` and `text-transformer.en.mdc` frontmatter.

### 🟡 `textarea` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `a11y` · D4 · CONFIRMED
  - The root element is a `<label>` that also contains the character counter, so when `showCount` is on the textarea's accessible name becomes the counter text (e.g. "0/160"), and `aria-live="polite"` re-announces it on every keystroke.
  - 证据：`packages/tuffex/packages/components/src/textarea/src/TxTextarea.vue:112`
  - 建议：Move the counter out of the naming path: render the root as a `<div>` (keeping a click-to-focus handler), or keep the label and mark the counter `aria-hidden="true"` while exposing the count to AT through a debounced visually-hidden live region; drop the per-keystroke `aria-live` on the visible counter.

### 🔴 `timeline` — 5 条（high 1 / medium 4 / low 0）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - TxTimeline provides a non-reactive snapshot `{ layout: props.layout }`, and TxTimelineItem further destructures it into a plain `const layout`, so changing the `layout` prop after mount never propagates to child items.
  - 证据：`packages/tuffex/packages/components/src/timeline/src/TxTimeline.vue:14`
  - 建议：Provide a reactive source: `provide('timeline', reactive({ layout: toRef(props, 'layout') }))` (or provide a computed and change `TimelineContext.layout` to `Ref<TimelineLayout>`), and in TxTimelineItem.vue:20 replace `const layout = timeline.layout` with a `computed(() => timeline.layout)`. Add a regression test that mounts `<TxTimeline :layout="dir">`, flips `dir` from 'vertical' to 'horizontal', and asserts the item class switches to `tx-timeline-item--horizontal`.
- **[medium]** `stale-source-ref` · D1 · CONFIRMED
  - Both timeline docs cite a screenshot at `.codex-screenshots/nexus-timeline-permission-orchestration-demo-playwright-2026-05-28.png`, but the `.codex-screenshots/` directory does not exist anywhere in the repo and is not gitignored.
  - 证据：`apps/nexus/content/docs/dev/components/timeline.zh.mdc:125`
  - 建议：Either commit the screenshot (and gitignore-exempt the directory) or drop the screenshot bullet from timeline.zh.mdc:125 and timeline.en.mdc:125. Note this pattern is repo-wide (tag-input, cascader, transfer, segmented-slider docs cite the same missing directory), so a sweep is warranted.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The TxTimelineItem props table documents `title` and `time` as defaulting to `''`, but TxTimelineItem's `withDefaults` only sets `color` and `active`, so both actually default to `undefined` — which matters because the header block is gated on `v-if="title || time"`.
  - 证据：`apps/nexus/content/docs/dev/components/timeline.zh.mdc:72`
  - 建议：Change the `default` cells for `title` and `time` to `-` in timeline.zh.mdc:70-77 and timeline.en.mdc:70-77, and add to the description that omitting both suppresses the `.tx-timeline-item__header` row entirely (TxTimelineItem.vue:43).
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `## 后台审计流程` section's inline `code:` shows a bare 12-line `<TxTimeline>` with three items, but the referenced ComponentsPermissionOrchestrationDemo renders a 362-line panel where the timeline is one sidebar column beside TxTree, TxTreeSelect, TxTransfer, TxSearchInput, TxTag and TxStatusBadge.
  - 证据：`apps/nexus/content/docs/dev/components/timeline.zh.mdc:36`
  - 建议：Either point this section at a timeline-only demo whose source matches the snippet, or replace the snippet with the actual `<aside class="permission-demo__panel--timeline">` block from ComponentsPermissionOrchestrationDemo.vue:247-260 (the `v-for` over `labels.timeline` with `:active="index === 1"`) so readers can map the rendered panel to the code.
- **[medium]** `missing-export` · D4 · CONFIRMED
  - timeline/index.ts re-exports the raw SFCs via `export * from './src'` without `withInstall`, unlike every other component (badge/card/tree/tabs/blank-slate), so the library's `install()` loop in src/index.ts calls `app.use(TxTimeline)` on a plain options object — Vue warns and TxTimeline/TxTimelineItem are never globally registered.
  - 证据：`packages/tuffex/packages/components/src/timeline/index.ts:1`
  - 建议：Mirror the tabs pattern: in timeline/index.ts import both SFCs, wrap them with `withInstall` from '../../../utils/withInstall', and export the wrapped `TxTimeline`/`TxTimelineItem` plus `TxTimelineInstance`/`TxTimelineItemInstance` types. Add a test like blank-slate.test.ts:95-101 asserting `install?.(app)` calls `app.component('TxTimeline', ...)`.

### 🔴 `toast` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `toast()` replaces an existing item with the same `id` but never cancels that item's pending auto-dismiss timer, so the replacement toast is torn down by the previous toast's stale timeout.
  - 证据：`packages/tuffex/packages/utils/toast.ts:56`
  - 建议：Keep a `Map<string, timeoutId>` alongside `toastStore.items`; clear the previous timer in the `existingIndex !== -1` branch (and inside `dismissToast`/`clearToasts`) before scheduling a new one, so `toast({ id: 'sync', duration: 5000 })` re-issued after 4s stays visible for a full 5s.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `后台反馈中心` / `Dashboard Feedback Center` inline snippet is a ~15-line stub (one tooltip, one overlay, one spinner) while ComponentsFeedbackTaskCenterDemo.vue actually renders a full task panel with two toasts, TuffSwitch, TxStatusBadge, TxTag and TxProgressBar rows.
  - 证据：`apps/nexus/content/docs/dev/components/toast.zh.mdc:99`
  - 建议：Either sync the `code:` block with the real demo's toast-related excerpt (the two `toast({ id: 'nexus-feedback-task-center...' })` calls plus `<TxToastHost />`) or drop the inline `code:` entirely and let TuffDemoWrapper show the actual demo source.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Basic Usage snippet calls `toast(...)` straight from the template with no `<script setup>` block, while the real ToastToastDemo.vue imports `toast` from `@talex-touch/tuffex/utils` — copy-pasting the snippet yields a `toast is not defined` render error.
  - 证据：`apps/nexus/content/docs/dev/components/toast.zh.mdc:25`
  - 建议：Prepend `<script setup>\nimport { toast } from '@talex-touch/tuffex/utils'\n</script>` to the snippet in both toast.zh.mdc and toast.en.mdc so the first example is self-contained.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The toast region is `role="region"` only — it has no `aria-live` and individual toasts carry no `role="status"`/`role="alert"`, so screen readers never announce a toast that appears while focus is elsewhere.
  - 证据：`packages/tuffex/packages/components/src/toast/src/TxToastHost.vue:15`
  - 建议：Add `aria-live="polite"` and `aria-atomic="false"` to the host region, and give each `.tx-toast` `role="status"` (or `role="alert"` when `variant === 'danger'`); then move the current "Accessibility note" out of the Review Notes since it would no longer apply.
- **[low]** `d5-fence-mismatch` · D5 · PLAUSIBLE
  - The Dashboard Feedback Center block opens with a two-colon fence `::TuffDemoWrapper{...}` at line 99 but closes with a three-colon `:::` at line 132, inconsistent with the two-colon close used elsewhere in the same file and with the `:::`/`:::` pair at lines 20/36.
  - 证据：`apps/nexus/content/docs/dev/components/toast.zh.mdc:132`
  - 建议：Make the fence depths match (open `:::TuffDemoWrapper` or close with `::`) in both toast.zh.mdc and toast.en.mdc; the same mismatch exists in loading-overlay, spinner, transfer, tree-select, input, rating and timeline docs and is worth a repo-wide lint rule.

### 🔴 `tooltip` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `tooltipVars` uses the literal value `320` as a sentinel for "prop not set", so an explicit `:max-height="320"` combined with a `content` slot is silently converted to `max-height: none` and the panel grows unbounded.
  - 证据：`packages/tuffex/packages/components/src/tooltip/src/TxTooltip.vue:171`
  - 建议：Drop the `maxHeight: 320` default from `withDefaults` (leave it `undefined`) and branch on `props.maxHeight === undefined` instead of comparing against the magic number, so an explicitly passed 320 is honoured while the unset case still relaxes for slot content.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The Props table types `anchor` as `Partial<BaseAnchorProps>`, but the real prop is `Partial<TooltipAnchorProps>` = `Partial<Omit<BaseAnchorProps, 'modelValue' | 'disabled'>>`, so the docs imply `:anchor="{ disabled: true }"` / `{ modelValue: ... }` is supported when it is not.
  - 证据：`apps/nexus/content/docs/dev/components/tooltip.zh.mdc:122`
  - 建议：Change the type cell in both tooltip.zh.mdc and tooltip.en.mdc to `Partial<TooltipAnchorProps>` and add a sentence noting `modelValue` / `disabled` are owned by Tooltip and must be set via `v-model` / the `disabled` prop.
- **[medium]** `a11y` · D4 · CONFIRMED
  - With the default `trigger="hover"` the tooltip never opens on keyboard focus (`onFocusIn` early-returns unless `trigger === 'focus'`), and the floating body carries `role="tooltip"` with no `id`/`aria-describedby` link back to the reference, so keyboard and screen-reader users never receive the hint.
  - 证据：`packages/tuffex/packages/components/src/tooltip/src/TxTooltip.vue:95`
  - 建议：Let hover mode also respond to `focusin`/`focusout` (WAI-APG tooltip pattern: hover OR focus opens), generate a stable `id` for the `role="tooltip"` node, and bind `aria-describedby` on the `.tx-tooltip__reference` wrapper while open.
- **[medium]** `missing-export` · D4 · PLAUSIBLE
  - `TooltipAnchorProps` is declared in tooltip/src/types.ts and is the actual type of the public `anchor` prop, but tooltip/index.ts only re-exports `TooltipProps`, so consumers cannot type an anchor config object without reaching into internal paths.
  - 证据：`packages/tuffex/packages/components/src/tooltip/index.ts:8`
  - 建议：Add `TooltipAnchorProps` to the type re-export (`export type { TooltipAnchorProps, TooltipProps }`) so `const anchor: TooltipAnchorProps = { ... }` works from `@talex-touch/tuffex`.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - The intro blockquote hardcodes `> **状态**：Beta`, duplicating the frontmatter `status: beta` field and creating a second place that must be updated when the component graduates.
  - 证据：`apps/nexus/content/docs/dev/components/tooltip.zh.mdc:15`
  - 建议：Delete the `**状态**` line from both tooltip.zh.mdc and tooltip.en.mdc and let the page chrome render the status from frontmatter, as the other three docs in this shard already do.

### 🟡 `transfer` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The `ComponentsPermissionOrchestrationDemo` prose says the panel splits work across `TxTree`, `TxTreeSelect`, `TxTimeline` and `TxTransfer`, but the inline snippet contains only `<TxTransfer>`, while the real 362-line demo renders all four.
  - 证据：`apps/nexus/content/docs/dev/components/transfer.zh.mdc:55`
  - 建议：Either trim the prose to describe only the transfer portion, or extend the inline snippet with the `TxTree` / `TxTreeSelect` / `TxTimeline` skeleton so the code matches what the reader sees rendered.
- **[medium]** `a11y` · D4 · PLAUSIBLE
  - Every row `TxCheckbox` is rendered with no `label`, no default slot and no `ariaLabel`, and the row text lives in a sibling `<span>`, so `TxCheckbox`'s `effectiveAriaLabel` resolves to `undefined` and the emitted `<button role="checkbox">` has no accessible name.
  - 证据：`packages/tuffex/packages/components/src/transfer/src/TxTransfer.vue:135`
  - 建议：Pass the row text into the checkbox — either `<TxCheckbox :label="item.label">` (dropping the sibling `<span>`) or `:aria-label="item.label"` — for both panels, and stop wrapping the interactive `<button>` in a `<label>` element.
- **[low]** `lang-parity` · D3 · PLAUSIBLE
  - The `<TuffDocSourceLink />` invocation differs between languages: the EN doc passes `label="View source"` while the ZH doc passes no label, so the two pages render different link text.
  - 证据：`apps/nexus/content/docs/dev/components/transfer.en.mdc:151`
  - 建议：Use the same invocation in both files — either drop `label` from the EN doc so both fall back to the component default, or add a localized `label` to the ZH doc.

### 🔴 `transition` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - With `preset="smooth-size"` and `group=false`, TxTransition binds only `passThroughAttrs` (which strips class and style) to TxTransitionSmoothSize, so a caller's `class`/`style` are silently dropped — directly contradicting the documented contract that they merge onto `.tx-transition`.
  - 证据：`packages/tuffex/packages/components/src/transition/src/TxTransition.vue:58`
  - 建议：Bind the merged wrapper values on the smooth-size branch too: `<TxTransitionSmoothSize :class="wrapperClass" :style="wrapperStyle" v-bind="passThroughAttrs" ...>` (TxTransitionSmoothSize already re-merges its own attrs.class/attrs.style into its inner `.tx-transition` div at TxTransitionSmoothSize.vue:39-45). Add a test asserting class/style survive a `fade` → `smooth-size` preset switch, since transition.test.ts:72-99 only checks a plain `id` attr on that branch.
- **[medium]** `lang-drift` · D3 · CONFIRMED
  - The zh intro is a single bare sentence about X/Y switching, while the en intro is a three-clause purpose statement explaining that TxTransition centralizes Tuffex motion presets, wraps Vue Transition/TransitionGroup, maps timing props to CSS variables, and delegates to TxTransitionSmoothSize.
  - 证据：`apps/nexus/content/docs/dev/components/transition.zh.mdc:11`
  - 建议：Translate the en paragraph (transition.en.mdc:11) into zh, e.g. "`TxTransition` 统一了 Tuffex 组件使用的动效预设：它封装 Vue `Transition` / `TransitionGroup`，把时长与缓动映射为 CSS 变量，并在需要尺寸感知时切换到 `TxTransitionSmoothSize`。"
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - `preset="smooth-size"` combined with `group=true` renders a TransitionGroup with `name="tx-smooth-size"`, but no `.tx-smooth-size-*` classes exist in the style block — the result is a completely silent no-op with zero animation.
  - 证据：`packages/tuffex/packages/components/src/transition/src/TxTransition.vue:30`
  - 建议：Fall back to `'tx-fade'` when `preset === 'smooth-size' && group` (and optionally warn in dev), so grouped lists still animate. The style block only defines tx-fade / tx-slide-fade / tx-rebound and their `-move` variants (lines 96-141); the Review Notes already call this combination "not recommended", so making it degrade gracefully is safer than emitting a dead transition name.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The library's central motion primitive has no `@media (prefers-reduced-motion: reduce)` override for any of its four presets, even though CONTRIBUTING.md mandates it and eight sibling components (rating, glow-text, flat-dropdown, version-capsule, ...) implement it.
  - 证据：`packages/tuffex/packages/components/src/transition/src/TxTransition.vue:96`
  - 建议：Append a reduced-motion block to the global style in TxTransition.vue that sets `transition-duration: 0.01ms` (or `transition: none`) and neutralizes the `translateY`/`scale` in `.tx-slide-fade-*` and `.tx-rebound-*` enter/leave states, mirroring the pattern in CONTRIBUTING.md:243.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - Both transition.zh.mdc and transition.en.mdc frontmatter omit `status` and `since`, the only docs in this shard missing them (auto-sizer, divider, flex, pagination all carry `status: beta` / `since: 1.0.0`).
  - 证据：`apps/nexus/content/docs/dev/components/transition.zh.mdc:4`
  - 建议：Insert `status: beta` and `since: 1.0.0` between `category` and `tags` in both locale files so all 8 standard frontmatter fields (title, description, category, status, since, tags, syncStatus, verified) are present.

### 🟡 `tree` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `a11y` · D4 · CONFIRMED
  - The tree renders a flattened list, but `role="treeitem"` rows are nested under an un-roled `<div class="tx-tree__list">` inside `role="tree"`, and the flattened items carry neither `role="group"` wrappers nor `aria-setsize`/`aria-posinset`, so assistive tech cannot convey "item N of M at this level".
  - 证据：`packages/tuffex/packages/components/src/tree/src/TxTree.vue:288`
  - 建议：Add `role="presentation"` (or `role="none"`) to `.tx-tree__list` so treeitems remain owned by the tree, and compute per-level sibling counts in `flatItems` to bind `:aria-setsize` and `:aria-posinset` on each row alongside the existing `aria-level`.
- **[medium]** `a11y` · D4 · CONFIRMED
  - In `handleItemKeydown` the Enter/Space branch returns before `event.preventDefault()` when `selectable` is false, so pressing Space on a focused treeitem in a non-selectable tree scrolls the page instead of being consumed — treeitems are still in the roving tab sequence because `tabStopKey` does not consider `selectable`.
  - 证据：`packages/tuffex/packages/components/src/tree/src/TxTree.vue:235`
  - 建议：Move `event.preventDefault()` above the `selectable` guard for the `' '` key (Enter can still bubble), so Space never scrolls while a treeitem holds focus. Add a test asserting `defaultPrevented` is true for Space when `selectable: false`.
- **[low]** `d5-no-purpose` · D5 · PLAUSIBLE
  - The tree doc's opening line is a verbatim copy of the frontmatter `description` — a bare feature list ('支持搜索过滤、单选/多选与展开控制') with no statement of why the component exists, when to reach for it, or when to prefer TxTreeSelect / TxTransfer instead.
  - 证据：`apps/nexus/content/docs/dev/components/tree.zh.mdc:13`
  - 建议：Replace with 1-3 sentences of design intent, e.g. 'TxTree 用于让用户在稳定的层级结构中定位并选择一个范围（资源域、权限域、组织架构）。它只负责导航与选择，不做父子级联或懒加载；需要在收起的输入框里选层级请用 TxTreeSelect，需要批量授权请用 TxTransfer。' Mirror in tree.en.mdc line 13.

### 🔴 `tree-select` — 4 条（high 1 / medium 3 / low 0）

- **[high]** `invalid-demo-usage` · D2 · CONFIRMED
  - The primary TreeSelect demo `TreeSelectTreeSelectDemo.vue` builds its nodes with `{ label, value }` instead of the required `{ key, label }`, so every node's `key` is `undefined` and the live demo is functionally broken (all rows share the same undefined v-for key, selecting any node emits `undefined`, and expansion never works).
  - 证据：`apps/nexus/app/components/content/demos/TreeSelectTreeSelectDemo.vue:17`
  - 建议：Rename the demo's local `TreeNode.value` field to `key` (or import `TreeSelectNode` from `@talex-touch/tuffex/tree-select` so the compiler catches it) and align the node data with the doc's inline snippet (General / Account / Danger Zone incl. the `disabled` node) so the rendered demo actually matches the documented example. Note the doc itself already warns against this exact mistake at tree-select.zh.mdc:207 ("`nodes` 使用 `key`/`label`，不要沿用旧选择器的 `value` 字段").
- **[medium]** `stale-source-ref` · D1 · CONFIRMED
  - The Review Notes cite `.codex-screenshots/nexus-tree-select-permission-orchestration-demo-playwright-2026-05-28.png` as the verification artifact, but neither that file nor the `.codex-screenshots/` directory exists anywhere in the repo (and it is not gitignored), so the claimed screenshot evidence is unverifiable.
  - 证据：`apps/nexus/content/docs/dev/components/tree-select.zh.mdc:208`
  - 建议：Either commit the screenshot to a real tracked path (e.g. `apps/nexus/public/docs/...`) and update the reference in both tree-select.zh.mdc:208 and tree-select.en.mdc:208, or remove the screenshot bullet. The same dangling `.codex-screenshots/` path appears in 18 component docs, so this is worth fixing corpus-wide in one pass.
- **[medium]** `logic-bug` · D4 · CONFIRMED
  - The internal search text `query` is never cleared when the dropdown closes, so after searching + picking a node, reopening the dropdown still shows the previous filter; the `open` watcher's `if (v && props.searchable) { await nextTick() }` branch is dead code that does nothing.
  - 证据：`packages/tuffex/packages/components/src/tree-select/src/TxTreeSelect.vue:98`
  - 建议：In the `open` watcher, reset `query.value = ''` when `v === false`, and either finish the intended autofocus (add a `ref` to the search `TuffInput` and call `.focus()` after `nextTick()`) or delete the empty `await nextTick()` branch. Then document the reset behaviour in the `## 交互契约` / `## Interaction Contract` section, which currently says nothing about search-state lifetime.
- **[medium]** `a11y` · D4 · CONFIRMED
  - The dropdown panel declares `role="listbox"` (and the trigger declares `aria-haspopup="listbox"`) but its only content is `TxTree`, which renders `role="tree"` with `role="treeitem"` rows — a listbox with zero `option` children is an invalid ARIA structure, and the combobox trigger has no `aria-controls` pointing at the popup.
  - 证据：`packages/tuffex/packages/components/src/tree-select/src/TxTreeSelect.vue:190`
  - 建议：Drop `role="listbox"` from `.tx-tree-select__panel` and change the trigger's `aria-haspopup` to `"tree"`, letting `TxTree`'s own `role="tree"`/`role="treeitem"` carry the semantics. Add a generated id on the panel and reference it from the trigger via `aria-controls`, then update `## Interaction Contract` (tree-select.en.mdc:186) to state the popup exposes a tree, not a listbox.

### ⚪ `tuff-logo-stroke` — 1 条（high 0 / medium 0 / low 1）

- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - tuff-logo-stroke frontmatter has title/description/category/tags/syncStatus/verified but is missing `status` and `since` in both zh and en.
  - 证据：`apps/nexus/content/docs/dev/components/tuff-logo-stroke.zh.mdc:5`
  - 建议：Add `status: beta` and `since: 1.0.0` between `category` and `tags` in both tuff-logo-stroke.zh.mdc and tuff-logo-stroke.en.mdc.

### 🟡 `typing-indicator` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `stale-source-ref` · D1 · CONFIRMED
  - `<TuffDocSourceLink />` is used with no `path` prop, so it auto-derives `packages/tuffex/packages/components/src/typing-indicator/index.ts` from the route slug — a directory that does not exist, since TxTypingIndicator lives in `src/chat/`.
  - 证据：`apps/nexus/content/docs/dev/components/typing-indicator.zh.mdc:127`
  - 建议：TuffDocSourceLink.vue:16-22 builds `packages/tuffex/packages/components/src/${slug}/index.ts` from the `/docs/dev/components/:slug` route, and `ls packages/tuffex/packages/components/src/*typing*` returns no match. Both the 'View source' GitHub link and the printed path are wrong (404). Pass the explicit path on both locales: `<TuffDocSourceLink path="packages/tuffex/packages/components/src/chat/index.ts" />` in typing-indicator.zh.mdc:127 and typing-indicator.en.mdc:127. Check other sub-component doc pages (chat-composer, avatar-variants) for the same auto-derivation trap.
- **[medium]** `a11y` · D4 · CONFIRMED
  - With `showText=false` the `role="status" aria-live="polite"` region contains only `aria-hidden="true"` loaders, producing an empty live region that announces nothing, and the component exposes no `aria-label` prop to compensate.
  - 证据：`packages/tuffex/packages/components/src/chat/src/TxTypingIndicator.vue:72`
  - 建议：Every loader branch (lines 73, 92, 94, 96, 98, 104) is marked `aria-hidden="true"`, and the only text node is gated behind `v-if="showText"` (line 109). `grep aria-label` on the component returns nothing, and `TypingIndicatorProps` (chat/src/types.ts:68-83) has no label field. The docs lean hard on this mode — `show-text="false"` appears 11 times in typing-indicator.zh.mdc. Either render a visually-hidden `<span class="sr-only">{{ text }}</span>` when `showText` is false, or add an `ariaLabel?: string` prop bound to `aria-label` on the root and document it in the Props table.
- **[low]** `d5-shallow-api` · D5 · PLAUSIBLE
  - The zh Props table descriptions only restate the prop name and type ('样式变体', '文案', 'dots 模式点尺寸(px)') with no guidance on when or how to set them, while the en table for the same rows gives real usage guidance.
  - 证据：`apps/nexus/content/docs/dev/components/typing-indicator.zh.mdc:87`
  - 建议：All 14 zh rows (lines 87-100) are one- or two-word restatements, whereas the en counterparts read e.g. 'Visual loader style rendered inside the status region' (en:87) and 'Controls whether the text label is rendered next to the indicator' (en:89). Translate the en descriptions rather than abbreviating them, and add the 'when to set' guidance the Best Practices section already contains (e.g. `variant` -> 'dots 用于内联聊天行，ai 用于有足够空间的品牌化生成状态').

### 🟡 `utils` — 1 条（high 0 / medium 1 / low 0）

- **[medium]** `undocumented-api` · D1 · CONFIRMED
  - `src/utils/index.ts` re-exports the whole `packages/utils` barrel into both the root `@talex-touch/tuffex` entry and the published `./utils` subpath, but there is no `utils.zh.mdc` / `utils.en.mdc` page, so public helpers (`withInstall`, `nextZIndex`/`resetZIndex`/`configureZIndex`/`onZIndexEvent`, `hasWindow`/`hasDocument`/`hasNavigator`, the `vibrate` suite, `dialog-manager`, `flip`/`auto-resize`) ship undocumented.
  - 证据：`packages/tuffex/packages/components/src/utils/index.ts:1`
  - 建议：Add `utils.zh.mdc` / `utils.en.mdc` with the standard frontmatter and a `## API` section grouped by module (z-index manager, env guards, vibrate, toast, dialog manager, animation helpers, `withInstall`), and link it from `index.*.mdc` — currently the only mention anywhere is the incidental `import { toast } from '@talex-touch/tuffex/utils'` at index.en.mdc:115. Alternatively, if only `toast` is meant to be public, narrow the barrel to an explicit export list instead of `export *`.

### 🔴 `version-capsule` — 5 条（high 1 / medium 3 / low 1）

- **[high]** `logic-bug` · D4 · CONFIRMED
  - `TxVersionCapsule` binds its outside-pointerdown / Escape listeners only inside a non-immediate `watch(activePanel, ...)`, so a capsule mounted with an already-open controlled `panel` never registers them and `closeOnClickOutside` / `closeOnEsc` silently do nothing until the panel is toggled once by hand.
  - 证据：`packages/tuffex/packages/components/src/version-capsule/src/TxVersionCapsule.vue:105`
  - 建议：Add `{ immediate: true }` to the `watch(activePanel, ...)` call (or call `bind()` from `onMounted` when `activePanel.value` is truthy), and add a regression test that mounts with `panel: 'download'` and asserts an outside `pointerdown` emits `update:panel` with `null`.
- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - The `## Exposed` table types `downloadRef` / `historyRef` as `Ref<HTMLButtonElement>`, but the component declares them as `ref<HTMLButtonElement | null>(null)`, so consumers who follow the docs write `capsuleRef.value.downloadRef.value.focus()` and hit a TypeScript null error.
  - 证据：`apps/nexus/content/docs/dev/components/version-capsule.zh.mdc:213`
  - 建议：Change both rows in version-capsule.zh.mdc (213-214) and version-capsule.en.mdc (214-215) to `Ref<HTMLButtonElement | null>`, matching TxVersionCapsule.vue:25-26 (`const downloadRef = ref<HTMLButtonElement | null>(null)`), and note that the ref is `null` before mount.
- **[medium]** `stale-demo-code` · D2 · CONFIRMED
  - The Channel Tones inline snippet passes `<TxVersionHistoryPanel :title="item.channel" />` with no `latest` and no `entries`, so copying it renders four empty-state panels — it demonstrates none of the per-entry tone resolution the surrounding prose claims, and the real demo passes `:latest="item.latest"` plus a separate `historyTitle`.
  - 证据：`apps/nexus/content/docs/dev/components/version-capsule.zh.mdc:79`
  - 建议：Sync the inline `code:` block in both version-capsule.zh.mdc (line 79) and version-capsule.en.mdc (line 79) with VersionCapsuleChannelTonesDemo.vue: add a `latest` entry per capsule carrying `tone`/`channel`/`date`/`note`, and use a dedicated `historyTitle` instead of reusing `item.channel` as the panel heading.
- **[medium]** `a11y` · D4 · CONFIRMED
  - `TxVersionHistoryPanel` renders history rows and the featured `latest` card as a plain `<div>` when `href` is absent while still attaching `@click="emit('select', entry)"`, so those rows are mouse-only — no `role="button"`, no `tabindex`, and the `:focus-visible` outline defined for `.tx-version-history-panel__row` can never fire.
  - 证据：`packages/tuffex/packages/components/src/version-capsule/src/TxVersionHistoryPanel.vue:99`
  - 建议：Mirror `TxVersionDownloadPanel`, which falls back to `<button>` (`:is="build.href ? 'a' : 'button'"` at TxVersionDownloadPanel.vue:79): change both `<component :is>` expressions in the history panel to `entry.href ? 'a' : 'button'` (with `:type="entry.href ? undefined : 'button'"`) so `select` is keyboard-reachable.
- **[low]** `d5-frontmatter` · D5 · PLAUSIBLE
  - version-capsule.zh.mdc / .en.mdc frontmatter carries only title / description / category / syncStatus / verified — `status`, `since`, and `tags` are all missing from the 8-field standard.
  - 证据：`apps/nexus/content/docs/dev/components/version-capsule.zh.mdc:4`
  - 建议：Add `status:`, `since:`, and `tags: [version, release, download, history]` to both language files, matching the complete frontmatter already used by copy-button.zh.mdc:1-10.

### 🟡 `virtual-list` — 3 条（high 0 / medium 2 / low 1）

- **[medium]** `type-mismatch` · D1 · CONFIRMED
  - Docs list `items` default `[]` and `height` default `320`, but both are declared non-optional in `VirtualListProps`, so the SFC compiles them to `required: true` and Vue logs `Missing required prop` for each when they are omitted — the documented defaults are unreachable.
  - 证据：`apps/nexus/content/docs/dev/components/virtual-list.zh.mdc:88`
  - 建议：Make `items?: T[]` and `height?: number | string` optional in packages/tuffex/packages/components/src/virtual-list/src/types.ts (matching the existing `withDefaults` values) so the documented defaults actually apply; otherwise change both Default cells in virtual-list.zh.mdc:88/90 and virtual-list.en.mdc:88/90 to `required`. Verified empirically: mounting with only `itemHeight` emits `[Vue warn]: Missing required prop: "items"` and `"height"`.
- **[medium]** `type-leak` · D4 · CONFIRMED
  - `defineProps<VirtualListProps<any>>()` hard-codes the generic to `any` and the SFC is not declared `generic="T"`, so the `#item` slot props documented as `{ item: T, index: number }` actually resolve to `item: any` for every consumer.
  - 证据：`packages/tuffex/packages/components/src/virtual-list/src/TxVirtualList.vue:7`
  - 建议：Add `generic="T"` to the `<script setup>` tag and use `defineProps<VirtualListProps<T>>()` plus `defineSlots<{ item(props: { item: T, index: number }): any }>()`, so `itemKey` narrows to `keyof T` and slot consumers get real inference instead of `any`.
- **[low]** `a11y` · D4 · PLAUSIBLE
  - The virtualized scroll container and its rows are bare `<div>`s with no `role`/`aria-*`; because only the visible slice is in the DOM, assistive tech has no way to know the real list length or an item's position, and the docs give no a11y guidance.
  - 证据：`packages/tuffex/packages/components/src/virtual-list/src/TxVirtualList.vue:127`
  - 建议：Add `role="list"` + `:aria-setsize="items.length"` on the container and `role="listitem"` + `:aria-posinset="entry.index + 1"` on each `.tx-virtual-list__item`, or expose a `containerRole` prop so consumers can opt into `role="feed"`; document the chosen contract in the Interaction Contract section of both locales.


## 6. 建议整改顺序

1. **P0 — 59 条 high**：52 条 logic-bug + 6 条 invalid-demo-usage + 1 条 a11y。这些是真 bug，优先修。
2. **P1 — 三个系统性模式**：provide 快照、disabled guard、交互式 div a11y。建议一次性横扫，别逐组件修。
3. **P2 — 30 条 missing-export**：`index.ts` 未导出，外部使用者拿不到。改动小、收益直接。
4. **P3 — 文档一致性**：51 条 stale-demo-code + 56 条 D1 API 不一致。
5. **P4 — 范式统一**：先把事实标准写成规范（`.trellis/spec/frontend/`），再批量整改文档结构与 137 个孤儿 demo。

## 7. GitHub Issue 索引

汇总 issue：[#362](https://github.com/talex-touch/tuff/issues/362)

组件 issue：#363 ~ #474（112 个）

| # | 组件 | high | medium | low | 主要问题 |
|---|---|---|---|---|---|
| #436 | 🔴 `picker` | 3 | 2 | 1 | `logic-bug`, `a11y` |
| #385 | 🔴 `context-menu` | 2 | 4 | 2 | `logic-bug`, `stale-demo-code`, `missing-export` |
| #410 | 🔴 `gradual-blur` | 2 | 4 | 1 | `logic-bug`, `missing-export`, `type-leak` |
| #401 | 🔴 `flat-select` | 2 | 3 | 1 | `logic-bug`, `a11y`, `stale-demo-code` |
| #446 | 🔴 `segmented-slider` | 2 | 3 | 2 | `invalid-demo-usage`, `a11y`, `type-mismatch` |
| #388 | 🔴 `data-table` | 2 | 2 | 1 | `logic-bug`, `undocumented-api`, `a11y` |
| #442 | 🔴 `scroll` | 2 | 2 | 2 | `logic-bug`, `undocumented-api`, `lang-drift` |
| #447 | 🔴 `select` | 2 | 2 | 2 | `logic-bug`, `a11y`, `stale-demo-code` |
| #449 | 🔴 `slider` | 2 | 2 | 1 | `invalid-demo-usage`, `stale-demo-code`, `a11y` |
| #398 | 🔴 `flat-dropdown` | 2 | 1 | 0 | `logic-bug`, `invalid-demo-usage`, `a11y` |
| #462 | 🔴 `tag-input` | 2 | 1 | 1 | `logic-bug` |
| #371 | 🔴 `base-surface` | 1 | 5 | 0 | `logic-bug`, `stale-demo-code`, `undocumented-api` |
| #383 | 🔴 `command-palette` | 1 | 5 | 0 | `logic-bug`, `a11y`, `missing-export` |
| #393 | 🔴 `dropdown-menu` | 1 | 5 | 1 | `type-mismatch`, `undocumented-api`, `logic-bug` |
| #441 | 🔴 `rating` | 1 | 5 | 1 | `logic-bug`, `missing-export`, `a11y` |
| #460 | 🔴 `tabs` | 1 | 5 | 2 | `stale-demo-code`, `logic-bug`, `a11y` |
| #375 | 🔴 `card` | 1 | 4 | 2 | `lang-parity`, `logic-bug`, `stale-demo-code` |
| #390 | 🔴 `dialog` | 1 | 4 | 0 | `type-mismatch`, `logic-bug`, `a11y` |
| #440 | 🔴 `radio` | 1 | 4 | 0 | `logic-bug`, `missing-export`, `type-mismatch` |
| #464 | 🔴 `timeline` | 1 | 4 | 0 | `logic-bug`, `missing-export`, `stale-source-ref` |
| #367 | 🔴 `avatar` | 1 | 3 | 1 | `logic-bug`, `stale-demo-code`, `missing-export` |
| #374 | 🔴 `button` | 1 | 3 | 1 | `logic-bug`, `type-mismatch`, `stale-demo-code` |
| #384 | 🔴 `container` | 1 | 3 | 1 | `logic-bug`, `stale-demo-code`, `css-precedence` |
| #404 | 🔴 `form` | 1 | 3 | 0 | `logic-bug`, `dead-prop`, `a11y` |
| #411 | 🔴 `grid` | 1 | 3 | 1 | `logic-bug`, `type-mismatch`, `missing-export` |
| #413 | 🔴 `group-block` | 1 | 3 | 2 | `logic-bug`, `a11y`, `type-mismatch` |
| #445 | 🔴 `search-select` | 1 | 3 | 1 | `logic-bug`, `a11y`, `type-leak` |
| #452 | 🔴 `splitter` | 1 | 3 | 1 | `logic-bug`, `missing-export`, `a11y` |
| #454 | 🔴 `stagger` | 1 | 3 | 0 | `logic-bug`, `missing-export`, `type-leak` |
| #457 | 🔴 `steps` | 1 | 3 | 0 | `logic-bug`, `a11y`, `stale-demo-code` |
| #465 | 🔴 `toast` | 1 | 3 | 1 | `stale-demo-code`, `logic-bug`, `a11y` |
| #466 | 🔴 `tooltip` | 1 | 3 | 1 | `logic-bug`, `a11y`, `type-mismatch` |
| #468 | 🔴 `transition` | 1 | 3 | 1 | `logic-bug`, `a11y`, `lang-drift` |
| #470 | 🔴 `tree-select` | 1 | 3 | 0 | `invalid-demo-usage`, `logic-bug`, `a11y` |
| #473 | 🔴 `version-capsule` | 1 | 3 | 1 | `logic-bug`, `a11y`, `type-mismatch` |
| #366 | 🔴 `auto-sizer` | 1 | 2 | 1 | `logic-bug`, `stale-demo-code`, `type-mismatch` |
| #389 | 🔴 `date-picker` | 1 | 2 | 1 | `logic-bug`, `missing-export`, `a11y` |
| #392 | 🔴 `drawer` | 1 | 2 | 1 | `a11y`, `type-mismatch`, `stale-demo-code` |
| #399 | 🔴 `flat-input` | 1 | 2 | 0 | `logic-bug`, `missing-export`, `stale-demo-code` |
| #427 | 🔴 `markdown-view` | 1 | 2 | 1 | `logic-bug`, `stale-demo-code` |
| #432 | 🔴 `number-input` | 1 | 2 | 0 | `logic-bug`, `a11y` |
| #450 | 🔴 `sortable-list` | 1 | 2 | 0 | `logic-bug`, `stale-demo-code`, `type-leak` |
| #365 | 🔴 `alert` | 1 | 1 | 1 | `logic-bug`, `stale-demo-code` |
| #373 | 🔴 `breadcrumb` | 1 | 1 | 0 | `logic-bug`, `a11y` |
| #396 | 🔴 `file-uploader` | 1 | 1 | 0 | `logic-bug` |
| #428 | 🔴 `modal` | 1 | 1 | 0 | `logic-bug`, `a11y` |
| #369 | 🔴 `badge` | 1 | 0 | 0 | `logic-bug` |
| #370 | 🟡 `base-anchor` | 0 | 6 | 1 | `type-mismatch`, `missing-export`, `logic-bug` |
| #415 | 🟡 `icon` | 0 | 5 | 0 | `type-mismatch`, `undocumented-api`, `a11y` |
| #455 | 🟡 `stat-card` | 0 | 5 | 1 | `logic-bug`, `lang-drift`, `a11y` |
| #400 | 🟡 `flat-radio` | 0 | 4 | 0 | `a11y`, `missing-export`, `stale-demo-code` |
| #402 | 🟡 `flip-overlay` | 0 | 4 | 1 | `logic-bug`, `a11y`, `undocumented-api` |
| #416 | 🟡 `icon-button` | 0 | 4 | 0 | `type-mismatch`, `a11y`, `stale-demo-code` |
| #424 | 🟡 `loading-overlay` | 0 | 4 | 0 | `broken-mdc-fence`, `stale-demo-code`, `a11y` |
| #434 | 🟡 `pagination` | 0 | 4 | 0 | `type-mismatch`, `logic-bug`, `a11y` |
| #458 | 🟡 `switch` | 0 | 4 | 1 | `stale-demo-code`, `hallucinated-api`, `stale-source-ref` |
| #376 | 🟡 `card-item` | 0 | 3 | 1 | `type-leak`, `missing-export`, `a11y` |
| #377 | 🟡 `cascader` | 0 | 3 | 1 | `stale-demo-code`, `missing-export`, `lang-parity` |
| #382 | 🟡 `collapse` | 0 | 3 | 0 | `missing-export`, `logic-bug`, `type-leak` |
| #397 | 🟡 `flat-button` | 0 | 3 | 0 | `a11y`, `missing-export`, `stale-demo-code` |
| #425 | 🟡 `loading-state` | 0 | 3 | 0 | `type-leak`, `type-mismatch`, `stale-demo-code` |
| #426 | 🟡 `markdown-editor` | 0 | 3 | 0 | `a11y`, `logic-bug` |
| #429 | 🟡 `nav-bar` | 0 | 3 | 0 | `a11y`, `logic-bug` |
| #437 | 🟡 `popover` | 0 | 3 | 1 | `a11y`, `missing-export`, `lang-drift` |
| #444 | 🟡 `search-input` | 0 | 3 | 1 | `stale-demo-code`, `type-leak` |
| #461 | 🟡 `tag` | 0 | 3 | 0 | `a11y`, `undocumented-api` |
| #363 | 🟡 `agents` | 0 | 2 | 1 | `a11y`, `missing-export` |
| #364 | 🟡 `ai-elements` | 0 | 2 | 0 | `a11y`, `logic-bug` |
| #368 | 🟡 `avatar-variants` | 0 | 2 | 3 | `lang-parity`, `stale-demo-code` |
| #378 | 🟡 `chat` | 0 | 2 | 0 | `missing-export`, `a11y` |
| #379 | 🟡 `chat-composer` | 0 | 2 | 1 | `logic-bug`, `a11y` |
| #381 | 🟡 `code-editor` | 0 | 2 | 0 | `type-leak`, `undocumented-api` |
| #386 | 🟡 `copy-button` | 0 | 2 | 0 | `logic-bug`, `a11y` |
| #395 | 🟡 `error-state` | 0 | 2 | 0 | `type-leak`, `type-mismatch` |
| #403 | 🟡 `floating` | 0 | 2 | 1 | `doc-behavior-mismatch`, `undocumented-api` |
| #406 | 🟡 `fusion` | 0 | 2 | 2 | `stale-demo-code`, `a11y` |
| #417 | 🟡 `image-gallery` | 0 | 2 | 1 | `a11y`, `missing-export` |
| #418 | 🟡 `image-uploader` | 0 | 2 | 0 | `a11y`, `i18n-hardcoded` |
| #420 | 🟡 `input` | 0 | 2 | 1 | `undocumented-api`, `a11y` |
| #423 | 🟡 `layout-skeleton` | 0 | 2 | 2 | `stale-demo-code`, `a11y` |
| #433 | 🟡 `outline-border` | 0 | 2 | 1 | `misleading-demo`, `undocumented-behavior` |
| #439 | 🟡 `progress-bar` | 0 | 2 | 1 | `stale-demo-code`, `logic-bug` |
| #443 | 🟡 `search-empty` | 0 | 2 | 0 | `stale-demo-code`, `type-leak` |
| #448 | 🟡 `skeleton` | 0 | 2 | 3 | `missing-export`, `a11y` |
| #451 | 🟡 `spinner` | 0 | 2 | 3 | `broken-mdc-block`, `behavior-mismatch` |
| #453 | 🟡 `stack` | 0 | 2 | 2 | `invalid-demo-usage`, `missing-export` |
| #456 | 🟡 `status-badge` | 0 | 2 | 0 | `a11y`, `stale-demo-code` |
| #459 | 🟡 `tab-bar` | 0 | 2 | 2 | `missing-export`, `a11y` |
| #467 | 🟡 `transfer` | 0 | 2 | 1 | `a11y`, `stale-demo-code` |
| #469 | 🟡 `tree` | 0 | 2 | 1 | `a11y` |
| #471 | 🟡 `typing-indicator` | 0 | 2 | 1 | `stale-source-ref`, `a11y` |
| #474 | 🟡 `virtual-list` | 0 | 2 | 1 | `type-mismatch`, `type-leak` |
| #372 | 🟡 `blank-slate` | 0 | 1 | 1 | `type-leak` |
| #380 | 🟡 `checkbox` | 0 | 1 | 0 | `stale-source-ref` |
| #387 | 🟡 `corner-overlay` | 0 | 1 | 0 | `a11y` |
| #391 | 🟡 `divider` | 0 | 1 | 0 | `missing-export` |
| #394 | 🟡 `empty-state` | 0 | 1 | 0 | `lang-parity` |
| #405 | 🟡 `foundations` | 0 | 1 | 0 | `type-mismatch` |
| #407 | 🟡 `glass-surface` | 0 | 1 | 2 | `type-mismatch` |
| #408 | 🟡 `glow-text` | 0 | 1 | 2 | `lang-drift` |
| #409 | 🟡 `gradient-border` | 0 | 1 | 1 | `a11y` |
| #412 | 🟡 `grid-layout` | 0 | 1 | 0 | `logic-bug` |
| #414 | 🟡 `guide-state` | 0 | 1 | 0 | `type-leak` |
| #419 | 🟡 `index` | 0 | 1 | 2 | `stale-demo-code` |
| #421 | 🟡 `kbd` | 0 | 1 | 1 | `missing-export` |
| #422 | 🟡 `keyframe-stroke-text` | 0 | 1 | 1 | `logic-bug` |
| #430 | 🟡 `no-data` | 0 | 1 | 0 | `type-leak` |
| #431 | 🟡 `no-selection` | 0 | 1 | 0 | `type-leak` |
| #435 | 🟡 `permission-state` | 0 | 1 | 0 | `missing-emits-declaration` |
| #438 | 🟡 `progress` | 0 | 1 | 0 | `missing-export` |
| #463 | 🟡 `textarea` | 0 | 1 | 0 | `a11y` |
| #472 | 🟡 `utils` | 0 | 1 | 0 | `undocumented-api` |