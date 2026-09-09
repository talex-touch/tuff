# Design — TxTransfer 面板内部滚动与双侧搜索

## 1. 根因

`.tx-transfer__panel` 是 `display:flex; flex-direction:column; min-height:240px`，没有任何高度上限；`.tx-transfer__list` 的 `flex:1 + overflow:auto` 在父容器高度由内容决定时不会产生滚动条，列表把面板一路撑高。因此：

- 滚动条落在 FlipDialog 外层，弹窗标题、筛选框、中间移动按钮全部被滚出视野；
- 两个面板高度不一致时（249 vs 0），短的那个在长面板旁边看起来像空白。

修复点只有一个：**给面板一个高度上限，并让列表成为唯一的滚动容器**。

## 2. TuffEx `TxTransfer` 变更

### 2.1 类型（`transfer/src/types.ts`）

```ts
export interface TransferProps {
  // ...existing
  emptyText?: string | [string, string]   // 收窄→放宽：单文案或 [source, target]
  maxHeight?: string | number             // 面板高度上限，数字按 px
  orderable?: boolean                     // 目标面板显示序号与上移/下移
  moveUpAriaLabel?: string
  moveDownAriaLabel?: string
}
```

`maxHeight` 命名沿用仓库既有约定（`TxDataTable` / `TxMarkdownEditor` 都是 `maxHeight?: string | number`），并复用各组件本地的 `toCssUnit` 写法。

### 2.2 滚动布局

- 根节点在 `maxHeight` 有值时写入内联 `--tx-transfer-max-height`；
- `.tx-transfer__panel { max-height: var(--tx-transfer-max-height, 320px); }`——**默认值放在 CSS 兜底而不是 prop 默认值**，这样未传 prop 的既有调用方不会出现内联样式，同时也拿到高度上限（这是 bug 修复的关键：默认必须有上限）；
- `.tx-transfer__panel-header` / `.tx-transfer__filter` 设 `flex: none`，`.tx-transfer__list` 加 `min-height: 0`，使其成为唯一滚动容器；
- `.tx-transfer` 的 `align-items: center` 改为 `stretch`，两侧面板等高，避免短面板悬浮在长面板中间。

### 2.3 排序（`orderable`）

- `targetItems`：`orderable` 为真时一律按 `modelValue` 顺序，忽略 `targetOrder`；
- `resolveOrder`：`orderable` 为真时直接返回传入顺序。**这是必须的**——否则 `targetOrder='original'`（默认值）会在每次 `emitChange` 时把顺序重排回 `data` 顺序，上移/下移看起来"没反应"。该行为写一条负控制用例；
- 目标行结构从 `<label>` 提升为 `<div class="tx-transfer__row">`：`<label>`（复选框 + 序号 + 文本）+ 排序按钮组；
- 序号与"是否首/末项"都基于**未过滤**的 `targetItems`，不能用 `filteredTarget` 的下标，否则搜索状态下序号和禁用判定都是错的；
- 排序按钮 aria-label 为 `` `${moveUpAriaLabel}: ${item.label}` ``，避免同一页面出现 N 个同名按钮。

### 2.4 空态

`emptyText` 支持元组后，用两个 computed 解析 `sourceEmptyText` / `targetEmptyText`，字符串形态保持原语义（两侧同文案）。

### 2.5 不做的事

- 不加插槽。自定义/新增模型输入放在 CoreApp 侧穿梭框下方，两个弹窗版式因此一致，通用组件也不必知道"模型"这个业务概念。
- 不加 `disabled` 整体禁用 prop。CoreApp 侧包一层 `.is-disabled { opacity; pointer-events: none }` 即可，与现状一致。
- 不加逐行删除按钮（见 PRD 的 accepted trade-offs）。

## 3. CoreApp 变更

### 3.1 `CapabilityModelTransfer.vue`（改为 TxTransfer 的语义包装层）

对外 props / emits 完全不变（`modelValue`、`availableModels`、`scopeKey`、`disabled` / `update:modelValue`），因此 `AISDKCapabilityDetails.vue`、`IntelligenceCapabilityInfo.vue` 两个调用方和 `AISDKCapabilityDetails.test.ts` 的存根都不用改。

保留的业务逻辑：

- `seenModels` 跟踪（自定义添加过的模型在移回左侧后仍可见）；
- `scopeKey` 变化时重置；
- 归一化 / 去重 / `emitSelection`；
- 自定义模型 ID 输入 + 回车添加。

删除的本地实现：列表 DOM、双击移动、逐行删除、面板样式。

传给 `TxTransfer`：`:data`（可用池 ∪ seen ∪ 已选，按 `localeCompare` 排序）、`filterable`、`:filter-placeholder`、`:titles`、`:empty-text="[可选为空文案, 已绑定为空文案]"`、`orderable`、`target-order="push"`、`:max-height`、四个本地化 aria-label。

### 3.2 `IntelligenceModelConfig.vue`

- 传 `:max-height` 与本地化的 `add-aria-label` / `remove-aria-label`；
- 删掉与新布局冲突的 `:deep(.tx-transfer)` / `:deep(.tx-transfer__panel)` 最小高度覆盖，保留必要的圆角/间距。

### 3.3 i18n（zh-CN 与 en-US 成对）

| key | 用途 |
|---|---|
| `settings.intelligence.transferFilterPlaceholder` | 模型优先级两侧搜索占位 |
| `settings.intelligence.transferAddAriaLabel` / `transferRemoveAriaLabel` | 中间移动按钮 |
| `settings.intelligence.transferMoveUpAriaLabel` / `transferMoveDownAriaLabel` | 优先级上移/下移 |
| `intelligence.config.model.transferAddAriaLabel` / `transferRemoveAriaLabel` | 管理模型的移动按钮 |

## 4. 文档与 demo（同提交）

- `apps/nexus/content/docs/dev/components/transfer.zh.mdc` / `.en.mdc`：props 表新增 4 行、`emptyText` 类型更新、新增「优先级排序」示例小节、最佳实践补长列表用 `maxHeight`、审阅说明的覆盖行更新；
- 新增 demo `apps/nexus/app/components/content/demos/TransferOrderableDemo.vue`，在 `demo-registry.ts` 按字母序注册（紧邻 `TransferTransferDemo`），保证不是孤儿 demo。

## 5. 兼容性

- 既有调用方（nexus 三处 demo/gallery）条目数都在 5 条以内，短于 320px 默认上限，视觉不变；
- `emptyText` 由 `string` 放宽为联合类型，是向后兼容的放宽；
- 未传 `orderable` 时目标面板 DOM 结构新增一层 `.tx-transfer__row` 包装 —— 既有测试断言的是 `.tx-transfer__item` / `.tx-checkbox` / `.tx-transfer__label`，不受影响。

## 6. 风险

| 风险 | 处理 |
|---|---|
| `resolveOrder` 把排序重排回 data 顺序 | `orderable` 短路 + 负控制用例 |
| 搜索状态下序号/禁用判定错位 | 序号与边界基于未过滤的 `targetItems`，用例覆盖 |
| 默认 320px 上限对某些消费方偏矮 | 上限可用 prop 或 CSS 变量覆盖，文档写明 |
| CoreApp typecheck 会重写 tuffex `dist` | 校验顺序：先 tuffex 测试/typecheck，再 core-app typecheck；如需再跑 tuffex 门禁则重新 build |
