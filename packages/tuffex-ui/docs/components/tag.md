# Tag 标签

用于标记和分类的多功能标签组件，支持自定义颜色、尺寸和可关闭功能。

## 基础用法

<div class="demo-container">
  <div class="demo-container__row">
    <TxTag label="默认" />
    <TxTag label="主色" color="var(--el-color-primary)" />
    <TxTag label="成功" color="var(--el-color-success)" />
    <TxTag label="警告" color="var(--el-color-warning)" />
    <TxTag label="危险" color="var(--el-color-danger)" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxTag label="默认" />
  <TxTag label="主色" color="var(--el-color-primary)" />
  <TxTag label="成功" color="var(--el-color-success)" />
  <TxTag label="警告" color="var(--el-color-warning)" />
  <TxTag label="危险" color="var(--el-color-danger)" />
</template>

<script setup>
import { TxTag } from '@talex-touch/tuff-ui'
</script>
```
:::

## 尺寸

标签组件支持两种尺寸：`sm`（小）和 `md`（中）。

<div class="demo-container">
  <div class="demo-container__row">
    <TxTag label="小尺寸" size="sm" />
    <TxTag label="中尺寸" size="md" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxTag label="小尺寸" size="sm" />
  <TxTag label="中尺寸" size="md" />
</template>
```
:::

## 带图标

使用 `icon` 属性为标签添加图标。

<div class="demo-container">
  <div class="demo-container__row">
    <TxTag label="设置" icon="i-carbon-settings" />
    <TxTag label="用户" icon="i-carbon-user" color="var(--el-color-success)" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxTag label="设置" icon="i-carbon-settings" />
  <TxTag label="用户" icon="i-carbon-user" color="var(--el-color-success)" />
</template>
```
:::

## 可关闭标签

使用 `closable` 属性启用关闭按钮。

<div class="demo-container">
  <div class="demo-container__row">
    <TxTag label="Vue" closable />
    <TxTag label="React" closable color="var(--el-color-success)" />
    <TxTag label="Angular" closable color="var(--el-color-danger)" />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxTag 
    v-for="tag in tags" 
    :key="tag" 
    :label="tag" 
    closable 
    @close="handleClose(tag)" 
  />
</template>

<script setup>
import { ref } from 'vue'
import { TxTag } from '@talex-touch/tuff-ui'

const tags = ref(['Vue', 'React', 'Angular'])

function handleClose(tag) {
  tags.value = tags.value.filter(t => t !== tag)
}
</script>
```
:::

## 自定义颜色

使用 `color`、`background` 和 `border` 属性自定义标签外观。

<div class="demo-container">
  <div class="demo-container__row">
    <TxTag 
      label="自定义" 
      color="#ff6b6b" 
      background="rgba(255, 107, 107, 0.1)" 
      border="rgba(255, 107, 107, 0.3)" 
    />
    <TxTag 
      label="渐变风格" 
      color="#6366f1" 
      background="rgba(99, 102, 241, 0.1)" 
      border="rgba(99, 102, 241, 0.3)" 
    />
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxTag 
    label="自定义" 
    color="#ff6b6b" 
    background="rgba(255, 107, 107, 0.1)" 
    border="rgba(255, 107, 107, 0.3)" 
  />
</template>
```
:::

## 插槽内容

使用默认插槽自定义内容。

<div class="demo-container">
  <div class="demo-container__row">
    <TxTag color="var(--el-color-success)">
      <span>✓</span> 已验证
    </TxTag>
    <TxTag color="var(--el-color-warning)">
      <span>⚡</span> 进行中
    </TxTag>
  </div>
</div>

::: details 查看代码
```vue
<template>
  <TxTag color="var(--el-color-success)">
    <span>✓</span> 已验证
  </TxTag>
</template>
```
:::

## API

### 属性

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|-------------|
| `label` | `string \| null` | `''` | 显示的文本标签 |
| `icon` | `string` | `''` | 图标类名 |
| `color` | `string` | `'var(--el-color-primary)'` | 标签主色 |
| `background` | `string` | `''` | 自定义背景色 |
| `border` | `string` | `''` | 自定义边框色 |
| `size` | `'sm' \| 'md'` | `'sm'` | 标签尺寸 |
| `closable` | `boolean` | `false` | 是否可关闭 |
| `disabled` | `boolean` | `false` | 是否禁用交互 |

### 事件

| 事件名 | 参数 | 说明 |
|------|------------|-------------|
| `close` | - | 点击关闭按钮时触发 |
| `click` | `event: MouseEvent` | 点击标签时触发 |

### 插槽

| 插槽名 | 说明 |
|------|-------------|
| `default` | 自定义内容，替代 label |
