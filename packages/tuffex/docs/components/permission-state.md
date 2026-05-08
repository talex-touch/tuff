# PermissionState 权限不足

`TxPermissionState` 是 `TxEmptyState` 的权限场景快捷封装，固定使用 `variant="permission"`。适用于权限不足、未授权或缺少访问资格的状态提示。

## 基础用法

<DemoBlock title="PermissionState">
<template #preview>
<div style="max-width: 420px;">
  <TxPermissionState
    description="Request access to continue."
    :primary-action="{ label: 'Request access', type: 'primary' }"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxPermissionState
    description="Request access to continue."
    :primary-action="{ label: 'Request access', type: 'primary' }"
  />
</template>
```
</template>
</DemoBlock>

## API

`TxPermissionState` 继承 `TxEmptyState` 的全部 Props（除 `variant`）、Slots 和 Events。完整 API 见 [EmptyState](./empty-state.md)。

## 交互契约

- `TxPermissionState` 始终向 `TxEmptyState` 透传 `variant="permission"`。
- 组件不额外改写 `title`、`description`、`surface` 或 action 配置；显式 props 会原样透传。
- `icon`、`title`、`description`、`actions` 插槽会原样转发给 `TxEmptyState`。
