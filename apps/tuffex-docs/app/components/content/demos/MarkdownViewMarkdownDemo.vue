<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const richContent = computed(() => (locale.value === 'zh'
  ? [
      '# 文档片段',
      '## 功能清单',
      '',
      '支持 **加粗**、*斜体*、~~删除线~~ 和 [链接](https://example.com)。',
      '',
      '- 列表项',
      '  - 嵌套列表项',
      '- [x] 已完成任务',
      '- [ ] 待处理任务',
      '',
      '> 引用可以包含多行内容。',
      '',
      '| Feature | Status |',
      '| --- | --- |',
      '| Table | Supported |',
      '| Inline code | `const ok = true` |',
      '',
      '```ts',
      'export const sum = (a: number, b: number) => a + b',
      '```',
    ].join('\n')
  : [
      '# Documentation sample',
      '## Feature list',
      '',
      'Supports **bold**, *italic*, ~~strikethrough~~, and [links](https://example.com).',
      '',
      '- List item',
      '  - Nested list item',
      '- [x] Completed task',
      '- [ ] Pending task',
      '',
      '> Quotes can span multiple lines.',
      '',
      '| Feature | Status |',
      '| --- | --- |',
      '| Table | Supported |',
      '| Inline code | `const ok = true` |',
      '',
      '```ts',
      'export const sum = (a: number, b: number) => a + b',
      '```',
    ].join('\n')))
</script>

<template>
  <TxMarkdownView :content="richContent" />
</template>
