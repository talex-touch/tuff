# TxAvatar 状态点裁切修复与头像组悬浮/溢出 popover

## Goal

两件事，一个 bug 一个功能，都落在 `packages/tuffex` 的 avatar 家族：

1. `TxAvatar` 的 `status` 状态点被裁成月牙，修回完整圆点。
2. `TxAvatarGroup` 增加可配置的 hover 特效，以及 `+N` 溢出头像上的 popover。

## Background

用户截图（2026-08-30）显示 `AvatarStatusDemo` 四个头像的右下角状态点只剩一道弧形碎片。

根因：`TxAvatar.vue` 根节点同时有 `overflow: hidden`（`:174`）和 `border-radius: 50%`（`:181`），而状态点定位在 `bottom: 0; right: 0`（`:258-266`）——那是**外接正方形的角**，对圆形头像来说整块落在圆外，被 `overflow: hidden` 按圆角裁掉，只剩贴着圆弧的一小片。`square` / `rounded` 形状受影响较轻但同样被圆角切角。

第二件事是新功能：`TxAvatarGroup` 目前只有 `max` / `size` / `overlap` 三个 prop（`types.ts:25-29`），没有任何 hover 反馈，`+N` 也只是个死头像，看不到被折叠掉的人是谁。

## Requirements

### R1 状态点必须完整可见

- R1.1 `circle` 形状下状态点完整显示，不被根节点裁切。
- R1.2 `square` / `rounded` 形状下同样完整显示。
- R1.3 头像图片本身仍然被形状裁切（圆形头像的图片不能变成方的）——这是 `overflow: hidden` 原本要解决的问题，不能因为修状态点而回归。
- R1.4 状态点位置在视觉上贴合形状边缘：圆形贴 45° 切点，方形/圆角贴角。
- R1.5 四种 `status` 值（`online` / `offline` / `busy` / `away`）与全部尺寸预设 + 自定义数字尺寸下都成立。
- R1.6 在 `TxAvatarGroup` 内状态点同样不被**根节点**裁切。与右侧相邻头像的叠放遮挡是既有 `z-index` 递增顺序的固有结果，本次**不**改叠放顺序（改了会翻转所有现有头像组的视觉），只在文档交互契约里写明，并说明 `hoverEffect="lift"` 会把悬浮头像置顶从而露出状态点。

### R2 头像组 hover 特效

- R2.1 提供 `hoverEffect`：单个头像悬浮时上浮 + 阴影 + 置顶（`z-index` 提到最前，不被右侧头像压住）。取值 `'none' | 'lift'`，**默认 `'lift'`**。
- R2.2 提供 `spreadOnHover`：整组悬浮时头像间距展开（`overlap` 过渡到 `spreadOverlap`）。布尔，**默认 `false`**。
- R2.3 `spreadOverlap` 可配置展开后的重叠量，默认 `0`。
- R2.4 两个特性互不依赖，可同时开启。
- R2.5 特效对**插槽传入的**子头像生效——这是难点，组的 scoped 样式默认不落到插槽内容上。
- R2.6 尊重 `prefers-reduced-motion: reduce`：关闭位移与过渡，保留 `z-index` 置顶。

### R3 `+N` 溢出 popover

- R3.1 提供 `overflowPopover` 开关，**默认 `false`**（向后兼容：现有调用方行为不变）。
- R3.2 打开后，悬浮 `+N` 头像弹出面板，默认内容是**被折叠掉的那些头像**的网格（不是全部成员）。
- R3.3 提供具名插槽让调用方完全覆写面板内容，插槽 props 至少包含溢出的 VNode 列表与数量。
- R3.4 触发方式与位置可配置（`hover` / `click`，`placement`）。
- R3.5 `max` 未设置或没有溢出时不渲染 popover，也不产生额外 DOM 包装。
- R3.6 复用既有 `TxPopover`，不新写浮层逻辑。

### R4 交付面

- R4.1 `types.ts` 的 `AvatarGroupProps` 同步新 prop，带 TSDoc。
- R4.2 单测覆盖新行为，且**必须能在旧代码上失败**（负控制）。
- R4.3 nexus 文档中英双份同步更新：`avatar.zh.mdc` / `avatar.en.mdc`，包括 Props 表、Slots 表、样式定制变量表、交互契约段。
- R4.4 新增/更新 demo 组件并接入 demo registry。
- R4.5 zh / en 两份文档段数必须相等（doc-parity 守卫）。

## Constraints

- C1 **不改公开 class 契约**：`tx-avatar`、`tx-avatar__status`、`tx-avatar-group__item`、`tx-avatar-group__more` 等既有类名保留（spec `component-guidelines.md` 的 "Preserve public class names"）。
- C2 现有三条 group 单测必须继续通过，尤其 `avatar.test.ts:146` 断言 ring border 仍是**内联** style，以及 `:165` 断言内联 style 不含 `border-radius`。
- C3 avatar 与 popover / tooltip 同属 `base` 套件（`base/index.ts:7,61,92`），新依赖边不跨套件违规；但 avatar 静态引入 popover 会把 `base-anchor`/`base-surface`/`card`/`glass-surface`/`spinner` 拖进 `@talex-touch/tuffex/avatar` 的依赖图，必须在 `audit-package-size.mjs` 的 `onDemandImportBudgets` 里显式登记。
- C4 本次不增删组件，`TAXONOMY` / 套件 barrel / `SECTION_ORDER` / hub 四处**无需**改动（bc 2026-08-30 提醒 + spec `component-guidelines.md` 尾节）。
- C5 tuffex 无 i18n 系统；面板内任何文案走「文案 prop 默认英文」惯例，不硬编码中文。
- C6 base branch = `af8fc362d`（`origin/master`，PR #1817 合入后），worktree `/Users/talexdreamsoul/Workspace/Projects/tt-wt-avatar`。

## Acceptance Criteria

- [ ] AC1 `circle` + `status` 渲染出**完整的圆形**状态点；用 jsdom 断不出裁切，需以「根节点不再是 `overflow: hidden`」+ 视觉核验双重确认。
- [ ] AC2 圆形头像的 `src` 图片仍呈圆形（`border-radius` 生效于图片层）。
- [ ] AC3 `square` / `rounded` + `status` 状态点完整。
- [ ] AC4 `TxAvatarGroup` 内的头像悬浮时上浮且置顶（覆盖住右侧相邻头像，不被压住）。
- [ ] AC5 `hoverEffect="none"` 时无任何 hover 位移。
- [ ] AC6 `spreadOnHover` 开启后整组悬浮展开，关闭时无变化。
- [ ] AC7 `overflowPopover` 默认关闭时，渲染出的 DOM 与改动前**完全一致**（无 popover 包装元素）。
- [ ] AC8 `overflowPopover` 开启 + 有溢出时，`+N` 外层出现 popover reference，面板内含溢出头像。
- [ ] AC9 具名插槽能覆写面板内容，且能拿到溢出数量。
- [ ] AC10 popover 包装存在时，`+N` 的叠放位置（负 margin）与不包装时一致——包装元素不能把 `+N` 顶开。
- [ ] AC11 `pnpm --filter @talex-touch/tuffex test` 全绿，新测试在 revert 源码后会红（逐条负控制）。
- [ ] AC12 tuffex `lint` / `typecheck` / `audit:size` 全绿（`audit:size` 前先 build）。
- [ ] AC13 nexus `typecheck` 绿（先 build tuffex）。
- [ ] AC14 `avatar.zh.mdc` 与 `avatar.en.mdc` 段数相等，且 Props 表与 `types.ts` 无 drift。
- [ ] AC15 demo registry / orphan 守卫绿。
- [ ] AC16 CDP 目验截图确认状态点与 hover / popover 三项视觉表现。

## Out of Scope

- 不改 `TxAvatar` 的 fallback 链路、尺寸归一化、`clickable` 语义。
- 不给 `TxAvatar` 加状态点位置 prop（`statusPlacement` 之类）——本次只修默认位置的裁切。
- 不做头像组的键盘导航 / roving tabindex。
- 不动 avatar-variants 文档族。
