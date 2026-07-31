# P0 修复进度台账

> **每轮 loop 触发时先读本文件**，跳过已完成项，避免重复认领。
> 状态：`TODO` 待修 · `WIP` 修复中 · `DONE` 已修+测试通过 · `WONTFIX` 判定不成立

P0 = 59 条 high finding，分布在 47 个组件。

## 进度总览

| 状态 | finding 数 | 组件数 |
|---|---|---|
| DONE | 1 | 1 |
| WIP | 6 | 4 |
| TODO | 52 | 42 |

## 批次划分

**第 1 批（✅ 已完成）— 用户直接撞墙类**：`tag-input` `number-input` `gradual-blur` `alert`+`pagination` `tree-select`

**第 2 批（部分进行中）— provide 快照，一次横扫**：`form` `dropdown-menu` `context-menu` `steps` `timeline` `auto-sizer`

**第 3 批（建议）— 定时器/监听器生命周期**：`dialog` `toast` `modal` `version-capsule`

**第 4 批（建议）— disabled 失效**：`card` `picker` `sortable-list` `flat-dropdown`

**第 5 批（建议）— 状态不同步**：`flat-select` `search-select` `date-picker` `rating` `data-table`

**第 6 批（建议）— 响应式断点**：`grid` `container`

**第 7 批（建议）— 组件整个不工作**：`radio` `stagger` `select`

**其余**：按组件逐个认领

## 逐条明细

| 状态 | Issue | 组件 | 文件:行 | 问题 |
|---|---|---|---|---|
| ✅ DONE | #365 | `alert` | `TxAlert.vue:56` | TxAlert's close `<button>` has no `type="button"`, so it defaults to `type="submit"` and submits any enclos… |
| ✅ DONE | #366 | `auto-sizer` | `TxAutoSizer.vue:52` | TxAutoSizer reads durationMs/easing/width/height/rounding/immediate/rafBatch/observeTarget once at setup an… |
| ✅ DONE | #367 | `avatar` | `TxAvatarGroup.vue:86` | TxAvatarGroup's scoped `.tx-avatar-group__item` border/radius rules never apply to user-supplied avatars, b… |
| ✅ DONE | #369 | `badge` | `TxBadge.vue:93` | Combining `dot` with a custom `color` produces an invisible dot: `color` forces `--tx-badge-text: #ffffff` … |
| ✅ DONE | #371 | `base-surface` | `base-surface-motion.ts:288` | In autoDetect mode the MutationObserver ends the motion state whenever ANY observed ancestor's inline style… |
| ✅ DONE | #373 | `breadcrumb` | `TxBreadcrumb.vue:12` | The default `separatorIcon` value `'chevron-right'` is not a TxIcon builtin and has no `i-` prefix, so the … |
| ✅ DONE | #374 | `button` | `split-button.vue:76` | TxSplitButton's `ignoreNextMenuClick` guard is set on `pointerdown` but only cleared inside the `click` han… |
| ✅ DONE | #375 | `card` | `TxCard.vue:389` | `onMouseLeave` is missing the `if (props.disabled) return` guard that `onMouseMove` has, so a disabled card… |
| ✅ DONE | #383 | `command-palette` | `TxCommandPalette.vue:177` | `onKeydown` bails out before the `Escape` branch whenever the filtered command list is empty, so pressing E… |
| ✅ DONE | #384 | `container` | `TxCol.vue:72` | TxCol breakpoint spans do not cascade upward: `map[bp] ?? props.span` falls back to the raw `span` default … |
| ✅ DONE | #385 | `context-menu` | `TxContextMenu.vue:328` | TxContextMenu renders its internal TxContextMenuPanel without `outside-guard`, so `data-tx-context-menu-lay… |
| ✅ DONE | #385 | `context-menu` | `TxContextMenuPanel.vue:80` | TxContextMenuPanel provides `closeOnSelect` as a one-time snapshot of the prop value, so changing `closeOnS… |
| ✅ DONE | #388 | `data-table` | `TxDataTable.vue:332` | `rowClick` is emitted from the `<tr>` click handler, so ticking the row-selection checkbox also fires `rowC… |
| ✅ DONE | #388 | `data-table` | `TxDataTable.vue:31` | The `defaultSort` watcher compares by reference, so passing an inline object literal silently reverts the u… |
| ✅ DONE | #389 | `date-picker` | `TxDatePicker.vue:144` | TxDatePicker silently clamps an out-of-range `modelValue` into `localParts` for display but never emits `up… |
| ✅ DONE | #390 | `dialog` | `TxBottomDialog.vue:120` | `TxBottomDialog`'s auto-click countdown (`DialogButton.time`) schedules chained setTimeouts inside a `watch… |
| ✅ DONE | #392 | `drawer` | `TxDrawer.vue:225` | When `visible` is false the drawer root is marked `aria-hidden="true"` but is never removed from the layout… |
| ✅ DONE | #393 | `dropdown-menu` | `TxDropdownMenu.vue:112` | TxDropdownMenu provides `closeOnSelect` as a snapshot primitive instead of a getter/computed, so changing `… |
| ✅ DONE | #396 | `file-uploader` | `TxFileUploader.vue:105` | `onDrop` never checks the `multiple` prop, so a `TxFileUploader` configured with `:multiple="false"` still … |
| ✅ DONE | #398 | `flat-dropdown` | `TxFlatDropdown.vue:236` | `closeOnClickOutside` is wired up for every trigger mode, so a `trigger="manual"` dropdown still closes its… |
| ✅ DONE | #398 | `flat-dropdown` | `FlatDropdownBasicDemo.vue:15` | Both the inline doc example and the real FlatDropdownBasicDemo pass `variant="default"` to `TxButton`, but … |
| ✅ DONE | #399 | `flat-input` | `FlatInput.vue:47` | Caps Lock detection uses keypress-era charCode logic on a `keydown` event, so any unshifted letter key (key… |
| ✅ DONE | #401 | `flat-select` | `TxFlatSelect.vue:194` | `selectedLabel` is only ever overwritten when the new `modelValue` matches a registered item, so clearing t… |
| ✅ DONE | #401 | `flat-select` | `TxFlatSelectItem.vue:27` | `handleClick` builds the committed label from `props.label \|\| String(props.value)`, ignoring the default … |
| ✅ DONE | #404 | `form` | `TxForm.vue:51` | TxForm passes `props.model` / `props.rules` into `provide()` as one-time snapshots (every other context ent… |
| ✅ DONE | #410 | `gradual-blur` | `TxGradualBlur.vue:334` | The `isVisible` watcher returns a cleanup closure, but Vue ignores a watch callback's return value (cleanup… |
| ✅ DONE | #410 | `gradual-blur` | `TxGradualBlur.vue:332` | `duration` is documented as a free-form CSS time string but is converted to milliseconds with `parseFloat(d… |
| ✅ DONE | #411 | `grid` | `TxGrid.vue:74` | TxGrid 的 resolveResponsive 回退顺序是 `v[bp] ?? v.md ?? v.sm ?? v.xs ?? v.lg ?? v.xl`，把 md/sm/xs 排在 lg/xl 之前，导致视… |
| ✅ DONE | #413 | `group-block` | `TxGroupBlock.vue:62` | TxGroupBlock 的 `collapsed` prop 对首屏渲染完全无效：`resolveDefaultExpand()` 的 `!props.collapsed` 分支是死代码，因为 `defaultE… |
| ✅ DONE | #427 | `markdown-view` | `TxMarkdownView.vue:120` | DOMPurify is only imported inside `onMounted` when `sanitize` is initially true, so flipping `sanitize` fro… |
| ✅ DONE | #428 | `modal` | `TxModal.vue:51` | TxModal's visibility watcher is not `immediate`, so a modal mounted with `modelValue: true` never focuses t… |
| ✅ DONE | #432 | `number-input` | `TxNumberInput.vue:56` | The `displayValue` setter clamps and rounds on every keystroke and `v-model` writes the result straight bac… |
| ✅ DONE | #436 | `picker` | `TxPicker.vue:447` | `visibleItemCount` only feeds the scroller padding variable; the column viewport height is hardcoded to 5 r… |
| ✅ DONE | #436 | `picker` | `TxPicker.vue:236` | Inline mode (`popup=false`) never performs an initial scroll sync, so a picker mounted with a non-first `mo… |
| ✅ DONE | #436 | `picker` | `TxPicker.vue:168` | `disabled` does not block scroll-driven value changes: `onScroll` has no disabled guard and the scroller ke… |
| ✅ DONE | #440 | `radio` | `TxRadio.vue:35` | A standalone `TxRadio` (used outside a `TxRadioGroup`) is completely inert: `select()` returns early when n… |
| ✅ DONE | #441 | `rating` | `TxRating.vue:73` | TxRating never syncs `hoverValue` back from `modelValue`, so in interactive (non-readonly/non-disabled) mod… |
| ✅ DONE | #442 | `scroll` | `TxScroll.vue:509` | The prop watcher uses `{ deep: true }` and includes `props.options`, so a consumer passing an inline object… |
| ✅ DONE | #442 | `scroll` | `TxScroll.vue:250` | BetterScroll positions are reported via `Math.abs()`, so with the default `bounce: true` an upward overscro… |
| ✅ DONE | #445 | `search-select` | `TxSearchSelect.vue:52` | The selectedOption watcher early-returns when the option is not found, so resetting `modelValue` externally… |
| ✅ DONE | #446 | `segmented-slider` | `SegmentedSliderSegmentedSliderDemo.vue:4` | SegmentedSliderSegmentedSliderDemo.vue passes `const segments = ref('')` (an empty string) into `:segments`… |
| ✅ DONE | #446 | `segmented-slider` | `SegmentedSliderSegmentedSliderCustomDemo.vue:4` | SegmentedSliderSegmentedSliderCustomDemo.vue initialises `priceSegments`/`ratingSegments`/`priceValue`/`rat… |
| ✅ DONE | #447 | `select` | `TxSelect.vue:198` | hasVisibleOptions ignores the local search filter in slot mode, so a `searchable` select built from TuffSel… |
| ✅ DONE | #447 | `select` | `TxSelect.vue:162` | With `multiple` + `searchable` + `options`, two search inputs render at once and the in-panel search box is… |
| ✅ DONE | #449 | `slider` | `SliderSliderElasticTooltipDemo.vue:12` | SliderSliderElasticTooltipDemo.vue is a gutted skeleton: all 24 state refs are initialized to `''`/`false` … |
| ✅ DONE | #449 | `slider` | `SliderSliderFormatValueDemo.vue:4` | SliderSliderFormatValueDemo.vue binds `:format-value` to `ref('')` (a string) while `SliderProps.formatValu… |
| ✅ DONE | #450 | `sortable-list` | `TxSortableList.vue:69` | `onDrop` never checks `props.disabled`, so a drop that lands while `disabled` is true still emits `update:m… |
| ✅ DONE | #452 | `splitter` | `TxSplitter.vue:41` | `snapValue()` is applied *after* `clamp(v, min, max)` and only re-clamps to `0..1`, so any `snap` step that… |
| ✅ DONE | #454 | `stagger` | `TxStagger.vue:30` | TxStagger's normalizedChildren does not flatten the Fragment VNode produced by a template `v-for`, so no ch… |
| ✅ DONE | #457 | `steps` | `TxSteps.vue:25` | TxSteps injects `direction` and `size` into the provide object as one-time snapshots of `props.direction` /… |
| ✅ DONE | #460 | `tabs` | `TxTabs.vue:282` | TxTabs' exposed `size()` always returns `undefined` because it reads `.value` off an already-unwrapped ref:… |
| ✅ DONE | #462 | `tag-input` | `TxTagInput.vue:78` | `splitBySeparators` builds a regex character class without escaping `-`, so `separators: [',', '-', ' ']` t… |
| ✅ DONE | #462 | `tag-input` | `TxTagInput.vue:65` | `removeTag` filters by value, so with `allowDuplicates: true` closing one duplicate chip deletes every copy… |
| ✅ DONE | #464 | `timeline` | `TxTimeline.vue:14` | TxTimeline provides a non-reactive snapshot `{ layout: props.layout }`, and TxTimelineItem further destruct… |
| ✅ DONE | #465 | `toast` | `toast.ts:56` | `toast()` replaces an existing item with the same `id` but never cancels that item's pending auto-dismiss t… |
| ✅ DONE | #466 | `tooltip` | `TxTooltip.vue:171` | `tooltipVars` uses the literal value `320` as a sentinel for "prop not set", so an explicit `:max-height="3… |
| ✅ DONE | #468 | `transition` | `TxTransition.vue:58` | With `preset="smooth-size"` and `group=false`, TxTransition binds only `passThroughAttrs` (which strips cla… |
| ✅ DONE | #470 | `tree-select` | `TreeSelectTreeSelectDemo.vue:17` | The primary TreeSelect demo `TreeSelectTreeSelectDemo.vue` builds its nodes with `{ label, value }` instead… |
| ✅ DONE | #473 | `version-capsule` | `TxVersionCapsule.vue:105` | `TxVersionCapsule` binds its outside-pointerdown / Escape listeners only inside a non-immediate `watch(acti… |

## 已完成记录

### ✅ #365 alert + pagination — 缺 `type="button"`（2026-07-28）

- `TxAlert.vue:59` 关闭按钮 + `TxPagination.vue:87,101,120,134,148` 全部 5 个按钮
- 未引入 `nativeType` prop，保持改动面最小
- 回归测试：alert 4→5、pagination 6→7，共 12 通过
- 全库复查 `<button>` 无缺 type：通过
- diff：+30 / -0

### ✅ #462 tag-input — 正则未转义 `-` + removeTag 误删重复项（2026-07-28）

- `splitBySeparators` 弃用正则字符类，改 `separators.reduce((parts, sep) => parts.flatMap(p => p.split(sep)), [value])`，顺带支持多字符分隔符
- `removeTag(tag, index)` 改按索引 splice；`remove` 事件 payload 保持标签值不变；`:key="tag"` → `:key="index"`（允许重复时原写法产生重复 key）
- 回归测试 2 条，已 revert 源码验证确实失败 → 有效守卫
- 测试：2→4 全通过

### ✅ #470 tree-select — 主 demo 字段名错误（2026-07-28）

- `TreeSelectTreeSelectDemo.vue` 手写的 `interface TreeNode` 换成从 `@talex-touch/tuffex/tree-select` 导入 `TreeSelectNode`，字段 `value` → `key`
- 数据对齐文档内联示例（General / Account / Danger Zone，含 disabled 节点）
- 验证：`pnpm run typecheck` EXIT=0，全 app 无新增类型错误
- 只改 script 段，template 与双语结构未动

### ✅ #410 gradual-blur — duration 单位 + watch 清理无效（2026-07-28）

- 新增 `parseDurationMs()`：`/ms$/i` 判定单位，`'300ms'`→300ms（原先算成 300000ms / 5 分钟），`'0.3s'`→300ms 不变
- watch 签名改 `(newVisible, _oldVisible, onCleanup)`，清理走 `onCleanup()` 而非被 Vue 忽略的 `return`
- timer handle 提到 setup 作用域，`onUnmounted` 也清一次
- 回归测试 3 条（`vi.useFakeTimers()` + stub IntersectionObserver），对抗验证 revert 后恰好这 3 条失败
- 测试：4→7 全通过；ESLint 干净
- `types.ts` 未动 —— 单位解析已解决问题，无需收窄 `duration` 类型或改文档

### ✅ #432 number-input — 输入即钳制，目标值输不进去（2026-07-28）

- 引入聚焦期 raw string 缓冲 `rawValue`；`displayValue` 改为只读 computed（聚焦时返回 rawValue，失焦时返回 modelValue）
- template 从 `v-model` 改为 `:value` + `@input`
- `handleInput` emit **未钳制**的值（仍应用 precision）；clamp 只在 `handleBlur` / `stepBy` 执行
- precision 从 `normalizeValue` 拆出为 `applyPrecision`，使输入路径能只舍入不钳制
- 回归测试 3 条，对抗验证 revert 后恰好这 3 条失败
- 测试：4→7 全通过；ESLint 干净

**复核补记**：实测 jsdom 对 `type="number"` 有 value sanitization（`-` / `1.` / `abc` 均返回 `""`），
故 `handleInput` 里的 `!Number.isFinite(value)` 分支不可达，属死代码，注释描述亦不准确。
行为无误（与修复前一致，emit `null`，负数仍可正常输入），已要求下一轮顺手清理。

### ✅ #457 steps + #464 timeline — provide 快照致响应式失效（2026-07-28）

- steps：`direction`/`size` 改 `computed(() => props.x)`；跟随 `StepsContext` 中 `activeStep`/`stepKeys` 既有的 `{ value }` 约定，未另发明新形态；types.ts 同步
- timeline：`provide('timeline', reactive({ layout: toRef(props, 'layout') }))`，item 侧 `computed(() => timeline.layout)`；`reactive()` 顶层解包故 types.ts 无需改动
- 回归测试各 1 条，对抗验证确认 pre-fix 恰好 2 条失败
- 测试：9→11 全通过

## ⚠️ 操作规程变更（2026-07-28）

**禁止 agent 使用 `git stash` / `git checkout` / `git restore` 做对抗验证。**

起因：一个 agent 在 stash pop 时撞上 `.git/index.lock`。本仓库当前有 3 个修复 agent + 另一个 Claude 会话并发写入，
`git stash` 是仓库全局操作，会卷走所有人的在途改动；pop 失败即丢工作。本次经核查未丢失（stash 已正常 drop，
6 处已完成修复经逐一 grep 确认完整），但属侥幸。

替代方案（只影响单个文件）：
```bash
cp path/File.vue /tmp/File.vue.fixed
git show HEAD:path/File.vue > path/File.vue
pnpm exec vitest run packages/components/src/<comp>
cp /tmp/File.vue.fixed path/File.vue
git diff --stat path/File.vue
```
已向全部 3 个 agent 广播。

## 📌 环境变化

另一个 Claude 会话已提交 6 个 commit，HEAD 由会话初始的 `42ac84e6d` 推进至 `d4c0ed0c7`，
其中含 `feat(tuffex): drive the BaseAnchor bead pinch from a closed-form velocity`——
即 `base-anchor` 相关改动已被对方提交，不再与本任务的未提交改动混杂。

### ✅ 第 2/3/4 批 8 个组件（2026-07-28，主会话复核 diff 通过）

全量测试基线：**120 文件 / 740 测试全绿**，无跨组件回归。

| Issue | 组件 | 修法 |
|---|---|---|
| #404 | `form` | `model`/`rules` → computed；`context.ts` 类型改 `ComputedRef`；TxFormItem 全部读取点解包 |
| #393 | `dropdown-menu` | provide 改 getter `get closeOnSelect()` |
| #465 | `toast` | `dismissTimers` Map；替换/dismiss/clearAll 三处清理 |
| #390 | `dialog` | `countdownTimers` 数组 + `watchEffect(onCleanup)` + `onUnmounted` 清理 |
| #428 | `modal` | watch 加 `immediate: true`；用既有 `hasDocument()` 做 SSR guard（带括号调用） |
| #473 | `version-capsule` | `onMounted` 时若 `activePanel` 已开则 `bind()`（未用 immediate，避开 watch 其他副作用）|
| #375 | `card` | `onMouseLeave` 补 `if (props.disabled) return` |
| #450 | `sortable-list` | `onDrop` 补 disabled guard 并重置 draggingId/overId |

## 🔒 base-surface 已排除

`base-surface`（1 条 high，#371 MutationObserver 在 autoDetect 模式下被无关的 body/html 内联样式变更误判为动效结束）
**不派给任何 agent** —— 另一个 Claude 会话正在改 `base-anchor` / `base-surface`，已提交 6 个 commit。
待对方工作告一段落后再处理，否则必然冲突。

### ✅ #385 context-menu（2026-07-28）

- `TxContextMenu.vue:332` 补 `:outside-guard="true"`。根因确认在 panel 第 90 行：`data-tx-context-menu-layer` 以 `outsideGuard`（默认 false）为开关，导致 `isEventInsideMenuLayer`(201) 恒返回 false，`closeOnAnyPointerDown` 连点在菜单自身也关闭
- `TxContextMenuPanel.vue:78` 改 `provide(reactive({ close, closeOnSelect: toRef(props, 'closeOnSelect') }))`；顶层解包故 types.ts 与 Item 均无需改动
- 回归测试 2 条，对抗验证 pre-fix 恰好 2 条失败；17/17 通过

## 🔓 范围扩大批准：#366 auto-sizer（2026-07-28）

agent 主动停下请示，未自行扩大范围——处理正确。

**问题本质**：`useAutoResize`(auto-resize.ts:70) 与 `useFlip`(flip.ts:36) 都在调用时把 options 冻结进 `Required<>` 对象，
之后不再重读，也不暴露"更新 options"的句柄。因此 8 个 prop 的响应性**在组件侧无法修复**，必须改 composable。

**爆炸半径核实**（agent 报 5 个消费方，实测 3 个）：

| Composable | 真实消费方 |
|---|---|
| `useAutoResize` | 仅 `TxAutoSizer.vue` |
| `useFlip` | `button.vue`、`TxAutoSizer.vue`、`apps/core-app/.../CanvasGridEditor.vue` |

agent 误把 `TxFlipOverlay.vue` / `flip-overlay-motion.ts` 计入——那两个用的是 `useFlipOverlayMotion`，另一个函数。

**批准方案**：`toValue()` / `MaybeRefOrGetter`。`toValue(plainValue)` 对普通值恒等，故 `button.vue` 与 core-app 消费方零改动，
向后兼容是构造性保证。

**硬约束**：禁碰 `apps/core-app/`；禁碰 `button.vue`；`toValue()` 必须在**消费点**惰性调用而非 `opt` 构造时解包
（否则又变快照，等于没修）；`flip.ts` 只改 TxAutoSizer 实际用到的 4 项，不动整个 FlipOptions。
button / flip-overlay 作为回归哨兵必须零改动通过。

### ✅ #411 grid + #384 container — 断点级联（2026-07-28）

- `TxGrid.resolveResponsive`：改为先向小断点级联、再向大断点回退（保留原「总能解析出值」的意图）
- `TxCol.resolveSpan`：只向小断点级联，都没有才回退 `span`（有天然兜底，无需向上）
- **两者语义不同是有理由的**：grid 返回 `T | undefined` 无兜底，container 有 `span`
- ⚠️ 改了既有测试 `container.test.ts:113-116`：`flex: 0 0 100%` → `flex: 0 0 50%`，并附注释说明
- 补了反向用例「只声明更大断点时不向上级联、回退 span」，钉死 mobile-first 语义

### ✅ #454 stagger + #440 radio（2026-07-28）

- `TxStagger`：新增 `flattenFragments()` 递归下降 Fragment 取真实元素 vnode；顺带修了原实现只过滤顶层 Comment 的问题
- `TxRadio`：**纯增量 API 变更** —— 新增可选 `modelValue?: boolean` + `update:modelValue` emit
  - group 模式分支逐行等价，语义完全不变
  - 独立模式支持受控（传 modelValue）与非受控（本地 ref）两种
  - 不构成破坏性变更

### ✅ #449 slider + #446 segmented-slider — demo 被掏空（2026-07-28）

- 4 个 demo 的 `ref('')` 残留归零
- `SliderSliderElasticTooltipDemo` +227 行，恢复完整 preset 系统
- `formatValue` 从 `ref('')` 改为真函数 `(next: number) => \`${next}%\``

## 📋 最后一批待办（8 条，等 agent 腾出手）

以下组件尚未派工，且**有三条带「既有测试锁死错误行为」的陷阱**，派工时必须明确指出：

| Issue | 组件 | 陷阱 |
|---|---|---|
| #399 | `flat-input` | `flat-input.test.ts:85-89` 断言了错误行为（`keyCode:65` 就显示 CapsLock 提示），必须一并改 |
| #460 | `tabs` | `tabs.test.ts:27` 的 stub 暴露的是普通对象 `{value:{...}}` 而非真 `ref()`，**这个假 stub 正是 bug 没被测出来的唯一原因** |
| #398 | `flat-dropdown` | 2 条：manual 模式仍被外部点击关闭 + demo 用了不存在的 `variant="default"`。后者的修法涉及改 `.mdc` 文档，超出本次范围，只修 demo |
| #413 | `group-block` | `collapsed` prop 首屏无效，`!props.collapsed` 分支是死代码（因 withDefaults 给了 `defaultExpand: true`）|
| #374 | `button` | SplitButton 的 `ignoreNextMenuClick` 在中止按压后卡死 |
| #389 | `date-picker` | 越界 modelValue 只改显示不 emit，父子长期不一致 |
| #396 | `file-uploader` | `onDrop` 不看 `multiple`，拖拽路径与原生选择器行为不一致 |

### ✅ #447 select + #388 data-table（2026-07-28）

- `TxDataTable.vue:335` 选择单元格 `<td>` 加 `@click.stop`
- `TxDataTable.vue:30` watcher 改为**getter 数组** `[() => props.defaultSort?.key, () => props.defaultSort?.order]`
  —— agent 指出「返回数组的单个 getter」不行（Vue 对数组做引用比较，每次都触发），这个区分是关键
- `TxSelect.vue:195` 新增 `visibleSlotOptionCount`，用与 TuffSelectItem 相同的 query 过滤
- `TxSelect.vue:665` 面板搜索框 `v-if` 加 `&& !isMultiInputEnabled`（方案 a）
  —— 理由：multiple 模式下 multiInput 本身就是搜索框，面板框既重复又是死的；方案 b 能修好过滤但仍显示两个框，没解决上报症状
- 4 条回归测试，对抗验证 4 条全部在 HEAD 上失败
- 24/24 通过

## 🔴 严重环境陷阱：tuffex 自检弱于消费方

**tuffex 包内 `vue-tsc` 通过 ≠ nexus 能编译。**

| 配置 | `noUncheckedIndexedAccess` |
|---|---|
| `packages/tuffex/tsconfig.json` | ❌ 未开（仅 `strict: true`）|
| `apps/nexus/.nuxt/tsconfig.json:210` | ✅ 开启 |

nexus 直接消费 tuffex **源码**。后果实例：断点级联修复在 `cd packages/tuffex && pnpm exec vue-tsc --noEmit` 下退出码 0，
却让 `cd apps/nexus && pnpm run typecheck` 报 3 个 TS2538（`order[i]` 被视为 `Breakpoint | undefined`）。

**这是本次审计的意外收获，值得单开 issue**：tuffex 应对齐消费方的严格度，否则包内 CI 全绿也能打断下游构建。

验证规程已更新：涉及索引访问的改动，除 vitest 外必须跑 nexus typecheck。

## ⚠️ 三个 agent API 中断（2026-07-28 16:39-16:43）

`fix-stagger-radio`（连接中断）、`fix-behavior-bugs`（ECONNRESET）、`fix-tag-input`（ECONNRESET）。

**磁盘完整性核查结果**：
- `tabs` `flat-input` `command-palette` `markdown-view` `splitter` `transition`：**完全未改动**（死在开工前）
- `picker` `scroll`：源码修复**完整**，但回归测试**一条未写**（`picker.test.ts` 只改了 import 行）
- 全量测试 120 文件 / 757 通过——中断未留下破坏性状态

三批工作已重新派给存活 agent。

## 📊 P0 全量派工完成（2026-07-28）

59 条 high 的派工覆盖率：**58/59**，唯一未派工的是 `base-surface`（#371），因另一个 Claude 会话
正在改 `base-anchor` / `base-surface` 且已提交 6 个 commit，现在动必然冲突。

`drawer`(#392) 此前被我遗漏，本轮补派。

当前在跑的 7 个 agent：
| Agent | 负责 |
|---|---|
| fix-render-bugs | badge / avatar / breadcrumb / tooltip |
| fix-breakpoints | grid+container 的 nexus typecheck 修复 + TxRow 同类 bug |
| fix-number-input | picker / scroll 补回归测试（接手崩掉 agent 的半成品）|
| fix-tree-select-demo | command-palette / markdown-view / splitter / transition |
| fix-tabs-flatinput | tabs / flat-input（两处既有测试掩盖 bug）|
| fix-final-batch | flat-dropdown / group-block / button / date-picker / file-uploader |
| fix-drawer-a11y | drawer |

## 🔴 大规模 agent 中断（2026-07-28 16:39–16:43）

**7 个 agent 因 API 错误死亡**，其中 4 个集中在 16:43:12–16:43:27 这 15 秒内 ECONNRESET —— API 侧故障，非本地问题。

磁盘完整性核查（逐一 grep + 全量测试）：

| 组件 | 状态 |
|---|---|
| `flat-select` `search-select` `rating` | ✅ **源码+测试均完整**，agent 完成了工作只是没来得及回报 |
| `picker` `scroll` | ⚠️ 源码完整、测试缺失（已重派） |
| `badge` `avatar` `breadcrumb` `tooltip` `auto-sizer` | 完全未动（死在开工前）→ **退回 TODO** |
| `tabs` `flat-input` `command-palette` 等 | 完全未动 → 已重派 |
| `packages/utils/animation/` 共享 composable | ✅ **未动** —— 万幸没留下半改的共享工具 |

**未丢失任何已完成工作**，stash 仍是 3 个旧条目，无 index.lock 残留。

## ✅ 主会话直接修复：nexus typecheck 错误 + TxRow（2026-07-28）

负责的 agent 死了，且 API 不稳，故由主会话直接动手（改动小且明确）。

**修法**：把索引访问 `order[i]` 改为 `for...of` 迭代。`noUncheckedIndexedAccess` 只影响元素访问、不影响迭代，
所以 `for (const key of arr)` 得到的是 `Breakpoint` 而非 `Breakpoint | undefined`。未使用 `!` 非空断言。

- `TxGrid.vue`：`order.slice(0, start+1).reverse()` + `order.slice(start+1)` 拼接后迭代
- `TxCol.vue`：同上，只向下级联
- `TxRow.vue`：**顺手修了同类 bug**（死掉的 agent 发现的）。原 `g[bp] ?? g.md ?? g.sm ?? g.xs ?? 0`
  把 md 排在 lg/xl 前且**完全不查 lg/xl**，视口变大 gutter 反而变小

**验证（带对照）**：`pnpm exec vue-tsc --noEmit -p tsconfig.json --noUncheckedIndexedAccess`
- 还原成索引写法 → `TxGrid.vue(81,19): error TS2538` ✅ 证明该标志确实生效
- 修复版 → 0 错误
- 全量测试 120 文件 / 765 通过；ESLint 三个文件干净

> 注：`cd apps/nexus && pnpm run typecheck` 在本机被 shell 的 mise handler 打断（0 个 TS error、退出码 1），
> 无法直接使用，故改用上述等价标志复现 nexus 严格度。

## ⚠️ 测试执行注意事项

**agent 并发写入时跑全量测试会读到中间态**。实测同一时间段连续三次全量：758 通过 → 2 失败/763 → 4 失败/765 → 0 失败/765。
失败源自 agent 写了测试但源码还没落盘。判断回归时须排除在途组件目录，或等其写完。

### ✅ #392 drawer + #460 tabs + #399 flat-input（2026-07-28）

- `TxDrawer.vue`：`:inert="!display || undefined"` 一行。未加 `visibility: hidden`（会破坏滑出动画，inert 已足够移出 Tab 序列并从 a11y 树摘除）。用 `|| undefined` 规避 `inert="false"` 仍为 truthy 的陷阱
- `TxTabs.vue:282`：`autoSizerRef.value?.size?.value` → `?.size`。Vue expose 代理已跑 `proxyRefs`，多余的 `.value` 导致恒返回 undefined
- **`tabs.test.ts:27` 假 stub 已修正**：`{ value: {...} }` 普通对象 → `ref({...})`。原 stub 模拟出与真实运行时**相反**的形态，是该 bug 从未被测出的唯一原因。新注释已把这个陷阱写进代码
- `FlatInput.vue`：keyCode 启发式 → `e.getModifierState?.('CapsLock') ?? false`，并接上 `keyup`
- **`flat-input.test.ts:85-89` 既有测试已修正**：原断言「keyCode 65 且未按 Shift → 提示出现」正是 bug 本身
- 三条均经单文件法对抗验证，pre-fix 精确失败

### ✅ #383 command-palette + #427 markdown-view + #452 splitter + #468 transition（2026-07-28）

- `TxCommandPalette.vue`：Escape 分支上移到 `if (!filteredCommands.value.length) return` **之前**，空结果时也能关闭
- `TxMarkdownView.vue`：dompurify import 抽成 `ensureSanitizer()`，带 `sanitizerLoading` 防重复；
  改由 `watch(() => props.sanitize, ..., { immediate: true })` 驱动，运行时开启 sanitize 不再永久空白
- `TxSplitter.vue`：选方案 (a) —— `clamp(snapValue(clamp(v, min, max)), min, max)`，snap 后重新钳制回 `[min,max]`
- `TxTransition.vue`：smooth-size 分支补 `:class="wrapperClass" :style="wrapperStyle"`

验证：7 个组件 58 测试通过，ESLint 干净。

## 🔬 验证规程定稿（2026-07-28）

### nexus 到底检查源码还是 dist —— 已查实

`apps/nexus/nuxt.config.ts:21` → `const useWorkspaceSource = isDev`，33-40 行据此切换别名：
**dev 模式全部指向 tuffex 源码，仅生产构建指 `dist/es`**。`pnpm run typecheck` 走 dev 路径。

证据：此前 nexus typecheck 报的错误路径是 `packages/tuffex/.../container/src/TxCol.vue(77,27)` —— 源码路径。

曾有 agent 推论「nexus typecheck 走 built dist，反映不了源码改动」，**该推论错误**，已纠正。
若采信它会导致跳过真正需要的严格检查。

### 三条验证命令（定稿）

```bash
# 1. 单元测试
cd packages/tuffex && pnpm exec vitest run

# 2. 复现 nexus 严格度（tuffex 自身 tsconfig 未开 noUncheckedIndexedAccess，属更弱检查）
cd packages/tuffex && pnpm exec vue-tsc --noEmit -p tsconfig.json --noUncheckedIndexedAccess

# 3. Lint
cd packages/tuffex && pnpm exec eslint packages/components/src packages/utils
```

第 2 条经对照验证有效：`TxGrid.vue` 还原成索引写法 → 复现 `error TS2538`；改回 `for...of` → 0 错误。

> `cd apps/nexus && pnpm run typecheck` 在本机会被 shell 的 mise handler 打断
> （报 0 个 TS error 但退出码 1），不可直接使用。

### ✅ #436 picker + #442 scroll（2026-07-28，接手崩溃 agent 的半成品）

接手者对前一个 agent 的改动做了独立判断，**发现一处遗漏**：

- ⚠️ **`--tx-picker-visible-count` 只接了一半** —— 前一个 agent 只加在弹窗模板（363 行），
  漏了内联模板（311 行）。而 CSS `height: calc(item-height * var(--tx-picker-visible-count, 5))` 对两种模式都生效，
  于是内联模式下 `visibleItemCount` **静默失效回退成 5**。已补齐。
  （主会话复核 diff 时未发现此问题——看到变量加上了就过了，没数它出现在几个模板里。）
- **回退了 `scrollTo` 的生产代码 hack**：`typeof el.scrollTo === 'function'` 分支纯为 jsdom 服务，
  在 Electron/Chromium 与现代浏览器中恒为真、SSR 下 onMounted 又不跑，属死分支。改为在测试里 shim
  `HTMLElement.prototype.scrollTo`。（接手者先查了反证——同族 `TxScroll` 确有 `typeof ResizeObserver === 'undefined'`
  这类生产 guard——再论证区别：那类处理真实降级，scrollTo 不存在该场景。）
- **`JSON.stringify` 签名判为可接受，保留**。`options`/`pullDownRefresh`/`pullUpLoad` 类型是 `Record<string, unknown>`，
  理论允许函数（静默丢弃，属良性）与循环引用（会抛错）。后者是病态且配不通的场景，
  主会话决定**不加 try/catch**，避免过度工程。边界已记录。
- 5 条回归测试 + scrollTo shim；对抗验证 picker 3 条 / scroll 2 条精确失败

### 🔧 单文件对抗验证法的已知陷阱（务必采用守卫）

一个 agent 报告：在子目录内用**仓库根相对路径**喂 `git show HEAD:`，git 报 fatal 但重定向**已产出空文件**，
随后 `cp` 把源码覆盖成空 SFC，导致一次**假失败**。

修正后的写法：
```bash
git -C <repo-root> show HEAD:<repo-relative-path> > /tmp/probe.vue
# 守卫：非空且含 <template> 才继续
[ -s /tmp/probe.vue ] && grep -q '<template>' /tmp/probe.vue || { echo "基线取用失败，中止"; exit 1; }
```

### ✅ #398 flat-dropdown + #413 group-block + #374 button + #389 date-picker + #396 file-uploader
（最后一批，已落盘待复核）

## 🔓 base-surface 解封（2026-07-28）

此前因另一会话占用而排除。现已确认解封：对方工作区清空、最后文件修改 07:39、最后 commit 为 BaseAnchor 相关。
#371 已派工 —— **59 条 P0 至此全部有归属**。

派工时已提醒：对方刚大改过该目录，审计报告的行号（288）可能已偏移，以实际 Read 到的为准；
若发现 bug 已被对方重写掉，直接回报「已失效」，不许硬造修复。

## 🏁 P0 全部完成（2026-07-28）

### 最终验证（三条命令，主会话亲跑）

| 验证 | 结果 |
|---|---|
| `pnpm exec vitest run` | **120 文件 / 783 测试全通过** |
| `vue-tsc --noEmit --noUncheckedIndexedAccess` | 3 error，**全部为既存债，非本次引入** |
| `pnpm exec eslint packages/components/src packages/utils` | **退出码 0，零输出** |

3 个 typecheck error 归属核实：`markdown-serializer.ts(64,66)` 与 `script/build/run.ts(56)`
两文件工作区 = HEAD、**未被本次改动触及**，属更严标志下暴露的既存技术债。
nexus 对 markdown-editor 的引用仅是文档侧边栏路由字符串，非 import。
**本次改动在严格模式下引入 0 个新类型错误。**

### ✅ #371 base-surface（主会话直接修复）

agent 连续两轮空转未接任务，由主会话动手。

**审计建议的修法是错的**：它建议加 `mutation.target === el` 守卫，但祖先节点**本来就可能是真正在 transform 的元素**
（这正是要观察祖先的原因——父级 transform 会带动 surface）。照做会把一个 bug 换成另一个。

**实际修法**：`else if (autoMoving.value && !targets.some(hasTransformChanged))`
—— 语义为「观察范围内已无任何元素在 transform 时」才结束动效。

**仓库内真实复现路径**（强于审计给的假设场景）：`flip-overlay-body-scroll-lock.ts:24` 写
`body.style.overflow = 'hidden'`，而 `body` 正是被观察的祖先之一 ——
**打开 TxFlipOverlay 会取消掉任何在途的 BaseSurface 动效**。

附带发现：`hasTransformChanged` 命名有误导，它不检测「变化」而是检测「当前是否有 transform」。
未改名（属重构，超出 bug 修复范围）。

验证：base-surface + card + base-anchor 共 73 测试通过，ESLint 干净。

### ✅ #366 auto-sizer（唯一溢出到共享工具层的改动）

**四条硬约束全部遵守**，逐条核实：

1. ✅ 未碰 `apps/core-app/`（工作区里 core-app 的 4 个改动经查全部属另一会话的 plugin isolation 工作，与 useFlip/AutoSizer 无关）
2. ✅ 未碰 `button.vue`
3. ✅ **`toValue()` 惰性调用** —— `opt` 用 **getter** 实现，每次访问重新 `toValue()`，未在构造时解包
4. ✅ `flip.ts` 只改了批准的 4 项（`duration`/`easing`/`size.width`/`size.height`），
   `mode`/`includeScale`/`onBefore`/`onAfter` 未动

agent 额外指出一个我没提醒的细节：**回调不能套 `toValue()`**，因为 `toValue(fn)` 会把普通回调当 getter 立即调用。
故 `onResize`/`onBeforeApply`/`onAfterApply` 保持原样。这个洞察正确。

回归哨兵：`button`(7) + `flip-overlay`(22) 零改动通过，共 60 测试。

### ✅ 渲染批 #369/#367/#373/#466 + 最后一批 #398/#413/#374/#389/#396（2026-07-28）

**#369 badge —— agent 拒绝了主会话给的两个方案，提出第三个，且是对的。**

主会话原本给了两个选项，经核实**都有问题**：
- 方案 (a)「圆点取 `var(--tx-badge-bg)`」：variant 里 `--tx-badge-bg` 是**淡色**（primary `#dbeafe`）、
  `--tx-badge-text` 才是**饱和色**（`#1d4ed8`）。照此改会把所有 variant 圆点降级成淡色，白底上几乎不可见
- 方案 (b)「dot 模式不覆盖 text」：圆点回退到 `#374151` 深灰，**仍不是自定义色**，等于没修

agent 采用的第三方案：新增专用 `--tx-badge-dot` token，默认 `currentColor`（variant 圆点行为不变），
仅在传了自定义 color 时设为该色。既修好自定义色圆点，又保住非 dot 模式的文字对比度。

**#373 breadcrumb** —— 改用 `i-carbon-chevron-right`，**未动 TxIcon.vue**。论证：TxIcon 自身已用
`i-ri-image-line`，breadcrumb 既有测试已用 `i-carbon-home`，`@iconify-json/carbon` 是 apps/nexus 的依赖，
故符合既有图标约定，无需改基础组件。

**#367 avatar** —— 选内联 `cloneVNode` 注入而非 `:slotted()`，理由是 scoped CSS 在 jsdom 下不可靠断言。
对抗验证证明了 bug：修复前插槽头像的 style 只有 `z-index: 1;`，边框从未到达。

**#374 split-button** —— keydown 直接调 `toggleMenu` 而非绕道 `handleMenuClick`；
另加 `setTimeout(clearMenuClickGuard, 0)` 兜底。agent 说明了为何不用 pointerup 重置：
button 级 pointerup 先于配对 click，会导致正常路径双触发。

**#389 date-picker** —— `emitModel()` 只在「已解析出有效值且确实被钳制移动过」时才 emit，
避免空/非法 model 挂载时误 emit 今天的日期（那会打破既有测试）。

## 🏁 最终交付验证（2026-07-28）

| 验证 | 结果 |
|---|---|
| `pnpm exec vitest run` | **120 文件 / 783 测试全通过** |
| `vue-tsc --noUncheckedIndexedAccess` | 3 error，**全部既存债**（`markdown-serializer.ts` ×2、`script/build/run.ts` ×1），工作区=HEAD 未被触及 |
| `eslint packages/components/src packages/utils` | **退出码 0** |

**59 / 59 条 P0 全部完成。** 改动规模：116 文件 / +3353 / -1171，覆盖 45 个组件。

## 🔍 独立复检报告（2026-07-28，非实现者执行）

复检 agent 主动划出覆盖边界：快照取于 10:04–10:10，仅覆盖当时已落盘的 ~38 条。
badge/avatar/breadcrumb/tooltip 彼时未落盘，auto-sizer/base-surface 仍在途 —— **已另派一轮补扫**。

### 结论：快照内 ~38 条建议可提交

| 检查项 | 结果 |
|---|---|
| vitest 全量 | 120 文件 / 774 通过 |
| `vue-tsc --noUncheckedIndexedAccess` | 3 error，全部既存债；**container/grid 的 TS2538 已消失**（主会话的 `for...of` 重写在严格模式下通过，经独立验证）|
| eslint | exit 0 |
| 抽查回归测试有效性 | **5/5 均为有效守卫**（tag-input 2 / gradual-blur 3 / number-input 3 / steps 1 / timeline 1，还原 HEAD 后精确失败）|
| 缺测试覆盖 | 快照内 44 个改了 src 的组件**全部**有对应测试改动 |
| 高/中级问题 | **无** |

复检逐一查证并排除的疑点：context-menu 的 `outside-guard` 非死 prop、group-block 两端闭合、
card 的 disabled guard 是补齐对称性而非引入单边、picker **不存在**生产 `typeof scrollTo` guard（已改为测试端 shim）、
provide/inject 五处两端均已同步、全批 `+` 行**零** `as any`/`@ts-ignore`/非空断言。

### 4 条低/信息级问题的裁决（主会话）

| # | 问题 | 裁决 |
|---|---|---|
| 1 | number-input 依赖浏览器吞非法输入 | 接受不改，注释已声明假设，生产成立 |
| 2 | scroll 的 `JSON.stringify` 丢函数回调 | 接受不改，为配不通的病态配置加防御属过度工程 |
| 3 | container/grid 断点解析改为向下级联 | **有意的行为变更**，原逻辑本身即 #411/#384 的 bug。demo/文档对齐记为跟进项 |
| 4 | tag-input 用 `:key="index"` | 接受，原 `:key="tag"` 在 allowDuplicates 下产生重复 key，更糟 |

### 🐚 新增陷阱记录：zsh 分词

复检 agent 报告：**zsh 不对无引号变量做分词**，导致多文件还原时第一次没真正生效。
多文件循环须用 `"$@"`。与此前的「空文件守卫」并列为单文件对抗验证法的两个必备防护。

## 📌 跟进项（不属本次 P0 范围）

1. **3 条既存严格 typecheck 债会挡 nexus typecheck** —— `markdown-editor/src/markdown-serializer.ts(64,66)`、
   `script/build/run.ts(56)`。值得单开 issue 清理。
2. **tuffex 应对齐消费方的 tsconfig 严格度** —— 包内 CI 全绿仍可能打断 nexus 构建。
3. **container/grid 断点级联的行为变更**需同步 demo 与文档。
4. **`hasTransformChanged` 命名误导** —— 实际检测「当前是否有 transform」而非「是否变化」。属重构，未在 bug 修复中改名。

## ⚠️ 协调事故：base-surface 双重派工（2026-07-28，已避免）

**经过**：主会话给 `fix-number-input` 派 base-surface 后，它连续两轮 idle 未接单（磁盘零改动）。
主会话遂**自行修复源码**（10:10），并在下一条消息里把「只写测试」重新派给它。
但由于消息交错，它是在收到该指令**之前**开始 Read 的，看到 `base-surface-motion.ts` 的 mtime 是 10:10、
与主会话先前告知的「已解封、最后修改 07:39」矛盾，**判断存在并发写入风险而主动停手**，未落任何编辑。

与此同时主会话已把同一任务派给了 `fix-final-batch` —— **构成双重派工**。

**处理**：查证 `base-surface.test.ts` 未被任何人触碰（mtime 5月7日）→ 授予 `fix-number-input` 独占写入权
→ 叫停 `fix-final-batch`。未发生实际冲突。

**根因（主会话的表述缺陷）**：告知「解封」时说的是**另一个 Claude 会话**的状态，
未说明主会话自己随后也会写入该文件。agent 无从区分「10:10 的改动」来自谁。

**教训**：主会话自行修改文件后，必须在派工消息里**显式声明该文件已被主会话改动及其内容**，
否则 agent 的并发检测会把主会话误判为失控的第三方写入者。

**附带收获**：`fix-number-input` 独立评估了主会话的修法，认为 `!targets.some(hasTransformChanged)`
**优于**它原计划的「transform-source Set」方案——无状态、每次 mutation 重扫（targets 深度极小），
省去 Set 的建/清生命周期，无 teardown 漏清隐患。主会话接受该结论。

它提出的测试方案也更好：用导出的 `useBaseSurfaceMotion` + harness 组件直接断言 `isMoving`，
绕开主会话原方案依赖的 `needsFallback` 浏览器能力探测链（jsdom 下取值不确定）。

### ✅ #371 base-surface 回归测试（主会话补写，2026-07-28）

指派的 agent 在这条上三次未推进（两次 idle 空转 + 一次授权独占写入后仍未落盘），由主会话补写。

**采用了该 agent 提出的测试方案**（优于主会话原方案）：用导出的 `useBaseSurfaceMotion` + harness 组件
直接断言 `isMoving`，绕开 SFC 的 `needsFallback` 浏览器能力门控（jsdom 下取值不确定）。

两条测试：
1. **正向守卫** `keeps the motion state while an ancestor writes an unrelated inline style`
   —— 模拟 flip-overlay 的 body scroll lock（`document.body.style.overflow = 'hidden'`），
   断言在途动效**未被取消**
2. **反向守卫** `ends the motion state once nothing under observation is transforming`
   —— 防止修复过度拦截把 surface 卡在 moving 状态

**对抗验证**（单文件法，非空 + 关键标识双守卫）：
```
✓ 基线有效: 411 行
× 正向守卫  ← HEAD 上失败，真判别性测试
✓ 反向守卫  ← HEAD 上通过，正确（它是守卫非判别器）
✓ 7 条既有测试全过
Tests  1 failed | 8 passed (9)
```

补充说明：这段 mutation 回调逻辑此前**零测试覆盖** —— 既有的 autoDetect 测试把 MutationObserver
整个 stub 掉却从不触发回调，所以修没修它都绿。这两条是首个覆盖它的测试。

## 🏁 最终交付（2026-07-28）

| 验证 | 结果 |
|---|---|
| `vitest run`（全量）| **120 文件 / 785 测试通过** |
| base-surface + card + base-anchor | 75 通过 |
| `vue-tsc --noUncheckedIndexedAccess` | 3 error，全部既存债（`markdown-serializer.ts` ×2、`script/build/run.ts` ×1），未被本次触及 |
| `eslint packages/components/src packages/utils` | 退出码 0 |

**59 / 59 条 P0 全部完成、全部有回归测试覆盖。**

## ❌ 主会话的一处事实错误（已由 agent 纠正）

主会话曾向两个 agent 断言：「`needsFallback` 依赖浏览器能力探测，jsdom 下取值不确定，别硬套这条可观测路径。」

**这是错的。** 实测 `TxBaseSurface.vue:61-64`：

```js
const needsFallback = computed(() =>
  props.mode === 'blur' || props.mode === 'glass',
)
```

纯 prop 判断，**零能力探测**（全文件 grep 无 `CSS.supports` / `backdrop-filter` 等）。
既有测试 `degrades moving blur to fallback mask` 与 `supports pure fallback while moving`
在 jsdom 下本来就通过，本身即是反证。

**根因**：主会话凭组件语义推测，未读定义就把结论传给了 agent。
未造成实际损害（harness 方案不依赖该链，且更干净），但属于传播未经核实的事实。

**记为规程**：向 agent 传递「某处不确定/有风险」的判断前，先读代码确认，否则应明确标注为「未验证的猜测」。

## ✅ #371 base-surface 独立复核通过（非实现者执行）

源码与测试均由主会话编写，故主会话自跑的对抗验证构成自查。已派非实现者独立重跑：

```
× keeps the motion state while an ancestor writes an unrelated inline style
  → expected false to be true (isMoving, line 285)
✓ ends the motion state once nothing under observation is transforming
✓ 7 条既有全过
Tests  1 failed | 8 passed (9)
```

与主会话结果**逐字吻合**。复核者亦独立认同「审计建议的 `mutation.target === el` 方案错误，
因 transforming ancestor 是合法场景」。

三组件最终：base-surface + card + base-anchor + card-item + base-anchor-liquid = **75 测试通过**。

## 🔁 第二次协调事故：base-surface 测试双重派工（再次避免）

主会话叫停 `fix-final-batch` 的消息与其工作交错，它仍进入了该文件。
Read 与 Edit 之间文件被主会话改动，**编辑器的 stale-file guard 拦截了写入**，它遂改为只读验证。

它推断改动者是 `fix-number-input`——实为主会话本人。**但其处理正确**：无论改动者是谁，
检测到并发改动就不覆盖，是对的。

**净结果为正**：这次"事故"恰好补上了 base-surface 的自查漏洞。

## 🔴 第三次协调事故：base-surface 一个文件牵扯四方（主会话的系统性失误）

| 时刻 | 谁 | 动作 |
|---|---|---|
| 10:10 | 主会话 | 改源码（指派 agent 三次未推进后自行动手）|
| 10:23:41 | 主会话 | 写两条测试（222 → 309 行）|
| 10:24 | 主会话 | 对抗验证 → `/tmp/bsm.fixed.ts` + `bsm.head.ts` |
| 10:27 | 复核 agent A | 独立对抗验证 → `/tmp/bsm-fixed-backup.ts` + `bsm-head.ts` |
| 10:30 | 复核 agent B | 再一次独立验证 |

原指派 agent 做了细致取证（观察到源文件在一秒内于 12234 ↔ 12651 间翻转、`/tmp` 里两组备份），
判断「有并发写入者，此刻做任何事都会撞车」而**全面停手**——判断正确，只是把主会话误认为未知第三方。

**根因：主会话未维护「谁持有哪个文件写入权」的清单**，而是逐条消息临时决定，导致三次事故：

1. 派任务 → agent 未接 → 主会话自行改源码 → 但告知 agent 的前提仍是旧的，agent 据此判断有失控写入者
2. 同一测试任务同时派给两个 agent
3. 叫停消息与对方工作交错，对方仍进入文件

**三次均无实际损失**，但原因是每次都有 agent 主动停手或被编辑器 stale-file guard 拦下，
**不是因为调度本身安全**。

**规程**：多 agent 并发时，主会话必须维护文件级写入权清单；
自行修改文件后，须在后续所有相关派工中显式声明「该文件已被主会话改动」。

**附带正面结果**：这三次「事故」分别带来了——独立的修法评估、独立的对抗验证复现、
以及 `needsFallback` 事实错误的双重纠正（两个 agent 各自独立指出）。

### 最终状态确认（文件已静止，3 分钟无写入）

- 源码 12651 字节，守卫行 293：`else if (autoMoving.value && !targets.some(hasTransformChanged))`
- 测试 309 行
- `base-surface + card + base-anchor` = **75 测试通过**
- 对抗验证经**两方独立**执行，结果逐字吻合

## ✅ 6 组件补扫报告（非实现者，2026-07-28）

**裁决：可提交。** 无高/中级问题；1 条低级行为语义待拍板（已处理，见下）；2 条信息级。
6/6 新测试均为有效守卫；auto-sizer 五个重点项逐条成立。

### auto-sizer 五项逐条核实（复核者结论，主会话已交叉确认）

| # | 项 | 结论 |
|---|---|---|
| 1 | `opt` getter 惰性读取而非构造时解包 | ✅ 12 个标量选项全为 `get X(){ return toValue(...) ?? 默认 }`，无 `const {..}=opt` 冻结 |
| 2 | 回调保持普通函数未被 toValue 包裹 | ✅ `onResize`/`onBeforeApply`/`onAfterApply`/`onBefore`/`onAfter` 全为 `options.X ?? (()=>{})` |
| 3 | `flip.ts` 只改批准的 4 项 | ✅ `mode`(42) / `includeScale`(43) 原样未动 |
| 4 | button + flip-overlay 哨兵零改动 | ✅ 且查明 **flip-overlay 根本不 import `useFlip`**（此前 grep 命中的是 `useFlipOverlayMotion` 子串）|
| 5 | core-app `CanvasGridEditor.vue` 零改动仍工作 | ✅ 传字面量，靠类型拓宽兼容，`toValue(220)===220` 运行时等价 |

### 🟡 LOW-1 avatar 形状被强制覆盖 —— 已修正

复核者发现：`TxAvatarGroup` 注入的**内联** `borderRadius: '50%'` 优先级高于 `TxAvatar` 的
scoped `.tx-avatar--square{8px}` / `--rounded{12px}`，导致
`<TxAvatarGroup><TxAvatar shape="square"/></TxAvatarGroup>` 被**静默强制变圆**。

**主会话裁定：超出 #367 范围，去掉 `borderRadius` 只保留 `border`。**
理由：#367 的问题是「ring 够不到插槽头像」，与形状无关；`shape` 是公开 prop，
静默推翻它属范围外行为变更。去掉后边框自然跟随头像自身圆角，方形头像得方形环，语义更正确。

同时把锁死该行为的既有断言从 `toContain('border-radius: 50%')` 改为 `toContain('border: 2px solid')`，
并新增反向守卫 `leaves a grouped avatar's own shape intact`（断言无内联 border-radius 且 `tx-avatar--square` class 在场）。

对抗验证：把 `borderRadius` 加回后，新守卫精确失败（`1 failed | 6 passed`）。

### 📏 方法论纠正：管道退出码

复核者指出，此前报告的 `vue-tsc ... | grep | head` 后取 `$?` 拿到的是**管道末端命令**的退出码，
不是 vue-tsc 的。已改为重定向到文件后单独取值。

实测 vue-tsc 真实退出码 = **2**（3 条既有债），并非之前误报的 0。
这不改变结论（3 条均在本次未触碰的文件），但读数方式此前是错的。

## 🏁 最终交付（2026-07-28）

| 验证 | 结果 |
|---|---|
| `vitest run` | **120 文件 / 786 测试通过** |
| `vue-tsc --noUncheckedIndexedAccess` | 退出码 2，3 error，**全部既存债**，本批零新增 |
| `eslint` | 退出码 0，零输出 |

**59 / 59 P0 完成 · 124 文件 / +3976 / -1734 · 45 个组件 · 全部有回归测试覆盖。**

## ✅ 补扫复检最终报告（2026-07-28，全部第一手重取）

**结论：可提交。无 high / 无 medium。**

| 验证 | 结果 |
|---|---|
| vitest | 120 文件 / **786 通过** |
| `vue-tsc --noUncheckedIndexedAccess` | 3 error，全部本批之外；6 组件 + 2 共享工具**零新增** |
| eslint | exit 0，无输出 |

### auto-sizer 惰性读取的动态证明（强于静态读码）

复核者把 `auto-resize.ts` + `flip.ts` 还原到 HEAD → auto-sizer 的 2 条 `importActual` 测试**立即失败**：
`rounding` 从 ceil 改 floor 被忽略（measure 返回 {11,6} 而非 {10,5}）、duration getter 调用次数为 0。

**若是构造时 `toValue()` 解包（即"等于没修"），这两条在 HEAD 上也会通过 —— 它们没通过。**
这是对「真惰性」的反证，比逐行读代码确认更硬。

### Spot-check 矩阵（6/6 均为有效守卫）

| 组件 | 还原目标 | 结果 |
|---|---|---|
| auto-sizer | auto-resize.ts + flip.ts | 2 fail / 9 pass |
| avatar | TxAvatarGroup.vue | 1 fail / 6 pass |
| base-surface | base-surface-motion.ts | 1 fail / 8 pass |
| badge | TxBadge.vue | 1 fail / 4 pass |
| breadcrumb | TxBreadcrumb.vue | 1 fail / 4 pass |
| tooltip | TxTooltip.vue | 1 fail / 6 pass |

还原后 footprint 逐字校验一致（14 files / 450 insertions / 94 deletions），无 /tmp 残留。

### avatar LOW-1 已确认修复

复核者独立确认：`ringStyle` 现只注入 `border`，`borderRadius` 已移除，
新增回归测试 `leaves a grouped avatar's own shape intact` 在场。
既让 ring 到达插槽内容（真 bug），又不再吃掉 square/rounded 形状。

---

# 🏁 任务完成

**59 / 59 条 P0 修复完毕，经三轮独立复检（38 条 + 6 组件 + base-surface 专项）全部通过。**

未执行（待用户指示）：
1. git commit —— 123 文件仍在 master 工作区
2. 关闭 113 个 GitHub issue
3. 3 条跟进项另开 issue


---

# 阶段二：272 条 medium（2026-07-28 起）

P0（59 high）已封版。medium 按**缺陷模式**分批（P0 阶段验证过优于按组件分），清单落在
`.trellis/tasks/07-28-tuffex-docs-audit/batches/`：

| 批次 | 类型 | 条数 / 组件数 | 状态 |
|---|---|---|---|
| m1 | `missing-export` | 30 / 30 | 🔄 已派工 |
| m2 | `logic-bug` A | 15 / 14 | 🔄 已派工 |
| m3 | `logic-bug` B | 15 / 15 | 🔄 已派工 |
| m4a | `a11y` 键盘不可达 | 18 / 18 | 🔄 已派工 |
| m4b | `a11y` 缺可访问名称 | 23 / 23 | ⬜ 待派 |
| m4c | `a11y` role / 焦点 / aria 状态 | 25 / 25 | ⬜ 待派 |
| m5 | `stale-demo-code` | 46 / 41 | ⬜ 待派 |
| m6 | 类型相关（type-mismatch / type-leak / undocumented-api 等）| 68 / 50 | ⬜ 待派 |
| m7 | 中英一致性 | 17 / 16 | ⬜ 待派 |
| m8 | 杂项 | 15 / 13 | ⬜ 待派 |

**阶段二基线**：vitest 120 文件 / 786 通过 · vue-tsc 严格模式 3 个既存 error · eslint exit 0 · audit:exports exit 0

## 派工时统一传达的踩坑清单（累积自 P0 阶段）

1. 禁 `git stash` / `checkout` / `restore` / `reset` —— 会取 `.git/index.lock`，卷走他人在途工作
2. 单文件对抗验证须带**非空守卫** —— 路径写错时 git 报 fatal 但重定向已产出空文件
3. 多文件循环用 `"$@"` —— zsh 不对无引号变量分词
4. `grep` 搜 `--` 开头的字符串要写 `grep -- "--foo"` —— 否则被当选项解析
5. **读实际输出，不要读管道退出码** —— `cmd | grep | head` 后的 `$?` 是 head 的
6. 行号可能已偏移，**以实际 Read 到的为准**
7. **认为 finding 不成立就直说，不要为凑数硬改**

## 📊 工作区归属已可按路径分离（2026-07-28）

| 归属 | 范围 | 规模 |
|---|---|---|
| **本任务** | `packages/tuffex` + `apps/nexus/app/components/content/demos` | 102 文件 / +2093 / -255 |
| 另一会话 | `apps/core-app` + `plugins/` + `.trellis/tasks/07-27-*` | 34 文件 / +5021 / -4188 |

两条工作流**无路径交叉**，提交时可按路径精确切分，不会误伤对方。
（此前担心的「混在一起难拆」已不成立。）

## a11y 66 条的模式分布

| 子模式 | 条数 |
|---|---|
| 缺可访问名称 | 23 |
| 键盘不可达 / 缺 tabindex | 18 |
| 缺 role | 16 |
| 焦点管理 | 3 |
| 缺 aria 状态属性 | 2 |
| 其他 | 4 |

高度聚集 → 已拆成 m4a / m4b / m4c 三个子批，要求 agent **先定统一模板再逐条应用**，避免 66 种写法。

## 🔀 批次并行调度矩阵（2026-07-28 预演）

派工前先算同文件冲突，而不是事后靠 agent 停手补救。

### 在跑的 4 批：唯一真冲突已拆解

13 个组件被多批触及，但仅 **`picker/src/TxPicker.vue`** 是同文件冲突
（m3 的 `columns` watcher 不 emit + m4a 的 listbox 缺 role/方向键）。
→ 两条 finding **整体转给 m3 的 agent**，m4a 跳过 picker。**在双方写入前拦下**。

其余 12 个是 `index.ts`（m1）vs 组件 `.vue`（m2/m3/m4a），文件不同，安全。

### 待派 6 批的两两冲突矩阵（同文件数）

|        | m4b | m4c | m5 | m6 | m7 | m8 |
|--------|-----|-----|----|----|----|----|
| m4b    |  ·  |  3  | 0  | 3  | 0  | 0  |
| m4c    |  3  |  ·  | 0  | 4  | 0  | 0  |
| m5     |  0  |  0  | ·  | 6  | 1  | 2  |
| m6     |  3  |  4  | 6  | ·  | 1  | 4  |
| m7     |  0  |  0  | 1  | 1  | ·  | 1  |
| m8     |  0  |  0  | 2  | 4  | 1  | ·  |

**结论**：
- `m6-types`（68 条）与所有批都冲突（3–6 处），**必须单独跑**，不与任何批并行
- 可安全并行的组合：`m4b ⟂ m5`、`m4b ⟂ m7`、`m4b ⟂ m8`、`m4c ⟂ m5`、`m4c ⟂ m7`、`m4c ⟂ m8`
- **m4b 与 m4c 有 3 处冲突** —— 两个 a11y 子批不能同时跑

### 建议的后续波次

| 波 | 批次 | 理由 |
|---|---|---|
| 2 | `m4b` + `m5` + `m7` | 三者两两零冲突 |
| 3 | `m4c` + `m8` | 零冲突（m4b 已完成，不再与 m4c 撞） |
| 4 | `m6` | 单独跑，与所有批冲突 |

### 越界抽查（2026-07-28）

67 个已改组件：**53 个在阶段二批次内、14 个为 P0 历史遗留、0 个越界** ✓

## ❌ 主会话第二处错误：建议了一种不会被执行的类型测试

**背景**：主会话指示 m1 的 agent 用 `expectTypeOf` / `assertType` 为 30 条类型导出写守卫。

**agent 停下来指出这行不通**，核实后全部属实：

```
packages/tuffex/tsconfig.json exclude: ['dist','node_modules','**/node_modules','**/__tests__/**']
                                        → vue-tsc 跳过所有测试文件
vitest.config: 无 typecheck 配置        → .test-d.ts 永不运行；vitest run 走 esbuild 直接抹类型
仓库先例: 零 expectTypeOf、零 .test-d.ts
```

**后果**：`__tests__/` 里的类型断言 **vue-tsc 不检、vitest 也不检**，等于零守卫——
正是主会话全程在警告别人的那种「看起来通过、实则没验证任何东西」的测试。

### 实证：vue-tsc 才是真正的守卫

主会话不满足于推理，做了判别性实验——把 `tooltip/index.ts` 里的 `TooltipProps` 改成不存在的名字：

```
tooltip/index.ts(1,35): error TS2305: Module './src/types' has no exported member 'TooltipPropsDOESNOTEXIST'
tooltip/index.ts(8,35): error TS2304: Cannot find name 'TooltipProps'
```

**报错。** 随后逐字恢复并 `diff -q` 确认无残留。

**结论**：`index.ts` 的 `import type ... from './src/types'` + `export type {...}` + `components.ts` 的
`export *` 构成完整编译期链条，链断即 vue-tsc 报错。类型导出**不需要额外测试**。

### 裁定

| 项 | 决定 |
|---|---|
| 类型导出守卫 | 靠 vue-tsc，不写测试；回报中须注明机制，避免后人误以为漏写 |
| 「非测试编译期断言文件放 src/」 | **不做** —— 会把纯类型断言打进发布产物，零额外覆盖率却引入新文件形态。若将来要做，正确路径是给 vitest 开 typecheck 模式并建立 `.test-d.ts` 约定，属独立基建决策 |
| withInstall 注册 | 运行期可观测 → 写真 vitest 测试（照 `blank-slate.test.ts:95-101`），并做判别性验证 |

### 📏 沉淀的规程

**建议任何「测试」前，先确认该测试会被哪个 gate 实际执行。**
本仓库：`__tests__/` 不进 vue-tsc；vitest 不做类型检查。类型层面的契约靠 `src/` 内的导入链守卫。

## 🪤 第三个「测试看起来在跑、实际没验证目标」的陷阱

**VTU 默认 stub `Transition` / `TransitionGroup`**，把它们渲染成 `-stub` 元素并把 props 当属性透出。

后果（m2 批 A 的 agent 发现）：
- `stagger` 的「不泄漏 transition props」旧测试**实际测的是 stub 的属性**，而非真实渲染
- `collapse` 的 `@enter` 钩子**在 stub 下根本不触发**

修法：`stubs: { transition: false, 'transition-group': false }` 渲染真组件。

### 目前累积的三个同类陷阱

| # | 陷阱 | 后果 |
|---|---|---|
| 1 | `__tests__/` 不进 vue-tsc；vitest 无 typecheck | 类型断言两个 gate 都不执行 |
| 2 | VTU 的 `trigger('keydown.enter')` 产出小写 `"enter"` | 手写 `event.key === 'Enter'` 判定被拒 |
| 3 | VTU 默认 stub Transition / TransitionGroup | 测到的是 stub 属性而非真实行为 |

**共同教训：写测试前先确认它到底在验证什么、由哪个 gate 执行。**

## ✅ 纯 SCSS 修复的处理原则（2026-07-28 确立）

批 A 有 2 条纯 SCSS 修复（`form` 的 `labelPosition="right"` 无规则、`nav-bar` 的 `position` 只在 `.is-fixed` 下设）。

VTU 不应用 scoped SCSS、jsdom 不计算 `position`/`text-align`，**无法构造「HEAD 上失败」的判别测试**——
class 本就已挂，断言 class 存在在修复前后都通过。

**agent 未硬造假测试**，只确认修复落盘正确并说明理由。**此为正确处理**：
一条永远绿的断言比没有测试更糟，因为它伪装成守卫。

## 🔍 3 个失败的完整根因（跨组件行为回归）

`agents` / `dropdown-menu` / `context-menu` 三条 Space 测试失败，三方（主会话 + 两个 agent）独立归因一致为 m4a。
主会话挖到的完整根因**比表面深一层**：

1. **key 归一化**：VTU 送 `"enter"`，m4a 的手写 `event.key === 'Enter'` 拒收
2. **行为扩张致双触发**：三者**都以 `TxCardItem` 为根**且**自己已绑 `@keydown.space.prevent`**。
   m4a 给 `TxCardItem` 新增 Space 后，Space 同时走「TxCardItem emit click → 消费方 @click」
   和「消费方自己的 Space 处理器」→ **2 次 emit**

**裁定**：TxCardItem 独占键盘激活，三个消费方删掉冗余绑定。
否掉「退回只管 Enter」（TxCardItem 独立使用时 Space 不可达）和
「用 `event.defaultPrevented` 去重」（依赖模板监听器与 fallthrough attrs 的执行顺序，Vue 无明确契约）。

## ❌ 主会话第三处错误：否决了唯一有效的类型导出守卫

**背景**：m1 的 agent 提议建一个「非测试编译期断言文件」，主会话以两条理由否决：
「会打进发布产物」+「零额外覆盖率，vue-tsc 的 index.ts 链条已覆盖」。

agent 仍建了 `packages/tuffex/packages/components/missing-export.contract.ts`（171 行），
放在 `src/` **外面**（主会话原话否决的是「放 `src/`」），并在文件头写明为何选此位置。

**核实结果：两条理由都错。**

| 我的理由 | 实际 |
|---|---|
| 会打进发布产物 | `package.json` 的 `files: ['dist']`，**只有 dist 打包**，该文件不进包 |
| 零额外覆盖率 | **错**。见下方实证 |

### 实证：contract 文件抓得到 index.ts 链条抓不到的退化

把 `tooltip/index.ts` 里 `TooltipAnchorProps` 的 **import 与 export 两行同时删除**
（真实的退化方式，不是只删一行）：

```
missing-export.contract.ts(77,15): error TS2724:
  '"./src/tooltip/index"' has no exported member named 'TooltipAnchorProps'
```

**contract 抓到；index.ts 自身链条零报错** —— 两行一起删后该文件内部自洽。

主会话当时只想到「删一行导致链断」，没想到「两行一起删」。

### 裁定

- **保留该文件**，它是这 30 条类型导出唯一真正的守卫
- 守卫机制记为 **`missing-export.contract.ts` + vue-tsc**，而非仅 index.ts 链条
- 要求补一句「新增组件公开类型导出时同步在此登记」，否则会退化成历史快照
- 提交时须纳入版本控制（当前 untracked）

### 📊 主会话至此的三处判断失误

| # | 错误 | 纠正者 |
|---|---|---|
| 1 | 把 `needsFallback` 当成浏览器能力探测（实为纯 prop 判断）| 两个 agent 独立指出 |
| 2 | 建议用 `expectTypeOf`（本仓库两个 gate 都不执行）| m1 agent |
| 3 | 否决 contract 文件（两条理由均不成立）| m1 agent |

**三次都是 agent 拒绝照做、先提出质疑。** 若它们盲从，仓库里会多出一堆假守卫、
少掉唯一有效的那个。

## ✅ 3 条 Space 失败已解决（主会话接管修复，2026-07-28）

催过 m4a 两次未获处理（它活跃但在推进其他组件），主会话**明确声明接管这 4 个文件**后动手：

| 文件 | 改动 |
|---|---|
| `card-item/src/TxCardItem.vue` | 模板 `@keydown` → `@keydown.enter.prevent` + `@keydown.space.prevent`；处理函数删掉手写 `event.key` 比较与 `preventDefault()`，**保留** `event.target !== event.currentTarget` 冒泡守卫和 disabled/clickable 守卫 |
| `dropdown-menu/src/TxDropdownItem.vue` | 删 `@keydown.space.prevent="onClick"` |
| `context-menu/src/TxContextMenuItem.vue` | 同上 |
| `agents/src/TxAgentItem.vue` | 删 `@keydown.space.prevent="handleSelect"` |

结果：**3 失败 → 0**，4 组件 40 测试通过，ESLint 干净。全量 856 测试 / 855 通过。

**与 base-surface 那次的区别**：这次**先明确声明「我接管这 4 个文件，你不要碰」**再动手，
而不是默默写完再通知。避免了模糊争用。

### 遗留要求（已交代 m4a）

`TxCardItem` 现为唯一键盘激活来源。m4a 需自查其余 14 个已改组件是否也用了
「手写 `event.key === 'Enter'` 比较」——**该模式在 VTU 下静默失效**
（`trigger('keydown.enter')` 送小写 `"enter"`）。

主会话给的判断：**失败是显性的会被测试抓到；用了手写比较但恰好没写对应测试的组件是隐性的，
线上不坏但测试永远测不到那条路径。** 后者更危险。

## 📏 「能否修改既有测试」的判断标准（2026-07-28 确立）

m4b 把 `stat-card` 硬编码的 `aria-label="Stat card"` 换成 `aria-labelledby` 指向可见文本，
导致既有测试 `expected undefined to be 'Stat card'` 失败。

主会话此前多次强调「不要改既有测试来迁就实现」，故主动澄清两条标准：

**改既有测试是对的**，当：
- 该断言固化的正是 finding 所描述的缺陷本身（如此处的硬编码英文 label）
- 或该断言依赖被证明错误的测试基建（如 VTU 的假 Transition stub）

**改既有测试是错的**，当：
- 该断言表达的是正确的用户可见行为，只是实现没满足它（如 dropdown-menu 的「Space 只 emit 一次」）

拿不准就停下来问，不自行决定。

## ✅ 全绿检查点（2026-07-28 19:55）

| 验证 | 结果 |
|---|---|
| vitest | **121 文件 / 860 测试全通过，0 失败** |
| `vue-tsc --noUncheckedIndexedAccess` | 3 error，全部既存债，本阶段零新增 |
| eslint | 退出码 0，零输出 |

自阶段一基线 786 起，净增 **74 条回归测试**。

### 阶段二各批进度

| 批 | 进度 |
|---|---|
| m1 missing-export | 29/30（+9 个 SFC 抽 props + contract 守卫）|
| m2 logic-bug A | ✅ 15/15 |
| m3 logic-bug B | ✅ 13 修 + 2 判定已解决 |
| m4a a11y 键盘 | ✅ 18/18（Space 双触发由主会话接管修复）|
| m4b a11y 名称 | 14/23 |
| m5 stale-demo | 8/46 |

待派：m4c（25）、m6（68）、m7（17）、m8（15）

## ❌ 主会话第四处错误：过宽的「手写 key 比较全改修饰符」指令（已收回）

`TxCardItem` 的双触发事故后，主会话要求 m4a **自查全部 14 个已改组件，把所有手写
`event.key` 比较换成 Vue 修饰符**。

**核查后发现这条指令过宽，已收回。**

### 实际情况

| 类别 | 组件 |
|---|---|
| 既有手写比较（HEAD 就有） | cascader chat command-palette data-table select tag-input tree-select |
| 本次新增（m4a 改的） | avatar card fusion group-block status-badge tree |
| 用 Vue 修饰符 | 5 处 |

**本库两种写法本就并存**，不存在需要强推的统一约定。

m4a 给那 6 个新增的写的测试**全部用显式 `trigger('keydown', { key: 'Enter' })`**，
而非修饰符语法——`{ key: 'Enter' }` 正是真实浏览器发出的值、也正是手写比较判定的值，
**测试确实在验证真实路径，不存在静默失效**。

交叉核对「测试用修饰符 + 源码手写比较」的交集：**0 个**。

### TxCardItem 那次为何不同

根因不是「手写比较不好」，而是**它原本是 `@keydown.enter` 修饰符绑定，三个消费方的既有测试
依赖这个契约**。把已有的修饰符契约换成手写比较，打断了下游。

### 修正后的规则

**只需自查「把原有修饰符绑定改成了手写比较」这一类**（可能有下游依赖），
而非所有手写比较。为「一致性」重写 6 个自洽的组件、每个都带回归风险，不值得。

### 📊 主会话至此的四处判断失误

| # | 错误 | 发现方式 |
|---|---|---|
| 1 | 把 `needsFallback` 当浏览器能力探测 | 两个 agent 独立指出 |
| 2 | 建议 `expectTypeOf`（两个 gate 都不执行）| m1 agent 指出 |
| 3 | 否决 contract 文件（两条理由均不成立）| m1 agent 坚持 + 主会话实证 |
| 4 | 「全改修饰符」指令过宽 | **主会话自查发现** |

第 4 条是主会话自己查出来的——发出指令后主动去验证前提，而非等 agent 照做完再发现。

## 🚨 第四个验证陷阱（最隐蔽）：`--noEmit` 不检查声明可发射性

m1 的 agent 发现并追到根因，主会话做判别性实验确认。

### 现象

`rating/index.ts` 用 `const Rating = withInstall(TxRating)` 形态时：

```
A. vue-tsc --noEmit -p tsconfig.json            → 0 error
B. vue-tsc --declaration --emitDeclarationOnly  → TS4023: Exported variable 'Rating'
                                                   has or is using name 'Props' from
                                                   TxRating.vue but cannot be named
```

**同一份代码、同一份 tsconfig，只因加了声明发射标志，错误才出现。**

### 根因

`TxRating.vue` / `TxTimeline.vue` 用**本地未导出的 `interface Props`** 声明 props。
新建的推断 const 其类型引用了这个不可命名的类型 → TS4023 → 该 barrel 的 `index.d.ts`
**静默停止发射**。

`tag` / `tabs` 用同样的 `const X = withInstall(...)` 却不炸，是因为它们的 SFC 用**导出的** props 类型。

### 危害

**失败是静默的** —— 不报错、不中断构建，只是那个组件的 `.d.ts` 不存在了。
要等消费方 import 类型失败才发现。这也是 `audit:exports` 一开始为何红（113 个组件里恰好这 2 个缺 `index.d.ts`）。

而 `--noEmit` 正是本次审计全程在跑、也是要求所有 agent 跑的那条命令。**类型门禁一直有这个洞。**

### 修法

mutate-in-place + 别名 re-export，避免产生新的推断 const：

```ts
withInstall(TxRating)
export { TxRating }
export { TxRating as Rating }
```

### 📏 验证规程更新

**凡改动 `index.ts` 的导出形态（不只是加类型），除 `--noEmit` 外必须跑：**

```bash
cd packages/tuffex && pnpm run audit:exports
```

它检查 package exports 是否都有 dist 文件兜底，能抓到 `.d.ts` 缺失。

### 四个陷阱汇总

| # | 陷阱 | 表现 |
|---|---|---|
| 1 | `__tests__/` 不进 vue-tsc、vitest 无 typecheck | 类型断言两个 gate 都不执行 |
| 2 | VTU 的 `keydown.enter` 送小写 `"enter"` | 手写 key 比较被拒 |
| 3 | VTU 默认 stub Transition / TransitionGroup | 测到的是 stub 属性而非真实行为 |
| 4 | **`--noEmit` 不检查声明可发射性** | **构建时静默丢 `.d.ts`** |

**共同教训：先确认验证命令到底在验证什么、由哪个 gate 执行、失败会不会被静默吞掉。**

## ✅ 四门检查点（2026-07-28 20:1x）

| 门 | 结果 |
|---|---|
| vitest（连跑 3 次） | **122 文件 / 882 测试全通过** |
| `vue-tsc --noUncheckedIndexedAccess` | 3 error，全部既存债，本阶段零新增 |
| `vue-tsc --declaration --emitDeclarationOnly` | **0 error**（`--noEmit` 的盲区，已纳入常规） |
| `audit:exports` | 绿 |
| eslint | 退出码 0，零输出 |

自阶段一基线 786 起，净增 **96 条回归测试**。

### 阶段二进度

| 批 | 进度 |
|---|---|
| m1 missing-export | ✅ 30/30（含 collapse withInstall + contract 守卫）|
| m2 logic-bug A | ✅ 15/15 |
| m3 logic-bug B | ✅ 13 修 + 2 已解决 |
| m4a a11y 键盘 | ✅ 18/18 |
| m4b a11y 名称 | 22/23 |
| m5 stale-demo | 24/46 |
| m7 中英一致 | 5/17 |
| m8 杂项 | 2/15 |

## ❌ 主会话第五处错误：`.prevent` 修饰符劫持插槽内打字

修 Space 双触发时，主会话给 `TxCardItem` 用了 `@keydown.enter.prevent` + `@keydown.space.prevent`。
m4a 的 agent 指出内联修饰符会被插槽内控件冒泡的按键触发，主会话实测确认：

```
插槽内 <input> 打空格 → defaultPrevented=true   ← 空格被吞
                        clicked=false            ← 守卫确实挡住了激活
```

**`.prevent` 在 handler 之前无条件调用 `preventDefault()`**，守卫只能阻止激活、阻止不了它。
而 `TxCardItem` 的右侧插槽正是放控件的地方——其自身注释就写明了这点。

**正解（两者兼得）**：保留修饰符做按键归一化，去掉 `.prevent`，把 `preventDefault()` 放进守卫之后。

| 场景 | defaultPrevented | 激活 |
|---|---|---|
| 插槽内输入框打空格 | false ✓ | false ✓ |
| 行本身按空格 | true ✓ | true ✓ |

已补永久回归测试 `activates on Space from the row but leaves slot typing alone`，
对抗验证：加回 `.prevent` 该条精确失败。

### 键盘绑定的完整规则（三种情况，非一刀切）

1. **组件包 `<slot>` 且插槽可能含输入控件** → 修饰符匹配按键，但**不加 `.prevent`**，`preventDefault()` 放守卫之后
2. **不包插槽 / 插槽无可输入控件** → 两种写法皆可
3. **改动已有的修饰符绑定** → 先查下游是否依赖该契约

### 📊 主会话至此的五处判断失误

| # | 错误 | 发现方式 |
|---|---|---|
| 1 | `needsFallback` 当成能力探测 | 两个 agent 独立指出 |
| 2 | 建议 `expectTypeOf`（两 gate 都不执行）| m1 agent |
| 3 | 否决 contract 文件（两条理由均不成立）| m1 agent 坚持 + 主会话实证 |
| 4 | 「全改修饰符」指令过宽 | 主会话自查 |
| 5 | `.prevent` 劫持插槽打字 | m4a agent 指出 + 主会话实测 |

## 🔀 m6 拆分：50 条安全 + 18 条待解锁（2026-07-28）

m6-types（68 条）此前判定「与所有批冲突，必须单独跑」。按**实际已改文件 + 30 分钟内写入活动**
重新切分后，发现可拆：

| 子批 | 条数 | 组件 | 状态 |
|---|---|---|---|
| `m6a-types-safe` | **50** | 36 | ✅ 已派工（与在跑各批零冲突）|
| `m6b-types-blocked` | 18 | — | ⏸ 等在跑批排空 |

安全子集的类型分布：`type-mismatch` 19 · `type-leak` 16 · `undocumented-api` 13 · `dead-prop` 1 · `missing-emits-declaration` 1

**教训**：「整批冲突」不等于「无法开始」。按文件粒度切，往往能切出大半个安全子集。
之前把 m6 整批挂起是过度保守。

### 派工时对三类问题给了不同的处理方向

| 类型 | 方向 |
|---|---|
| `type-mismatch` | **先判哪边是真源** —— 多数情况代码是真源改文档，但代码类型过宽/错误时改代码。逐条说明 |
| `type-leak` | **改公开契约，最需克制** —— 先分清「实现细节泄漏」还是「刻意的逃生舱」；grep 全仓库确认消费方；不确定时用 `unknown` 而非具体类型；**任何会让现有消费方编译失败的，停下来问** |
| `undocumented-api` | 纯加文档，zh/en 双份，`description` 写「何时设/怎么用」而非复述类型 |

### 已把六条验证陷阱写进派工模板

新 agent 上手即知：`__tests__` 不进 vue-tsc、`--noEmit` 不检查声明发射、VTU 小写 key、
VTU 默认 stub Transition、`grep --` 选项解析、管道末端 `$?`。

**这六条是本次审计比 421 条 finding 更有复用价值的产出** —— finding 修完就结束了，
陷阱会一直存在于这个仓库。

---

## MDC 围栏深度不匹配 —— 审计撞见三次却没认出是一类

> **更正**：初稿写的是「不在 421 条 finding 里的任何一条」，**错了**。
> 审计实际抓到 3 次，分散在三个各自只用过一次的类别名下：
> `broken-mdc-block`(spinner, medium) / `broken-mdc-fence`(loading-overlay, medium) / `d5-fence-mismatch`(toast, low)。
>
> 真正的问题是**命名碎片化**：三个一次性类别名永远聚不成一个批次，
> `toast` 那条还被判 low 沉进未分批堆。结果 23 处只修了 3 处
> （spinner / loading-overlay 由 m8 修掉，正好在我扫描前，这解释了我的扫描为何没报它俩），
> 其余 20 处无人问津，且全程没有守卫。
>
> **派生教训**：审计的**类别体系**本身需要收敛。只出现一次的 category 名是信号——
> 要么是真孤例，要么是某个类被拆碎了。本次 34 个 category 里有 **16 个只出现一次**，值得回头合并。

eslint / nuxt typecheck / vitest 三道闸全绿，它却让文档页面半页内容消失。

### 现象

remark-mdc 要求组件开闭冒号数**完全一致**。不一致时容器永不闭合，把文件剩余部分全部吞成自己的子节点。

用真解析器（remark-mdc@3.11.1，即 @nuxt/content 3.15.0 解析到的那份）对比验证：

| 写法 | `## After` 标题的位置 |
|---|---|
| `::Demo` … `::` | `<demo>` 的**兄弟**节点（正确） |
| `::Demo` … `:::` | `<demo>` 的**子**节点（被吞） |

### 影响面

组件文档 236 个文件中 **12 个**中招，每个被吞 3–11 个标题：

`input`(8) `rating`(5) `timeline`(7) `toast`(3) `transfer`(7) `tree-select`(11) —— 各 zh/en 两份。
`tree-select` 被吞 11 个标题，等于那一页大半是坏的。

**全部是既有问题**：2-冒号开标签数量在 HEAD 与工作区完全一致，非本次 agent 引入。

### 修法

开标签 `::` 提升为 `:::`，共 20 处，每处 1 个字符，正文一字未动。

方向选择依据：全库 486 处 `:::TuffDemoWrapper` vs 102 处 `::`，三冒号是主流；且升开标签不必动闭合行。
修前逐块确认**体内 0 嵌套组件、0 裸冒号行**，升深度不产生歧义。

### 附带发现：VitePress 语法残留

`api/clipboard.{en,zh}.mdc:389` 用了 `::: warning Important`（VitePress 容器语法）。
MDC 要求组件名紧贴冒号，带空格则不构成开标签 —— 真解析器确认整块 parse 成普通段落，
**用户在页面上看到的是字面量 `::: warning Important` 和一行裸 `:::`**。

`app/components/content/` 下无任何 callout 组件，全站该写法仅此 2 处。
改为 api 目录既有约定：`> **Note**: ` / `> **注意**：`（该目录已有 7 处此写法）。原文一字未改，只换外壳。

### 常驻守卫

`apps/nexus/build/check-mdc-fences.mjs` + `pnpm -C apps/nexus check:mdc-fences`

纯 Node 栈式检查，不依赖 remark-mdc（避免依赖传递性 dep）。
**等价性已验证**：在全部 446 个 content/*.mdc 上与 remark-mdc 真解析器判定完全一致。

对抗性验证（cp 备份 + 注入 + 还原）：

| 场景 | 结果 |
|---|---|
| 干净树 | exit 0 |
| 注入深度不匹配 | exit 1，报出开闭双行号 |
| 注入孤儿闭合 | exit 1，并提示 VitePress 语法可能性 |
| 注入未闭合组件 | exit 1 |
| 还原 | 与备份逐字节一致，重新 exit 0 |

### 教训

**审计的覆盖面本身要被审计。** 421 条 finding 全部围绕「文档内容 vs 源码」，
没有一条检查「文档文件本身能否正确解析」。
四个维度（API 一致性 / demo 有效性 / zh-en 对等 / 代码质量）都预设了文档能正常渲染。

派生检查项：凡是「内容文件」都该有一道**语法层**守卫，与内容层审计正交。

---

## 协调事故：9/66 组件被多方认领，其中 2 个我从没标记

派发到第五批时跑了一次**全量归属图**（对所有活跃批次做实际计算，而非凭记忆），结果：

```
当前活跃派发覆盖 66 个组件，其中 9 个被多方认领：

  base-anchor      m4c + #44-types      ← 已标记
  context-menu     L3  + #44-types      ← 已标记
  dropdown-menu    L4  + #44-types      ← 已标记（但撤回消息到得太晚）
  flip-overlay     L3  + m4c            ← 已标记
  layout-skeleton  L3  + m4c            ← 已标记
  rating           L4  + m4c            ← ❌ 从没标记
  scroll           L4  + #44-types      ← 已标记（同 dropdown-menu）
  select           L3  + m4c            ← 已标记
  transition       L4  + m4c            ← ❌ 从没标记
```

**根因**：每次派发时只对「我记得的那几个批次」算冲突矩阵，而不是对全量活跃派发做实际计算。
这是同一根因的第三次发作——前两次是 `icon-button` 漏算、`dropdown-menu`/`scroll` 双派。

**未造成损坏**，原因不是我的调度安全，而是 agent 自己的谨慎：
`fix-final-batch` 在 `transition` 上 Edit 报 "modified since read" 后，
重读 → 确认 frontmatter 区与初读逐字一致 → 才外科式重放自己那一处。

事后核实：无重复字段、围栏守卫 exit 0、YAML 完好。

### 由此定下的硬规矩

> **多方认领的 `.mdc` 只能用外科式 Edit，绝不整文件 Write，且每次编辑前紧邻重读。**

依据是这次事故揭示的结构：同一个 `.mdc` 被不同批次**合法地**需要不同区域
（frontmatter / 正文 / demo 代码块 / API 表）。区域不重叠时并行编辑是安全的，
**危险的只是整文件写**。所以正确的隔离粒度不是「组件」也不是「文件」，是**文件内区域**。

### 归属应按文件类型划，不按组件名划

a11y 批占 `.vue` + `__tests__`，文档批占 `.mdc`——同一组件可被两个 agent 安全并行处理。
按组件名算冲突矩阵既会误报（把安全的并行拦下来），也会漏（把真冲突放过去）。

### 派生检查

派发前必须跑全量归属图，输入是**所有活跃批次的实际组件清单**，不是记忆。

---

## 完整性核验：报告 vs 实际落盘

各批次 agent 交的是**报告**，报告可能夸大。做了一轮机械核验，抽查各批次声称的修复是否真在文件里。

**结果 13/13 全部为真**，无一夸大：

| 批次 | 核验项 | 结果 |
|---|---|---|
| m8 #14 | `container` 5 条 `.is-responsive` 加 `:not(.is-fluid)` | 5 ✅ |
| #41 | empty-state 家族 8 个 `defineEmits<>` | 8 ✅ |
| m6a | `virtual-list` `items?` 改可选 | ✅ |
| m6a | `TxBottomDialog` 补 `pre-line` | ✅ |
| m4a | `TxCardItem` 独占键盘激活、消费方无冗余 space 绑定 | 2 / 0 ✅ |
| L2 | 10 组件 × zh/en 的 status+since | 20 ✅ |
| L4 | 6 组件 × zh/en 的 status+since | 12 ✅ |
| m8 | `typing-indicator` 指向 `src/chat` | 2 ✅ |
| m8 | `stack` demo 用 `<span>` 非 `<p>` | 0 ✅ |
| m8 | `timeline` 死链截图已删 | 0 ✅ |
| L1 | `tree` 目的句非抄 description | 2 ✅ |
| m5 | `card.zh` 1800 → 1066 行 | ✅ |

## D5 达标率（用户原始诉求的量化）

```
8 字段 frontmatter 齐备:  HEAD 95/119 (79%)  →  现在 110/119 (92%)   +15
6 个事实标准段 ≥5 个:                          现在 113/119 (94%)
```

剩余 9 个未齐备的组件**全部已在派发中**，零遗漏：
- `avatar-variants` / `context-menu` / `glass-surface` / `index` ← #47 L3（**注意**：L3 做截断不做 frontmatter，这 4 个要等它完事再补）
- `dropdown-menu` / `scroll` ← #50
- `stat-card` / `tabs` / `version-capsule` ← L4-3

## zh/en 对等性全库扫描（D3 维度）

119 个组件：

```
frontmatter 字段集不一致:  0
二级段数不一致:            0
demo 引用不一致:           1   ← index，L3 改到一半（zh 11→2，en 未动）
```

## 并发期全量测试不可信 —— 第三次确认

`code-editor` + `context-menu` 全量跑失败，隔离复跑**各 3/3 通过**。
当时 `context-menu` 有 6 个文件正被 m4c 改写。

**结论固化**：agent 在写文件时跑全量 vitest 的结果不是信号。判定失败必须隔离复跑。

---

## 孤儿 demo 口径更正（我的计算错误）

先后报过 137 / 135 / 139 三个数，**互不可比**——一次算了代码标识符、一次没算。
据此又推出「L3 净增 11 个孤儿」并发给了 agent，**也是错的**。

统一口径重算，三类死重定义分清：

```
demo 文件总数                          443
registry 条目                          306
被文档引用                             304

① 从未注册的文件（历史遗留，本轮前就在）  137
② 已注册但无文档引用（本轮产生）            2   ← 仅 auto-sizer 那对
③ 文档引用但未注册（断链，必须为 0）        0   ✅
```

`index` 移除的 9 个是**跨页共享的组合 demo**（DataOperations / PermissionOrchestration /
FeedbackTaskCenter 等），其他组件页仍引用，所以不构成孤儿。

**教训**：同一指标先后用不同口径计算，比不算更糟——它会产出看似精确、实则虚假的「变化量」，
并被当成事实转发给 agent。报数前先固定口径，且口径要写在结论旁边。

## D5 达标率（用户原始诉求的两个量化指标）

**指标一：frontmatter 8 字段齐备**
```
HEAD 95/119 (79%)  →  现在 110/119 (92%)   +15
```

**指标二：开头段是否讲设计目的**（文本相似度 >0.85 判为照抄 description）
```
                 HEAD    现在
讲设计目的        100  →  109   +9
照抄 description   18  →   10   −8
无开头段            0  →    0
```

剩余 10 个照抄的：`auto-sizer` `avatar-variants` `slider`（#47）、`tree-select`（#49）、
`scroll` `data-table`（#50）、`flat-select` `search-input` `search-select` `spinner`（已派）。

**指标三：6 个事实标准段 ≥5 个** —— 113/119 (94%)

**zh/en 对等（D3 维度）**：119 个组件，frontmatter 字段集 / 二级段数 / demo 引用**三项均 0 处不一致**。

## audit:size 既存债（本轮之外，记录后不修）

至少从 2026-06 起一直是红的，从没人跑过：

```
Base CSS   28.4 / 16.0 KiB   超 12.7 KiB (+77%)
Full CSS  382.7 / 330.0 KiB  超 52.7 KiB (+16%)
Core App renderer 根导入 2 / 0
```

归因已独立核实：两处根导入所在文件（`widget-registry.ts` 07-19、`SettingEverything.vue` 07-17）
工作树零改动且在 `apps/core-app/`（另一会话地盘）；base.css 三个样式源冻结于 2026-06-21；
预算块最后改动 2026-06-05。本轮对组件样式的净增量经逐文件 `<style>` diff 量化为 **+4,842 B**，
仅占 54,009 B 超额的 <9%。

**裁定不修**：非本轮造成、涉及他人地盘、调预算是产品决策。作为独立后续项上报。

**正面结论**：CHANGELOG 里那些「防回涨」守卫全绿——gsap / v-wave / @codemirror 动态加载、
scroll pull 插件、empty-state 轻量别名全部通过，empty-state 与 HEAD 逐字节相同。
本轮改动**没有让任何按需入口回涨**。

---

## 一类审计四个维度都抓不到的缺陷：**腐坏的否定断言**

m4c 收尾对齐文档时暴露出 5 处，性质与普通「文档没写」完全不同。

### 症状

文档写了一句「本组件**不**做 X」，源码后来做了 X。这句话同时产生两重危害：

1. **否定断言变成假话**
2. **它推荐的变通做法成了纯粹的无用功**——读者会去实现一个已经不需要的东西

最典型的是 `splitter`，HEAD 原文：

> 分隔条可聚焦，带 `role="separator"`，并支持方向键调整，**但没有暴露 `aria-valuenow`、`aria-valuemin` 或 `aria-valuemax`**。
> 精确调整场景**建议在外部补充可见比例/尺寸反馈**。

m4c 给 `TxSplitter.vue:161-172` 加上这三个属性后，读者若照文档做，会白写一套外部反馈。

### 全部 5 处

| 组件 | 腐坏的否定断言 | 源码实况 |
|---|---|---|
| `splitter` | 「没有暴露 aria-valuenow/min/max」+ 建议外部补反馈 | 三者都有 + `aria-label="Resize"` |
| `form` | 「不自动绑定 `for`/`id`」 | `TxFormItem.vue:20-21` 用 `useId()` 生成并绑定 |
| `tab-bar` | 「tablist 语义、每项 role=tab」 | 已改 nav 地标，**无 role**，用 `aria-current="page"` |
| `agents` | 「`clickable` 仅启用时」 | 恒开，禁用交给 `aria-disabled` + 点击守卫 |
| `tree` | 自定义 item slot「**应自行**保留语义」 | slot 渲染在 `role="treeitem"` 包裹内，语义自动保留 |

### 为什么四个维度都抓不到

- **D1（文档 vs 源码 API 一致性）** 比对的是 Props/Events/Slots **条目**。
  「我们不暴露 aria-valuenow」不是条目，是散文。
- **D2（demo 有效性）** 看的是示例代码能否跑。
- **D3（zh/en 对等）** 两份译文可以**同样地假**——事实上这 5 处 zh/en 都是错的。
- **D4（代码质量）** 只看源码，不回看文档。

**没有任何一个维度把「文档里的否定性散文断言」与源码对照。**

### 派生检查项

审计文档时，除了「文档说有的源码是否有」，还要反过来查
**「文档说没有的，源码是不是已经有了」**。

机械起点：搜文档里的否定模式——`不支持` / `不会` / `没有暴露` / `不自动` / `does not` / `is not` /
`no ` + ARIA 属性名 / `should ... yourself` —— 逐条回源码核实。

否定断言比肯定断言更危险，因为**它们通常还附带一个「所以你要自己做 X」的建议**，
腐坏时不只是信息缺失，是主动误导读者做无用功。
