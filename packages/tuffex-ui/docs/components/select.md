# Select 选择器

下拉选择器组件，支持浮动定位。

## 基础用法

基础的选择器用法。

<div class="group">
  <TuffSelect v-model="value1" placeholder="请选择">
    <TuffSelectItem value="option1" label="选项 1" />
    <TuffSelectItem value="option2" label="选项 2" />
    <TuffSelectItem value="option3" label="选项 3" />
  </TuffSelect>
</div>

::: details Show Code

```vue
<template>
  <TuffSelect v-model="value" placeholder="请选择">
    <TuffSelectItem value="option1" label="选项 1" />
    <TuffSelectItem value="option2" label="选项 2" />
    <TuffSelectItem value="option3" label="选项 3" />
  </TuffSelect>
</template>

<script setup>
import { ref } from 'vue'
const value = ref('')
</script>
```

:::

## 禁用状态

选择器不可用状态。

<div class="group">
  <TuffSelect v-model="value2" placeholder="禁用状态" disabled>
    <TuffSelectItem value="option1" label="选项 1" />
  </TuffSelect>
</div>

::: details Show Code

```vue
<template>
  <TuffSelect v-model="value" placeholder="禁用状态" disabled>
    <TuffSelectItem value="option1" label="选项 1" />
  </TuffSelect>
</template>
```

:::

## 禁用选项

选项可以单独禁用。

<div class="group">
  <TuffSelect v-model="value3" placeholder="请选择">
    <TuffSelectItem value="option1" label="可选项 1" />
    <TuffSelectItem value="option2" label="禁用选项" disabled />
    <TuffSelectItem value="option3" label="可选项 2" />
  </TuffSelect>
</div>

::: details Show Code

```vue
<template>
  <TuffSelect v-model="value" placeholder="请选择">
    <TuffSelectItem value="option1" label="可选项 1" />
    <TuffSelectItem value="option2" label="禁用选项" disabled />
    <TuffSelectItem value="option3" label="可选项 2" />
  </TuffSelect>
</template>
```

:::

## API

### TuffSelect Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| modelValue / v-model | 绑定值 | `string \| number` | `''` |
| placeholder | 占位文本 | `string` | `'请选择'` |
| disabled | 是否禁用 | `boolean` | `false` |

### TuffSelect Events

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| change | 选中值改变时触发 | `(value: string \| number) => void` |
| update:modelValue | 值更新时触发 | `(value: string \| number) => void` |

### TuffSelectItem Props

| 属性名 | 说明 | 类型 | 默认值 |
|--------|------|------|--------|
| value | 选项值 | `string \| number` | - |
| label | 选项标签 | `string` | - |
| disabled | 是否禁用 | `boolean` | `false` |

<script setup>
import { ref } from 'vue'
const value1 = ref('')
const value2 = ref('')
const value3 = ref('')
</script>

<style scoped>
.group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  max-width: 300px;
}
</style>
