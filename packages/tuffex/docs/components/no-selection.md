# NoSelection 未选择

`TxNoSelection` 是 `TxEmptyState` 的未选择场景快捷封装，固定使用 `variant="no-selection"`。适用于详情面板、检查器或分栏视图尚未选择任何项的状态提示。

## 基础用法

<DemoBlock title="NoSelection">
<template #preview>
<div style="max-width: 420px;">
  <TxNoSelection description="Select an item to see its details." />
</div>
</template>

<template #code>
```vue
<template>
  <TxNoSelection description="Select an item to see its details." />
</template>
```
</template>
</DemoBlock>

## API

`TxNoSelection` 继承 `TxEmptyState` 的全部 Props（除 `variant`）、Slots 和 Events。完整 API 见 [EmptyState](./empty-state.md)。

## 交互契约

- `TxNoSelection` 始终向 `TxEmptyState` 透传 `variant="no-selection"`。
- 组件不额外改写 `title`、`description`、`surface` 或 action 配置；显式 props 会原样透传。
- `icon`、`title`、`description`、`actions` 插槽会原样转发给 `TxEmptyState`。
