# CoreApp UI Contract

> 更新时间：2026-06-13
> 定位：CoreApp renderer UI 组件使用边界，约束本地 legacy UI 向 TuffEx primitives 渐进收口。

## Contract

- 页面层与业务功能代码优先直接使用 TuffEx primitives，例如 `TxButton`、`TxModal`、`TxDrawer`、`TxSwitch`、`TxSelect`、`TxTabs`、`TxIcon`。
- 业务组合层可以继续保留 CoreApp 语义组件，例如 `TuffGroupBlock`、`TuffBlockSlot`、`StatusIcon`，但内部 primitive 必须委托 TuffEx。
- 兼容层只用于迁移期保留历史 API，不允许承载新视觉或交互能力；新代码不得新增对 `components/base/tuff`、`components/base/select`、`components/base/switch`、`components/tabs`、`components/menu` 中 primitive 的依赖。
- `FlipDialog` 暂作为 CoreApp 对 `TxFlipOverlay` 的行为门面保留，直到引用点完成批量迁移。
- `TouchMenu` / `TTabs` 等历史导航面暂不第一阶段迁移，后续按主导航与页面 tab 体验单独切片。

## Current Pilot

- Renderer 根部通过 `TX_ICON_CONFIG_KEY` 注入 CoreApp icon 配置，统一 `file`、本地绝对路径、`/api/*` 与 SVG fetch 行为。
- 直接引用本地 `TuffIcon` 的页面与组件已切到 `@talex-touch/tuffex/icon` 的 `TxIcon`。
- `TButton`、`TModal`、`TSwitch` 新调用已迁到 TuffEx；旧文件仅作为 legacy adaptor 暂留。
- `TuffBlock*` 属业务组合层，当前保留 API，并将内部 switch/icon/input/select primitive 收口到 TuffEx。
- Drawer pilot 已从能力测试弹层迁到 `TxDrawer`；复杂多抽屉场景继续走后续小切片。

## Validation

- 本地 contract 扫描：`node "scripts/check-coreapp-ui-contract.mjs"`。
- 最近路径类型检查：`pnpm -C "apps/core-app" run typecheck:web`。
- Icon 配置单测：`pnpm -C "apps/core-app" exec vitest run "src/renderer/src/modules/tuffex/icon-config.test.ts" "src/renderer/src/components/base/tuff-icon-rendering.test.ts"`。
