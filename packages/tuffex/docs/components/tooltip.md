# Tooltip 文字提示

`TxTooltip` 是 `TxBaseAnchor` 的语义封装，负责触发逻辑与提示内容渲染。

定位、动效和面板样式通过 `anchor` 参数透传到 `TxBaseAnchor`，Tooltip 只保留提示场景需要的最小 API。

<script setup lang="ts">
import { ref } from 'vue'

import TooltipVisualEffectsDemo from '../.vitepress/theme/components/demos/TooltipVisualEffectsDemo.vue'
import TooltipVisualEffectsDemoSource from '../.vitepress/theme/components/demos/TooltipVisualEffectsDemo.vue?raw'

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

## 透传 Anchor 参数

<DemoBlock title="Tooltip (anchor passthrough)">
<template #preview>
<TxTooltip
  content="Bottom tooltip with arrow"
  :anchor="{ placement: 'bottom', showArrow: true, panelBackground: 'mask' }"
>
  <TxButton>Bottom</TxButton>
</TxTooltip>
</template>

<template #code>
```vue
<template>
  <TxTooltip
    content="Bottom tooltip with arrow"
    :anchor="{ placement: 'bottom', showArrow: true, panelBackground: 'mask' }"
  >
    <TxButton>Bottom</TxButton>
  </TxTooltip>
</template>
```
</template>
</DemoBlock>

## Click 触发

<DemoBlock title="Tooltip (click)">
<template #preview>
<TxTooltip
  v-model="open"
  trigger="click"
  content="Click to toggle"
  :anchor="{ showArrow: true }"
>
  <TxButton>Click me</TxButton>
</TxTooltip>
</template>

<template #code>
```vue
<template>
  <TxTooltip
    v-model="open"
    trigger="click"
    content="Click to toggle"
    :anchor="{ showArrow: true }"
  >
    <TxButton>Click me</TxButton>
  </TxTooltip>
</template>
```
</template>
</DemoBlock>

## 可交互内容

<DemoBlock title="Tooltip (interactive content)">
<template #preview>
<TxTooltip trigger="hover" interactive :anchor="{ showArrow: true }">
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
  <TxTooltip trigger="hover" interactive :anchor="{ showArrow: true }">
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

## Anchor 面板预设

<DemoBlock title="Tooltip (anchor presets)" :code="TooltipVisualEffectsDemoSource">
<template #preview>
<TooltipVisualEffectsDemo />
</template>
</DemoBlock>

## API

### Tooltip Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean` | - | v-model 控制打开状态 |
| `content` | `string` | `''` | 默认提示文案 |
| `disabled` | `boolean` | `false` | 禁用 |
| `trigger` | `'hover' \| 'click' \| 'focus'` | `'hover'` | 触发方式 |
| `openDelay` | `number` | `200` | 打开延迟(ms) |
| `closeDelay` | `number` | `120` | 关闭延迟(ms) |
| `interactive` | `boolean` | `false` | hover 模式下允许鼠标进入浮层 |
| `referenceFullWidth` | `boolean` | `false` | reference 容器是否占满宽度 |
| `maxHeight` | `number` | `320` | Tooltip 内容最大高度 |
| `anchor` | `Partial<BaseAnchorProps>` | `{}` | 透传给 `TxBaseAnchor` 的配置 |

### anchor 常用字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `placement` | `BaseAnchorPlacement` | `'top'` | 浮层位置 |
| `offset` | `number` | `8` | 与 reference 的间距 |
| `width` | `number` | `0` | 面板宽度（0 为内容宽度） |
| `minWidth` | `number` | `0` | 最小宽度 |
| `maxWidth` | `number` | `280` | 最大宽度 |
| `matchReferenceWidth` | `boolean` | `false` | 是否跟随 reference 宽度 |
| `showArrow` | `boolean` | `false` | 是否显示箭头 |
| `panelBackground` | `'pure' \| 'mask' \| 'blur' \| 'glass' \| 'refraction'` | `'refraction'` | 面板背景 |
| `panelShadow` | `'none' \| 'soft' \| 'medium'` | `'soft'` | 面板阴影 |
| `panelRadius` | `number` | `10` | 面板圆角 |
| `panelPadding` | `number` | `8` | 面板内边距 |
| `duration` | `number` | `432` | 打开动画时长(ms) |
| `ease` | `string` | `'back.out(2)'` | 打开动画缓动 |
| `closeOnClickOutside` | `boolean` | `trigger === 'click'` | 点击外部关闭 |
| `closeOnEsc` | `boolean` | `true` | ESC 关闭 |
| `toggleOnReferenceClick` | `boolean` | `trigger === 'click'` | 点击 reference 是否切换开关 |
