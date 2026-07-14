<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const richContent = computed(() => (locale.value === 'zh'
  ? [
      '## 主题预览',
      '',
      '同一段 Markdown 可以在亮色和暗色主题中保持一致结构。',
      '',
      '- sanitize 默认开启',
      '- `theme` 可以显式指定',
    ].join('\n')
  : [
      '## Theme preview',
      '',
      'The same Markdown keeps its structure in light and dark themes.',
      '',
      '- sanitize stays enabled by default',
      '- `theme` can be set explicitly',
    ].join('\n')))
</script>

<template>
  <div class="markdown-theme-demo">
    <div class="markdown-theme-demo__panel markdown-theme-demo__panel--light">
      <TxMarkdownView :content="richContent" theme="light" />
    </div>
    <div class="markdown-theme-demo__panel markdown-theme-demo__panel--dark">
      <TxMarkdownView :content="richContent" theme="dark" />
    </div>
  </div>
</template>

<style scoped>
.markdown-theme-demo {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.markdown-theme-demo__panel {
  padding: 12px;
  border-radius: 12px;
}

.markdown-theme-demo__panel--light {
  border: 1px solid #d1d9e0;
  background: #fff;
}

.markdown-theme-demo__panel--dark {
  border: 1px solid #30363d;
  background: #0d1117;
}
</style>
