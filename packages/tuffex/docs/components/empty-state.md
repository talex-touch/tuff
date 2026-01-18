# EmptyState 空态引导

通用空态/引导组件，适用于页面为空、未选择、无权限等场景。

## 基础用法

<DemoBlock title="EmptyState (variant)">
<template #preview>
<div style="max-width: 420px;">
  <TxEmptyState
    variant="no-data"
    :primary-action="{ label: 'Create', type: 'primary' }"
    :secondary-action="{ label: 'Refresh' }"
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxEmptyState
    variant="no-data"
    :primary-action="{ label: 'Create', type: 'primary' }"
    :secondary-action="{ label: 'Refresh' }"
  />
</template>
```
</template>
</DemoBlock>

## 横向布局

<DemoBlock title="EmptyState (horizontal)">
<template #preview>
<div style="max-width: 520px;">
  <TxEmptyState
    variant="no-selection"
    layout="horizontal"
    surface="card"
    title="No selection"
    description="Pick an item from the left to continue."
  />
</div>
</template>

<template #code>
```vue
<template>
  <TxEmptyState
    variant="no-selection"
    layout="horizontal"
    surface="card"
    title="No selection"
    description="Pick an item from the left to continue."
  />
</template>
```
</template>
</DemoBlock>

## 自定义插槽

<DemoBlock title="EmptyState (slots)">
<template #preview>
<div style="max-width: 420px;">
  <TxEmptyState variant="custom">
    <template #icon>
      <TxIcon name="i-carbon-search" :size="28" />
    </template>
    <template #title>
      Setup required
    </template>
    <template #description>
      Connect a workspace to enable this feature.
    </template>
    <template #actions>
      <TxButton type="primary">Connect</TxButton>
      <TxButton>Learn more</TxButton>
    </template>
  </TxEmptyState>
</div>
</template>

<template #code>
```vue
<template>
  <TxEmptyState variant="custom">
    <template #icon>
      <TxIcon name="i-carbon-search" :size="28" />
    </template>
    <template #title>
      Setup required
    </template>
    <template #description>
      Connect a workspace to enable this feature.
    </template>
    <template #actions>
      <TxButton type="primary">Connect</TxButton>
      <TxButton>Learn more</TxButton>
    </template>
  </TxEmptyState>
</template>
```
</template>
</DemoBlock>

## 预设组件

- `TxBlankSlate`：大尺寸空白页（默认 `size="large"`）
- `TxLoadingState`：加载态占位（默认 `variant="loading"`）
- `TxNoSelection`：未选择占位（默认 `variant="no-selection"`）
- `TxNoData`：无数据占位（默认 `variant="no-data"`）
- `TxSearchEmpty`：搜索空态（默认 `variant="search-empty"`）
- `TxOfflineState`：离线提示（默认 `variant="offline"`）
- `TxPermissionState`：权限不足（默认 `variant="permission"`）

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `variant` | `EmptyStateVariant` | `'empty'` | 预设场景 |
| `title` | `string` | - | 标题 |
| `description` | `string` | - | 描述 |
| `icon` | `TxIconSource \| string \| null` | - | 图标（string 为 class/name） |
| `iconSize` | `number` | - | 图标尺寸 |
| `layout` | `'vertical' \| 'horizontal'` | `'vertical'` | 布局方向 |
| `align` | `'start' \| 'center' \| 'end'` | `'center'` | 对齐方式 |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | 尺寸等级 |
| `surface` | `'plain' \| 'card'` | `'plain'` | 表面风格 |
| `primaryAction` | `EmptyStateAction` | - | 主操作配置 |
| `secondaryAction` | `EmptyStateAction` | - | 次操作配置 |
| `actionSize` | `TxButtonProps['size']` | `'small'` | 操作按钮尺寸 |
| `loading` | `boolean` | `false` | 强制 loading 图标 |

### EmptyStateAction

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `label` | `string` | - | 按钮文本 |
| `type` | `TxButtonProps['type']` | - | 按钮类型 |
| `variant` | `TxButtonProps['variant']` | - | 按钮变体 |
| `size` | `TxButtonProps['size']` | - | 按钮尺寸 |
| `disabled` | `boolean` | `false` | 禁用状态 |
| `icon` | `string` | - | 图标 class |

### Slots

| 名称 | 说明 |
|------|------|
| `icon` | 自定义图标区 |
| `title` | 标题 |
| `description` | 描述 |
| `actions` | 操作区 |

### Events

| 事件名 | 说明 |
|------|------|
| `primary` | 主操作点击 |
| `secondary` | 次操作点击 |
