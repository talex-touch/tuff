# StatCard 指标卡片

用于展示一个数字/指标与对应描述。

<script setup lang="ts">
import { ref } from 'vue'

const value = ref(12880)
</script>

## 基础用法

<DemoBlock title="StatCard">
<template #preview>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
  <TxStatCard :value="value" label="Downloads" icon-class="i-carbon-download" clickable />
  <TxStatCard :value="42" label="Tasks" icon-class="i-carbon-task" />
</div>
</template>

<template #code>
```vue
<template>
  <TxStatCard :value="12880" label="Downloads" icon-class="i-carbon-download" />
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `value` | `number \| string` | - | 显示值 |
| `label` | `string` | - | 描述文本 |
| `iconClass` | `string` | `''` | 图标 class（UnoCSS icones） |
| `clickable` | `boolean` | `false` | 鼠标悬浮/点击态 |
