# MarkdownView Markdown 渲染

用于将 Markdown 渲染为 HTML（默认开启 sanitize）。

<script setup lang="ts">
import { ref } from 'vue'

const content = ref(
  '# Title\n\n- item 1\n- item 2\n\n`inline code`\n\n```ts\nconst a = 1\n```\n\n> Quote',
)
</script>

## 基础用法

<DemoBlock title="MarkdownView">
<template #preview>
<div style="width: 560px; padding: 12px; border-radius: 14px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);">
  <TxMarkdownView :content="content" />
</div>
</template>

<template #code>
```vue
<template>
  <TxMarkdownView :content="content" />
</template>
```
</template>
</DemoBlock>

## API

### Props

| 属性名 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `content` | `string` | *必填* | Markdown 内容 |
| `sanitize` | `boolean` | `true` | 是否 sanitize（默认开启） |
