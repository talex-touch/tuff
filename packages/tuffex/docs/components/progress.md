# Progress 进度条

进度条组件，用于展示操作进度，支持多种状态。

<script setup lang="ts">
const format = (percentage: number) => `进度 ${percentage}%`
</script>

## 基础用法

基础的进度条用法。

<div style="display: flex; flex-direction: column; gap: 16px;">
  <TuffProgress :percentage="50" />
  <TuffProgress :percentage="75" />
  <TuffProgress :percentage="100" />
</div>

::: details Show Code

```vue
<template>
  <TuffProgress :percentage="50" />
  <TuffProgress :percentage="75" />
  <TuffProgress :percentage="100" />
</template>
```

:::

## 不同状态

进度条可以展示不同状态。

<div style="display: flex; flex-direction: column; gap: 16px;">
  <TuffProgress :percentage="100" status="success" />
  <TuffProgress :percentage="70" status="warning" />
  <TuffProgress :percentage="50" status="error" />
</div>

::: details Show Code

```vue
<template>
  <TuffProgress :percentage="100" status="success" />
  <TuffProgress :percentage="70" status="warning" />
  <TuffProgress :percentage="50" status="error" />
</template>
```

:::

## 不确定进度

当进度未知时，可以使用不确定模式。

<div style="display: flex; flex-direction: column; gap: 16px;">
  <TuffProgress indeterminate />
</div>

::: details Show Code

```vue
<template>
  <TuffProgress indeterminate />
</template>
```

:::

## 自定义高度

可以自定义进度条高度。

<div style="display: flex; flex-direction: column; gap: 16px;">
  <TuffProgress :percentage="60" :stroke-width="10" />
  <TuffProgress :percentage="60" :stroke-width="18" />
</div>

::: details Show Code

```vue
<template>
  <TuffProgress :percentage="60" :stroke-width="10" />
  <TuffProgress :percentage="60" :stroke-width="18" />
</template>
```

:::

## 自定义文本

可以自定义进度条文本。

<div style="display: flex; flex-direction: column; gap: 16px;">
  <TuffProgress :percentage="60" :format="format" />
  <TuffProgress :percentage="100" :show-text="false" />
</div>

::: details Show Code

```vue
<template>
  <TuffProgress :percentage="60" :format="format" />
  <TuffProgress :percentage="100" :show-text="false" />
</template>
```

:::

## API

### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| percentage | 进度百分比 | `number` | `0` |
| status | 进度状态 | `'success' \| 'error' \| 'warning' \| ''` | `''` |
| strokeWidth | 进度条高度 | `number` | `6` |
| showText | 是否显示文本 | `boolean` | `true` |
| indeterminate | 是否为不确定进度 | `boolean` | `false` |
| format | 自定义文本格式 | `(percentage: number) => string` | - |

