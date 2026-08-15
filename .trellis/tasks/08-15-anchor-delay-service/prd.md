# TuffEx Anchor 延迟服务与组合动画

## Goal

把 anchor 类浮层（tooltip / popover / dropdown，以及将来任何需要的组件）的「何时开、何时关、被谁抢占」，从各组件各自手写定时器，收敛成一个可共享、可配置、带内置预设的服务；并让出现与消失可以使用不同的动画类型组合。

## Background

现状（2026-08-15 实测，非推断）：

- `TxTooltip` 默认 `openDelay 200 / closeDelay 120`，`TxPopover` 默认 `openDelay 120 / closeDelay 100`。
  两者在各自 SFC 里手写了**逐字重复**的 `openTimer / closeTimer / clearTimers / scheduleOpen / scheduleClose`。
- 共同地基 `TxBaseAnchor` **完全不知道 delay 的存在**，`BaseAnchorProps` 里没有任何延迟字段。
- 全局**没有任何注册表 / 单例 / dismiss stack**，anchor 链路上**没有任何 `provide` / `inject`**。
- 应用层因此各自造轮子：`apps/nexus` 头部的 `LanguageToggle.vue` / `DarkToggle.vue` 里写死了 `CLOSE_DELAY = 600`。
- `BaseAnchorAnimationOptions` 已有成对的 `duration/closeDuration`、`ease/closeEase`，但 `type` **只有一个**，
  出现与消失被迫同种动画。`boom` 类型（`base-anchor-motion.ts:750`）已实现 blur + scale + opacity 同时收敛，
  但无法只用在出现阶段。

由此产生的可观察缺陷：**两个同类浮层可以同时可见**。指针从 A 移到 B 时，A 仍在跑自己的 closeDelay。
closeDelay 的存在理由是宽容「指针从触发器走向面板」的位移过程；当指针已落到另一个 anchor 上，
该前提已不成立，继续等待没有任何意义。

## Requirements

### R1 共享延迟服务

- 单一服务模块，任何组件可接入，不限于现有三个。
- 内置按语义角色划分的预设，消费方只需声明角色而不是手填数字。
- 每个角色可配 `openDelay` / `closeDelay` / `skipDelay`。
- 应用可在全局覆盖预设，无需逐组件传参。
- 不引入新的运行时依赖。

### R2 抢占（本任务的核心诉求）

- 同角色浮层互斥：B 打开时 A **立即**关闭，绕过 A 的 closeDelay。
- 抢占必须**祖先感知**：只作用于兄弟及其后代，永不向上关闭祖先。
  否则会立刻破坏两个既有场景：子菜单打开时关掉父菜单；dropdown 面板**内部**的 tooltip 关掉承载它的 dropdown。

### R3 预热（skip delay）

- 同组内已有一个浮层打开过之后进入「热」状态，滑到兄弟触发器时**立即**出现，不再等 openDelay。
- 离开热窗口（`skipDelay`）后恢复冷启动延迟。

### R4 跨角色策略

- 打开 menu / dialog 时，立即关闭所有 hint。
- menu / dialog 开启期间，抑制 hint 的出现。
- 该矩阵可配置，不硬编码。

### R5 组合动画

- 出现与消失可指定**不同**的动画类型。
- 目标组合：出现用 `boom`（模糊 + 缩放材质化），消失沿用默认 `expand` 的收起。
- 几何参数（scale / distance / blur）在出现与消失阶段可分别覆盖。
- 全部可由使用方自定义。

### R6 移动端

- 无 hover 即自动收起，不做额外的触摸分支或长按机制。

## Constraints

- `@talex-touch/tuffex` 是**已发布包**，公共 API 必须向后兼容：
  `TxTooltip` / `TxPopover` 现有的 `openDelay` / `closeDelay` props 不得删除，只能下沉实现并保留为覆盖入口。
- 现有 `BaseAnchor` 的 `expand` 默认动效是按参考视频逐帧调过的（见 `base-anchor-motion.ts` 的 `EXPAND_DEFAULTS` 注释）。
  **默认观感不得回归** —— 本任务只新增能力，不改默认值。
- 必须通过：`packages/tuffex` 的 `audit:size`（注意该门禁读 `dist/`，跑之前要先 build），
  以及 tuffex / nexus / core-app 三处 typecheck。
- 改动公共 API 会连带影响 `apps/nexus` 下的 TuffEx 组件文档，需同步。

## Non-Goals

- 指针轨迹安全区（safe triangle）。本轮仍用延迟作为 hover 意图的近似，安全区留作后续。
- 触摸端长按唤起 tooltip。
- 重做 `drip` / `bead` 液态动效。

## Acceptance Criteria

- [ ] AC1 存在单一延迟服务模块，导出默认单例、工厂函数、组合式入口与内置预设；有单元测试覆盖。
- [ ] AC2 `TxTooltip` 与 `TxPopover` 不再各自持有 `openTimer` / `closeTimer`，改为接入该服务；两者原有 props 行为不变。
- [ ] AC3 同角色抢占生效：打开 B 时 A 立即关闭，**不等** A 的 closeDelay。有测试断言 A 在 closeDelay 之内已关闭。
- [ ] AC4 祖先不被误关：嵌套子菜单打开时父菜单保持打开；面板内部的 tooltip 打开时承载面板保持打开。两条均有测试。
- [ ] AC5 预热生效：热窗口内打开兄弟浮层的等待时间为 0；窗口过期后恢复 openDelay。有测试。
- [ ] AC6 跨角色矩阵生效：menu 打开时既有 hint 立即关闭，且期间不再出现新 hint。有测试。
- [ ] AC7 `BaseAnchorAnimationOptions` 支持出现/消失分别指定类型与几何参数；未指定时与本任务前的渲染行为逐字段一致。
- [ ] AC8 存在可用的「出现 `boom` / 消失 `expand`」组合，并在 nexus 文档中有可交互 demo。
- [ ] AC9 `apps/nexus` 头部 `LanguageToggle.vue` / `DarkToggle.vue` 中手写的 `CLOSE_DELAY = 600` 被删除，改为服务配置。
- [ ] AC10 门禁全绿：tuffex 单测、nexus 全量单测（当前基线 200 文件 / 1109 用例全过）、
      tuffex build + `audit:size` 无**新增**回归（CSS 预算自 6 月起既有红项，只比较增量）、三处 typecheck 通过。
- [ ] AC11 nexus 侧 TuffEx 文档（tooltip / popover / dropdown-menu / base-anchor）同步新 API，中英文段数一致。

## Resolved Questions

- ~~Q1~~ **已定（2026-08-15）：tooltip 需要延迟，不按 `interactive` 分叉。**
  `hint` 保持单一预设 200/120/300，不引入 `hintInteractive`。原提案（不可交互面板延迟降至近 0）作废。
- ~~Q2~~ **已定：menu / dialog 开启期间完全抑制 hint。** 该倾向在讨论中提出且未被否决，按此实现。
