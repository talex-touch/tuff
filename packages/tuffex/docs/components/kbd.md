# Kbd 键盘键

Kbd 用于展示快捷键、组合键和键位提示，适合命令面板、表格操作说明和工具栏提示。

<script setup lang="ts">
const kbdApiRows1 = [
  { name: 'size', description: '尺寸。', type: '\'sm\' | \'md\'', default: '\'sm\'' },
  { name: 'tone', description: '色调。', type: '\'default\' | \'primary\'', default: '\'default\'' },
]

const kbdApiRows2 = [
  { name: 'default', description: '键位或组合键内容。' },
]
</script>

## 基础用法

<DemoBlock title="Kbd Basic">
<template #preview>
<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
  <TxKbd>Ctrl</TxKbd>
  <TxKbd>K</TxKbd>
  <TxKbd size="md" tone="primary">Enter</TxKbd>
  <TxKbd>Esc</TxKbd>
</div>
</template>

<template #code>

```vue
<template>
  <TxKbd>Ctrl</TxKbd>
  <TxKbd>K</TxKbd>
  <TxKbd size="md" tone="primary">Enter</TxKbd>
  <TxKbd>Esc</TxKbd>
</template>
```

</template>
</DemoBlock>

## API

### Props

<ApiSpecTable :rows="kbdApiRows1" />

### Slots

<ApiSpecTable title="Slots" :rows="kbdApiRows2" />
