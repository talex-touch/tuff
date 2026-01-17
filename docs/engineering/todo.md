# TODO

## 已完成

- 插件详情页（`PluginInfo`）滚动收缩：隐藏描述/徽章，缩小图标与 padding，状态条收起并把状态入口收进头部右侧
- Tabs 滚动统一：`TTabs` / `TvTabs` 从 `ElScrollbar` 切换为 `TouchScroll`（TxScroll 封装）
- Plugin 页面滚动统一：
  - `Plugin.vue` 主内容区 `overflow-auto` → `TouchScroll`
  - `PluginIssues.vue` / `PluginStorage.vue` 列表滚动 → `TouchScroll`，并向上回传 `scroll` 事件以维持头部收缩逻辑
  - `PluginItem.vue` Popover issues 列表滚动 → `TouchScroll (native)`
  - `PluginFeatures.vue` JSON 横向滚动 → `TouchScroll (native, horizontal)`
- TxScroll 滚动回归修复：
  - wheel handler：在 **不可滚动** 的情况下不再吞掉 `wheel`（避免“看起来无法滚动/父级无法接管”）
  - `TTabs` 布局：修复 `align-items: center` 导致滚动容器高度不成立的问题
- 渐变模糊（TxGradualBlur）接入：
  - `ViewTemplate` 顶/底渐变模糊（覆盖大多数基础页面）
  - `TuffAsideTemplate` 主内容区顶/底渐变模糊（覆盖 Plugin/Market 等侧栏布局页面）
- 全局 TxScroll 收尾（已迁移 3 处）：
  - `apps/core-app/src/renderer/src/components/flow/FlowSelector.vue`
  - `apps/core-app/src/renderer/src/views/base/intelligence/IntelligenceAuditPage.vue`
  - `apps/core-app/src/renderer/src/components/base/dialog/TPopperDialog.vue`

## 待确认 / 待处理

- 体验走查：插件详情页各 Tab（尤其 `Logs`）内部滚动时，头部收缩是否符合预期（当前 `Issues/Storage` 已回传滚动；`Logs` 若内部自带滚动，可能也需要回传）
- 嵌套滚动策略：`TouchScroll` 套 `TouchScroll` 时的滚轮/触控板事件传递（是否需要 `scrollChaining` 或统一只保留一层滚动容器）
- 全局 TxScroll 收尾（可选）：renderer 仍存在其它 `overflow-*`（部分为 dialog/test/preview 组件），是否继续统一到 `TouchScroll`（建议按“需要 sticky header/原生链式滚动”与“需要 BetterScroll 统一手感”两类拆分策略）
- 样式影响范围确认：`TvTabs` 为适配 `TouchScroll` 加的 `:deep(.tx-scroll__content)` 是否会带来副作用（如有则进一步局部化）
  - `apps/core-app/src/renderer/src/components/tabs/vertical/TvTabs.vue`

## 备注

- `npm run typecheck:web` 当前仓库存在既有类型错误（与本次 UI/滚动改动无关），暂时无法作为本次变更的回归信号。
