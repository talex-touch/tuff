# ImageGallery 图片预览

用于图片网格与 Modal 预览。

<script setup lang="ts">
const items = [
  { id: 'a', url: 'https://picsum.photos/seed/a/640/420', name: 'A' },
  { id: 'b', url: 'https://picsum.photos/seed/b/640/420', name: 'B' },
  { id: 'c', url: 'https://picsum.photos/seed/c/640/420', name: 'C' },
]
</script>

## 基础用法

<DemoBlock title="ImageGallery">
<template #preview>
<div style="width: 560px;">
  <TxImageGallery :items="items" />
</div>
</template>

<template #code>
```vue
<template>
  <TxImageGallery :items="items" />
</template>
```
</template>
</DemoBlock>
