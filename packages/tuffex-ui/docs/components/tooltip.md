# Tooltip 文字提示

基于 Floating UI 的 hover/focus 提示。

## 基础用法

<DemoBlock title="Tooltip">
<template #preview>
<TxTooltip content="Hello tooltip">
  <TxButton>Hover me</TxButton>
</TxTooltip>
</template>

<template #code>
```vue
<template>
  <TxTooltip content="Hello tooltip">
    <TxButton>Hover me</TxButton>
  </TxTooltip>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `content` | `string` | `''` | 文案 |
| `disabled` | `boolean` | `false` | 禁用 |
| `placement` | `TooltipPlacement` | `'top'` | 浮层位置 |
| `offset` | `number` | `8` | 间距 |
| `openDelay` | `number` | `200` | 打开延迟(ms) |
| `closeDelay` | `number` | `120` | 关闭延迟(ms) |
| `maxWidth` | `number` | `280` | 最大宽度 |
