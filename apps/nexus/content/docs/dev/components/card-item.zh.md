---
title: "CardItem 卡片项"
description: "用于列表/设置页等场景的通用条目：左侧头像/图标，右侧标题信息，支持右侧操作区。"
---
# CardItem 卡片项

用于列表/设置页等场景的通用条目：左侧头像/图标，右侧标题信息，支持右侧操作区。

<script setup lang="ts">
import { ref } from 'vue'

const enabled = ref(true)
</script>

## 基础用法

<DemoBlock title="CardItem">
<template #preview>
<div style="display: flex; flex-direction: column; gap: 10px; width: 360px;">
  <TxCardItem
    title="Talex"
    subtitle="@talex"
    description="A reusable card item with avatar on the left and content on the right."
    avatar-text="T"
    clickable
  />

  <TxCardItem
    title="Downloads"
    description="Show as icon avatar"
    icon-class="i-carbon-download"
  />

  <TxCardItem
    title="Enable feature"
    description="Right area supports arbitrary actions"
    icon-class="i-carbon-settings"
  >
    <template #right>
      <TxSwitch v-model="enabled" />
      <i class="i-carbon-chevron-right" style="font-size: 18px; color: var(--tx-text-color-secondary);" />
    </template>
  </TxCardItem>
</div>
</template>

<template #code>
```vue
<template>
  <TxCardItem title="Enable feature" description="Right area supports actions" icon-class="i-carbon-settings">
    <template #right>
      <TxSwitch v-model="enabled" />
      <i class="i-carbon-chevron-right" />
    </template>
  </TxCardItem>
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `role` | `string` | `'button'` | ARIA role（用于 menuitem / option 等语义） |
| `title` | `string` | `''` | 标题 |
| `subtitle` | `string` | `''` | 副标题 |
| `description` | `string` | `''` | 描述 |
| `iconClass` | `string` | `''` | 头像区域图标 class |
| `avatarText` | `string` | `''` | 头像文本 |
| `avatarUrl` | `string` | `''` | 头像图片 URL |
| `avatarSize` | `number` | `36` | 头像尺寸 |
| `avatarShape` | `'circle' \| 'rounded'` | `'circle'` | 头像形状 |
| `clickable` | `boolean` | `false` | 可点击 |
| `active` | `boolean` | `false` | 激活态 |
| `disabled` | `boolean` | `false` | 禁用 |

### Slots

| 名称 | 说明 |
|------|------|
| `avatar` | 自定义左侧头像区域 |
| `title` | 自定义标题 |
| `subtitle` | 自定义副标题 |
| `description` | 自定义描述 |
| `right` | 右侧操作区 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `click` | `MouseEvent` | 点击触发（需 `clickable` 且非 `disabled`） |
