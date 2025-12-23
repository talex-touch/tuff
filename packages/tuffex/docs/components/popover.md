# Popover 弹出层

基于 Floating UI 的点击弹出层。

<script setup lang="ts">
import { ref } from 'vue'
const open = ref(false)
</script>

## 基础用法

<DemoBlock title="Popover">
<template #preview>
<TxPopover v-model="open">
  <template #reference>
    <TxButton>Click</TxButton>
  </template>

  <div style="width: 240px;">
    <div style="font-weight: 600; margin-bottom: 6px;">Title</div>
    <div style="color: var(--tx-text-color-secondary); font-size: 12px;">Windows-like floating panel.</div>
  </div>
</TxPopover>
</template>

<template #code>
```vue
<template>
  <TxPopover v-model="open">
    <template #reference>
      <TxButton>Click</TxButton>
    </template>

    Popover content
  </TxPopover>
</template>
```
</template>
</DemoBlock>

## API

### TxPopover Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `modelValue` | `boolean` | `false` | 是否打开（v-model） |
| `disabled` | `boolean` | `false` | 禁用 |
| `placement` | `PopoverPlacement` | `'bottom-start'` | 位置 |
| `offset` | `number` | `8` | 间距 |
| `width` | `number` | `0` | 面板宽度（0 = 跟随 reference） |
| `maxWidth` | `number` | `360` | 最大宽度 |
| `closeOnClickOutside` | `boolean` | `true` | 点击外部关闭 |
| `closeOnEsc` | `boolean` | `true` | ESC 关闭 |

### Events

| 事件名 | 参数 | 说明 |
|------|------|------|
| `open` | - | 打开 |
| `close` | - | 关闭 |
| `update:modelValue` | `boolean` | v-model 更新 |
