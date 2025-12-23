# Tooltip 文字提示

基于 Floating UI 的提示组件，支持 hover/click/focus，支持 arrow 与可交互内容。

<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

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

## Click 触发

<DemoBlock title="Tooltip (click)">
<template #preview>
<TxTooltip v-model="open" trigger="click" content="Click to toggle" show-arrow>
  <TxButton>Click me</TxButton>
</TxTooltip>
</template>

<template #code>
```vue
<template>
  <TxTooltip v-model="open" trigger="click" content="Click to toggle" show-arrow>
    <TxButton>Click me</TxButton>
  </TxTooltip>
</template>
```
</template>
</DemoBlock>

## 可交互内容

<DemoBlock title="Tooltip (interactive content)">
<template #preview>
<TxTooltip trigger="hover" interactive show-arrow>
  <TxButton>Hover me</TxButton>

  <template #content>
    <div style="width: 220px; display: grid; gap: 8px;">
      <div style="font-weight: 600;">Title</div>
      <div style="color: var(--tx-text-color-secondary); font-size: 12px;">You can move mouse into tooltip.</div>
      <TxButton size="small" type="primary">Action</TxButton>
    </div>
  </template>
</TxTooltip>
</template>

<template #code>
```vue
<template>
  <TxTooltip trigger="hover" interactive show-arrow>
    <TxButton>Hover me</TxButton>
    <template #content>
      <div style="width: 220px; display: grid; gap: 8px;">
        <div style="font-weight: 600;">Title</div>
        <div style="font-size: 12px;">You can move mouse into tooltip.</div>
      </div>
    </template>
  </TxTooltip>
</template>
```
</template>
</DemoBlock>

## 延迟与位置

<DemoBlock title="Tooltip (delay & placement)">
<template #preview>
<div style="display: flex; gap: 12px; flex-wrap: wrap;">
  <TxTooltip content="top" placement="top" :open-delay="0" :close-delay="0" show-arrow>
    <TxButton>Top</TxButton>
  </TxTooltip>
  <TxTooltip content="bottom" placement="bottom" :open-delay="600" :close-delay="200" show-arrow>
    <TxButton>Bottom (delay)</TxButton>
  </TxTooltip>
</div>
</template>

<template #code>
```vue
<template>
  <TxTooltip content="top" placement="top" :open-delay="0" :close-delay="0" show-arrow>
    <TxButton>Top</TxButton>
  </TxTooltip>
  <TxTooltip content="bottom" placement="bottom" :open-delay="600" :close-delay="200" show-arrow>
    <TxButton>Bottom (delay)</TxButton>
  </TxTooltip>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean` | - | v-model 控制打开状态 |
| `content` | `string` | `''` | 文案 |
| `disabled` | `boolean` | `false` | 禁用 |
| `trigger` | `'hover' \| 'click' \| 'focus'` | `'hover'` | 触发方式 |
| `placement` | `TooltipPlacement` | `'top'` | 浮层位置 |
| `offset` | `number` | `8` | 间距 |
| `openDelay` | `number` | `200` | 打开延迟(ms) |
| `closeDelay` | `number` | `120` | 关闭延迟(ms) |
| `maxWidth` | `number` | `280` | 最大宽度 |
| `showArrow` | `boolean` | `false` | 显示箭头 |
| `interactive` | `boolean` | `false` | 允许鼠标进入 tooltip 内容 |
| `closeOnClickOutside` | `boolean` | `true` | click trigger 下点击外部关闭 |
