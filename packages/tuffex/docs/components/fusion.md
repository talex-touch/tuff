# Fusion 交融

两个元素交融与分开的视觉组件。

<script setup lang="ts">
import FusionBasicDemo from '../.vitepress/theme/components/demos/FusionBasicDemo.vue'
import FusionBasicDemoSource from '../.vitepress/theme/components/demos/FusionBasicDemo.vue?raw'

import FusionButtonTooltipDemo from '../.vitepress/theme/components/demos/FusionButtonTooltipDemo.vue'
import FusionButtonTooltipDemoSource from '../.vitepress/theme/components/demos/FusionButtonTooltipDemo.vue?raw'

import FusionAvatarBadgeDemo from '../.vitepress/theme/components/demos/FusionAvatarBadgeDemo.vue'
import FusionAvatarBadgeDemoSource from '../.vitepress/theme/components/demos/FusionAvatarBadgeDemo.vue?raw'

import FusionChipIconDemo from '../.vitepress/theme/components/demos/FusionChipIconDemo.vue'
import FusionChipIconDemoSource from '../.vitepress/theme/components/demos/FusionChipIconDemo.vue?raw'

import FusionMiniCardFabDemo from '../.vitepress/theme/components/demos/FusionMiniCardFabDemo.vue'
import FusionMiniCardFabDemoSource from '../.vitepress/theme/components/demos/FusionMiniCardFabDemo.vue?raw'

import FusionTwoButtonsDemo from '../.vitepress/theme/components/demos/FusionTwoButtonsDemo.vue'
import FusionTwoButtonsDemoSource from '../.vitepress/theme/components/demos/FusionTwoButtonsDemo.vue?raw'

import FusionTwoOptionsDemo from '../.vitepress/theme/components/demos/FusionTwoOptionsDemo.vue'
import FusionTwoOptionsDemoSource from '../.vitepress/theme/components/demos/FusionTwoOptionsDemo.vue?raw'

import FusionTwoChipsDemo from '../.vitepress/theme/components/demos/FusionTwoChipsDemo.vue'
import FusionTwoChipsDemoSource from '../.vitepress/theme/components/demos/FusionTwoChipsDemo.vue?raw'

import FusionTwoStatusDotsDemo from '../.vitepress/theme/components/demos/FusionTwoStatusDotsDemo.vue'
import FusionTwoStatusDotsDemoSource from '../.vitepress/theme/components/demos/FusionTwoStatusDotsDemo.vue?raw'

import FusionTwoIconButtonsDemo from '../.vitepress/theme/components/demos/FusionTwoIconButtonsDemo.vue'
import FusionTwoIconButtonsDemoSource from '../.vitepress/theme/components/demos/FusionTwoIconButtonsDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="Fusion" :code="FusionBasicDemoSource">
<template #preview>
<FusionBasicDemo />
</template>
</DemoBlock>

## 实际场景

### Button + Tooltip Bubble

<DemoBlock title="Fusion ButtonTooltip" :code="FusionButtonTooltipDemoSource">
<template #preview>
<FusionButtonTooltipDemo />
</template>
</DemoBlock>

### Two Buttons

<DemoBlock title="Fusion TwoButtons" :code="FusionTwoButtonsDemoSource">
<template #preview>
<FusionTwoButtonsDemo />
</template>
</DemoBlock>

### Two Options

<DemoBlock title="Fusion TwoOptions" :code="FusionTwoOptionsDemoSource">
<template #preview>
<FusionTwoOptionsDemo />
</template>
</DemoBlock>

### Two Chips

<DemoBlock title="Fusion TwoChips" :code="FusionTwoChipsDemoSource">
<template #preview>
<FusionTwoChipsDemo />
</template>
</DemoBlock>

### Two Status Dots

<DemoBlock title="Fusion TwoStatusDots" :code="FusionTwoStatusDotsDemoSource">
<template #preview>
<FusionTwoStatusDotsDemo />
</template>
</DemoBlock>

### Two Icon Buttons

<DemoBlock title="Fusion TwoIconButtons" :code="FusionTwoIconButtonsDemoSource">
<template #preview>
<FusionTwoIconButtonsDemo />
</template>
</DemoBlock>

### Avatar + Badge

<DemoBlock title="Fusion AvatarBadge" :code="FusionAvatarBadgeDemoSource">
<template #preview>
<FusionAvatarBadgeDemo />
</template>
</DemoBlock>

### Chip + Icon

<DemoBlock title="Fusion ChipIcon" :code="FusionChipIconDemoSource">
<template #preview>
<FusionChipIconDemo />
</template>
</DemoBlock>

### Mini Card + FAB

<DemoBlock title="Fusion MiniCardFab" :code="FusionMiniCardFabDemoSource">
<template #preview>
<FusionMiniCardFabDemo />
</template>
</DemoBlock>

## API

### TxFusion Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean \| undefined` | `undefined` | 是否交融（v-model）；`undefined` 时为非受控模式 |
| `disabled` | `boolean` | `false` | 是否禁用 |
| `trigger` | `'hover' \| 'click' \| 'manual'` | `'hover'` | 触发方式；`manual` 仅由 v-model 控制 |
| `direction` | `'x' \| 'y'` | `'x'` | 分裂方向 |
| `gap` | `number` | `40` | 分裂距离 |
| `duration` | `number` | `260` | 过渡时长（ms） |
| `easing` | `string` | `'cubic-bezier(0.2, 0.8, 0.2, 1)'` | easing |
| `blur` | `number` | `19` | gooey blur 强度 |
| `alpha` | `number` | `29` | gooey 阈值（越大越“粘”） |
| `alphaOffset` | `number` | `-10` | gooey 偏移 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `change` | `(v: boolean)` | 状态变化 |
| `update:modelValue` | `(v: boolean)` | v-model |
