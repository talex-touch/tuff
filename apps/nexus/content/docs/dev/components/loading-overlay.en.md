---
title: "LoadingOverlay 加载遮罩"
description: "用于在内容区域或全屏展示加载遮罩。"
---
# LoadingOverlay 加载遮罩

用于在内容区域或全屏展示加载遮罩。

<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)
</script>

## 容器内遮罩

<DemoBlock title="LoadingOverlay (container)">
<template #preview>
<div style="border: 1px solid var(--tx-border-color); border-radius: 12px; padding: 12px;">
  <TxButton @click="loading = !loading">Toggle</TxButton>
  <TxLoadingOverlay :loading="loading" text="Loading...">
    <div style="height: 120px; display: flex; align-items: center; justify-content: center; color: var(--tx-text-color-secondary);">
      Content
    </div>
  </TxLoadingOverlay>
</div>
</template>

<template #code>
```vue
<template>
  <TxButton @click="loading = !loading">Toggle</TxButton>
  <TxLoadingOverlay :loading="loading" text="Loading...">
    <div style="height: 120px; display: flex; align-items: center; justify-content: center;">Content</div>
  </TxLoadingOverlay>
</template>
```
</template>
</DemoBlock>

## 全屏遮罩

<DemoBlock title="LoadingOverlay (fullscreen)">
<template #preview>
<TxButton @click="loading = !loading">Toggle</TxButton>
<TxLoadingOverlay fullscreen :loading="loading" text="Loading..." />
</template>

<template #code>
```vue
<template>
  <TxButton @click="loading = !loading">Toggle</TxButton>
  <TxLoadingOverlay fullscreen :loading="loading" text="Loading..." />
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `loading` | `boolean` | `false` | 是否显示 |
| `fullscreen` | `boolean` | `false` | 是否全屏（Teleport 到 body） |
| `text` | `string` | `''` | 文案 |
| `spinnerSize` | `number` | `18` | spinner 尺寸 |
| `background` | `string` | - | 背景遮罩色 |
