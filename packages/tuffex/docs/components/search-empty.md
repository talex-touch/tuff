# SearchEmpty 搜索空态

`TxSearchEmpty` 是 `TxEmptyState` 的搜索空态快捷封装，固定使用 `variant="search-empty"`。适用于查询无结果或筛选条件排除所有数据的状态提示。

## 基础用法

<DemoBlock title="SearchEmpty">
<template #preview>
<div style="max-width: 420px;">
  <TxSearchEmpty description="Try another keyword or filter." />
</div>
</template>

<template #code>
```vue
<template>
  <TxSearchEmpty description="Try another keyword or filter." />
</template>
```
</template>
</DemoBlock>

## API

`TxSearchEmpty` 继承 `TxEmptyState` 的全部 Props（除 `variant`）、Slots 和 Events。完整 API 见 [EmptyState](./empty-state.md)。

## 交互契约

- `TxSearchEmpty` 始终向 `TxEmptyState` 透传 `variant="search-empty"`。
- 组件不额外改写 `title`、`description`、`surface` 或 action 配置；显式 props 会原样透传。
- `icon`、`title`、`description`、`actions` 插槽会原样转发给 `TxEmptyState`。
