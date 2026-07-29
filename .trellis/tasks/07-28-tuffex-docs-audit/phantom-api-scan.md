# tuffex 组件文档 —— 幻影 API 扫描（phantom-api-scan）

> **只读扫描。** 找「文档描述、但源码里根本不存在」的实现 / API / 组件 / composable / CSS 变量。
> 这是本次审计最危险的一类缺陷：普通不一致是「说得不全」，这类是**说了假话**——读者照做直接失败。
> 审计的四个维度（API 一致性 / demo 有效性 / zh-en 对等 / 代码质量）都**预设了文档提到的东西存在**，凭空发明的实现不在任何维度视野里。这是系统扫这一遍的理由。

**取样时刻：** 2026-07-28 22:25 PDT，起始 HEAD `fd5ec291c`。
**覆盖：** 全部 119 个组件 × zh/en（238 个 `.mdc`）+ 对应 `packages/tuffex/packages/**` 源码。
**并发快照：** 扫描期间 #58 base-anchor / #60 card / #62 group-block / #63 icon 的「层级归一」在改文件，这些文件按当时磁盘快照读。**下面 9 条确认项没有一条落在这些 mid-edit 文件上**，所以修复不会与它们撞车。
**动作：** 纯只读，本文件外零改动。**未修任何一条**——按要求先报，修的时候考虑写权归属（逐条已标注）。

---

## 结论摘要

- **9 条确认（一档）** —— 文档说了假话，读者照做会失败或被误导。
  - **A. 凭空描述不存在的实现（6）：** `popover`、`breadcrumb`、`container`、`flat-input`、`stagger`、`switch`
  - **B. 否认 / 错述真实行为（3，"反向幻影"）：** `loading-overlay`、`toast`、`dialog`
- **存疑（二档）：0** —— 所有候选都核到底了。
- **反向缺口（三档）：19**（源码有、文档没写，低危，单列）—— 绝大多数是 a11y label 类 prop 未进 Props 表。

**最值得报的一条判断：** 审计已知的 4 个样例里 **3 个已修**（`search-select` 的 `TxPopover→TxTooltip→TxBaseAnchor` 假链条已删、`spinner` 的 `currentColor` 已改成 `--tx-text-color-secondary`、`stat-card` 散文已准确说是 `Intl.NumberFormat`），但**同一个「凭空发明 Tooltip 链」的模式，在 `popover` 的 zh `description` 里还活着**。零散撞见只能修个例；模式化的同类要靠系统扫才抓得住——这正是本次扫描的价值。

---

## 一档 · A：凭空描述不存在的实现（6）

### A1. `popover` —— zh description 发明了不存在的 "Tooltip 链"（与 search-select 同类）
- **文档：** `popover.zh.mdc:3` `description: "基于 Tooltip 与 Anchor 链路的语义弹出层。"`
  （`popover.en.mdc:3` 已正确：`"Semantic popover built directly on BaseAnchor."`；zh 正文 `:13` 也已正确说「直接基于 `TxBaseAnchor`」——只有 zh 的 frontmatter description 漏网。）
- **源码真相：** `TxPopover.vue:5` `import { TxBaseAnchor } from '../../base-anchor'`、`:173` `<TxBaseAnchor>`。全组件**无任何 `TxTooltip`**；`TxBaseAnchor` 自身渲染 `TxCard`，也不是 Tooltip。
- **搜过：** `popover/**`（grep `Tooltip` 零命中）、`base-anchor/src/TxBaseAnchor.vue`。
- **建议：** zh description 对齐 en / 正文，改为「直接基于 `TxBaseAnchor` 的语义弹出层」。**写权：无人认领，free。**

### A2. `breadcrumb` —— 默认 `separatorIcon` 写成非功能值
- **文档：** `breadcrumb.zh.mdc:82`「默认分隔图标名是 `chevron-right`」+ `:91` Props 表默认 `'chevron-right'`；`breadcrumb.en.mdc:82`/`:91` 同。
- **源码真相：** `TxBreadcrumb.vue:12` `separatorIcon: 'i-carbon-chevron-right'`。`TxIcon` 只解析 `i-` 前缀（`TxIcon.vue:78` UnoCSS 类）或内置集（`chevron-down/close/search/user/star/star-half`，`:43`）；纯 `chevron-right` 既非 `i-` 前缀也不在内置集 → `:156` 返回 `null` → 空图标。文档自己的 demo（`:68`）用的正是 `i-carbon-chevron-right`，与其声称的默认自相矛盾。
- **搜过：** `breadcrumb/src/TxBreadcrumb.vue`、`icon/src/TxIcon.vue`（内置集 + `i-` 分支）。
- **建议：** 默认值改 `'i-carbon-chevron-right'`（散文 + 表格，两语）。**写权：无人认领，free。**

### A3. `container` —— demo 用了不存在的 CSS 变量
- **文档：** `container.zh.mdc:159` + `container.en.mdc:159` demo `<style scoped>` 内 `background: var(--tx-color-surface);`
- **源码真相：** `--tx-color-surface` **全仓（tuffex + nexus + packages）零定义**，也不在 `style/variables.scss` / `style/index.scss`。读者复制该例得到未定义变量 → 透明背景。
- **搜过：** `packages/tuffex/**`、`apps/nexus/app`、`apps/nexus/content` 全仓 grep。
- **建议：** 换成真实 token（如 `--tx-bg-color-overlay` / `--tx-fill-color-light`）。**低危**（demo 示例，非组件自身 API）。**写权：无人认领，free。**

### A4. `flat-input` —— 描述的正是被删掉的错误 CapsLock 机制
- **文档：** `flat-input.zh.mdc:68`「Caps Lock 检测基于 key code 和 `shiftKey`」；`flat-input.en.mdc:68`「based on key code plus `shiftKey`」。
- **源码真相：** `FlatInput.vue:39` `capsLockOn.value = e.getModifierState?.('CapsLock') ?? false`，绑在 `@keydown`+`@keyup`（`:47-48`）。全组件**无 `shiftKey` / `keyCode`**；源码注释 `:35-38` 明说 keyCode 方案「was wrong」。文档documenting的正是被删的 buggy 算法。
- **搜过：** `flat-input/**`（grep `shiftKey|keyCode` 仅命中注释）。
- **建议：** 改为「基于 `getModifierState('CapsLock')`」。**注意区分：** `input`（`TxInput.vue:97`）是**另一个组件**，其 CapsLock 文档（`input.*.mdc:134-136`）与源码一致、无此问题（已由 #54 处理）。**写权：无人认领，free。**

### A5. `stagger` —— 描述的 "mount 后才应用" 机制不存在（组件自己的测试反证）
- **文档：** `stagger.zh.mdc:81`「`name` 与 `appear` 会在 mount 后才传给 TransitionGroup，避免初始渲染时 transition props 泄漏为根属性」+ `:92`/`:93`/`:134`（en `:81`/`:92`/`:93`/`:134` 同：「withheld until after mount … SSR/client hydration should not depend on transition attributes during the initial render」）。
- **源码真相：** `TxStagger.vue:61-63` 在**每次渲染（含首帧）**直接从 props 传 `name`/`tag`/`appear`；注释 `:58-60`「Pass name/appear on the first render too … deferring them permanently skipped appear」。组件自己的测试 `stagger.test.ts:100` 标题即「**passes appear and name to TransitionGroup on the initial render** so appear can run」，断言首帧 `group.props('appear')===true`。
- **辨析：** 文档的「不泄漏为根属性」**结果**其实成立——但成因是 TransitionGroup 把 `name/appear` 当自身 props 消费（`stagger.test.ts:43` 断言根元素无 `name`/`appear` 属性），**不是**靠「mount 后才应用」。所以幻影是**机制描述**（"withheld until mount" + 那条 SSR/hydration 说法），不是泄漏结论。
- **搜过：** `TxStagger.vue` 全文、`stagger/__tests__/stagger.test.ts`。
- **建议：** 删掉「mount 后才 / 仅在 mount 后应用」的说法，改为「首帧即传给 TransitionGroup（appear 才能触发）；因 TransitionGroup 消费这两个 prop，故不会泄漏为根 DOM 属性」。**写权：无人认领，free。**

### A6. `switch` —— 文档声称渲染 `tabindex="0"/"-1"`，源码根本不渲染 tabindex
- **文档：** `switch.zh.mdc:219`「启用时 `tabindex="0"`」+ `:220`/`:287`「`disabled=true` 时设置 `tabindex="-1"`」；en `:219`/`:220`/`:287` 同。
- **源码真相：** `TxSwitch.vue:41` 是原生 `<button>`（`:43` `role="switch"`），**无任何 tabindex 绑定**；测试 `switch.test.ts:19`（启用）与 `:50`（禁用）都断言 `attributes('tabindex')` 为 `undefined`。可聚焦性来自原生 button，禁用来自原生 `disabled` 属性。
- **辨析：** 「可聚焦 / 禁用不可聚焦」的**结果**对，但文档描述的**属性机制**（显式 tabindex）是幻影。
- **搜过：** `TxSwitch.vue` 全文、`switch/__tests__/switch.test.ts`（grep `tabindex` 仅命中两条测试断言）。
- **建议：** 改为「原生 `<button>` 提供 tab 顺序；`disabled` 用原生 `disabled` 属性移除可聚焦性」，删掉 `tabindex="0"/"-1"` 表述。**写权：无人认领，free。**

---

## 一档 · B：否认 / 错述真实行为（3，反向幻影）

### B1. `loading-overlay` —— 可访问性说明**否认了组件确实具备的** a11y
- **文档：** `loading-overlay.zh.mdc:130`「……但没有提供 `role="status"`、`aria-live`、焦点陷阱或模态语义」；en `:130` 同（"does not expose `role=\"status\"`, `aria-live`, focus trapping, or modal semantics"）。
- **源码真相：** `TxLoadingOverlay.vue:73-77` 全屏分支渲染 `role="status" aria-live="polite" aria-busy="true" tabindex="-1" @keydown="onFullscreenKeydown"`；`onFullscreenKeydown`（`:51-55`）对 Tab `preventDefault()`——注释「trap Tab to keep focus parked here」，即**焦点陷阱**；`:94-95` 局部分支也有 `role="status" aria-live="polite"`。**四项里三项都在**，只有「模态语义」（`role="dialog"`/`aria-modal`）确实没有。
- **危害：** 读者信了这句会自己再包一层 live region 或加全屏 focus trap → 重复播报 / 陷阱打架。
- **搜过：** `TxLoadingOverlay.vue` 全文。
- **建议：** 改为「已提供 `role="status"` + `aria-live` + 全屏分支的最小焦点陷阱；仅不提供模态语义（`role="dialog"`/`aria-modal`）」。**写权：#54（a11y 对齐）已 completed 但此条漏网，free。**

### B2. `toast` —— 计时器说明说反了
- **文档：** `toast.zh.mdc:156`「复用 `id` 会替换 store item，但**已有自动关闭定时器不会取消**」；en `:156` 同（"existing auto-dismiss timers are not cancelled"）。
- **源码真相：** `toast.ts:49-51` 复用 id（`existingIndex !== -1`）时**先 `clearDismissTimer(id)`**（`:36-40` `clearTimeout` + `delete`），再于 `:70` 设新定时器。行为与文档**正好相反**。（`duration: 0` 的建议本身仍有效，但给出的理由是假的，按此理由推断「旧定时器还在跑」的读者被误导。）
- **搜过：** `packages/tuffex/packages/utils/toast.ts` 全文、`toast/src/TxToastHost.vue`。
- **建议：** 改为「复用 `id` 会取消旧定时器并重置一个新的」。**写权：无人认领，free。**

### B3. `dialog` —— 把 `TxBlowDialog` 错分进「稳定内部 id」组
- **文档：** `dialog.zh.mdc:264`「`TxBlowDialog` 与 `TxPopperDialog` 对默认标题 / 内容区域使用**稳定内部 id**」；en `:264` 同。
- **源码真相：** `TxBlowDialog.vue:52` 注释「Instance-scoped ids (mirroring Bottom/TouchTip)」、`:54-55` `titleId = useId()` / `contentId = useId()`——是**实例级**，不是稳定 id。只有 `TxPopperDialog` 用硬编码稳定 id（`TxPopperDialog.vue:80-81,91,97` `'tx-popper-dialog-title'` / `-content'`）。
- **搜过：** 4 个 dialog SFC 全部（Bottom/Blow/Popper/TouchTip）。
- **建议：** 把 `TxBlowDialog` 归到 Bottom/TouchTip 那组（instance-scoped `useId`），只留 `TxPopperDialog` 在「稳定内部 id」。**写权：无人认领，free。**

---

## 二档 · 存疑：0

所有候选（含中心化 token 差集扫出的 `TxStatusIconDemo`、`--tx-card-*`、`useCard/useEvent/useId/useTransition`、toast 的 `TxToast*` 类型、`--tx-color-surface`、`NumberFlow`、`@better-scroll`）都核到底、归入确认或排除，无悬而未决。

---

## 三档 · 反向缺口（源码有、文档没写 —— 低危，单列）

多数是 a11y label 类 prop（a11y 批加了 label prop，但 Props 表没同步）。**非幻影**，补文档即可。

| 组件 | 源码有、文档 Props 表没写 | 源码位置 |
|---|---|---|
| `ai-elements` | `typingLabel`（TxAiMessage） | `TxAiMessage.vue:11-19` |
| `badge` | CSS 变量 `--tx-badge-dot` | `TxBadge.vue:16,94` |
| `base-anchor` | `panelCard` 文档标为 `Partial<TxCardProps>`，实际更窄 `Partial<Pick<TxCardProps, …>>` | `base-anchor/src/types.ts:54-72`（过宽标注，非幻影键；base-anchor 正被 #58 改，snapshot） |
| `chat` | `attachmentLabel`（TxChatMessage） | `chat/src/TxChatMessage.vue:20-21` |
| `chat-composer` | `ariaLabel` | `chat/src/types.ts:42` |
| `command-palette` | `ariaLabel` | `command-palette/src/types.ts:25-26` |
| `guide-state` | Source 导出行漏 `GuideStateEmits` | `guide-state/index.ts:8` |
| `icon-button` | `size` 漏 `'xs'`（有 `.tx-icon-button--xs` 样式） | `icon-button/src/types.ts:4`、`TxIconButton.vue:133` |
| `image-gallery` | 7 个定制 prop：`previousLabel/nextLabel/previousText/nextText/previewTitle/itemLabelFormatter/openLabelFormatter` | `image-gallery/src/types.ts:10-23` |
| `markdown-editor` | `theme="auto"` 观察者同时看 `body`（文档只提 `documentElement`） | `TxMarkdownEditor.vue:391-396` |
| `nav-bar` | `backLabel/leftLabel/rightLabel` | `nav-bar/src/types.ts:13,19,25` |
| `number-input` | `decreaseLabel/increaseLabel` | `TxNumberInput.vue:21-24` |
| `pagination` | `ariaLabel/firstLabel/prevLabel/nextLabel/lastLabel` | `pagination/src/types.ts:10-19` |
| `radio` | 独立用 `modelValue?: boolean` + `update:modelValue` 事件（非 group） | `radio/src/types.ts:33`、`TxRadio.vue:16` |
| `slider` | `ariaLabel/ariaLabelledby` | `slider/src/types.ts:12-13` |
| `stat-card` | `ariaLabel` | `stat-card/src/types.ts:28` |
| `status-badge` | 绑了 click 监听时根节点切 `role="button"` + `tabindex="0"` + Enter/Space 激活（文档说 `role="status"` 无条件） | `TxStatusBadge.vue:134-136` |
| `tag` | `closeAriaLabel`（只在散文提，Props 表没有） | `tag/src/types.ts:65` |
| `typing-indicator` | `ariaLabel`（`showText=false` 时的 SR 文本） | `chat/src/types.ts:82` |

---

## 附 · 已知 4 样例现状复核

| 样例 | 状态 | 证据 |
|---|---|---|
| `search-select` | **已修** | 假链条已删；`search-select.*.mdc:209` 现说「面板由 `TxPopover` 承载」，与 `TxSearchSelect.vue:6,259` 一致 |
| `spinner` | **已修** | `spinner.*.mdc:121` 已说根节点用 `--tx-text-color-secondary`，与 `TxSpinner.vue:151` 一致；旧 `currentColor` 说法已改 |
| `stat-card` | **散文已准确** | `.*.mdc:222`「built-in number formatter」对应 `TxStatCard.vue:164 Intl.NumberFormat`；`NumberFlow` 仅出现在 demo/`#value` 插槽的**用户侧集成示例**，非组件自身实现（不算幻影） |
| `data-table` | **已文档化** | `interactiveRows` 行已在 `.*.mdc:105`（本人 #50 已补，且更正了 finding 的「唯一途径」错误说法） |

**同类模式仍存活处：** 上面 A1 `popover` zh description —— 与 search-select 同一「凭空发明 Tooltip 链」。

---

## 方法与可信度

**分两层，中心化 + 扇出，中心化的结论我逐条核到源码；扇出的每条「确认」我再亲自复验（源码行 + 文档行都看）后才入档。**

1. **中心化差集（我做，覆盖类别 #1/#2/#4）：** 建三份权威集——全 tuffex 包的 `Tx*`（370 个）、`use*` composable（10 个）、`--tx-*` 变量（442 个）——把文档 token 减去权威集，得「全仓不存在」候选。踩到并修正了两个盲点：
   - **动态 import 盲点：** `scroll` 经 `await import('@better-scroll/core')`（`TxScroll.vue:184-185`）加载 BetterScroll，静态 `from '...'` grep 看不见。**若只信静态 grep 会误报「scroll 不用 BetterScroll」——这是本任务最典型的假阳性陷阱。** 已改为静态 + 动态双查。
   - **utils 包盲点：** `toast` 的 `TxToast*` 类型在 `packages/tuffex/packages/utils/toast.ts`，不在 `components/`。权威集必须含 utils/script 子包。
2. **扇出（8 个只读子代理，各 ~15 组件，覆盖类别 #1/#2/#3 + 散文实现声明）：** 每个都带上述纠正后的方法 + 已核实的 per-component lib 图 + 4 个样例校准，硬规则「绝不凭一次 grep 下结论，先扩到 utils 包 / 动态 import / `style/variables.scss` / barrel re-export / Vue 内建再判」。
3. **可信度自查：** 反向缺口抽验 3 条（`icon-button` 的 `xs`、`radio` 独立 `modelValue`、`status-badge` 交互路径）全部属实；已知样例的「已修」结论逐条对源码复核。中心化扫出的 `--tx-card-*`(负向文档正确)、`useCard`(是 prop 不是 composable)、`useEvent`(`MouseEvent` 子串误提)、`TxStatusIconDemo`(`IconTxStatusIconDemo` 子串误提) 等假阳性均已排除。

**lib 使用真值（静态 + 动态，全包）：** `gsap`→base-anchor/flip-overlay/group-block；`@floating-ui`→base-anchor/flat-dropdown；`@codemirror`+`yaml`→code-editor；`marked`→markdown-editor/markdown-view；`@better-scroll`→scroll（动态）；`motion`→base-anchor/base-surface/flip-overlay。`NumberFlow`/`ogl`/`mermaid`/`echarts`/`typeit`/`@vueuse` 在 tuffex 组件源码里**均未使用**（是 nexus demo 侧的依赖）。
