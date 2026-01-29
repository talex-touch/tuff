---
title: "Radio 单选框"
description: "用于单选场景（`TxRadioGroup` + `TxRadio`）。支持三种形式：**标准单选**（圆点+文案）、**卡片单选**（强调信息层级）和**按钮组**（紧凑排列）。"
---
# Radio 单选框

用于单选场景（`TxRadioGroup` + `TxRadio`）。支持三种形式：**标准单选**（圆点+文案）、**卡片单选**（强调信息层级）和**按钮组**（紧凑排列）。

<script setup lang="ts">
import RadioBasicDemo from '~/components/content/demos/RadioBasicDemo.vue'
import RadioBasicDemoSource from '~/components/content/demos/RadioBasicDemo.vue?raw'

import RadioIndicatorDemo from '~/components/content/demos/RadioIndicatorDemo.vue'
import RadioIndicatorDemoSource from '~/components/content/demos/RadioIndicatorDemo.vue?raw'

import RadioStandardDemo from '~/components/content/demos/RadioStandardDemo.vue'
import RadioStandardDemoSource from '~/components/content/demos/RadioStandardDemo.vue?raw'

import RadioCardDemo from '~/components/content/demos/RadioCardDemo.vue'
import RadioCardDemoSource from '~/components/content/demos/RadioCardDemo.vue?raw'

import RadioGroupPlaygroundDemo from '~/components/content/demos/RadioGroupPlaygroundDemo.vue'
import RadioGroupPlaygroundDemoSource from '~/components/content/demos/RadioGroupPlaygroundDemo.vue?raw'

import RadioDisabledDemo from '~/components/content/demos/RadioDisabledDemo.vue'
import RadioDisabledDemoSource from '~/components/content/demos/RadioDisabledDemo.vue?raw'
</script>

## 标准单选形式

前圆点+后文案的标准单选形式，适合选项较多的场景。

<DemoBlock title="Radio (standard)" :code="RadioStandardDemoSource">
  <template #preview>
    <RadioStandardDemo />
  </template>
</DemoBlock>

## 卡片单选形式

更强调信息层级的单选形式，适合需要解释文本的场景。

<DemoBlock title="Radio (card)" :code="RadioCardDemoSource">
  <template #preview>
    <RadioCardDemo />
  </template>
</DemoBlock>

## 按钮组形式

紧凑排列的按钮组，适合选项较少的场景。

<DemoBlock title="Radio (simple)" :code="RadioBasicDemoSource">
  <template #preview>
    <RadioBasicDemo />
  </template>
</DemoBlock>

## Indicator 动效

带指示器的按钮组动效示例：默认 → 普通 → 模糊 → 玻璃。

<DemoBlock title="Radio (indicator)" :code="RadioIndicatorDemoSource">
  <template #preview>
    <RadioIndicatorDemo />
  </template>
</DemoBlock>

## 禁用状态

<DemoBlock title="Radio (disabled)" :code="RadioDisabledDemoSource">
  <template #preview>
    <RadioDisabledDemo />
  </template>
</DemoBlock>

## Playground

把 `TxRadioGroup` 的主要属性做成可调节的控制面板，用于快速验证不同形态/参数组合。

<DemoBlock title="RadioGroup (playground)" :code="RadioGroupPlaygroundDemoSource">
  <template #preview>
    <RadioGroupPlaygroundDemo />
  </template>
</DemoBlock>

## API

### TxRadioGroup

#### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| modelValue / v-model | 绑定值 | `string \| number` | - |
| disabled | 是否禁用（整组） | `boolean` | `false` |
| type | 形态：按钮组 / 标准单选 / 卡片 | `'button' \| 'standard' \| 'card'` | `'button'` |
| direction | 排列方向（button 无效；standard 默认 row；card 默认 column） | `'row' \| 'column'` | - |
| indicatorVariant | 指示器样式（button 有效） | `'solid' \| 'outline' \| 'glass' \| 'blur'` | - |
| glass | 玻璃指示器（button 有效） | `boolean` | `false` |
| blur | 模糊指示器（button 有效） | `boolean` | `false` |
| stiffness | 动效刚度（越大越快） | `number` | `110` |
| damping | 动效阻尼（越大越稳） | `number` | `12` |
| blurAmount | 模糊强度（blur 有效） | `number` | `1` |
| elastic | 是否启用弹性形变 | `boolean` | `true` |

#### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| update:modelValue | 值更新时触发 | `(value: string \| number) => void` |
| change | 值变化时触发 | `(value: string \| number) => void` |

### TxRadio

#### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| value | 当前项的值 | `string \| number` | - |
| label | 文案（无插槽时） | `string` | `''` |
| disabled | 是否禁用（单项） | `boolean` | `false` |
| type | 形态（一般由 group 决定） | `'button' \| 'standard' \| 'card'` | `'button'` |

#### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| click | 点击（仅在组内变更时触发） | `(value: string \| number) => void` |
