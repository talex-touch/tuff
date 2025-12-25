# Radio 单选框

用于单选场景（`TxRadioGroup` + `TxRadio`）。支持两种形式：**按钮组**（紧凑排列）和**标准单选**（圆点+文案）。

<script setup lang="ts">
import RadioBasicDemo from '../.vitepress/theme/components/demos/RadioBasicDemo.vue'
import RadioBasicDemoSource from '../.vitepress/theme/components/demos/RadioBasicDemo.vue?raw'

import RadioStandardDemo from '../.vitepress/theme/components/demos/RadioStandardDemo.vue'
import RadioStandardDemoSource from '../.vitepress/theme/components/demos/RadioStandardDemo.vue?raw'

import RadioDisabledDemo from '../.vitepress/theme/components/demos/RadioDisabledDemo.vue'
import RadioDisabledDemoSource from '../.vitepress/theme/components/demos/RadioDisabledDemo.vue?raw'
</script>

## 按钮组形式

紧凑排列的按钮组，适合选项较少的场景。

<DemoBlock title="Radio (button)" :code="RadioBasicDemoSource">
  <template #preview>
    <RadioBasicDemo />
  </template>
</DemoBlock>

## 标准单选形式

前圆点+后文案的标准单选形式，适合选项较多的场景。

<DemoBlock title="Radio (standard)" :code="RadioStandardDemoSource">
  <template #preview>
    <RadioStandardDemo />
  </template>
</DemoBlock>

## 禁用状态

<DemoBlock title="Radio (disabled)" :code="RadioDisabledDemoSource">
  <template #preview>
    <RadioDisabledDemo />
  </template>
</DemoBlock>

## API

### TxRadioGroup

#### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| modelValue / v-model | 绑定值 | `string \| number` | - |
| disabled | 是否禁用（整组） | `boolean` | `false` |

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

#### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| click | 点击（仅在组内变更时触发） | `(value: string \| number) => void` |
