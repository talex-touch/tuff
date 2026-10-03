# CoreBox 常用幽灵宫格空态 + 流转面板 MetaK 化

## Goal

CoreBox 里两处 UI 和启动器本身的视觉语言脱节，这次一并修好：

1. 推荐页「此刻常用」没有常用项时的提示，现在是一块网页式空状态。改成「幽灵宫格」：在宫格将来出现的位置画出淡色的虚线空格子，下面配一行说明。
2. 流转（选择目标）面板是老式的居中模态框，图标全空、列表压到底栏上，还露出原始 JSON。按 MetaK（⌘K 操作面板）的视觉语言和交互重做。

技术设计见 `design.md`，执行步骤见 `implement.md`。

## Background（已核实的事实）

### 常用区空态

- 提示是 2026-10-01 加的（`2678e5fbe`）。当天用户先确认「保留标题 + 轻量的学习／固定提示」，随后又要求居中，于是做成了 TuffEx `TxEmptyState` 的 `small` + `center` + 纯文本（`BoxGrid.vue:168-185`，判定见 `BoxGrid.vue:119-123` 的 `showHabitualEmptyState`）。2026-10-02 用户圈出这块，要求调整。
- 契约（`.trellis/spec/main-process/recommendation-freshness-contracts.md`）：提示永不进入 `sectionsData` / `items` / `itemIds` / `registerItem`；列表焦点从 0 开始，数字快捷键从 ⌘1 开始；出现真实常用格子就移除；普通搜索分区和无分区宫格永不显示。
- 常用宫格最多一行 6 格（`recommendation-engine.ts:131` `GRID_TIER_COLUMNS`）。BoxGrid 按宽度算列数（`box-grid-layout.ts`，最小格宽 84px，预览窗压缩时 52px）。格子的结构见 `BoxGridItem.vue`：圆角 16px、内边距 8px、36px 图标、11px 标题、可选徽标。
- `BoxGrid.vue` 目前没有单元测试覆盖这块空态，昨天只在浏览器里验证过。

### 流转面板

- 组件是 `components/flow/FlowSelector.vue`，挂在 `views/box/CoreBox.vue:1471`。入口有两个：⌘K 面板里的「流转」（`useActionPanel.ts:163` → `useDetach.openFlowSelector`），以及插件视图里的流转快捷键（`plugin-view-controller.ts:327` → `FlowEvents.triggerTransfer` → `useDetach.ts:326`）。
- 现状：Teleport 到 body，480px 宽，居中，遮罩是 `bg-black/40` 加 `backdrop-blur`；顶部依次是 JSON 预览条和搜索框；每行一个 40px 图标框，加名称、插件名、说明和类型标签；底部是按键提示和取消按钮；需要授权或确认时，再叠一个居中的确认框。
- 键盘：CoreBox 的 `onKeyDown` 挂在 document 的**捕获**阶段（`useKeyboard.ts:1048`），而 FlowSelector 挂在 document 的**冒泡**阶段，所以每次按键 CoreBox 都先处理。CoreBox 只在 ⌘ 组合键上避让流转面板（`useKeyboard.ts:596`），↵ 和 ↑↓ 没有避让。
- MetaK 参照：`views/meta/MetaOverlay.vue`、`components/meta/MetaActionItem.vue`、`shared/meta-overlay-geometry.ts`，契约在 `.trellis/spec/main-process/corebox-meta-overlay-contracts.md`。卡片 340px，锚在右下角：有底栏时落在底栏 ⌘K 提示上方（距底 52px），否则落在角上（距底 12px）。遮罩是 20% 的 `--tx-overlay-color`，不模糊。卡片由三段组成：40px 标题行、分组列表（32px 行、24px 组标题、6px 内边距，加一块跟随指针的高亮板）、40px 底部搜索行。主进程会在面板放不下时把窗口拉高，拉高的部分用 `CoreBox-Wrapper--meta-fill` 铺上实色。
- 主进程在有结果时按 `payload.height` clamp 到 `[COREBOX_MIN_HEIGHT, 600]` 设置窗口高度（`core-box/index.ts` `applyLayoutUpdate`），渲染端的高度来自 `useResize`（由 `useSearch.ts:2135` 调用）。
- 现有 `FlowSelector.test.ts` 锁住了确认流程：需要确认的目标不会直接 emit；取消时既不发授权也不派发；确认后带着 `confirmationToken` emit；缺授权时显示组合文案。

## Decisions（2026-10-02 用户已确认）

- 两处合成一个 Trellis 任务。
- 常用空态选「幽灵宫格」，代码放在 CoreApp 的 BoxGrid 内部，空格子与真实宫格共用同一份网格定义，不做成 TuffEx 组件。
- 流转面板照 MetaK 做：右下角 340px 卡片，叠在底栏 ⌘K 的上方，配轻遮罩（不模糊）；目标按插件分组，32px 行加跟随高亮板，搜索框放在底部，图标修好。
- 需要授权或确认的目标，在面板内原地切换到确认视图，Esc 退回列表，不再叠第二层弹窗；授权 token 和确认 token 的语义不变。
- 窗口放不下面板时，学 MetaK 临时拉高 CoreBox 窗口，关闭后缩回；拉高的部分铺实色。用户接受这会改动 `useResize`，由单测兜住回归风险。
- **2026-10-02 范围扩大**：真机验证中发现四个原有问题，用户选择全部并入本任务，对应下面的 R8–R11。

## Requirements

- **R1 常用幽灵宫格**：用空格子网格加居中说明行替换 `TxEmptyState`。空格子与真实宫格同轨道、同列数（列数 = 可见列数，不超过布局声明的列数），非交互，`aria-hidden`。说明行是「常用项目会随使用出现 · [⌘K] 固定到推荐」：键帽按平台显示（非 macOS 为 `Ctrl+K`），「固定到推荐」复用菜单项文案 `corebox.actions.pin`。上文契约里的焦点和快捷键规则全部保留。
- **R2 流转面板 MetaK 化**：几何、遮罩、标题行（条目图标、条目名、「选择目标」）、按插件分组、32px 行、高亮板、底部搜索行、动效都与 MetaK 一致。同时修复：
  - D2：列表压到底栏（截图里最后一行画在底栏下面）。
  - D3：删掉类型标签。`getTargets` 只返回「支持当前载荷类型且已启用」的目标（`flow-bus.ts:556`、`target-registry.ts:232`），标签没有信息量。
  - D4：删掉原始 JSON 预览条（`FlowSelector.vue:291-304`）。CoreBox 的载荷是 `{ item, query }`（`useDetach.ts:123`），条目信息改由标题行呈现。
  - 加载用 `useDeferredLoading` 控制的单行提示（行数事先未知，按 spec 不用骨架屏）；空结果时显示「没有可用的目标」。
- **R3 面板内确认**：取代独立确认框，保留现有三种文案和按钮组合以及 token 语义；进入确认视图时焦点落在主按钮，Esc 等同「拒绝」并退回列表。同时修复 D5：两份语言包的占位符都是 `{source}` / `{target}`，`FlowSelector.vue:82-85` 却传了 `sender`，确认说明里的发送方一直为空。现有测试的 mock 也按 `sender` 写，等于把这个缺陷锁住了。
- **R4 键盘归属**：修复 D6。面板在 window 的捕获阶段处理 ↵、↑↓、Esc，并阻止事件继续传播，CoreBox 的处理器收不到这些键，因此不会执行背后的结果、移动背后的焦点，也不会关掉 CoreBox。↑↓ 循环并跳过禁用行；↵ 只认新按下的键；输入法组字期间方向键和回车交给输入法；一次选择发出后上锁，直到面板关闭或重新打开，连按不会重复派发；指针只在真正移动时改变当前项。
- **R5 窗口让位**：面板所需窗口高度 = `resolveMetaOverlayWindowHeight({ anchor, desiredPanelHeight })`，渲染端经由 `useResize` 的地板把窗口拉到这个高度，关闭后释放。只有确实拉高时才铺实色，释放后保持 240ms 覆盖主进程的收缩动画（120–220ms）。
- **R6 内置目标图标可见**：修复 D1。图标先经 `normalizeCoreBoxIcon` 归一化（`ri:x` → `i-ri-x`，没有图标时用 `pluginIcon`，再没有就落到 `i-ri-puzzle-line`）。再把内置目标的图标 class 通过 safelist 生成出来，现在 38 个里有 22 个从未生成。同时加一道防漂移测试。
  - 实现中发现（2026-10-02）：有两个 QuickOps 目标声明的图标在 Remix 图标集里根本不存在，safelist 也救不了。一个是 `quick-ops/index.ts:526` 的 `ri:shutdown-line`，按拼写修正为 `ri:shut-down-line`；另一个是 `:551` 的 `ri:power-line`，集合里没有任何 `power-*`，改用 `ri:cup-line`（防休眠工具通用的咖啡隐喻，和同组的 sun / moon-clear / shut-down 配套）。只改这两个字符串，不动派发逻辑。这一处超出了 design §0 的文件清单，由协调者批准。防漂移测试同时断言「每个 class 都存在于 ri 集合」，以后再写出不存在的图标名会直接变红。
- **R7 MetaK 共用外壳**：把卡片部分抽成 `components/meta/MetaPanel.vue`，供 MetaOverlay 和 FlowSelector 共用。MetaOverlay 的 DOM、class 和行为都不变。
- **R8 派发能真正发出去**：原本就有的问题。CoreBox 发起的流转派发报 `An object could not be cloned`：`useDetach` 的 `flowPayload` 是深层 `ref`，里面装的是取自响应式结果列表的 TuffItem，Electron IPC 做结构化克隆时遇到 Proxy 失败，派发根本没发出去（真机抓到渲染端报错 `[TuffTransport] Payload not cloneable for "flow:bus:dispatch"`）。按仓库既有写法修：`shallowRef` 加 `toRaw`，参见 `useConversationHistory.ts:87`。
- **R9 流转结果走底栏反馈**：原本就有的问题。CoreBox 刻意不挂 toast（见 `footer-feedback.ts` 的注释），`useDetach.dispatchFlow` 里的 `toast.success` / `warning` / `error` 永远到不了屏幕，失败时面板一关就像什么都没发生。改用 `showCoreBoxFooterFeedback`，与 ⌘K 动作的反馈一致。只改流转这几处，分离窗口那边的 toast 不在范围内。
- **R10 消除 ⌘K→流转 的窗口回弹**：原本的时序问题。主进程对条目动作先广播 `itemAction`，紧接着同步 `hide()` 并把高度还回去（`meta-overlay.ts` 的 `executeAction`），流转面板稍后才申请地板。真机实测：开启尺寸动画时 488 → 364 → 536，全程约 170ms；关闭动画时 488 → 242 → 536，中间 63ms。改为对打开流转面板的动作做「交接」：主进程先隐藏 overlay 但暂不归还高度，等 CoreBox 的下一次布局更新（带地板）直接接手，超时再按原规则归还。
- **R11 列表重排后不再被滚走**：原本就有的问题，也是用户原图里「此刻常用」标题被切掉的原因。真机观察到撤掉剪贴板附件后 `scrollTop` 停在 183，恰好让焦点行贴在视口顶部；隐藏后重新唤出则复位为 0。疑似机制：`useKeyboard` 在每个被处理的键之后都会调用 `scrollActiveItemIntoView()`，按 Esc 撤附件时，窗口还停在 56px 的缩起状态，视口只有一行高，函数判定焦点行「超出视口」就把列表滚了下去，等窗口长高时列表已经被卷走。实现时要先证实或推翻这个机制，再修。

## Acceptance Criteria

| AC | 需求 | 验收标准 |
| --- | --- | --- |
| AC1 | R1 | 推荐页无常用时显示标题、N 个空格子（N = 可见列数，且不超过布局声明的列数）和说明行，说明行包含按平台显示的键帽与「固定到推荐」。空格子 `aria-hidden`、不可聚焦。第一条列表项仍是 ⌘1，`registerItem` 只收到真实行。出现常用格子后空态消失；普通搜索和无分区宫格都不出现。单测覆盖，并在真机上截取明暗两套主题、包括 compact 形态的截图。 |
| AC2 | R2 | 面板宽 340px、锚在右下角（底栏锚点 52px，角落锚点 12px），遮罩为 20% 的 overlay token 且不模糊。标题行显示条目图标、条目名和「选择目标」。目标按插件分组，行高 32px，没有类型标签，没有 JSON 预览，搜索框在底部。列表与标题行、搜索行、底栏都不重叠。单测覆盖，并有真机截图。 |
| AC3 | R3 | `requireConfirm` 或缺授权的目标会把同一张卡片切换到确认视图，三种文案组合不变，说明里的发送方不为空。Esc 退回列表，既不发 `grantConsent` 也不 emit；确认后 emit 带上对应 token。单测覆盖，并有真机截图。 |
| AC4 | R4 | 单测证明面板打开时，document 捕获阶段的监听器收不到 ↵、↑↓、Esc；↑↓ 循环；带 `repeat` 的 ↵ 被忽略；连按 ↵ 只产生一次 `checkConsent` 和一次 select；输入法组字期间不处理这些键。真机上在面板里按 ↵ 不会执行背后的结果。 |
| AC5 | R5 | 结果只有 1～2 条时打开流转，窗口拉到所需高度（不超过 600），面板完整显示，拉高部分铺了实色。关闭后窗口回到结果高度，收缩期间不透出桌面（真机验证）。单测覆盖地板、600 的上限、释放，以及 240ms 的 hand-back 保持。 |
| AC6 | R6 | 真机上内置目标的图标全部可见。防漂移测试保证：源码里每个内置流转图标都在 safelist 中，抽取结果非空且包含已知图标，每个 class 都存在于 ri 图标集合；负向对照（临时删掉一项）能让测试变红。 |
| AC7 | R7 | `MetaOverlay.test.ts` 不改即全绿；真机上 ⌘K 面板的外观与改动前一致（截图对比）。 |
| AC8 | 全部 | 改动过的文件在包内 ESLint 配置下没有新增问题；web 端 `vue-tsc` 与 node 端 `tsc` 通过，如有与本次无关的既有错误，如实报告；`git diff --check` 干净。 |
| AC9 | R8 | 单测：用 `reactive` 的条目构造并派发时，发给 transport 的载荷能被 `structuredClone`，且不含 Proxy；负向对照（还原成深层 `ref`）让测试变红。真机：选一个只读目标（如 QuickOps System Info）走完授权，渲染端不再报克隆错误，主进程收到派发并回复。 |
| AC10 | R9 | 单测：派发成功、权限不足、失败三种结果分别以对应文案和 tone 调用 `showCoreBoxFooterFeedback`，`dispatchFlow` 不再调用 toast。真机：派发后底栏出现反馈。 |
| AC11 | R10 | 单测（主进程 meta-overlay）：流转动作隐藏 overlay 时不归还高度，下一次布局更新直接生效；没有布局更新时，超时后按原规则归还；其他动作的归还时序不变；铺底状态在交接期间保持连续。真机：开启尺寸动画，在短列表上走 ⌘K → 流转，窗口高度单调变化，没有先缩后长。 |
| AC12 | R11 | 先在真机或单测中证实触发机制，写进验收记录。修复后单测覆盖：视口装不下焦点行时（窗口缩起或正在长高）不滚动；正常窗口里的键盘滚动行为不变。真机复现路径修复后 `scrollTop` 保持 0，分区标题可见。 |

## Out of Scope（旁路问题，只记录不修）

- 「最近案例」这个分区名（`coreBox.sections.proposed`，英文是 “Recent picks”）读起来别扭。
- 插件 UI 模式下按流转快捷键时，面板由 CoreBox 渲染进程绘制，会被附着的插件视图盖住（MetaK 靠独立的 overlay 视图解决这个问题）。从代码推断，未上机验证。
- 第三方插件在运行时声明的流转图标，如果 UnoCSS 没有生成对应 class，仍然会是空的。这是 CoreBox 所有运行时图标共有的限制。
- 系统分享的组名在主进程里写死为中文「系统分享」（`flow-bus/module.ts:154`），英文界面下也显示中文。
- 确认说明里的发送方是原始 ID（`corebox` 或插件 ID），不是显示名。D5 修好之后它才显露出来，以前那里是空的。
- 把流转并进 MetaK 面板，做成二级页面。
- 分离窗口（detach）相关的 toast 同样到不了 CoreBox 的屏幕，但不属于流转，这次不改。
- CoreBox 在流转面板打开时被隐藏，下次唤出时面板仍然开着、也还占着窗口高度（改动前就是如此，由 impl-cd 发现）。

## 验收记录（2026-10-02 至 10-03）

真机环境：隔离的 Electron dev 实例（CDP 9344，vite 5191，`TUFF_DISABLE_GLOBAL_SHORTCUTS=1`），通过 `/tmp/tuff-flow-metak-2/cdp.mjs` 驱动。没有写系统剪贴板，只派发了只读目标。

**证据丢失与补拍**：第一轮验证的目录 `/tmp/tuff-flow-metak/`（脚本、profile、截图）在验证途中被外部清理整体删除，同时被清掉的还有原来已过新手引导的 profile `/tmp/tuff-hint-verify/`。所有代码都在仓库里，不受影响。第二轮在全新 profile 上重建了环境（用存储 IPC 置 `beginner.init` 过引导闸），在最终代码上把下表各项重新验证一遍，截图在 `/tmp/tuff-flow-metak-2/shots/`。

| AC | 证据类型 | 结果 |
| --- | --- | --- |
| AC1 | 真机 + 单测 | 推荐页无常用时，6 个空格子对齐宫格轨道，说明行居中，⌘1 仍在第一条列表项上（`A-ghost-light-zh.png`、`A-ghost-dark-zh.png`）。compact 形态没能在真机上造出来（隔离 profile 没有文件索引，触发不了预览窗），由单测和 impl-a 的静态 Chromium 测量覆盖。 |
| AC2 | 真机 + 单测 | 卡片 340×420，右距 12，底部落在底栏上方（548）；标题行是「magpie · 选择目标」；QuickOps 分组 44 行，图标均为 16px 的 `i-ri-*`；没有类型标签和 JSON；遮罩不模糊；焦点在搜索框（`C-flow-light-zh.png`、`C-flow-dark-zh.png`）。 |
| AC3 | 真机 + 单测 | 确认视图在卡片内原地切换：中文 162px，英文按钮折成两行后 232px，与估算值一致；说明里出现发送方；第一次 Esc 退回列表，保留当前项、焦点回到搜索框，第二次 Esc 关闭；Shift+Tab 切到「仅本次允许」，↵ 触发按钮（`D-confirm-light-zh.png`、`D-confirm-dark-en.png`）。 |
| AC4 | 真机 + 单测 | 流转面板里按 ↓ 和 ↵，背后 CoreBox 的焦点不动，背后的应用也没有被启动。 |
| AC5 | 真机 + 单测 | 关闭时面板先完整淡出，不被挤压；淡出结束后窗口才带动画收缩（348 ← 536）；铺底比释放晚约 240ms 才撤，盖住收缩过程。 |
| AC6 | 真机 + 单测 | 内置目标图标全部可见；防漂移测试含正向和负向对照，顺带修正了两个不存在的图标名（见 R6）。 |
| AC7 | 真机 + 单测 | ⌘K 面板几何与规格一致（右距 12、宽 340、底部 548、标题行 40、行高 32、圆角 12）；`MetaOverlay.test.ts` 不改即全绿（`B-metak-light-zh.png`）。 |
| AC9 | 真机 + 单测 | 修复前渲染端报 `Payload not cloneable for "flow:bus:dispatch"`；修复后 System Info 派发回复 `ACKED`，回执里带有系统信息。 |
| AC10 | 真机 + 单测 | 派发成功后底栏显示「已发送到目标插件」，1.2 秒后消失。检查阶段还发现并修正了缺权限提示用的一个不存在的 i18n key。 |
| AC11 | 真机 + 单测 | 修复前（开动画）488 → 364 → 536；修复后 4 条结果时 348 → 488（⌘K）→ 488 → 536（流转），单调变化，铺底全程开着（`E-flow-grown-light-zh.png`）。 |
| AC12 | 真机 + 单测 | 见下方「R11 两轮修复」。 |
| AC8 | 门禁 | 受影响目录 133 个测试文件、1476 个用例，通过 1474 个。失败的 2 个在 `components/shell/ShellSidebar.test.ts`，起因是另一个会话尚未提交的 `ShellUpdateNotice.vue`，与本任务无关。ESLint 0 问题，web 端 `vue-tsc` 与 node 端 `tsc` 均为 0 错误，`git diff --check` 干净，`coreapp-ui-contract` / `orphan-tests` / `module-size-ratchet` 均通过。 |

**R11 两轮修复**：

1. 第一轮（impl-r）：结果区的 `scrollTop` 只由 `scrollActiveItemIntoView` 写入（新查询那一次 `scrollTo(0, 0)` 除外）。当视口装不下一行时，它会把行滚到底边对齐，单测复现出 234 → 183，与最初观察完全吻合。修法是视口装不下焦点行就跳过。旧 profile 上撤附件后 `scrollTop` 保持 0。
2. 第二轮（协调者）：在全新 profile、开着尺寸动画的条件下，撤附件后仍出现一次 `scrollTo(0, 144.19…)`，测量发生在窗口长高的半途，守卫拦不住。根因是 `handleGridColumnsChange` 把「新结果集的宫格首次上报列数」当成了「同一批格子重排」，于是 260ms 后补滚，正好落在窗口长高动画中途。修法：只有结果集没变（同一批格子因宽度变化而重排）时才补滚，新结果交给结果 watcher（`CoreBox.vue`，新增两条测试，带负向对照）。修复后，在又一个全新 profile 上观察「宫格首次挂载、窗口同时从 56 长高」：只有新结果复位那一次 `scrollTo(0, 0)`，没有补滚，`scrollTop` 为 0。如实说明：「撤附件」这条原始路径依赖剪贴板状态，修复后没能再次触发，结论来自机制分析、同类场景的观察和单测。
3. 附带修复：按键回到第 0 项时滚回顶端，让常用区和分区标题重新露出（修复前停在 183，修复后为 0）。正常窗口里的键盘滚动不受影响：按 ↓ 到第 9 项时，焦点行底边贴住底栏（滚到 196）。

**铺底保持的统一规则**（协调者，检查阶段之后）：`floorApplied` 由真变假时都保持 240ms，不论是释放地板，还是加载后地板降到结果高度以下。原来只覆盖释放，后者在收缩期间会透出桌面（最终检查报告第 4 条）。新增一条测试并做了负向对照。

**交接期间的焦点**：⌘K → 流转交接期间，透明的 overlay 视图会短暂持有焦点（通常几十毫秒，上限 500ms）。选流转 250ms 后通过 CDP 输入，文字落在流转面板的搜索框里，背后 CoreBox 的搜索词没被改动。局限：CDP 输入直接投递给页面，绕过了系统层面的焦点路由；交接最初几十毫秒内敲下的真实按键会先到 overlay 视图，这一点无法用 CDP 验证。

**仍然存在、已知的边角情况**（来自最终检查，都是改动前就有、或极少触发的）：

- 窗口「部分长高」时，如果视口已经装得下一行、但还装不下焦点行所在的位置，仍可能按差值滚一小段。现已知的触发路径都已修好。
- 比有效视口（约 500px）还高的自定义行，被键盘选中时不再滚进视口。目前没有这么高的行。
- 交接开始时，如果主进程 16ms 合并队列里恰好排着一个不带地板的旧布局更新，交接会被它提前结束，窗口仍会先缩再长。需要在 ⌘K 打开期间结果正好流式更新，极少见。
