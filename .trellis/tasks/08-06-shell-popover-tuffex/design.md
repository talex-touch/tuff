# Design — 首页 shell 弹层迁移 TuffEx 原语

## 能力映射(现手搓 → 原语)

| 手搓实现 | 原语承接 | 备注 |
|---|---|---|
| 绝对定位 + is-left/is-right | TxPopover placement(`bottom-start` / `top-start`) | composer 位向上弹 |
| document 捕获态 pointerdown 外点关闭 + `[data-*-pill]` closest | TxBaseAnchor `close-on-click-outside`(内建捕获态,trigger 在锚内天然豁免) | 两处 document 监听删除 |
| document keydown Escape | TxBaseAnchor 内建 Escape | 删除 |
| 手写 roving tabindex + 方向键 | TxDropdownMenu 巡航(选择器扩展后认 menuitemradio) | Home/End 白赚 |
| 打开聚焦 checked 项 | 原语聚焦首项 | 接受差异(PRD 记录) |
| 关闭还原焦点到 pill | 原语未见 → 组件层 `@close` 里 `triggerRef.focus()` | 不动原语 |

## TuffEx 改动(最小)

`dropdown-menu/src/TxDropdownMenu.vue:59` 选择器:

```ts
querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')
```

`closest('[role="menu"]')` 校验与 aria-disabled 过滤保持。`__tests__` 补:menuitemradio 行参与方向键巡航、disabled 跳过。TxDropdownItem 不动(CoreApp 自组行标记,checked 打勾/描述行/危险色都是业务样式)。

## CoreApp 结构

### HomeModelMenu.vue(重写为自包含控件)

- 模板骨架:`TxDropdownMenu v-model="open" :placement="placement"` + `#trigger` 槽向外转发(`<slot name="trigger" :open="open" />`,调用方放 pill 并绑 `data` 属性可删);默认槽 = 自动选择行 + 分组(沿用现 groups computed)+ 行按钮 `role="menuitemradio" :aria-checked`。
- Props 变化:`open/align` 双 prop 改为内聚 `placement?: 'top-start' | 'bottom-start'`;对外 emit 保留 `close` 不再需要——调用方 `openMenu` 状态机简化(HomePage/HomeTopBar 各自删除开合管理,若 openMenu 还管别的弹层则只摘出模型项)。
- 选中即关:靠 `closeOnSelect`(inject close 或行 click 后 `open=false`,自组行则手动调)。

### HomePermissionMenu.vue(从 HomePage 抽出)

- Props:`mode`(v-model)、内部状态 confirming;emit:`update:mode`、`reset`。**实现偏差(实现时定):重置不搬入组件,emit `reset` 由 HomePage 处理**——`useAgentTools()` 每次调用都会各自订阅 confirmRequest,组件内再调用会造成第二份 pending 状态与重复订阅;HomePage 已持有唯一实例,toast 也留在那里。pill 的 label/图标/警示态全由 mode 派生,与菜单强耦合,组件自带 pill,HomePage 删 ~230 行弹层代码 + 相关样式。
- 二步确认:默认槽内 v-if 切换(与现逻辑同),切入时 nextTick 聚焦取消键;取消回列表并聚焦 checked 行(组件内 querySelector,原语不管第二步)。
- `agentToolsMode` computed 与 watch 同步逻辑留在 HomePage(业务状态),组件纯 UI。

## 视觉

- 面板参数起点:`panelRadius` 对齐 --shell-radius-md、`panelPadding: 6`、`panelBackground` 目验从 'pure' 与 'refraction' 中选贴近现 --shell-bg 的一档;行样式沿用现 SCSS(类名保留,选择器挪进新结构)。
- 若 TxPopover teleport 到 body:确认 z-index 与 CoreBox/composer 布局不冲突(目验项)。

## 校验矩阵

| 层 | 命令 |
|---|---|
| tuffex | `packages/tuffex` build + vue-tsc + `vitest run dropdown-menu` |
| nexus | `apps/nexus` typecheck(记忆:noUncheckedIndexedAccess 更严) |
| core-app | `npm run typecheck` + `npx vitest run src/renderer/src/modules/conversation/` |
| 手搓清零 | `rg "addEventListener\('pointerdown'|data-model-pill|data-permission-pill" src/renderer/src/views/base/home/` 无弹层残留 |

## 回滚

- commit 1:tuffex 选择器 + 测试;commit 2:HomeModelMenu;commit 3:HomePermissionMenu + HomePage 瘦身。任一可单独 revert(commit 2/3 依赖 1,revert 1 需连带)。
