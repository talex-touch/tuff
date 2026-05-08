# NoData 无数据

`TxNoData` 是 `TxEmptyState` 的无数据场景快捷封装，固定使用 `variant="no-data"`。适用于列表、表格、图表或其它数据视图为空的状态提示。

## 基础用法

<DemoBlock title="NoData">
<template #preview>
<div style="max-width: 420px;">
  <TxNoData
    description="No records yet."
    :primary-action="{ label: 'Create', type: 'primary' }"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxNoData
    description="No records yet."
    :primary-action="{ label: 'Create', type: 'primary' }"
  />
</template>
```
</template>
</DemoBlock>

## API

`TxNoData` 继承 `TxEmptyState` 的全部 Props（除 `variant`）、Slots 和 Events。完整 API 见 [EmptyState](./empty-state.md)。

## 交互契约

- `TxNoData` 始终向 `TxEmptyState` 透传 `variant="no-data"`。
- 组件不额外改写 `title`、`description`、`surface` 或 action 配置；显式 props 会原样透传。
- `icon`、`title`、`description`、`actions` 插槽会原样转发给 `TxEmptyState`。
