# Divider 分割线

Divider 用于在内容之间建立轻量分组关系，支持水平文字分隔、行内垂直分隔和渐变透明分割。

<script setup lang="ts">
const dividerApiRows1 = [
  { name: 'direction', description: '分割线方向。', type: '\'horizontal\' | \'vertical\'', default: '\'horizontal\'' },
  { name: 'dashed', description: '是否使用虚线。', type: 'boolean', default: 'false' },
  { name: 'textPlacement', description: '水平分割线文字位置。', type: '\'left\' | \'center\' | \'right\'', default: '\'center\'' },
  { name: 'gradient', description: '渐变透明方向。true 等价于 both。', type: 'boolean | \'start\' | \'end\' | \'both\'', default: 'false' },
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

## 渐变分割

`gradient` 用于让分割线从某个区域到某个区域逐渐透明。`true` 等价于 `both`，也可以显式传入 `start`、`end`、`both`。

<DemoBlock title="Divider Gradient">
<template #preview>
<div style="display: grid; gap: 14px; max-width: 560px;">
  <span>Start fade</span>
  <TxDivider gradient="start" />
  <span>End fade</span>
  <TxDivider gradient="end" />
  <span>Both sides fade</span>
  <TxDivider gradient />
  <TxDivider gradient text-placement="center">Gradient Label</TxDivider>
</div>
</template>

<template #code>

```vue
<template>
  <TxDivider gradient="start" />
  <TxDivider gradient="end" />
  <TxDivider gradient />
  <TxDivider gradient text-placement="center">Gradient Label</TxDivider>
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
  <TxDivider direction="vertical" gradient />
  <span>Export</span>
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
  <TxDivider direction="vertical" gradient />
  <span>Export</span>
</template>
```

</template>
</DemoBlock>

## API

### Props

<ApiSpecTable :rows="dividerApiRows1" />

### Slots

<ApiSpecTable title="Slots" :rows="dividerApiRows2" />
