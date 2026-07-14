<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const content = computed(() => (locale.value === 'zh'
  ? [
      '# 发布说明',
      '',
      '本次更新优化了组件文档的加载体验。',
      '',
      '- 新增 API 表格',
      '- 补充交互契约',
      '- 保持默认 sanitize',
      '',
      '`TxMarkdownView` 会在 DOMPurify 就绪后渲染安全 HTML。',
    ].join('\n')
  : [
      '# Release notes',
      '',
      'This update improves the component documentation experience.',
      '',
      '- Added API tables',
      '- Documented interaction contracts',
      '- Kept sanitize enabled by default',
      '',
      '`TxMarkdownView` renders safe HTML after DOMPurify is ready.',
    ].join('\n')))
</script>

<template>
  <TxMarkdownView :content="content" />
</template>
