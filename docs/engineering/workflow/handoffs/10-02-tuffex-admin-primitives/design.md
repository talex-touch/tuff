# Design — TuffEx 后台通用件

## 1. TxDescriptions

```
packages/tuffex/packages/components/src/descriptions/
  index.ts                     # withInstall(TxDescriptions), withInstall(TxDescriptionsItem)；导出类型
  src/TxDescriptions.vue       # <dl class="tx-descriptions" :class="[--layout, --size]">，provide 上下文
  src/TxDescriptionsItem.vue   # <div class="tx-descriptions__item"><dt/><dd/></div>，inject 上下文
  src/types.ts
  __tests__/descriptions.test.ts
```

- 类型：`DescriptionsLayout = 'horizontal' | 'vertical'`、`DescriptionsSize = 'sm' | 'md'`；`DescriptionsProps { columns?: number; layout?; size?; emptyText?: string; labelWidth?: string | number }`；`DescriptionsItemProps { label?: string; span?: number }`。泛型名加前缀，避免在 `components.ts` 星号桶里撞名被静默丢弃。
- 布局：`display: grid; grid-template-columns: repeat(var(--tx-descriptions-columns), minmax(0, 1fr))`；`span` → `grid-column: span n`；用容器查询在容器 < 480px 时退为 1 列（`container-type: inline-size` 放在根上）。horizontal 时项内再分 `labelWidth` + `1fr` 两列；vertical 时标签在上。
- 空值：`<dd>` 无内容（插槽为空或仅空白）时渲染 `emptyText`，用 `useSlots()` 判断，避免把 `0` 当空。
- 无交互，不需要焦点管理；颜色只用 `--tx-text-color-secondary`（标签）/ `--tx-text-color-primary`（值）等 token。

## 2. TxDataTable 骨架加载态

- props：`loadingVariant?: 'overlay' | 'skeleton'`（默认 `'overlay'`）、`skeletonRows?: number`（默认 5）。
- 计算 `showSkeleton = loading && loadingVariant === 'skeleton' && displayRows.length === 0`；`showOverlay = loading && loadingVariant === 'overlay'`；`showRefreshBar = loading && loadingVariant === 'skeleton' && displayRows.length > 0`。
- 骨架行：`<tr v-for="n in skeletonRows" aria-hidden="true" class="tx-data-table__row tx-data-table__row--skeleton">`，每列一个 `<td>`（含 expandable / selectable 的占位列），内放 `TxSkeleton`（宽度按列序做 60%–90% 的确定性变化，不用随机数，保证 SSR / 客户端一致）；行高与真实行一致（复用单元格 padding）。
- 空态行条件改为 `!displayRows.length && !loading`（不变）——骨架时自然不显示空态。
- 刷新条：表头 `<thead>` 下方 2px 的不确定进度条，`prefers-reduced-motion` 时静止显示；不遮挡、不改行透明度。
- `aria-busy` 保持跟随 `loading`。

## 3. TxPagination 每页条数

- props：`pageSizes?: number[]`、`pageSize`（已有）配合 `v-model:pageSize`；`pageSizeLabel?: string`（默认 `'per page'`）。
- emits：`'update:pageSize': [size: number]`、`'pageSizeChange': [size: number]`。只发事件，不在组件内重置页码（调用方决定回第 1 页，避免双重 `pageChange`）。
- 选择器放在信息区之前；`pageSizes` 为空或未提供时不渲染，DOM 与现在一致。
- 选项文案：`${size} / ${pageSizeLabel}`，可经 `#page-size-option` 插槽覆盖。

## 4. 文档

- `descriptions.{zh,en}.mdc`：结构仿近期新增组件文档（如 `gradient-border.zh.mdc`），节：概述（H1 下不写导语）、基础用法、布局、列与跨列、空值、`## API`、`### TxDescriptions Props` / `### TxDescriptionsItem Props`、插槽、交互契约、最佳实践；中英 H2 / H3 数量一致。
- `data-table` 与 `pagination` 文档：新增「骨架加载」「每页条数」demo 与对应 Props 行、交互契约条目；查包装组件：`rg -l "\.\./\.\./data-table'|\.\./\.\./pagination'" packages/tuffex/packages/components/src --glob '*.vue'`，每个命中各自文档页同步。
- 新组件在侧边栏、组件索引页（中英）放进所属分类的正确位置，不追加到末尾。

## 5. 兼容

- 新 prop 全部可选，默认值保持现有行为；现有调用方零改动。
- `since: 0.6.3` 依赖 0.6.3 尚未发布；动手前 `npm view @talex-touch/tuffex versions` 复核，若 0.6.3 已发布则改用下一个版本并询问老板。
