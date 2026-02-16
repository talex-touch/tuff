# Popover 弹出层

基于 `TxBaseAnchor` 的轻封装弹出层，支持 click / hover 两种触发模式。

Popover 的面板容器使用 `TxCard` 渲染，可通过 `panelVariant/panelBackground/panelShadow/panelRadius/panelPadding` 控制面板样式；并支持 `keepAliveContent` 保留内部状态。

<script setup lang="ts">
import { ref } from 'vue'

import PopoverVisualEffectsDemo from '../.vitepress/theme/components/demos/PopoverVisualEffectsDemo.vue'
import PopoverVisualEffectsDemoSource from '../.vitepress/theme/components/demos/PopoverVisualEffectsDemo.vue?raw'
const open = ref(false)
</script>

## 基础用法

<DemoBlock title="Popover">
<template #preview>
<TxPopover v-model="open">
  <template #reference>
    <TxButton>Click</TxButton>
  </template>

  <div style="width: 240px;">
    <div style="font-weight: 600; margin-bottom: 6px;">Title</div>
    <div style="color: var(--tx-text-color-secondary); font-size: 12px;">Windows-like floating panel.</div>
  </div>
</TxPopover>
</template>

<template #code>
```vue
<template>
  <TxPopover v-model="open">
    <template #reference>
      <TxButton>Click</TxButton>
    </template>

    Popover content
  </TxPopover>
</template>
```
</template>
</DemoBlock>

## 组合模式（trigger / keepAlive / background）

<DemoBlock title="Popover (visual effects)" :code="PopoverVisualEffectsDemoSource">
<template #preview>
<PopoverVisualEffectsDemo />
</template>
</DemoBlock>

## API

### TxPopover Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean` | - | 是否打开（v-model） |
| `disabled` | `boolean` | `false` | 禁用 |
| `placement` | `PopoverPlacement` | `'bottom-start'` | 位置 |
| `offset` | `number` | 自动计算 | 间距（传值优先；未传时：有箭头按 `arrowSize` 自动留距，无箭头为 `2`） |
| `width` | `number` | `0` | 面板宽度（0 = 跟随 reference） |
| `minWidth` | `number` | `0` | 最小宽度（width=0 时也会生效） |
| `maxWidth` | `number` | `360` | 最大宽度 |
| `referenceFullWidth` | `boolean` | `false` | reference 容器是否占满宽度（用于 flex 场景） |
| `showArrow` | `boolean` | `true` | 显示箭头 |
| `arrowSize` | `number` | `12` | 箭头尺寸 |
| `trigger` | `'click' \| 'hover'` | `'click'` | 触发方式 |
| `openDelay` | `number` | `120` | hover 模式下打开延迟（ms） |
| `closeDelay` | `number` | `100` | hover 模式下关闭延迟（ms） |
| `keepAliveContent` | `boolean` | `true` | 是否保留弹层内部状态 |
| `toggleOnReferenceClick` | `boolean` | `trigger === 'click'` | 是否点击 reference 切换开关（用于可编辑输入等场景） |
| `panelVariant` | `'solid' \| 'dashed' \| 'plain'` | `'solid'` | 面板边框形态（TxCard variant） |
| `panelBackground` | `'pure' \| 'mask' \| 'blur' \| 'glass' \| 'refraction'` | `'refraction'` | 面板背景（TxCard background） |
| `panelShadow` | `'none' \| 'soft' \| 'medium'` | `'soft'` | 面板阴影（TxCard shadow） |
| `panelRadius` | `number` | `18` | 面板圆角（TxCard radius） |
| `panelPadding` | `number` | `10` | 面板 padding（TxCard padding） |
| `closeOnClickOutside` | `boolean` | `true` | 点击外部关闭（仅 click trigger 生效） |
| `closeOnEsc` | `boolean` | `true` | ESC 关闭 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `open` | - | 打开 |
| `close` | - | 关闭 |
| `update:modelValue` | `boolean` | v-model 更新 |
