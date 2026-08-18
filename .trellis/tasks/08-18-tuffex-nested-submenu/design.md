# Design: Tuffex nested submenu + anchor chain fixes

## 现状机制（已核实）

- 浮层 DOM：`TxBaseAnchor` 把浮层 Teleport 到 `<body>`（TxBaseAnchor.vue:916），
  嵌套面板之间无 DOM containment。
- 组件树链：`utils/anchor-delay.ts` 的 `useAnchorDelay` 经
  `TX_ANCHOR_NODE_KEY` provide/inject 建立父子链（刻意不走 DOM，注释明说）。
  `preemptFor` 已「永不向上关」（isDescendantOf 豁免祖先），`isSuppressed` 同理。
  注册方是 **TxTooltip**（不是 anchor）；TxBaseAnchor 自身不注册。
- 悬停调度：TxTooltip `onFloatingEnter → delay.cancel()`（只取消自己）、
  `onFloatingLeave → delay.requestClose()`（只关自己）。指针从父面板进入
  teleport 的子面板时，父层的 close 定时器无人取消 → 父层 100ms 后关闭，链断。
- outside-click：TxBaseAnchor `handleOutside`（:776）只查自己的
  referenceRef/floatingRef containment → 点击 teleport 的子面板对父层算 outside。
- 宽度链：reference 三层包装 `.tx-base-anchor__reference`（fit-content）>
  `.tx-tooltip__reference`（inline-flex 无宽）> `.tx-popover__reference`（fit-content）。
  TxPopover 的 `referenceFullWidth` 只作用于自己那层 + 经 referenceClass 传到 anchor 层，
  漏掉中间 tooltip 层（TxPopover.vue:149-163 未传，TxTooltip 的 prop 在等）。
- `TxDropdownItem` 点击即 `ctx.close()`（closeOnSelect 时）；`TxContextMenuItem`
  已有 `submenu` 箭头 prop（纯样式）。TxContextMenuPanel 有 `data-tx-context-menu-layer`
  outside 豁免属性 + 自己的 roving 键盘巡航。

## WP1: anchor-delay 服务链扩展（`packages/tuffex/packages/utils/anchor-delay.ts`）

新增三个行为，全部以「组件树链」为准：

1. **级联向下关闭**：`applyClose(entry)` 先对所有 open 后代（按深度从深到浅）
   `applyClose`，再关自己。配合既有「永不向上关」形成对称语义；
   keepAliveContent 下父层关闭子层不再残留幽灵 open。
2. **hover 链取消**：handle 新增 `cancelChain()` —— 取消自己 + 全部祖先的 pending timer。
   浮层 pointer-enter 时调用，恢复「指针仍在链内」的事实。
3. **hover 链关闭**：handle 新增 `requestCloseChain()` —— requestClose 自己 + 祖先中
   `hoverCloseable()` 为 true 的条目（跳过但继续上溯）。浮层 pointer-leave 时调用。
   `AnchorDelayRegistration` 新增可选 `hoverCloseable?: () => boolean`，
   TxTooltip 注册时传 `() => props.trigger === 'hover'`——click 触发的父层
   绝不被 hover 子链安排关闭（它只认 outside-click/esc/select）。

另外服务暴露浮层元素登记（WP2 用）：

- `AnchorDelayHandle.setFloatingEl(el: HTMLElement | null)`；服务内部 node→el Map。
- `AnchorDelayService.isEventInsideChain(node, event): boolean`：
  event（composedPath 优先）落在 node 自身或其任一 **open 后代** 登记的浮层元素内。

既有语义不动：preempts/suppress 表、warm/skipDelay、openNow/closeNow 均保持。

## WP2: TxTooltip / TxBaseAnchor 接线

- TxTooltip：`onFloatingEnter → delay.cancelChain()`；`onFloatingLeave → delay.requestCloseChain()`
  （原 clearTimers/scheduleClose 语义被链版本包含：无父链时行为与现状逐字段一致）。
  注册时传 `hoverCloseable`。把 handle（或其 setFloatingEl/节点）经既有 anchor 插槽
  向下与 TxBaseAnchor 共享：TxBaseAnchor inject `TX_ANCHOR_NODE_KEY`（最近 provider
  即包裹它的 tooltip 的 node）+ inject 服务，open 时 `setFloatingEl(floatingRef)`，
  关闭/卸载时置 null。
- TxBaseAnchor `handleOutside`：`!inRef && !inFloat` 后追加
  `service.isEventInsideChain(myNode, e)` 豁免——事件在自己 open 后代的浮层内则不关。
  无 node（裸用 anchor）时行为不变。
- Esc 维持现状（每层各自监听、整链同时收；菜单链上可接受，不做逐层退栈）。

## WP3: referenceFullWidth 断链修复

- TxPopover 模板给 TxTooltip 加 `:reference-full-width="props.referenceFullWidth"`（一行）。
- 下游核对：select/search-select/tree-select/cascader/date-picker 均已传
  `reference-full-width` 且外层有定宽/兜底，中间层从 fit-content 变 100% 只会更正确；
  逐个跑 nexus 文档页目检（CDP 截图）确认无回归。

## WP4: 子菜单组件

### TxDropdownSubmenu（dropdown-menu/src/TxDropdownSubmenu.vue）

结构：内部一个 `TxPopover trigger="hover" placement="right-start" reference-full-width`
（断链修复后即全宽），`#reference` 是自绘触发行（TxCardItem + chevron-right，
role="menuitem" aria-haspopup="menu" aria-expanded，**不走** TxDropdownItem 的
select-即-close 逻辑），默认插槽是子面板 `role="menu"`。

- Props：`disabled`、`minWidth`(默认 160)、`width?`、`placement`(默认 'right-start')、
  `offset`(默认 4)、panel 外观五件套沿用 dropdown 默认、`animation?`。
- Slots：default（触发行内容）、`#right`（行尾元信息，chevron 前）、`#menu`（子面板内容）。
- 上下文：inject `txDropdownMenu`（根 ctx），向子面板 **re-provide 同一个根 ctx**——
  子项 select 时 `ctx.close()` 关根，服务级联收全链。
- 键盘：触发行 ArrowRight/Enter/Space → openNow + 聚焦子面板首项；
  子面板复用 TxDropdownMenu 的巡航模式（Up/Down/Home/End 就地实现），
  ArrowLeft → 关子层 + 焦点回触发行。
- 无箭头（show-arrow=false），z-index 由 zIndexAllocator 自然递增（后开更高）。

### TxContextMenuSubmenu（context-menu/src/TxContextMenuSubmenu.vue）

同构：触发行复用 TxCardItem（对齐 TxContextMenuItem 视觉，含 `shortcut`/danger 风格
不需要），子面板直接复用 `TxContextMenuPanel`（`outsideGuard: true`、
`close` 转发根 close、closeOnSelect 转发根值），TxContextMenu 的
`isEventInsideMenuLayer` 豁免因此自动覆盖子面板。
`TxContextMenuItem` 的 `submenu` prop 保留（纯样式向后兼容），文档标注推荐新组件。

### 导出接线

components.ts + 两家族 index.ts barrel；README（root + components 包）各补一行；
星型 barrel 名称无碰撞（Submenu 前缀家族化）。

## WP5: HeaderUserMenu 重构（apps/nexus/app/components/HeaderUserMenu.vue）

- TxDropdownMenu：`trigger="hover"`，删 v-model 手管 + 全部 hover handler/timer；
  账户统计懒加载挂 `@open`；`close-on-select=false` 保留，导航/退出仍显式 close
  （经根 ctx 或 v-model —— 保留 v-model 仅用于显式 close，不再手写 hover）。
- Language 行：TxDropdownSubmenu，default 放图标+文案，`#right` 放 `中文/English`
  元信息，`#menu` 放两个语言 TxDropdownItem（is-active 样式保留）。
- 删除：160/120ms 定时器组、`handleLanguagePanelHover`、`:global` 宽度 hack
  （437-446）、死规则（409-426 中 `.tx-popover:has()`、448-457 `.tx-tooltip:has()`）、
  `--tx-index-popper` 覆盖（从未生效）。逐条删除前用 CDP 目检确认视觉不变；
  `.tx-base-anchor__outline` 隐藏与 `overflow-x: visible` 两条如仍有视觉作用则保留并加注释。
- 头像 click→/dashboard、主题切换、退出、i18n 文案全部不动。

## 风险与回滚

- anchor-delay 是全家族共享服务：改动以新增路径为主（cancelChain/requestCloseChain/
  级联关闭），既有单测必须原样全绿；级联关闭是唯一语义变化，若它使某测试转红，
  优先判断该测试是否「把 bug 当规范」（幽灵 open 本就是缺陷）。
- select 家族目检发现回归 → WP3 单独可回滚（一行），不连坐其他 WP。
- HeaderUserMenu 视觉对不齐 → 保留新结构、逐条恢复必要的局部样式（不恢复 :global hack）。
