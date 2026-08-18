# Tuffex nested submenu support + anchor chain fixes + HeaderUserMenu cleanup

## Goal

给 tuffex 菜单家族（dropdown-menu / context-menu）补上原生多级子菜单原语，修复
`referenceFullWidth` 三层 reference 断链，并把 nexus `HeaderUserMenu.vue` 从
「手写悬停体系 + 全局 CSS 强改组件内部」重构为纯组件 API 用法。

## Background

nexus 顶栏账户菜单暴露三个问题：

1. 悬停开合整套手写（3 组 mouseenter/mouseleave + setTimeout 160/120ms），复刻了
   TxDropdownMenu 原生 `trigger="hover"` + anchor-delay 服务已有的能力。
2. Language 子菜单用嵌套 TxPopover 手搓，配 ~40 行 `:global !important` 强改组件内部，
   其中 `.tx-popover:has()` / `.tx-tooltip:has()` 系列选择器因 unstyled 渲染路径不匹配（死规则）。
3. Language 行撑不满：TxPopover 不把 `referenceFullWidth` 转发给 TxTooltip，
   `.tx-tooltip__reference` 收缩包裹，宽度链在中间层断掉。

根因：菜单家族没有原生子菜单原语（nexus 的 ContextMenu 文档 demo 也在手搓嵌套 popover；
`TxContextMenuItem` 甚至已有 `submenu` 箭头 prop，有形无实）。anchor-delay 服务已具备
父子链模型（provide/inject 建链、preempt 永不向上关），但悬停关闭与 outside-click
判定还不认后代面板（面板 Teleport 到 body，DOM containment 失效）。

## Requirements

- R1. tuffex 菜单家族原生支持多级子菜单（任意深度）：
  - 新增 `TxDropdownSubmenu`（dropdown-menu 家族）与 `TxContextMenuSubmenu`（context-menu 家族）。
  - 悬停从父面板移入子面板不关父层；移回父面板子层收回；整链移出后全链关闭。
  - click 触发的父菜单：点击 teleport 到 body 的子面板不算 outside-click，不误关父层。
  - 子面板中选中项按 closeOnSelect 关闭整条链（关根即关全部）。
  - 父层关闭（含被兄弟菜单 preempt）时后代级联关闭，keepAliveContent 下不留幽灵开启态。
  - 键盘：子面板内 ArrowUp/Down/Home/End 巡航；ArrowRight 在触发行展开并聚焦首项；
    ArrowLeft 在子面板内收回并聚焦触发行。
- R2. 修复 `referenceFullWidth` 断链：TxPopover 转发该 prop 给 TxTooltip，三层 reference
  包装全链 `width:100%` 生效；不回归 select / search-select / tree-select / cascader /
  date-picker 现有布局（它们都已传 reference-full-width 且各有局部宽度兜底）。
- R3. HeaderUserMenu 重构为纯组件 API：
  - 主菜单 `trigger="hover"`（保留头像 click 在 fine-pointer 下跳 /dashboard）。
  - Language 子菜单改用 TxDropdownSubmenu，`中文 >` 元信息推到行尾（撑满一行）。
  - 删除手写 hover 定时器、全局宽度 hack、死规则；保留主题切换、账户统计懒加载、退出逻辑。
  - 视觉与现状对齐（面板宽 328 / 子面板 132、refraction 背景、transfer 动效）。
- R4. 文档：dropdown-menu 与 context-menu 现有文档页各加一个子菜单 demo 小节
  （zh/en 段数相等，demo 注册链齐全），不新建组件页。

## Constraints

- flat-dropdown 不在范围内（非浮层家族成员）。
- 除 HeaderUserMenu 外的应用侧（core-app、nexus 其他组件）不做迁移，只报告发现。
- anchor-delay 行为变更必须保持既有测试语义（hint 抢占、suppress 祖先豁免等）不变。

## Acceptance Criteria

- [ ] A1. HeaderUserMenu 无 mouseenter/mouseleave 手写定时器、无 `:global` 宽度/内部结构 hack；
  Language 行右侧元信息贴行尾。
- [ ] A2. 悬停路径 根面板→子面板→（孙面板）→移出 全程不闪断，最终全链关闭。
- [ ] A3. click 触发的菜单中，点击子面板内部不关父层；点击链外关闭全链；子面板选中关闭全链。
- [ ] A4. anchor-delay 新链行为有单测（hover 链取消 / 级联向下关闭 / click 父层不被 hover 链误关）。
- [ ] A5. `packages/tuffex` build + vue-tsc、nexus typecheck、core-app typecheck 全绿
  （tuffex typecheck 弱于双下游，必须双跑）。
- [ ] A6. 既有 anchor-delay / dropdown / popover / context-menu / tooltip 测试全绿。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- 技术设计见 `design.md`，执行序见 `implement.md`。
