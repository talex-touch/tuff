# GuideState 引导状态

`TxGuideState` 是 `TxEmptyState` 的引导场景快捷封装，固定使用 `variant="guide"`。适用于首次使用、功能介绍、初始化流程等需要引导用户继续操作的场景。

## 基础用法

<DemoBlock title="GuideState">
<template #preview>
<div style="max-width: 420px;">
  <TxGuideState
    :primary-action="{ label: 'Get Started', type: 'primary' }"
    :secondary-action="{ label: 'Learn More' }"
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxGuideState
    :primary-action="{ label: 'Get Started', type: 'primary' }"
    :secondary-action="{ label: 'Learn More' }"
  />
</template>
```

</template>
</DemoBlock>

## 自定义内容

<DemoBlock title="GuideState (custom)">
<template #preview>
<div style="max-width: 420px;">
  <TxGuideState
    title="Create your first workspace"
    description="Workspaces help you organize projects. Follow the steps below to begin."
    surface="card"
    size="large"
    :primary-action="{ label: 'Create Workspace', type: 'primary' }"
  />
</div>
</template>

<template #code>

```vue
<template>
  <TxGuideState
    title="Create your first workspace"
    description="Workspaces help you organize projects. Follow the steps below to begin."
    surface="card"
    size="large"
    :primary-action="{ label: 'Create Workspace', type: 'primary' }"
  />
</template>
```

</template>
</DemoBlock>

## 交互契约

- `TxGuideState` 始终向 `TxEmptyState` 透传 `variant="guide"`。
- 组件不额外改写 `title`、`description`、`surface`、`size` 或 action 配置；显式 props 会原样透传。
- `icon`、`title`、`description`、`actions` 插槽会原样转发给 `TxEmptyState`。

## API

`TxGuideState` 继承 `TxEmptyState` 的全部 Props（除 `variant`）、Slots 和 Events。完整 API 见 [EmptyState](./empty-state.md)。
