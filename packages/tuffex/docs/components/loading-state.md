# LoadingState 加载态

`TxLoadingState` 是 `TxEmptyState` 的加载场景快捷封装，固定使用 `variant="loading"`。适用于数据、插件或远程资源加载期间的占位展示。

## 基础用法

<DemoBlock title="LoadingState">
<template #preview>
<div style="max-width: 420px;">
  <TxLoadingState description="Loading official plugins..." />
</div>
</template>

<template #code>
```vue
<template>
  <TxLoadingState description="Loading official plugins..." />
</template>
```
</template>
</DemoBlock>

## API

`TxLoadingState` 继承 `TxEmptyState` 的全部 Props（除 `variant`）、Slots 和 Events。完整 API 见 [EmptyState](./empty-state.md)。

## 交互契约

- `TxLoadingState` 始终向 `TxEmptyState` 透传 `variant="loading"`。
- 组件不额外改写 `title`、`description`、`loading` 或 action 配置；显式 props 会原样透传。
- `icon`、`title`、`description`、`actions` 插槽会原样转发给 `TxEmptyState`。
