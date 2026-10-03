# Design — CoreBox 常用幽灵宫格空态 + 流转面板 MetaK 化

路径前缀：`renderer/` = `apps/core-app/src/renderer/src/`，`shared/` = `apps/core-app/src/shared/`，`main/` = `apps/core-app/src/main/`。

## 0. 边界

| 区块 | 文件 | 性质 |
| --- | --- | --- |
| A 幽灵宫格 | `renderer/components/render/BoxGrid.vue`，中英两份语言包 | 改 |
| B MetaK 外壳抽取 | 新增 `renderer/components/meta/MetaPanel.vue`；`renderer/views/meta/MetaOverlay.vue`；`renderer/components/meta/MetaActionItem.vue`（加 `trailing` 插槽） | 抽取，MetaOverlay 的 DOM 与 class 不变 |
| C 流转面板 | `renderer/components/flow/FlowSelector.vue`，中英两份语言包 | 重写模板和交互，事件契约不变 |
| D 窗口让位 | `renderer/modules/box/adapter/hooks/useResize.ts`、`useSearch.ts`（透传）、`useDetach.ts`；新增 `renderer/modules/box/adapter/hooks/useFlowPanelRoom.ts`；`renderer/views/box/CoreBox.vue` | 改 |
| E 图标 | `apps/core-app/uno.config.ts`；新增 `shared/flow-target-icons.ts` 及其测试 | 改 |
| H–K（范围扩大） | `useDetach.ts`（R8、R9）；`main/modules/box-tool/core-box/meta-overlay.ts` 与 `FlowSelector.vue`（R10）；`useKeyboard.ts`（R11） | 改 |

不动：主进程的 Flow 派发、授权、确认 token；推荐引擎的分区算法。MetaK 主进程的窗口逻辑只在 R10 范围内改动：流转动作的高度交接，其他动作的时序保持不变。

## A. 幽灵宫格（BoxGrid）

- 判定沿用 `showHabitualEmptyState`（有 `proposed`、没有 `habitual`）。`TxEmptyState` 换成三段：
  1. 分区标题（不变，保留 `data-flip-key="title:habitual"`）。
  2. 空格子网格：直接用 `.BoxGrid` 容器，同样的 `p-4`、`--grid-cols`、`--grid-gap` 和 `size-*`，所以空格子与真实格子同轨道、同位置。格子数 = `visibleColumns`（它已经封顶到布局声明的列数，推荐页最多 6 列，`recommendation-engine.ts:131`）。容器 `aria-hidden="true"`，格子是 `<span>`，不进 `registerItem`、不带 `data-flip`、没有快捷键。
  3. 说明行：`常用项目会随使用出现 · [⌘K] 固定到推荐`，居中。⌘K 用 `shortcutChordLabel({ code: 'KeyK' }, isMac)`，与 MetaOverlay 的 `toggleKeyLabel` 同源，非 macOS 显示 `Ctrl+K`。「固定到推荐」复用 `corebox.actions.pin`，保证和菜单项一字不差。
- 空格子的造型对齐 `BoxGridItem` 的盒子：圆角 16px，内边距 8px（compact 为 6px），1px **虚线**边框；内部画一块 36×36、圆角 10px 的图标位，加一条标签位短条，两者都是静态浅填充，不带闪光。它不是加载占位，所以不用 TxSkeleton 的动效。compact 时隐藏标签条，图标位缩到 0.78，和真实格子一致。颜色只用 `--tx-*` token，具体深浅在真机的明暗两套主题下定。
- 契约不变：提示不进入 `sectionsData` / `items` / `itemIds` / `registerItem`；列表焦点从 0 开始，快捷键从 ⌘1 开始；出现真实常用格子即消失。

## B. MetaK 外壳 `MetaPanel.vue`

把 MetaOverlay 里卡片本身的部分整体搬进来，两个面板共用一份：

```ts
// renderer/components/meta/MetaPanel.vue
props: {
  title: string            // 标题行文字，同时作为 dialog 的 aria-label
  icon: ITuffIcon          // 标题行图标
  listId: string
  listLabel: string        // listbox 的 aria-label
  placeholder: string
  activeIndex: number      // 扁平化后的键盘下标，对应行上的 data-meta-row-index
  activeDescendant?: string
  highlight: boolean       // 当前行能否承载高亮板（行存在且未禁用）
  layoutKey: unknown       // 行集合变化时跟着变，用来触发重新测量
  view?: 'list' | 'body'   // 'body' 时用 body 插槽替换列表和搜索行（流转的确认视图用）
}
model: query: string
emits: composition(composing: boolean)
slots: default（分组和行）、header-meta、filter-key、body
expose: focusFilter(), glideNext()
```

- DOM 与 class 和现在的 MetaOverlay 一模一样：`section.MetaPanel` > `header.MetaPanel-Header`（`.MetaPanel-HeaderIcon`、`.MetaPanel-HeaderTitle`）> `div.MetaPanel-List`（`role="listbox"`，内含 `.MetaPanel-Highlight`）> `footer.MetaPanel-Filter`（`input.SearchInput`，combobox ARIA）。卡片的 CSS 整体随迁：圆角、ring 加 elevation、组标题、空态行、搜索行。
- 高亮板逻辑（`syncHighlight`、缩放归一化、滚动偏移、运动总闸）从 MetaOverlay 搬进外壳。「这一步是否跟随指针滑动」由原来的 `let animateHighlight` 改成一次性开关 `glideNext()`：父组件在指针悬停改动 `activeIndex` 之前调用它，下一次同步消费掉；键盘步进、过滤、首次显示都不调用，于是原地落位，语义和现在完全一样。
- MetaOverlay 只保留自己独有的部分：遮罩根节点 `.MetaOverlay`、几何 CSS 变量、Transition、键盘、显示与隐藏、动作执行。**验收：`MetaOverlay.test.ts` 不改一行即可全部通过。**
- 几何 CSS 变量提成纯函数 `resolveMetaPanelCssVars(anchor)`，放进 `shared/meta-overlay-geometry.ts`，两个面板都调它，变量仍挂在各自的根节点上（MetaOverlay 测试读的就是 `.MetaOverlay` 上的 `--meta-panel-bottom`）。
- `MetaActionItem` 新增可选插槽 `trailing`，渲染在快捷键位置；不传时行为不变。

## C. 流转面板 `FlowSelector.vue`

### 结构

```
Teleport(body) > Transition(meta-panel)
  div.FlowSelector（遮罩根节点：fixed inset 0，20% --tx-overlay-color，不模糊，点击遮罩关闭；
                   挂几何变量和 z-index）
    MetaPanel
      标题行：条目图标 + 条目名；header-meta 放「选择目标」
      列表：按插件分组 → MetaActionItem.FlowTargetItem 行
      body（确认视图）
      搜索行：placeholder「搜索目标…」，filter-key 放 Esc 键帽
```

- 根节点 class 必须保留 `.FlowSelector`（`useKeyboard.ts:596` 靠它判断）。
- 锚点由父组件传入：`anchor: 'footer' | 'corner'`。`useDetach.openFlowSelector` 在打开时按 MetaK 同一条规则计算：不在 UI 模式且 `.CoreBoxFooter-Sticky.display` 存在则为 `footer`，否则为 `corner`。`isCoreBoxFooterShown` 从 `useKeyboard.ts` 导出复用。

### 数据

- 标题行：CoreBox 发起的载荷是 `{ item, query }`。取 `item.render.basic.title` 作为标题，`normalizeCoreBoxIcon(item.render.basic.icon)` 作为图标；拿不到条目时（防御）标题用「选择目标」，图标用 `i-ri-share-forward-line`，header-meta 留空。原始 JSON 预览条删除（D4）。
- 分组：按 `pluginId` 聚合，组标题用 `pluginName || pluginId`，顺序按主进程返回顺序里第一次出现的位置。
- 行：图标 `normalizeCoreBoxIcon(target.icon || target.pluginIcon)`（修 D1 的写法问题，`ri:x` 转为 `i-ri-x`，空值落到 `i-ri-puzzle-line`）；标签取 `target.name`；副标题取 `target.description || target.adaptationHint`（截断，完整文字在 title 提示里）；`requireConfirm` 的行在 trailing 插槽放一枚盾牌图标（`i-ri-shield-check-line`，带「需要确认」的无障碍标签）。类型标签删除（D3）。
- 过滤：同 MetaK，名称或说明包含查询串，或名称按子序列匹配；插件名包含也算命中。
- 加载：`useDeferredLoading(loading)`。行数事先未知，按 spec 不用骨架屏，只放一行 `.MetaPanel-Empty`（小 spinner 加「加载中…」）；150ms 内返回就什么都不显示。加载期间不显示「没有可用的目标」。

### 键盘（修 D6）

- 在 `window` 的 **捕获阶段**监听，与 MetaOverlay、计算历史面板一致。处理过的键一律 `preventDefault()` 加 `stopPropagation()`，于是 CoreBox 挂在 document 捕获阶段的 `onKeyDown` 收不到 ↵、↑↓、Esc，也就不会再执行背后的结果、移动背后的焦点或关掉 CoreBox。
- 列表视图：↑↓ 循环跳过禁用行并滚动到可见；↵ 只认新按下的键（`event.repeat` 忽略）；Esc 关闭；输入法组字期间（`isImeComposing` 或 composition 事件）方向键和 ↵ 交给输入法。
- 防连按：一次选择发出后（包括等待 `checkConsent` 的过程）上锁，直到面板关闭或重新打开。避免连按 ↵ 把同一份数据派发两次。
- 指针：行的 `pointermove` 调 `glideNext()` 再改 `activeIndex`；面板出现在静止的光标下面时不抢 ↵ 的当前项（与 MetaK 一样）。

### 面板内确认视图（R3，同时修 D5）

- `checkConsent` 返回「需要授权」或「需要确认」时，外壳切到 `view="body"`：列表和搜索行收起，换成确认块，标题行保留。
- 确认块：标题（13px/600），说明（12px，次要色），按钮右对齐。三种文案和按钮组合与现在完全一致：拒绝 / 仅本次 / 主按钮。按钮用 TuffEx `TxButton` 的标准尺寸与类型，不再手写 class。
- 焦点：进入确认视图时落到主按钮（↵ 由按钮原生触发，Tab 在按钮之间切换）；Esc 等同「拒绝」，退回列表并把焦点还给搜索框。点遮罩则整体关闭。
- **D5**：说明文案的占位符是 `{source}` / `{target}`（两份语言包都是），现状却传了 `{ sender, target }`，发送方永远是空的。改为传 `source`，测试 mock 同步改成读 `source`。
- token 语义不变：`grantConsent` 成功后 emit `select({ targetId, consentToken, confirmationToken })`；拒绝时不发 `grantConsent`，也不 emit。

### 高度估算（供 D 使用）

- 列表视图：`estimateMetaPanelHeight({ rows: max(全部目标数, 1), sections, titledSections })`，与 MetaK 同一套常量。按**未过滤**的目标估算，过滤时不缩窗口，与 MetaK 估一次即定的做法一致。
- 确认视图：`max(列表估算, FLOW_CONFIRM_PANEL_HEIGHT)`。常量按 4 行说明预留，最终值在真机上量出来再定，面板自身 `max-height` 加内部滚动兜底。
- 所需窗口高度 = `resolveMetaOverlayWindowHeight({ anchor, desiredPanelHeight })`，直接复用（`min(600, ceil(64 + min(h, 420) + 底部内缩))`）。可见时 emit `room(height)`，隐藏时 emit `room(0)`。

## D. 窗口让位（`useResize` 加地板）

- `useResize` 新增可选项 `floor?: Ref<number>`（CSS px，0 表示无）。`sendLayoutUpdate` 在现有的高度计算（包括「流式加载期间只增不减」那条规则）之后取 `max(height, floor)` 再 clamp 到 600。`floor` 变化时立即 `sendLayoutUpdate('panel:floor', { force: true })`，不走 80ms 节流。
- `useSearch(boxOptions, clipboardOptions, options?)` 新增第三个可选参数 `{ windowFloor?: Ref<number> }`，原样透传给 `useResize`。现有调用方和测试不用改。
- 新 composable `useFlowPanelRoom()` 由 CoreBox 在 `useSearch` 之前创建（以下为最终实现，几经修订）：
  - 持有 `floor`（面板所需的窗口高度，关闭时为 0）和 `floorApplied`。后者由 `useResize` 每次算高度时写入 `floor > 0 && floor > 结果内容高度`，是铺底判定的单一来源；经 `useSearch` 第三个参数的 `windowFloorApplied` 透传。
  - `fill = floorApplied || 保持中`。`floorApplied` 由真变假时（释放地板，或加载后地板降到结果高度以下）保持 240ms 再落下，覆盖主进程 120–220ms 的收缩动画（`animation.coreBoxResize`，见 meta-overlay 契约）。地板归零时同步把 `floorApplied` 置假，避免 `useResize` 的测量还没出来时铺底卡住不灭。
  - 不用「地板 > 申请那一刻的 innerHeight」来判定：从 ⌘K 交接过来时，窗口已经是 ⌘K 撑高后的高度，那样判定会漏掉铺底（impl-m 发现）。
  - 卸载时清掉计时器。
- 主进程的 `applyLayoutUpdate` 有结果时按 `payload.height` clamp 到 `[COREBOX_MIN_HEIGHT, 600]`（`core-box/index.ts`），不用改主进程。
- 铺底：复用现有的 `CoreBox-Wrapper--meta-fill`，条件为 `metaPanelFill || flowPanelFill`。
- 面板关闭时，`room(0)` 在 Transition 的 `after-leave` 里发出，另有 400ms 兜底（淡出途中窗口被隐藏、没有帧可跑时 after-leave 不会触发），保证面板先完整淡出，窗口再收缩。
- 边角情况：在短列表上，⌘K 先让主进程把窗口拉高，选「流转」后主进程又把高度还回去，接着流转面板再拉高一次，造成回弹。真机实测：开启动画时 488 → 364 → 536，约 170ms。用户已决定在本任务内根治，见 J 节。

## E. 流转目标图标

- 新增 `shared/flow-target-icons.ts`：导出 `BUILTIN_FLOW_TARGET_ICON_CLASSES`，列出内置目标（QuickOps、系统分享，外加 `pluginIcon`）所用图标对应的 `i-ri-*` class。这是纯模块，`uno.config.ts` 照现有做法 import 并展开进 safelist，同时加进 `configDeps`。
- 防漂移测试 `shared/flow-target-icons.test.ts`：
  - 读取 `main/modules/quick-ops/index.ts`、`main/modules/flow-bus/native-share.ts`、`main/modules/flow-bus/module.ts` 的源码，抽出流转目标声明中的 `icon: 'ri:…'` / `pluginIcon: 'ri:…'`，断言每一个都在列表里。仓库里已有同类做法：`quick-ops-flow-ai-adapter-audit.ts` 也是按源码正则解析目标清单。
  - 正向对照：抽取结果非空，并且包含 `ri:tools-line` 与 `ri:share-line`，防止正则失效后「什么都没抽到」也算通过。
  - 每个 class 都必须存在于已安装的 `@iconify-json/ri` 集合里（同 `MetaActionItem.test.ts` 的做法）。
- 第三方插件运行时声明的图标仍然受 UnoCSS 只做静态抽取的限制。这一点记为旁路问题，不在本次范围内。

## F. 文案

- `coreBox.sections.habitualEmptyTitle`：zh「常用项目会随使用出现」，en “Regular picks appear as you use Tuff”。删掉不再使用的 `habitualEmptyHint`。
- 新增 `flow.requiresConfirmation`：zh「需要确认」，en “Requires confirmation”。加载行复用 `common.loading`。
- `flow.searchTargets` 的省略号统一成 `…`（zh「搜索目标…」，en “Search targets…”）。
- 删掉不再使用的 `flow.selectTargetDesc`、`flow.navigate`、`flow.confirm`、`flow.cancel`。删除前 grep 确认只有 `FlowSelector.vue` 在用。

## G. 测试

- `views/meta/MetaOverlay.test.ts`：不改，必须全绿（B 的回归门）。
- `components/meta/MetaActionItem.test.ts`：补一条，不传插槽时 DOM 不变，传 `trailing` 时渲染在快捷键位置。
- `components/flow/FlowSelector.test.ts`：现有四条按新结构保留（行 class `FlowTargetItem`、按钮仍是 `TxButton`；mock 的 `t` 改读 `source`）；新增：
  - 按插件分组、组标题、行顺序；
  - 过滤以及「没有可用的目标」；
  - ↑↓ 循环、↵ 选中、`event.repeat` 被忽略；
  - 面板打开时，document 捕获阶段的监听器收不到 ↵、↑↓、Esc（D6）；
  - 确认视图里按 Esc 退回列表，不发 `grantConsent`，不 emit；
  - 连按 ↵ 只产生一次 `checkConsent` 和一次 select；
  - `ri:` 图标被归一化为 `i-ri-`，`pluginIcon` 作为兜底；
  - 锚点变量（footer 为 52px，corner 为 12px）；
  - `room` 事件的高度与 `resolveMetaOverlayWindowHeight` 一致，隐藏时为 0。
- 新增 `components/render/BoxGrid.test.ts`：只有 `proposed` 时出现幽灵宫格，格子数 = 可见列数且不超过布局声明的列数，`aria-hidden`；`registerItem` 只收到真实行，第一行的快捷键是 ⌘1；出现 `habitual` 分区时幽灵宫格消失；普通搜索分区、无分区宫格都不出现；说明行里有 ⌘K 键帽和 `corebox.actions.pin`。
- `modules/box/adapter/hooks/useResize.test.ts`：地板抬高高度；释放后回到测量值；clamp 到 600；地板变化立即发送，不节流。
- 新增 `useFlowPanelRoom` 的测试：需要拉高时 fill 为真；不需要时为假；release 后保持 240ms 再落下（fake timers）；卸载时清理计时器。
- `shared/flow-target-icons.test.ts`：见 E。
- CoreBox 的三份视图测试会 mock `useDetach`，如果模板新增了 `detach.flowAnchor` 之类的绑定，同步补上 mock 字段。

## 兼容与回滚

- FlowSelector 对外事件不变（`close`、`select({ targetId, consentToken?, confirmationToken? })`），新增的 `room` 事件和 `anchor` 属性都是可选的。
- `useSearch` 和 `useResize` 的新参数都是可选的，不传时行为与现在完全一致。
- 回滚点：A、B+C、D、E 四块可以各自独立 revert；B 和 C 需要一起回滚（C 依赖外壳）。

---

## 范围扩大（2026-10-02，用户确认并入 R8–R11）

### H. R8 派发载荷可克隆（`useDetach.ts`）

- `flowPayload` 由 `ref` 改为 `shallowRef`，`openFlowSelector` 用 `buildCoreBoxFlowPayload(toRaw(item), query)` 构造载荷。这是仓库里的既有写法，参见 `useConversationHistory.ts:87` 与 `useHomeConversation.ts:262` 对 `toRaw` 的说明：Vue 的响应式集合会把赋进来的 Proxy 解包成原始对象存储，所以 `toRaw(item)` 拿到的整棵对象都是原始对象。
- 单测：用 `reactive()` 包一个条目，走 `openFlowSelector` → `dispatchFlow`，断言交给 `transport.send` 的载荷能被 `structuredClone`。负向对照：还原成深层 `ref` 时测试必须变红。

### I. R9 流转结果走底栏反馈（`useDetach.ts`）

- `dispatchFlow` 里的三个 toast 换成 `showCoreBoxFooterFeedback(message, tone)`：成功用 `'success'`，权限不足和失败都用 `'error'`，文案沿用原来的 i18n key。分离窗口的 toast 不动。
- 单测：三种结果各调用一次对应的 `message` / `tone`，并断言不再调用 toast（mock `vue-sonner`）。

### J. R10 ⌘K → 流转的高度交接（主进程 `meta-overlay.ts` 与渲染端 `FlowSelector.vue`）

现状：`executeAction` 对 CoreBox 的条目动作先 `broadcastToWindow(itemAction)`，接着同步调用 `this.hide()` → `releaseHostLayout()`，没有持有的重放时就 `setHeight(restoreHeight)`。流转面板的地板要等它挂载、算出高度之后才会到达，于是窗口先缩再长。

做法：复用现成的「持有并重放」机制，不新增第二套高度状态。

- 主进程：对打开流转面板的那个动作（id 用共享常量，不写裸字符串；先确认这个常量定义在哪，必要时提到 `shared/` 或 utils），广播之后**不立即** `hide()`，而是进入交接等待（`handOffPending`，带一个上限计时器，约 500ms）。等待期间：
  - CoreBox 的布局更新照常进入 `holdLayoutUpdate`，被持有为最新的重放；第一次被持有时立即 `hide()`，`hide()` 按既有规则优先运行这个重放而不是 `restoreHeight`，窗口直接到达流转面板需要的高度。
  - 计时器到期仍没有布局更新时 `hide()`，走原规则（有重放就重放，否则 `restoreHeight`）。
  - `dismissWithHost()` / `destroyRenderer()` 清掉计时器与等待状态，行为同现有的提前结束。
  - overlay 渲染端执行动作时已经把面板内容本地隐藏了，交接期间 overlay 视图透明，只是还没交还焦点；上限 500ms 内结束。
  - 铺底连续：等待期间 `panelState` 仍是 `grown: true`；`hide()` 之后沿用既有的 hand-back 观察逻辑，在尺寸动画落地前保持 `grown`。
  - 其他条目动作与插件动作的时序**完全不变**。
- 渲染端（`FlowSelector.vue`）：加载目标期间上报的 `room` 取 `max(单行估算对应的窗口高度, 打开那一刻的 window.innerHeight)`，也就是加载完之前不缩窗口。加载完成后再按真实目标数上报，窗口最多单向变化一次。否则交接时拿到的是按 1 行估算的小地板，窗口还是会先缩。
- 测试：主进程 `meta-overlay.test.ts` 补交接场景（重放优先、超时回退、提前结束、其他动作不受影响、`panelState` 序列）；FlowSelector 测试补加载期间 `room` 不小于打开时的窗口高度。
- 规格：Phase 3 更新 `corebox-meta-overlay-contracts.md` 的 Hand back 条款与错误矩阵。

### K. R11 焦点滚动不在装不下焦点行的视口里执行（`useKeyboard.ts`，必要时加 `CoreBox.vue`）

- 先证实机制。疑似路径：Esc 撤附件被当作「已处理的键」，之后执行 `scrollActiveItemIntoView()`；那一帧窗口还停在 56px 的缩起状态，有效视口（扣掉底栏）只有几像素，`itemBottom > effectiveHeight` 分支把列表滚到「焦点行贴底」，窗口长高后焦点行就变成贴顶（实测 183）。证实方式任选：单测模拟视口矩形小于行高，或真机复现（附件只在剪贴板内容刚被看到的 5 秒内自动挂上，最稳的办法是重启隔离实例后立即唤出 CoreBox，不允许写系统剪贴板）。如果证据指向别的路径，按证据修，并在报告里写明。
- 修法：有效视口装不下焦点行时（`effectiveHeight < 行高`）跳过这次滚动，因为这时只可能是窗口缩起或正在长高，滚动只会把列表卷走。正常窗口里的键盘滚动不受影响。
- 单测：视口小于行高时不调用 `scrollTo`；视口正常、焦点行在下方或上方时照旧滚动（防止守卫把正常滚动也挡掉）；外加负向对照。

#### K 的补充（真机第二轮，2026-10-03）

- 视口守卫只拦得住「视口比一行还矮」的情况。开着尺寸动画时，`revealActiveItemAfterReflow` 那次 260ms 补滚落在窗口长高的半途，视口已经比一行高，守卫放行，按差值滚动（实测 144）。
- 根因：`CoreBox.vue` 的 `handleGridColumnsChange` 只比较列数，于是新结果集的宫格首次挂载时上报的列数也触发了补滚。这次补滚原本只服务于「同一批格子因宽度变化而重排」（预览窗把宫格挤成更多行）。
- 修法：记下上一次上报列数时对应的 `res.value`，只有同一个结果集才补滚；新结果由结果 watcher 处理（新查询回到顶部，被跟随的行只在原本可见时才跟随）。
- 第 0 项规则：焦点回到第 0 项、且这一行在视口上方时，直接 `scrollTo(0, 0)`。第 0 项上方只有分区标题和不可聚焦的常用引导，应该一起露出来。
