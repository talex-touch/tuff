# Implement: Tuffex nested submenu + anchor chain fixes

执行序按依赖排列；每步末尾是该步验证命令。tuffex 构建产物被 nexus/core-app 消费，
所以 tuffex 源码改完必须 build + 双下游 typecheck（memory: tuffex typecheck 弱于双下游）。

## Step 1: anchor-delay 服务链扩展（WP1）

- [ ] `packages/tuffex/packages/utils/anchor-delay.ts`：
  - `applyClose` 级联向下（深→浅）关闭 open 后代。
  - handle 新增 `cancelChain()` / `requestCloseChain()`；registration 新增
    `hoverCloseable?: () => boolean`（requestCloseChain 跳过 false 者，继续上溯）。
  - 浮层登记：`setFloatingEl(el)` + `isEventInsideChain(node, event)`。
- [ ] `packages/tuffex/packages/utils/__tests__/anchor-delay.test.ts` 新增用例：
  级联向下关闭；cancelChain 取消祖先 pending；requestCloseChain 跳过 click 祖先；
  isEventInsideChain 认后代浮层、不认无关浮层。
- 验证：`cd packages/tuffex && npx vitest run packages/utils/__tests__/anchor-delay.test.ts`
  （.bin shim 若失效走 .pnpm 直调，memory: stale-bin-shims）

## Step 2: TxTooltip / TxBaseAnchor 接线（WP2）

- [ ] TxTooltip：onFloatingEnter/Leave 换链版本；注册传 `hoverCloseable`。
- [ ] TxBaseAnchor：inject 节点 + 服务；open→`setFloatingEl(floatingRef)`、
  close/unmount→null；`handleOutside` 加 `isEventInsideChain` 豁免。
- 验证：tuffex 单测全量 `npx vitest run`；`npm run build`（audit:size 读 dist，
  memory: 先 build 再看尺寸门）

## Step 3: referenceFullWidth 转发（WP3）

- [ ] TxPopover 给 TxTooltip 传 `:reference-full-width="props.referenceFullWidth"`。
- 验证：tuffex build + vue-tsc；nexus 文档页 select/search-select/tree-select/
  cascader/date-picker CDP 目检无回归（memory: nexus-cdp-visual-verification）。

## Step 4: 子菜单组件（WP4）

- [ ] `TxDropdownSubmenu.vue` + types + `dropdown-menu/index.ts` 导出。
- [ ] `TxContextMenuSubmenu.vue` + types + `context-menu/index.ts` 导出。
- [ ] `components.ts` 注册；README（root + components）补行；无 barrel 名称碰撞。
- [ ] 家族测试：dropdown-menu / context-menu `__tests__` 补子菜单开合、
  closeOnSelect 关全链、click 父层点击子面板不关的用例。
- 验证：tuffex 单测全量 + build + vue-tsc。

## Step 5: HeaderUserMenu 重构（WP5)

- [ ] 按 design WP5 重写：trigger=hover、TxDropdownSubmenu、删手写定时器与 hack。
- [ ] 删除的每条 `:global` 规则先确认死活（死规则直接删，活规则找组件 API 替代或保留加注释）。
- 验证：`pnpm nexus:dev` + CDP 截图对比账户菜单（开合、语言子菜单悬停链、
  Language 行行尾对齐、暗色 refraction 视觉)。

## Step 6: 文档（WP4 收尾）

- [ ] nexus dropdown-menu、context-menu 文档页（zh/en）各加子菜单小节 + demo
  （demo 注册链：demo-registry / 内容页引用，zh/en 段数相等，memory: tuffex-doc-style）。
- 验证：`pnpm nexus:build` 或 dev 页面目检两个 demo。

## Step 7: 全量门禁

- [ ] `cd packages/tuffex && npm run build && npx vue-tsc --noEmit`（或包内等价命令）
- [ ] nexus typecheck、core-app typecheck（verify-with-cis-own-command：用各包自己的脚本）
- [ ] `pnpm lint` 涉改文件无新增告警（CoreApp lint 配置 ≠ 根配置，判 delta）
- [ ] 复核 A1–A6 后 `task.py` 收尾、更新 spec（frontend bui/anchor 相关 spec 若有对应节）

## Rollback points

- Step 1–2 独立可回滚（服务 + 接线一起回）；Step 3 单行独立；Step 4 组件新增文件为主；
  Step 5 应用侧独立。Git 逐步提交前不推远端。
