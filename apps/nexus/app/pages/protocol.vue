<script setup lang="ts">
import protocolContent from '~~/content/app/protocol.md?raw'

definePageMeta({
  layout: 'license',
})

const { t } = useI18n()

useHead({
  title: t('protocol.title'),
  meta: [
    { name: 'description', content: t('protocol.description') },
  ],
})
</script>

<template>
  <div class="protocol-surface px-8 py-10 space-y-10">
    <div class="prose prose-neutral dark:prose-invert max-w-none">
      <ContentRendererMarkdown :value="protocolContent" />
    </div>
  </div>
</template>

<style scoped>
.protocol-surface {
  /* 样式与docs保持一致 */
}

:deep(.prose h1) {
  font-size: 2.25rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
}

:deep(.prose h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
}

:deep(.prose p) {
  line-height: 1.75;
}
</style>
