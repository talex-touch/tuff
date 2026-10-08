# Design — 流转并入 ⌘K 卡片 + 流转页模糊 + footer 毛玻璃

路径前缀：

- `utils/` = `packages/utils/`
- `shared/` = `apps/core-app/src/shared/`
- `main/` = `apps/core-app/src/main/`
- `core-box/` = `main/modules/box-tool/core-box/`
- `renderer/` = `apps/core-app/src/renderer/src/`
- `tuffex/` = `packages/tuffex/packages/components/`

## 0. 总览

```
                ┌──────────── overlay 渲染层（#/meta-overlay，压在插件视图上面）────────────┐
 ⌘K ──show──▶   │ 页面栈: [actions] ─推入─▶ [actions, flow] ─推入─▶ [actions, flow, flow-confirm] │
 ⌘⇧D / 插件页   │ 直接打开: [flow] ─推入─▶ [flow, flow-confirm]                                  │
 ──show(page:   │   每次切页 ──ui.page{page, canGoBack, desiredPanelHeight}──▶ 主进程            │
   'flow')──▶   │   选中目标 ──action.execute{actionId:'flow-transfer', item, flow}──▶ 主进程     │
                └──────────────────────────────────────────────────────────────────────────────┘
主进程 MetaOverlayManager:
  ui.page → 记录 page / canGoBack；按 desiredPanelHeight 只拉高；publishPanelState{visible, grown, blur}
  before-input-event Esc → 只有 !canGoBack 时才 hide()
  executeAction('flow-transfer', item, flow) → 广播 itemAction{actionId, item, flow} → hide()
CoreBox 渲染层:
  panelState.blur → CoreBox-Wrapper--meta-blur（filter: blur(8px)）
  itemAction{flow} → useActionPanel → useDetach.dispatchFlow(item, flow) → FlowEvents.dispatch → 底栏反馈
  ⌘⇧D / triggerTransfer → useDetach.openFlowPanel(item) → getTargets → ui.show{page:'flow', flowTargets}
```

渲染层之间不直接通信，一律经主进程转发：这是现有 `itemAction` / `panelState` 的同一套模式。

## 1. 契约变更（`utils/transport/events/types/meta-overlay.ts`、`core-box.ts`、`meta-overlay.ts` 事件表）

```ts
// 卡片上正在显示的页面
export type MetaPanelPage = 'actions' | 'flow' | 'flow-confirm'

export interface MetaShowRequest {
  // …现有字段不变…
  /** 卡片打开时停在哪一页。省略 = 'actions'。'flow' 直接停在流转页，没有返回入口。 */
  page?: 'actions' | 'flow'
  /** `page: 'flow'` 时由发送方预先取好的流转目标；省略时由 overlay 自己取。 */
  flowTargets?: FlowTargetInfo[]
}

/** overlay → 主进程：卡片换页了，或者当前页需要的高度变了。 */
export interface MetaPageChangeRequest {
  page: MetaPanelPage
  /** Esc 是在卡片里返回上一页（true），还是关闭面板（false）。 */
  canGoBack: boolean
  /** 新页面需要的面板高度，口径同 `desiredPanelHeight`；省略 = 不动窗口。 */
  desiredPanelHeight?: number
}

/** 在流转页选中的目标，随转交动作一起送回 CoreBox。 */
export interface MetaFlowSelection {
  targetId: string
  consentToken?: string
  confirmationToken?: string
}

export interface MetaActionExecuteRequest {
  // …现有字段不变…
  flow?: MetaFlowSelection
}

// utils/transport/events/types/core-box.ts
export interface CoreBoxMetaOverlayItemActionPayload {
  // …现有字段不变…
  flow?: MetaFlowSelection
}
export interface CoreBoxMetaOverlayPanelStatePayload {
  visible: boolean
  grown: boolean
  /** 卡片正在显示流转页（flow / flow-confirm）：CoreBox 模糊自己的内容。visible 为假时一定为假。 */
  blur: boolean
}

// utils/transport/events/meta-overlay.ts，MetaOverlayEvents.ui
page: defineEvent('meta-overlay').module('ui').event('page').define<MetaPageChangeRequest, void>()
```

几条约定：

- 所有新字段都是可选的，只在末尾追加。读 `panelState` 时，缺少 `blur` 按 `false` 处理。
- `flowTargets` 是主进程的纯数据，可以结构化克隆。overlay 拿到后直接使用，不再重复请求。
- `MetaFlowSelection` 里的 token 是能力凭证，只在内存里转发，不进日志。主进程日志只记 `targetId` 的有无和 token 的有无，不记值。

## 2. 主进程

### 2.1 `MetaOverlayManager`（`core-box/meta-overlay.ts`）

新增状态：

```ts
private page: MetaPanelPage = 'actions'
private canGoBack = false
private currentAnchor: MetaPanelAnchor | undefined   // 来自最近一次 show 请求，切页拉高时用
```

**show 与显示**

- `flushPendingShow` 把请求交给 overlay 时，设置 `page = request.page ?? 'actions'`、`canGoBack = false`、`currentAnchor = request.anchor`。
- 然后 `fitParentToPanel(request)` 照旧执行。

**`changePage(request: MetaPageChangeRequest)`**（新）

1. 面板不可见时直接忽略。
2. 写入 `page` / `canGoBack`。
3. 如果有 `desiredPanelHeight`，就执行 `fitParentToPanel({ anchor: currentAnchor, desiredPanelHeight })`。
   - 这条路径现在也服务于切页：仍然**只拉高**，`restoreHeight` 每次打开只记录一次。
4. 执行 `publishPanelState()`。

**`publishPanelState()`**

- 下一个状态是 `{ visible, grown, blur: isVisible && page !== 'actions' }`。
- 三个字段都参与「状态变了才发」的比较。

**Esc 拦截**

- `before-input-event` 里的 Esc 条件追加 `&& !this.canGoBack`。
- `canGoBack` 为真时放行，由 overlay 处理返回。

**`executeAction(actionId, item?, flow?)`**

- 广播 `itemAction` 时，带 `flow` 就写成 `{ actionId, item, flow }`，否则写成 `{ actionId, item }`。
- 然后 `hide()`。

**删除交接代码**

- 删掉：`FLOW_HAND_OFF_MAX_WAIT_MS`、`flowHandOffTimer`、`handOffToFlowPicker()`、`clearFlowHandOff()`。
- 删掉对 `clearFlowHandOff()` 的调用：分布在 show / hide / dismissWithHost / destroyRenderer 里。
- 删掉 `holdLayoutUpdate` 里的 `if (this.flowHandOffTimer) this.hide()`。

**状态复位**

- `hide()`、`dismissWithHost()`、`destroyRenderer()` 都在发布状态之前复位：`page = 'actions'`，`canGoBack = false`。
- 所以面板关闭时 `blur` 一定为假。

### 2.2 IPC（`core-box/ipc.ts`）

**`MetaOverlayEvents.ui.page`**（新）

- 发送方必须是 `metaOverlayManager.ownsRenderer(senderId)`，否则记一条 warn（只记 senderId）并忽略。
- 载荷校验：`page` 属于三种页面之一，`canGoBack` 是布尔值，`desiredPanelHeight` 是有限正数或省略。不合法就整条丢弃。
- 校验通过后调用 `changePage`。

**`action.execute`**

- 现有的发送方校验不变。
- `flow` 只有在 `targetId` 是非空字符串、两个 token 是字符串或省略时才转发。不合法时去掉 `flow`，相当于一个没有选择的转交动作；CoreBox 收到这种动作什么都不做（见 §5.2）。

**`ui.show`**

- 日志追加 `page`。
- `extendMetaPanelHeightForPluginRows` 只对 `page !== 'flow'` 生效：流转页的高度来自目标数量，与插件动作无关。

### 2.3 不变的部分

- `holdLayoutUpdate` 的「打开期间挂起、关闭时重放」。
- 渲染层隐藏时的 `dismissWithHost`。
- `watchHandBack` 的铺底保持。
- `HEIGHT_SYNC_DELAY_MS`。
- `prewarm`、ready 握手。

## 3. overlay 渲染层（`renderer/views/meta/MetaOverlay.vue`）

### 3.1 页面栈

```ts
const pageStack = ref<MetaPanelPage[]>(['actions'])
const page = computed(() => pageStack.value.at(-1)!)
const canGoBack = computed(() => pageStack.value.length > 1)
const direction = ref<'forward' | 'back'>('forward')
function pushPage(next: MetaPanelPage): void   // direction = 'forward'
function popPage(): void                       // direction = 'back'；栈里只剩一页时改为关闭
```

- **show**：栈重置为 `[request.page ?? 'actions']`，`direction = 'forward'`，不播放进场推入（卡片自己的进场动画照旧）。
- **hide**：栈重置为 `['actions']`，同时重置各页的状态。

### 3.2 流转页逻辑：`useMetaFlowPage`

新文件 `renderer/modules/box/meta-actions/meta-flow-page.ts`。把 FlowSelector 的 `<script>` 原样迁过来：只是从 props / emit 改成 options / 返回值，行为不变。

```ts
useMetaFlowPage(options: {
  transport: ReturnType<typeof useTuffTransport>
  t: (key: string, params?: Record<string, unknown>) => string
}): {
  targets, loading, showLoading, query, activeIndex, composing,
  sections, flatRows, activeRow, activeRowHighlighted,
  consentTarget, consentRequiresAuthorization, consentRequiresExecutionConfirmation, consentLoading,
  confirmTitle, confirmDescription, onceLabel, primaryLabel, primaryMode, showAlwaysAction,
  listPanelHeight, confirmPanelHeight,   // 估算给主进程拉窗口用
  open(item: TuffItem, preset?: FlowTargetInfo[]): void  // 新一代：传了 preset 就直接用；同一条目的预取还在进行就复用它；否则 load
  prefetch(item: TuffItem): void          // show 时有「流转」行才调用；只取目标，不碰查询和选中；请求的 Promise 留着给 open 复用
  select(row): Promise<{ kind: 'dispatch'; selection: MetaFlowSelection } | { kind: 'confirm' } | null>
                                          // null = 被选择锁挡下、行被禁用，或回复已经过期
  grant(mode: 'once' | 'always'): Promise<MetaFlowSelection | null>
  deny(): void
  step(delta: number), hover(index: number), reset(): void
}
```

- **senderId** 和载荷类型都从共享的纯函数取（§5.1 抽出的 `buildCoreBoxFlowPayload`），避免 overlay 和 CoreBox 各算一遍。
- **代次计数和选择锁**：与 FlowSelector 现在的写法一致。
- **晚到的回复**：show、hide、重新打开都会让代次加一，回复不属于当前代次就丢弃。
- **确认页高度**：`FLOW_CONFIRM_PANEL_HEIGHT`（232）挪到 `shared/meta-overlay-geometry.ts`，改名为 `META_FLOW_CONFIRM_PANEL_HEIGHT`，计算式和注释原样带过去。
- **流转页高度**：`estimateMetaPanelHeight({ rows: targets.length, sections: groups, titledSections: groups })`。
  - 目标还没取回时，按 `max(单行估算, 上一页高度)` 计算，避免先缩后长。
  - 确认页按 `max(列表估算, 232)` 计算，退回列表时卡片不会先缩。

### 3.3 进入、选中、返回

**从操作列表进入流转页**

- 操作列表的 `handleActionExecute(row)` 遇到 `row.id === COREBOX_FLOW_TRANSFER_ACTION_ID` 时，执行 `flow.open(item, 已预取的目标)` 并推入 `flow`。
- **不发** `action.execute`，也不把 `visible` 设成假。

**选中目标**

- `flow.select(row)` 返回 `{ kind: 'dispatch', selection }` 时执行 `executeFlowTransfer(selection)`。
  - 与 `handleActionExecute` 的写法一致：先把本地 `visible` 设成假，再发 `action.execute { actionId: 'flow-transfer', itemId, item, flow: selection }`。
  - 等主进程 `hide()` 回来，再把栈复位。
- 返回 `{ kind: 'confirm' }` 时推入 `flow-confirm`。

**确认页**

- `grant(mode)` 成功后执行 `executeFlowTransfer(带 token 的 selection)`。
- `deny()` 后弹回 `flow`，焦点回到过滤框，当前项滚动到可见区域。

### 3.4 切页通知

- 监听 `[page, canGoBack, 当前页高度]`，`flush: 'post'`，三者有变化才发送 `ui.page`。
- 高度变化的典型场景：目标取回、进入确认页。
- show 时不发：主进程已经从请求里知道了页面。

### 3.5 键盘（window 捕获阶段，沿用现有监听）

| 按键 | actions | flow | flow-confirm |
| --- | --- | --- | --- |
| 组字中 | 交给 IME | 交给 IME | 交给 IME |
| Esc | 关闭（根页面时主进程会先拦下） | 能返回就弹回，否则关闭 | 授权还没发出：拒绝并弹回；已经发出：关闭 |
| ⌘K（不响应自动重复） | 关闭 | 关闭 | 关闭 |
| ↑↓ | 操作行 | 目标行（循环，跳过禁用行） | 无 |
| ↵（只认新按下的键） | 执行当前行；「流转」行是推入 | 选中目标 | 点击当前聚焦的按钮，否则执行主操作 |
| Tab | 默认行为 | 阻止 | 在按钮之间循环 |
| 操作快捷键 | `resolveMetaActionShortcut`（面板范围） | 不解析 | 不解析 |

- 根页面的 Esc：主进程先拦下并关闭面板，overlay 不会收到这个键。
- 子页面的 Esc：主进程放行，由 overlay 处理返回。

**主进程与 overlay 状态不一致时**

- 场景：overlay 刚推入子页面，`ui.page` 还没到达主进程，用户就按了 Esc。主进程会按根页面处理，直接关闭面板。
- 两步之间只隔一次本地 IPC（毫秒级），用户实际上来不及按出这个顺序。即使发生，也只是退回得多了一步，不会误派发。
- 直接打开的场景没有这个问题：主进程从 show 请求里就知道页面。

### 3.6 焦点

- 换页时立刻聚焦新页的过滤框（确认页聚焦主按钮），不等过渡结束，这样可以马上打字。
- 离场的那一页在过渡结束前用 `inert` 标记，避免指针和 Tab 进到正在滑走的页面里。

## 4. MetaPanel 拆分（`renderer/components/meta/`）

| 文件 | 职责 |
| --- | --- |
| `MetaPanel.vue` | 卡片外框、标题行（返回按钮、图标、标题、`header-meta` 插槽）、几何 CSS；主体用 `TxTransitionPush` 包住默认插槽 |
| `MetaPanelList.vue`（新） | 从 MetaPanel 迁出列表本体（`role=listbox`）、高亮板和 `syncHighlight` 的测量逻辑；暴露 `glideNext()`、`scrollActiveIntoView()` |
| `MetaPanelFilter.vue`（新） | 从 MetaPanel 迁出底部过滤框：`v-model:query`、`aria-controls` / `aria-activedescendant`、组字事件、`key` 插槽；暴露 `focus()` |
| `MetaFlowConfirm.vue`（新） | 从 FlowSelector 的 `#body` 迁出确认视图，接收已经算好的文案和加载态，向外 emit `deny` / `once` / `primary` |

**`MetaPanel.vue` 的接口**

```ts
props: {
  title, icon, shouldAnimate,
  page: string                 // 当前页面的 key
  direction: 'forward' | 'back'
  canGoBack: boolean
}
emits: back
slots: default（owner 渲染一个带 key 的页面根节点，class 为 MetaPanel-Page）、header-meta
```

- `view` prop 删除：确认页现在是独立的一页。
- 页面主体结构：`<TxTransitionPush :direction :duration="shouldAnimate() ? 220 : 0">`。
- 每个列表页的结构是 `MetaPanel-Page > MetaPanelList + MetaPanelFilter`：过滤框跟着自己的页面一起推走。标题行不推，「‹」和「选择目标」用淡入淡出切换。

**布局**

- 卡片仍然是 `display: flex; flex-direction: column; max-height: min(420px, 100vh - top - bottom)`。
- `TxTransitionPush` 的外层是 `flex: 1 1 auto; min-height: 0`，页面根节点是 flex 纵向布局，列表 `min-height: 0; overflow-y: auto`。
- 内容超过上限时，卡片被 `max-height` 封顶，列表在内部滚动。FLIP 测到的新高度就是封顶后的高度，所以动画终点正确。
- 高亮板仍在各自列表的滚动坐标系里，进场时按缩放归一化，测量时机与现在一致。

**行为保持不变**

- `MetaOverlay.test.ts` 现有的操作列表用例（按键、IME、自动重复、悬停跟随）不修改，必须照样通过。
- 只新增流转相关的用例。

## 5. CoreBox 渲染层

### 5.1 `useDetach`（`renderer/modules/box/adapter/hooks/useDetach.ts`）

- 把纯函数 `buildCoreBoxFlowPayload`、`resolveCoreBoxFlowActorPluginId`、`resolveFeaturePluginId` 抽到 `renderer/modules/box/meta-actions/core-box-flow-payload.ts`，overlay 和 CoreBox 共用。`useDetach` 改为重新导出它们，现有的导入路径保持可用。
- 新增 `openFlowPanel(item)`：
  1. DivisionBox 宿主（`body.division-box`）直接返回。
  2. `raw = toRaw(item)`，`payload = buildCoreBoxFlowPayload(raw, searchVal.value)`。
  3. 请求 `FlowEvents.getTargets({ payloadType: payload.type })`；失败时用 `[]` 兜底并记日志。
  4. 发送 `MetaOverlayEvents.ui.show`，请求体是 `buildCoreBoxMetaShowRequest(raw, { footerShown: !isUIMode && isCoreBoxFooterShown(), page: 'flow', flowTargets })`。
- `dispatchFlow(item: TuffItem, selection: MetaFlowSelection)`：
  - 载荷用 `toRaw(item)` 加当前查询现组，`senderId`、`actorPluginId`、`options` 与现在一致。
  - 三种底栏反馈不变。
  - 不再有面板需要关闭。
- 删除 `flowVisible`、`flowPayload`、`flowSessionId`、`flowAnchor`、`openFlowSelector`、`closeFlowSelector`。`corebox:flow-item` 和 `triggerTransfer` 都改为调用 `openFlowPanel`。

### 5.2 `useActionPanel`

- 选项 `openFlowSelector` 换成 `dispatchFlow?: (item, selection) => Promise<void>`。
- `itemAction` 的处理器和 `runUnawaitedAction` 把 `flow` 一路传下去。
- `executeAction(actionId, item, flow?)` 里 `case COREBOX_FLOW_TRANSFER_ACTION_ID` 的处理：
  - 有 `flow` 时 `await dispatchFlow(item, flow)`。
  - 没有 `flow` 时只记 debug 日志，什么都不做：进入流转页是 overlay 自己的事。

### 5.3 `useKeyboard`

- `buildCoreBoxMetaShowRequest(item, { footerShown, page?, flowTargets? })`：
  - `page === 'flow'` 时，`desiredPanelHeight` 用 `estimateFlowTargetsPanelHeight(flowTargets)`，与 overlay 用同一个函数，放在 `meta-flow-page.ts` 里导出。
  - 其他情况和现在一样。
- 删除 `:597` 对 `.FlowSelector` 的避让。流转页打开时焦点在 overlay 上，CoreBox 收不到按键。

### 5.4 `meta-panel-fill.ts` 改为 `useMetaPanelState()`

```ts
useMetaPanelState(): { fill: Readonly<Ref<boolean>>, blur: Readonly<Ref<boolean>> }
// fill = 合法载荷 && grown === true；blur = 合法载荷 && visible === true && blur === true
```

- 只有 `CoreBox.vue` 一个调用方，原地改名。文件名保持不变以减少改动，并在文件头注明。

### 5.5 `CoreBox.vue`

- 删除 FlowSelector、`useFlowPanelRoom` 的导入和接线，删除 `useSearch` 的第三个参数，`--meta-fill` 的条件只剩 `metaPanelFill`。
- `useActionPanel` 传入 `dispatchFlow: detach.dispatchFlow`。
- wrapper class 追加 `'CoreBox-Wrapper--meta-blur': metaPanelBlur`。
- `.CoreBoxRes-Main` 追加 `'CoreBoxRes-Main--footer-plate': footerOnScreen && !isCanvasLayout`。`footerOnScreen` 已经存在（`CoreBox.vue:1046`）。

**模糊（R11）**

```scss
.CoreBox-Wrapper > .CoreBox,
.CoreBox-Wrapper > .CoreBoxRes {
  transition: filter 0.22s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}
.CoreBox-Wrapper.CoreBox-Wrapper--meta-blur > .CoreBox,
.CoreBox-Wrapper.CoreBox-Wrapper--meta-blur > .CoreBoxRes {
  filter: blur(8px);
}
@media (prefers-reduced-motion: reduce) { /* transition: none */ }
html[data-low-battery-motion] /* 同上 */
```

- 2026-10-03 核对过：`div.CoreBox`（`CoreBox.vue:1897`）和 `div.CoreBoxRes`（`:1749`）都没有 `transition` 声明，可以直接加。实现前再 grep 一次 canvas / division-box 变体，有冲突就合并，不要覆盖。

**footer 底板（R15）**

```scss
.CoreBoxRes-Main::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 44px;                 /* CoreBoxFooter.vue 的 h-44px，同 META_PANEL_FOOTER_HEIGHT */
  z-index: -1;
  background-color: var(--tx-fill-color);
  transform: translateY(100%);
  pointer-events: none;
}
.CoreBoxRes-Main.CoreBoxRes-Main--footer-plate::before {
  transform: translateY(0);
  transition: transform 0.12s ease-out;   /* 与 .CoreBoxFooter.display 一致；收起时不过渡 */
}
```

- 注释写清楚原因：透明窗口里 `backdrop-filter` 把模糊副本叠在原图上，背后不透明才能盖住原图。并注明 `--meta-fill` 是同一类做法。
- **层叠关系**：`.CoreBoxRes-Main` 不建立层叠上下文，`z-index: -1` 落在最近的祖先层叠上下文里。没有模糊时是根，模糊时是带 filter 的 `.CoreBoxRes`。两种情况下底板都在行的下面、`.CoreBox-Mask`（-100）的上面，所以 footer 的 backdrop 一定包含底板和行。
- **布局差异**：widget 模式下 `.CoreBoxRes-Main` 自己就是 `overflow: hidden`，底板收起时同样会被裁掉。canvas 布局不加 class，没有底板。

### 5.6 `CoreBoxFooter.vue`（R16）

- `--fake-inner-opacity: 0.95` 改为 `--fake-inner-opacity: 0.5; --fake-opacity: 0.5;`。
- 注释写清楚：tuffex 的无条件 `!important` 规则读的是 `--fake-opacity`，那个缺陷已报告但不在这里修；两个变量一起写，规则修不修都不影响这里。
- 最终数值在 0.4–0.6 之间，按真机深色和浅色截图确定。

### 5.7 删除 floor 相关代码

- `useResize.ts`：删除 `floor` / `floorApplied` 选项和第 207 行的写入，恢复加地板之前的代码路径。
- `useSearch.ts`：删除 `windowFloor` / `windowFloorApplied` 参数，以及调用 `useResize` 时传下去的两个字段。
- 地板是 `85221fba1`（2026-10-03）加进来的，对照这个提交的 diff 反向删除，确保逐行回到原样。

## 6. TuffEx `TxTransitionPush`（`tuffex/src/transition/`）

### 6.1 API

```ts
// src/types.ts
export type TransitionPushDirection = 'forward' | 'back'
export interface TxTransitionPushProps {
  /** forward：新页从行内结束方向推入；back：从开始方向推回。 */
  direction?: TransitionPushDirection      // 默认 'forward'
  /** 毫秒；0 = 直接替换，不过渡。 */
  duration?: number                        // 默认 220
  easing?: string                          // 默认 'cubic-bezier(0.23, 1, 0.32, 1)'
  /** 切换时把容器高度从旧页过渡到新页。 */
  height?: boolean                         // 默认 true
  appear?: boolean                         // 默认 false
}
// emits: before-enter / after-enter / after-leave（透传 Transition 的事件）
// slot: default，只放一个带 key 的子元素
```

### 6.2 实现要点

- **结构**：根节点是 `<div class="tx-transition-push">`，相对定位；里面是 `<Transition :css="false">`（不设 mode，进场和离场同时进行），通过 JS 钩子驱动 WAAPI。不用 CSS class 驱动，这样方向、时长、中途打断都在同一处控制。
- **onBeforeLeave(el)**：
  1. 先记下容器当前高度 `h0`。如果正在动画中，读到的就是当前的动画值。
  2. 再把离场元素固定在原位：`position: absolute; top: el.offsetTop; left: el.offsetLeft; width: el.offsetWidth`，让它脱离文档流。
- **onEnter(el, done)**：
  1. 新元素已经插入，容器高度为 `auto`，读出 `h1`。
  2. `height` 为真且 `h0 !== h1` 时，执行 `container.animate([{ height: h0 }, { height: h1 }], { duration, easing })`，结束后清掉。
  3. 同时让新元素从 `translateX(±100%)` 滑到 `0`。
- **onLeave(el, done)**：离场元素从 `0` 滑到 `translateX(∓100%)`。
- **方向与 RTL**：`forward` 时新页从 `+100%` 进、旧页往 `-100%` 出，`back` 反过来。容器 `dir="rtl"` 时整体取反。
- **裁剪**：过渡期间容器 `overflow: clip`，结束后恢复，避免裁掉内容的焦点环。
- **中途打断**：新一次切换时，先 `cancel()` 掉上一次的容器高度动画，从当前计算值开始新的动画。Vue 会对上一次未完成的离场调用 `leaveCancelled` / 移除节点。
- **减弱动效**：`matchMedia('(prefers-reduced-motion: reduce)')` 为真时只做透明度淡入淡出（120ms），高度直接落定。
- **`duration` 为 0**：所有钩子立即调用 `done()`，没有任何动画。

### 6.3 测试与文档

**单测**（`tuffex/src/transition/__tests__/transition.test.ts` 追加）

- 用 `Element.prototype.animate` 的 mock 断言以下情况：
  - 两个方向的位移关键帧。
  - 离场元素带 absolute 内联样式。
  - 容器高度的关键帧是 `[h0, h1]`。
  - `height=false` 时没有高度动画。
  - `duration=0` 时没有 `animate` 调用，且子元素立即替换。
  - 减弱动效时只有透明度关键帧。
  - 中途打断时上一次动画被取消。

**文档**（`apps/nexus`）

- `transition.{zh,en}.mdc`：
  - 在 `### TxTransitionSmoothSize Props` 后面加 `### TxTransitionPush Props`。
  - 「语义化组件」表补一行。
  - 新增一节 `## 推入翻页（Z）` / 英文对应标题，里面放 `TuffDemoWrapper{demo="TransitionTransitionPushDemo"}`。
  - 最佳实践补一条：用于层级导航，不用于平级的 Tab 切换。
- demo：`apps/nexus/app/components/content/demos/TransitionTransitionPushDemo.vue`，一个两三页的小卡片，可以前进和返回，并登记到 `demo-registry.ts`。
- `packages/tuffex/CHANGELOG.md` 的 `## [Unreleased]` 记一条。如果 Nexus 的 changelog 页也有 `[Unreleased]` 约定，就同步一条，否则不动。
- 标题写法照 `.trellis/spec/frontend/nexus-docs-structure.md` 的固定栏目名，小标题用句首大写。中英文 H2/H3 数量必须一致。
- 正文最后一个 `<TuffDocSourceLink />` 之后不能再放内容。

## 7. 兼容、回滚与取舍

**兼容**

- 所有协议字段都是可选追加，旧载荷照样能读：`panelState` 缺 `blur` 按 `false` 处理，`itemAction` 缺 `flow` 不派发。
- overlay 和 CoreBox 同属一个渲染包，主进程与渲染层同一个版本发布，不存在新旧混跑。

**回滚**

按提交粒度回退，提交拆分见 implement.md。

- footer 毛玻璃是独立提交，可以单独回退。
- TuffEx 原语也是独立提交，但回退它要连同 MetaPanel 一起回退。

**取舍**

- **页面放在 overlay 而不是 CoreBox**：overlay 本来就压在插件视图上面，又已经拥有 ⌘K 的窗口高度逻辑。放回 CoreBox 就要继续维护「窗口让位 + 跨渲染层交接」，而这正是本任务要删掉的。
- **派发留在 CoreBox**：沿用用户的决定。查询文本、底栏反馈、`toRaw` 克隆规则都在 CoreBox。overlay 只交出目标和 token。
- **CoreBox 先取目标再打开**：直接打开的场景可以一次拉对窗口高度，避免「先按单行拉高，再按真实目标数拉高」的两次跳动。代价是 ⌘⇧D 到面板出现之间多一次本地 IPC（毫秒级）。
- **切页时窗口只拉高、不缩小**：退回操作列表时卡片在窗口里缩小，多出来的空间由 meta-fill 铺实色。如果切页时也缩窗口，每次进出都会让窗口抖动。
- **过滤时卡片不加动画**：保持现有的即时伸缩，只有切页时才走 FLIP。这也是没有用 `TxAutoSizer`（它会对所有尺寸变化做动画）的原因。
- **footer 用底板而不是修 tuffex 全局规则**：
  - 修全局规则只能把填充恢复到 0.95，残影消失但仍然看不到模糊，并且会改变全局观感。
  - 底板让模糊真正起作用，影响范围只在 CoreBox 结果区。
