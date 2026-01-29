---
title: "Spinner 加载"
description: "用于展示加载中的旋转指示器。通常作为更复杂 Loading 组件的基础。"
---
# Spinner 加载

用于展示加载中的旋转指示器。通常作为更复杂 Loading 组件的基础。

<script setup lang="ts">
import SpinnerBasicDemo from '~/components/content/demos/SpinnerBasicDemo.vue'
import SpinnerBasicDemoSource from '~/components/content/demos/SpinnerBasicDemo.vue?raw'

import SpinnerSizesDemo from '~/components/content/demos/SpinnerSizesDemo.vue'
import SpinnerSizesDemoSource from '~/components/content/demos/SpinnerSizesDemo.vue?raw'

import SpinnerToggleDemo from '~/components/content/demos/SpinnerToggleDemo.vue'
import SpinnerToggleDemoSource from '~/components/content/demos/SpinnerToggleDemo.vue?raw'
</script>

## 基础用法

<DemoBlock title="Spinner" :code="SpinnerBasicDemoSource">
  <template #preview>
    <SpinnerBasicDemo />
  </template>
</DemoBlock>

## 尺寸

<DemoBlock title="Spinner sizes" :code="SpinnerSizesDemoSource">
  <template #preview>
    <SpinnerSizesDemo />
  </template>
</DemoBlock>

## 显隐切换（v-if vs visible）

<DemoBlock title="Toggle" :code="SpinnerToggleDemoSource">
  <template #preview>
    <SpinnerToggleDemo />
  </template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `size` | `number` | `16` | 尺寸(px) |
| `strokeWidth` | `number` | `2` | 线宽 |
| `fallback` | `boolean` | `false` | 使用 SVG fallback 样式 |
| `visible` | `boolean` | `true` | 显示/隐藏（内部 v-if，带 enter/leave 过渡动画） |
