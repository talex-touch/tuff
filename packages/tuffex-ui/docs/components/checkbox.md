# Checkbox 复选框

复选框组件，具有 SVG 动画勾选效果。

## 基础用法

基础的复选框用法。

<div class="group">
  <TuffCheckbox v-model="checked1" label="选项 1" />
  <TuffCheckbox v-model="checked2" label="选项 2" />
</div>

::: details Show Code

```vue
<template>
  <TuffCheckbox v-model="checked" label="选项" />
</template>

<script setup>
import { ref } from 'vue'
const checked = ref(false)
</script>
```

:::

## 禁用状态

复选框不可用状态。

<div class="group">
  <TuffCheckbox v-model="checked3" label="禁用" disabled />
  <TuffCheckbox v-model="checked4" label="禁用且选中" disabled />
</div>

::: details Show Code

```vue
<template>
  <TuffCheckbox v-model="checked" label="禁用" disabled />
</template>
```

:::

## 使用插槽

使用默认插槽自定义标签内容。

<div class="group">
  <TuffCheckbox v-model="checked5">
    <span style="color: #409eff;">自定义标签</span>
  </TuffCheckbox>
</div>

::: details Show Code

```vue
<template>
  <TuffCheckbox v-model="checked">
    <span style="color: #409eff;">自定义标签</span>
  </TuffCheckbox>
</template>
```

:::

## API

### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| modelValue / v-model | 绑定值 | `boolean` | `false` |
| disabled | 是否禁用 | `boolean` | `false` |
| label | 标签文本 | `string` | - |

### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| change | 状态改变时触发 | `(value: boolean) => void` |
| update:modelValue | 值更新时触发 | `(value: boolean) => void` |

### Slots

| 插槽名 | 说明 |
|--------|------|
| default | 自定义标签内容 |

<script setup>
import { ref } from 'vue'
const checked1 = ref(false)
const checked2 = ref(true)
const checked3 = ref(false)
const checked4 = ref(true)
const checked5 = ref(false)
</script>

<style scoped>
.group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
</style>
