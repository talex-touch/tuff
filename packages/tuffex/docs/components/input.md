# Input 输入框

Input 输入框组件用于接收用户输入，支持多种类型和状态，具有流畅的动画效果和现代化的设计风格。

<script setup lang="ts">
import { ref } from 'vue'

const value = ref('')
const text = ref('')
const password = ref('')
const content = ref('')
const readonlyValue = ref('readonly')
const disabledValue = ref('disabled')
const clearableValue = ref('hello')
const withPrefix = ref('')
const withSuffix = ref('')
</script>

## 基础用法

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
```
:::

## 输入框类型

目前支持：`text` / `password` / `textarea` / `date` / `email` / `number`。

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="text" placeholder="文本输入" />
    <TuffInput v-model="password" type="password" placeholder="密码输入" />
  </div>
  <div class="demo-container__row">
    <TuffInput v-model="content" type="textarea" placeholder="多行文本" :rows="4" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TuffInput v-model="text" placeholder="文本输入" />
  <TuffInput v-model="password" type="password" placeholder="密码输入" />
  <TuffInput v-model="content" type="textarea" placeholder="多行文本" :rows="4" />
</template>
```
:::

## 只读 / 禁用

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="readonlyValue" readonly placeholder="只读" />
    <TuffInput v-model="disabledValue" disabled placeholder="禁用" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TuffInput v-model="readonlyValue" readonly placeholder="只读" />
  <TuffInput v-model="disabledValue" disabled placeholder="禁用" />
</template>
```
:::

## 可清空

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="clearableValue" clearable placeholder="可清空" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TuffInput v-model="clearableValue" clearable placeholder="可清空" />
</template>
```
:::

## 前后缀插槽

<div class="demo-container">
  <div class="demo-container__row">
    <TuffInput v-model="withPrefix" placeholder="Search">
      <template #prefix>
        <TxIcon icon="i-carbon-search" />
      </template>
    </TuffInput>

    <TuffInput v-model="withSuffix" placeholder="User">
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

  <TuffInput v-model="withSuffix" placeholder="User">
    <template #suffix>
      <TxIcon icon="i-carbon-user" />
    </template>
  </TuffInput>
</template>
```
:::

## API

### Props

| 属性名 | 说明 | 类型 | 默认值 |
|------|------|------|--------|
| modelValue / v-model | 绑定值 | `string \| number` | `''` |
| placeholder | 占位文本 | `string` | `''` |
| type | 类型 | `'text' \| 'password' \| 'textarea' \| 'date' \| 'email' \| 'number'` | `'text'` |
| disabled | 是否禁用 | `boolean` | `false` |
| readonly | 是否只读 | `boolean` | `false` |
| clearable | 是否可清空 | `boolean` | `false` |
| rows | 文本域行数（仅 textarea） | `number` | `3` |
| prefixIcon | 前缀图标类名 | `string` | `''` |
| suffixIcon | 后缀图标类名 | `string` | `''` |

### Events

| 事件名 | 说明 |
|------|------|
| update:modelValue | v-model 更新 |
| input | 输入时触发 |
| focus | 聚焦 |
| blur | 失焦 |
| clear | 点击清空 |

### Exposes

| 方法名 | 说明 | 类型 |
|------|------|------|
| focus | 聚焦原生输入控件 | `() => void` |
| blur | 让原生输入控件失焦 | `() => void` |
| clear | 在非禁用且非只读时清空 | `() => void` |
| setValue | 设置值并触发 input/model 更新 | `(value: string) => void` |
| getValue | 读取当前值 | `() => string \| number` |

### Slots

| 插槽名 | 说明 |
|------|------|
| prefix | 前缀内容 |
| suffix | 后缀内容 |

## 交互契约

- `type="number"` 在非空输入时发出 number，清空时发出 `''`。
- 清空控件是可键盘聚焦的 button，并会在禁用或只读状态下隐藏。
- `class` / `style` 透传到外层容器，其余 attrs 透传到原生 input / textarea。
