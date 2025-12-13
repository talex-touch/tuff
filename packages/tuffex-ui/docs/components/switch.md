# Switch 开关

开关用于两种状态之间的切换，具有流畅的动画效果。

## 基础用法

基础的开关用法。

<div class="group">
  <TuffSwitch v-model="value1" />
</div>

::: details Show Code

```vue
<template>
  <TuffSwitch v-model="checked" />
</template>

<script setup>
import { ref } from 'vue'
const checked = ref(false)
</script>
```

:::

## 禁用状态

开关不可用状态。

<div class="group">
  <TuffSwitch v-model="value2" disabled />
  <TuffSwitch v-model="value3" disabled />
</div>

::: details Show Code

```vue
<template>
  <TuffSwitch v-model="checked" disabled />
</template>
```

:::

## 不同尺寸

提供三种尺寸的开关。

<div class="group">
  <TuffSwitch v-model="value4" size="small" />
  <TuffSwitch v-model="value5" />
  <TuffSwitch v-model="value6" size="large" />
</div>

::: details Show Code

```vue
<template>
  <TuffSwitch size="small" />
  <TuffSwitch />
  <TuffSwitch size="large" />
</template>
```

:::

## API

### Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| modelValue / v-model | 绑定值 | `boolean` | `false` |
| disabled | 是否禁用 | `boolean` | `false` |
| size | 开关尺寸 | `'small' \| 'default' \| 'large'` | `'default'` |

### Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| change | 状态改变时触发 | `(value: boolean) => void` |
| update:modelValue | 值更新时触发 | `(value: boolean) => void` |

<script setup>
import { ref } from 'vue'
const value1 = ref(false)
const value2 = ref(true)
const value3 = ref(false)
const value4 = ref(true)
const value5 = ref(true)
const value6 = ref(true)
</script>

<style scoped>
.group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
</style>
