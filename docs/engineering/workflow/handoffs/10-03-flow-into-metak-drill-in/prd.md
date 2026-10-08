# 流转并入 ⌘K 面板做二级页 + 流转页模糊背景 + footer 毛玻璃

## Goal

这个任务把三件事一起做掉：

1. **⌘K 到流转无缝切换**：流转不再是 CoreBox 里另起的一块面板，而是 ⌘K 卡片里的第二页。卡片本身不动，内容横向推过去，高度平滑过渡。
2. **流转页模糊背景**：进入流转页后，背后的 CoreBox（搜索栏、结果、底栏）整体模糊，不干扰用户选择目标。
3. **footer 真正毛玻璃**：现在 CoreBox 底栏的 `backdrop-filter` 实际上没有起作用，列表文字从底栏下面清晰地透出来。

技术设计见 `design.md`，执行步骤见 `implement.md`。

## Background（已核实的事实）

### 现在的流转是怎么工作的

- 流转选择器是 `renderer/components/flow/FlowSelector.vue`，画在 **CoreBox 渲染层**里，挂载位置是 `views/box/CoreBox.vue:1497`。它借用 ⌘K 的卡片外壳 `components/meta/MetaPanel.vue`，以及同一套几何常量 `shared/meta-overlay-geometry.ts`。
- 打开流转有三个入口，最后都调用 `useDetach.openFlowSelector`（`useDetach.ts:280`）：
  - 结果列表上按 ⌘⇧D：`useKeyboard.ts:937` 发出 `corebox:flow-item` 窗口事件，由 `useDetach.ts:360` 接住。
  - ⌘K 面板里的「流转」行：overlay 走 `action.execute`，主进程广播 `itemAction`，再到 `useActionPanel.ts:163`。
  - 插件视图里的流转快捷键：`plugin-view-controller.ts:327` 广播 `FlowEvents.triggerTransfer`，由 `useDetach.ts:343` 接住。
- ⌘K 面板在另一个渲染层里：一个透明的全窗口 `WebContentsView`（`#/meta-overlay`，`views/meta/MetaOverlay.vue`），压在插件视图上面。因为两个面板分属两个渲染层，从 ⌘K 进流转时，只能先关掉 ⌘K 再打开流转。
  - 为了不让窗口高度来回跳，主进程专门写了一段交接：`handOffToFlowPicker`（`meta-overlay.ts:594`、`:816`，等待上限 `FLOW_HAND_OFF_MAX_WAIT_MS = 500`，`:60`）。
  - CoreBox 那边配合一整套「窗口让位」：`useFlowPanelRoom`、`useResize` 的 `floor` / `floorApplied`、`useSearch` 的第三个参数（`CoreBox.vue:114`、`:134`）。
- **插件页里流转面板被挡住**：FlowSelector 画在 CoreBox 文档里，插件视图是叠在上面的独立 `WebContentsView`，所以 UI 模式下按流转快捷键，面板打开了却看不见。
- 派发由 CoreBox 执行：`useDetach.dispatchFlow`（`useDetach.ts:298`）用 `FlowEvents.dispatch` 发出，senderId 为 `'corebox'` 并带上 `actorPluginId`，结果通过 `showCoreBoxFooterFeedback` 显示在底栏。载荷经过 `toRaw` 加 `shallowRef` 处理，保证可以结构化克隆。
- 主进程在 overlay 的 `before-input-event` 里**自己拦截 Esc** 并直接 `hide()`（`meta-overlay.ts:180`）。这段代码 2026-01-03 初版就有，spec 只约束了「IME 组字时不拦」。
- Flow IPC 认 overlay 这个发送方：
  - `getTargets` 只对插件发送方做权限检查（`flow-bus/ipc.ts:83-123` 的 `resolveActor` / `enforce`）。
  - `checkConsent` 不检查发送方。
  - `grantConsent` 只拒绝插件上下文（`:264`，「只能由 app UI 授予」）。
  - 所以 overlay 可以自己取目标、做授权。
- DivisionBox 窗口也挂载了 `CoreBox.vue`（`AppEntrance.vue:106`）。`shouldForwardKey` 不转发 ⌘⇧D（`useKeyboard.ts:411`），所以在 DivisionBox 里按 ⌘⇧D，会在独立窗口自己的渲染层弹出 FlowSelector（有插件视图时同样被挡住）。主进程对 DivisionBox 里按的 ⌘K 本来就会跳过：overlay 只挂在 CoreBox 窗口上，CoreBox 隐藏时 `show()` 直接返回。

### footer 为什么没有毛玻璃（2026-10-03 在隔离实例里实测）

- footer 根元素带 `backdrop-filter: blur(18px) saturate(180%)`（`CoreBoxFooter.vue:427`），是最上层元素。祖先链上没有任何会截断 backdrop 的属性（filter、opacity、mask、clip-path、mix-blend-mode、will-change 都没有）。改 z-index、overflow、transform 都没有任何区别。
- **根因**：CoreBox 是透明窗口，毛玻璃质感来自系统合成在网页下面的原生 vibrancy。网页自己只铺了一层 75% 的 `--tx-fill-color` 遮罩（`.CoreBox-Mask`，`CoreBox.vue:1936`），文字画在这层上面。`backdrop-filter` 只能读网页自己的像素，并且是把模糊副本**叠在原图上面**，不是替换原图。底栏背后只有 75% 不透明，模糊副本也只有约 75%，清晰原图还有约 25% 透出来。
- **放大因素**：footer 声明的填充是 `--fake-inner-opacity: 0.95`（`CoreBoxFooter.vue:424`），按这个设计值残影只剩约 1%。但 tuffex 的 `style/index.scss:32-34` 有一条无条件的 `.fake-background:before { opacity: var(--fake-opacity, 0.75) !important }`，把它压成了 0.75，残影变成约 6%，字形清晰可读。
  - 这条规则是 2025-12-23 迁进 tuffex 时（`a6ba3b3f2`）丢掉了 CoreApp 原版的 `.touch-blur` 前缀。
- **对照实验**：
  - 把填充设成 0：字依旧清楚。
  - 去掉 `backdrop-filter`：字只是变亮。
  - 在底栏那条位置、列表下面垫一块不透明底板：模糊立刻正常，残影消失。
  - 截图在 `/tmp/tuff-flow-metak-2/shots/`，其中 `cmp-footer-3way.png` 是三张对比：现状、底板加填充 0.5、底板加填充 0.3。
- **先例**：CoreBox 已经用 `.CoreBox-Wrapper--meta-fill::before`（`z-index: -1`，画在遮罩上面、所有行下面）给 ⌘K 拉高的窗口铺实色。底板可以照这个写法。

## Decisions（2026-10-03 用户已确认）

- 建 Trellis 任务。
- 流转并进 ⌘K 卡片做二级页：
  - 同一张卡片里内容横向滑动，高度平滑过渡。
  - ⌘⇧D 和插件页面里的流转快捷键都直接打开到流转页。
  - 删掉 CoreBox 里独立的流转面板、窗口让位和高度交接。
  - 派发仍由 CoreBox 执行，底栏反馈不变。
- **Esc 的规则**：
  - 从 ⌘K 列表点进流转：标题行显示「‹」，第一次 Esc 退回操作列表，第二次 Esc 关闭。
  - 直接打开流转页（⌘⇧D、插件页快捷键）：不显示「‹」，Esc 一次关闭面板。
- **模糊范围**：只在流转页模糊整个 CoreBox，搜索栏、结果、底栏一起模糊约 8px，保留轻遮罩；退回操作列表时恢复清晰，全程带过渡。插件页面是独立视图，没法用 CSS 模糊，只保留遮罩。
- **翻页能力放 TuffEx**：新增 `TxTransitionPush`，MetaPanel 用它翻页。同一个提交带上 Nexus 中英文文档、demo 和 changelog。
  - 它放在已有的 `transition/` 目录里，不新增 slug。组件生命周期门禁按 slug 检查（`audit-version-changelog.mjs`），所以不会因此变红，CHANGELOG 记在 `## [Unreleased]` 下。
  - 发不发版、改不改版本号由用户决定。
- footer 毛玻璃并入本任务：用户的原话是「footer 根本就没背景模糊到，应该是要独立一个层级？」。

## Requirements

### A. 流转是 ⌘K 卡片的第二页

- **R1 卡片页面栈**
  - overlay 维护一个页面栈，页面有三种：`actions`（操作列表）、`flow`（流转目标）、`flow-confirm`（授权和确认）。
  - 进入下一页时内容向左推入，返回时向右推回，卡片外框（底色、ring、阴影、圆角、锚点）不动，高度在切页时平滑过渡。
  - 标题行始终显示条目的图标和名称。流转页加上「选择目标」，可以返回时在最左侧显示「‹」按钮（语义化 `<button>`，带无障碍名称）。
  - 过滤输入时，卡片保持现在的即时伸缩，不做动画。
- **R2 从 ⌘K 进入流转**
  - 激活「流转」行就在卡片里推入流转页，不再走 `action.execute`。激活方式包括 ↵、点击和面板内的 ⌘⇧D。
  - ⌘K 面板打开时，如果操作列表里有「流转」行，就顺手预取流转目标，进入流转页时尽量已经就绪。
- **R3 直接打开流转页**
  - ⌘⇧D（CoreBox 列表）和插件视图里的流转快捷键（`FlowEvents.triggerTransfer`）都改成请求主进程打开 ⌘K 卡片，并且直接停在流转页（`MetaShowRequest.page = 'flow'`）。
  - CoreBox 先取好目标再发请求，主进程据此一次性把窗口拉到合适高度。
  - overlay 压在插件视图上面，所以 UI 模式下流转面板终于看得见了。
- **R4 流转页的内容和交互**：照搬 FlowSelector 现有的行为，不改语义。
  - 目标按插件分组，组的顺序按首次出现。
  - 图标用 `normalizeCoreBoxIcon(target.icon || target.pluginIcon)`。
  - 副标题用 `description || adaptationHint`。
  - 需要确认的目标在行尾显示盾牌图标。
  - 加载提示经过 `useDeferredLoading` 延迟显示；没有目标时显示「没有可用的目标」。
  - 过滤框在卡片底部，右侧键帽显示 Esc。
  - ↑↓ 循环，跳过禁用行；↵ 只认新按下的键；输入法组字时把按键交给输入法；一次选择发出后加锁，防止连按重复派发；晚到的回复用代次计数丢弃。
- **R5 授权和确认是第三页**
  - 目标需要授权或确认时推入 `flow-confirm` 页。三种文案和按钮组合、`{ source, target }` 占位符、token 语义都不变。
  - 焦点落在主按钮上，Tab 在按钮之间循环。
  - Esc 等同「拒绝」：不授权、不派发，推回流转列表。授权已经发出后再按 Esc，直接关闭。
- **R6 选中后由 CoreBox 派发**
  - overlay 通过 `action.execute` 发出 `{ actionId: 'flow-transfer', item, flow: { targetId, consentToken?, confirmationToken? } }`。
  - 主进程把 `flow` 原样随 `itemAction` 转给 CoreBox，然后关闭面板，按现有规则归还窗口高度。
  - CoreBox 的 `dispatchFlow(item, flow)` 用条目和当前查询组装载荷后派发。底栏反馈不变：成功、缺权限、失败三种。
- **R7 键盘归属与 Esc**
  - overlay 在根页面（栈里只有一页）时，Esc 由主进程拦截并关闭面板，与现在一致。
  - 处在子页面时，主进程放行 Esc，交给 overlay 返回上一页。主进程从 overlay 的切页通知里得知能否返回（`canGoBack`）。
  - 任何页面上 ⌘K 都关闭面板。流转页上不解析操作快捷键，所以再按 ⌘⇧D 不会重复进入。
  - IME 规则保持不变：组字期间主进程不拦 Esc，overlay 不处理按键。
- **R8 切页时的窗口高度**
  - overlay 每次切页，或者流转页高度变化，都会把新页面需要的 `desiredPanelHeight` 通知主进程。
  - 面板打开期间主进程只拉高、不缩小，关闭后按现有规则归还：有挂起的布局更新就重放它，没有就恢复打开前的高度。
- **R9 DivisionBox 不做流转（2026-10-03 用户确认）**：DivisionBox 里的流转和 ⌘K 保持一致，不可用。
  - DivisionBox 里按 ⌘⇧D 直接短路（不发请求、不报错），避免 CoreBox 可见时面板开到 CoreBox 窗口上，用的却是 DivisionBox 的条目。
  - 今天 DivisionBox 里的旧面板有插件视图时本来就看不见。不给 DivisionBox 挂 overlay。

### B. 流转页模糊 CoreBox

- **R10 模糊信号**：主进程推给 CoreBox 的 `panelState` 增加 `blur`。面板可见且当前页不是 `actions` 时为真，面板关闭时一定为假。
- **R11 模糊效果**
  - CoreBox 收到 `blur` 后，对搜索栏（`.CoreBox`）和结果区（`.CoreBoxRes`，含底栏）施加 `filter: blur(8px)`，模糊和恢复都带过渡，时长和翻页一致。
  - 运动总闸关闭（减弱动效或低电量）时只切换、不过渡。
  - overlay 的 20% 遮罩不变。插件视图只有遮罩，没有模糊。
  - 只用 `filter` 模糊 CoreBox 自己的内容，**不用** `backdrop-filter`：透明窗口里它会重蹈 footer 的覆辙。

### C. 删除旧实现

- **R12 删除 CoreBox 里的流转面板**：以下全部删除。
  - 文件：`FlowSelector.vue` 及其测试、`useFlowPanelRoom.ts` 及其测试。
  - 参数：`useResize` 的 `floor` / `floorApplied`，`useSearch` 的第三个参数。
  - 接线：`CoreBox.vue` 里的 FlowSelector、`flowPanelFill`、`updateFlowPanelRoom`，以及 `useKeyboard.ts:597` 对 `.FlowSelector` 的避让。
  - 主进程的交接代码：`handOffToFlowPicker`、`flowHandOffTimer`、`FLOW_HAND_OFF_MAX_WAIT_MS`，以及 `holdLayoutUpdate` 里按交接关闭的分支。
  - `useDetach` 里 FlowSelector 的状态：`flowVisible`、`flowPayload`、`flowSessionId`、`flowAnchor`、`openFlowSelector`、`closeFlowSelector`。
  - 删除之后，useResize 的行为与加地板之前逐字节一致。

### D. TuffEx `TxTransitionPush`

- **R13 横向推入过渡**
  - 包住一个带 key 的子元素。key 变化时，旧页按 `direction` 滑出，新页同时滑入：`forward` 时新页从行内结束方向进来，`back` 时从开始方向进来。
  - 容器高度只在切换那一刻用 FLIP 从旧高度过渡到新高度，结束后恢复为 `auto`。
  - 支持中途打断：从当前动画值继续过渡。
  - `duration: 0` 时直接替换，没有过渡。
  - `prefers-reduced-motion: reduce` 时退化为淡入淡出，高度直接落定。
  - 遵守 TuffEx 设计规则：只用 `--tx-*` token，BEM `tx-transition-push`，hover 不过渡颜色。
- **R14 TxTransitionPush 的文档和登记**
  - `transition.{zh,en}.mdc` 新增「推入翻页」演示一节，`TxTransitionPush Props` 表放在 API 下，最佳实践补一条，中英文结构保持一致。
  - 新增 demo SFC，并登记到 `demo-registry.ts`。
  - `packages/tuffex/CHANGELOG.md` 的 `[Unreleased]` 记一条。
  - 导出 `TxTransitionPush`、`TransitionPush` 和类型；补组件测试。

### E. footer 毛玻璃

- **R15 底栏下方的不透明底板**
  - footer 在屏幕上时（`footerOnScreen`），在结果列表**下面**、底栏那条位置铺一块不透明底板，颜色取遮罩色的满强度 `--tx-fill-color`，与 meta-fill 一致。高度与 footer 一致（44px）。
  - 底板跟随 footer 一起滑入（0.12s ease-out），一起立即收起。
  - canvas 布局的 footer 不压内容，不铺底板。
  - 默认布局和 widget 布局都要铺。
- **R16 footer 填充**
  - footer 的填充降到约 0.5，最终值在 0.4–0.6 之间按深色和浅色主题截图确定，让模糊透出来。
  - 同时写死 `--fake-inner-opacity` 和 `--fake-opacity`。这样 tuffex 那条无条件规则以后修不修，footer 都不受影响。
  - `backdrop-filter` 保持不变。

## Acceptance Criteria

| AC | 需求 | 验收标准 |
| --- | --- | --- |
| AC1 | R1 R2 | 真机：在短列表上按 ⌘K，激活「流转」后内容横向推入；卡片外框不跳；高度只过渡一次；窗口最多拉高一次；标题行出现「‹」和「选择目标」 |
| AC2 | R7 | 从 ⌘K 进入流转后：第一次 Esc 推回操作列表，模糊消失；第二次 Esc 关闭面板，窗口高度归还。⌘K 在任何页面都关闭面板 |
| AC3 | R3 R7 | 真机：结果列表上按 ⌘⇧D，卡片直接停在流转页，不显示「‹」，Esc 一次关闭 |
| AC4 | R3 | 真机：插件 UI 模式下按流转快捷键，卡片出现在插件视图上方（截图为证）；插件视图只有遮罩，搜索栏被模糊 |
| AC5 | R4 R6 | 真机：选择一个不需要确认的目标（如 System Info），派发成功（`ACKED`），底栏显示「已发送到目标插件」；连按 ↵ 只派发一次 |
| AC6 | R5 | 真机：选择需要确认的目标后推入确认页，焦点在主按钮上；Esc 不授权、不派发，推回列表；确认后带着 token 派发成功 |
| AC7 | R10 R11 | 进入流转页时 CoreBox 搜索栏、结果、底栏都被模糊（约 8px，带过渡），退回操作列表或关闭面板后恢复；在减弱动效下只切换、不过渡 |
| AC8 | R8 | 预取到的目标比操作列表高时，进入流转页时窗口一次性拉到所需高度；退回操作列表时窗口不缩；关闭面板后按现有规则归还 |
| AC9 | R12 | 仓库里不再出现 `FlowSelector`、`useFlowPanelRoom`、`windowFloor`、`floorApplied`、`handOffToFlowPicker`（spec 的历史说明除外）；`useResize` 原有用例全部通过 |
| AC10 | R13 R14 | TuffEx：`TxTransitionPush` 的单测覆盖方向、离场元素脱离文档流、高度动画、`duration: 0`、减弱动效和中途打断；Nexus `transition` 文档页中英文都能渲染出推入 demo；`apps/nexus` 的 vitest 全绿 |
| AC11 | R15 R16 | 真机，深色和浅色主题各截一张：底栏下面不再有清晰可读的列表残影，能看到模糊的色晕；footer 出现和收起时底板与它同步，不会先闪出一条深色带；canvas 布局没有变化 |
| AC12 | R9 | DivisionBox 里按 ⌘⇧D 不发出 `ui.show`，CoreBox 窗口里不会出现面板（单测覆盖） |
| AC13 | 全部 | 门禁：core-app 两套 typecheck 加改动目录的 vitest；主进程相关测试；tuffex 的 typecheck、vitest、build；nexus 的 vitest 和 `check:mdc-fences`；lint 只看增量；`git diff --check` |

## Out of Scope / 旁路问题（只报告，不在本任务修）

- **tuffex 那条无条件的 `--fake-opacity` 规则**（`packages/tuffex/packages/components/style/index.scss:32-34`）：它让 CoreApp 里所有 `--fake-inner-opacity` 都失效了。
  - 当前屏幕上就有两个：footer 0.95 变 0.75，输入框补全提示 0.7 变 0.75。
  - 宫格图块、菜单项、插件列表等也都声明了这个变量。
  - 修它会改变全局观感，建议另开任务。
- **`.CoreBoxFooter-Sticky { z-index: 10 }`**（`CoreBox.vue:1820`）被同一元素上的 `z-0` 工具类压成了 0，目前没有可见影响。
- **DivisionBox 里按 ⌘K**：CoreBox 可见时，面板会开在 CoreBox 窗口上（主进程只检查 CoreBox 是否可见，不检查请求来自哪个窗口）。本任务只给流转加渲染层短路，不改 ⌘K。
- 不改流转的派发语义、授权模型和目标注册。不改 ⌘K 操作列表本身的内容、顺序和快捷键。
