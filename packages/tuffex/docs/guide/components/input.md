# Input 输入框

输入框是表单中最基础的组件之一。TouchX UI 的输入框提供了优雅的聚焦动画、丰富的验证状态和多样的输入类型支持。

## 基础用法

最简单的输入框用法：

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="value" placeholder="请输入内容" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TuffInput v-model="value" placeholder="请输入内容" />
</template>

<script setup>
import { ref } from 'vue'
const value = ref('')
</script>
```
:::

## 输入框类型

目前支持：`text` / `password` / `textarea`。

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="text" type="text" placeholder="文本输入" />
    <TuffInput v-model="password" type="password" placeholder="密码输入" clearable />
  </div>
  <div class="demo-container__row">
    <TuffInput v-model="content" type="textarea" placeholder="请输入多行内容" :rows="4" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TuffInput v-model="text" type="text" placeholder="文本输入" />
  <TuffInput v-model="password" type="password" placeholder="密码输入" clearable />
  <TuffInput v-model="content" type="textarea" placeholder="请输入多行内容" :rows="4" />
</template>

<script setup>
import { ref } from 'vue'
const text = ref('')
const password = ref('')
const content = ref('')
</script>
```
:::

## 只读 / 禁用

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="readonlyValue" readonly placeholder="只读" />
    <TuffInput v-model="disabledValue" disabled placeholder="禁用" />
  </div>
</div>

## 前后缀插槽

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="withPrefix" placeholder="Search">
      <template #prefix>
        <TxIcon icon="i-carbon-search" />
      </template>
    </TuffInput>
    <TuffInput v-model="withSuffix" clearable placeholder="User">
      <template #suffix>
        <TxIcon icon="i-carbon-user" />
      </template>
    </TuffInput>
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TuffInput v-model="withPrefix" placeholder="Search">
    <template #prefix>
      <TxIcon icon="i-carbon-search" />
    </template>
  </TuffInput>

  <TuffInput v-model="withSuffix" clearable placeholder="User">
    <template #suffix>
      <TxIcon icon="i-carbon-user" />
    </template>
  </TuffInput>
</template>

<script setup>
import { ref } from 'vue'
const withPrefix = ref('')
const withSuffix = ref('')
</script>
```
:::

## API

| 属性名 | 类型 | 默认值 |
|------|------|--------|
| modelValue / v-model | `string` | `''` |
| placeholder | `string` | `''` |
| type | `'text' \| 'password' \| 'textarea'` | `'text'` |
| disabled | `boolean` | `false` |
| readonly | `boolean` | `false` |
| clearable | `boolean` | `false` |
| rows | `number` | `3` |

<script setup>
import { ref } from 'vue'

const value = ref('')
const text = ref('')
const password = ref('')
const content = ref('')
const readonlyValue = ref('readonly')
const disabledValue = ref('disabled')
const withPrefix = ref('')
const withSuffix = ref('')
</script>
