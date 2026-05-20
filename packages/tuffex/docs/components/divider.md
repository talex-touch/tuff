# Divider 分割线

Divider 用于在内容之间建立轻量分组关系，支持水平文字分隔和行内垂直分隔。

<script setup lang="ts">
const dividerApiRows1 = [
  { name: 'direction', description: '分割线方向。', type: '\'horizontal\' | \'vertical\'', default: '\'horizontal\'' },
  { name: 'dashed', description: '是否使用虚线。', type: 'boolean', default: 'false' },
  { name: 'textPlacement', description: '水平分割线文字位置。', type: '\'left\' | \'center\' | \'right\'', default: '\'center\'' },
]

const dividerApiRows2 = [
  { name: 'default', description: '水平分割线中间的文字内容。' },
]
</script>

## 基础用法

<DemoBlock title="Divider Basic">
<template #preview>
<div style="display: grid; gap: 12px;">
  <span>Account</span>
  <TxDivider />
  <span>Workspace</span>
  <TxDivider text-placement="left">Advanced</TxDivider>
  <span>Danger zone</span>
</div>
</template>

<template #code>

```vue
<template>
  <span>Account</span>
  <TxDivider />
  <span>Workspace</span>
  <TxDivider text-placement="left">Advanced</TxDivider>
  <span>Danger zone</span>
</template>
```

</template>
</DemoBlock>

## 垂直分割

<DemoBlock title="Divider Vertical">
<template #preview>
<div style="display: flex; align-items: center; gap: 4px;">
  <span>Preview</span>
  <TxDivider direction="vertical" />
  <span>Edit</span>
  <TxDivider direction="vertical" dashed />
  <span>Share</span>
</div>
</template>

<template #code>

```vue
<template>
  <span>Preview</span>
  <TxDivider direction="vertical" />
  <span>Edit</span>
  <TxDivider direction="vertical" dashed />
  <span>Share</span>
</template>
```

</template>
</DemoBlock>

## API

### Props

<ApiSpecTable :rows="dividerApiRows1" />

### Slots

<ApiSpecTable title="Slots" :rows="dividerApiRows2" />
