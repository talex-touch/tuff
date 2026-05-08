# ErrorState 错误状态

`TxErrorState` 是 `TxEmptyState` 的错误场景快捷封装，固定使用 `variant="error"`。适用于请求失败、系统异常、保存失败等需要用户重试或返回的场景。

## 基础用法

<DemoBlock title="ErrorState">
<template #preview>
<div style="max-width: 420px;">
  <TxErrorState
    :primary-action="{ label: 'Retry', type: 'primary' }"
    :secondary-action="{ label: 'Go Back' }"
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxErrorState
    :primary-action="{ label: 'Retry', type: 'primary' }"
    :secondary-action="{ label: 'Go Back' }"
  />
</template>
```

</template>
</DemoBlock>

## 自定义内容

<DemoBlock title="ErrorState (custom)">
<template #preview>
<div style="max-width: 420px;">
  <TxErrorState
    title="Failed to load data"
    description="The server returned error 500. Please check your network and try again."
    surface="card"
    :primary-action="{ label: 'Retry', type: 'primary' }"
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxErrorState
    title="Failed to load data"
    description="The server returned error 500. Please check your network and try again."
    surface="card"
    :primary-action="{ label: 'Retry', type: 'primary' }"
  />
</template>
```

</template>
</DemoBlock>

## 交互契约

- `TxErrorState` 始终向 `TxEmptyState` 透传 `variant="error"`。
- 组件不额外改写 `title`、`description`、`surface` 或 action 配置；显式 props 会原样透传。
- `icon`、`title`、`description`、`actions` 插槽会原样转发给 `TxEmptyState`。

## API

`TxErrorState` 继承 `TxEmptyState` 的全部 Props（除 `variant`）、Slots 和 Events。完整 API 见 [EmptyState](./empty-state.md)。
