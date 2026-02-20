<script setup lang="ts">
import { usePolicyMarkdown } from '~/composables/usePolicyMarkdown'

definePageMeta({
  layout: 'license',
})

const { t } = useI18n()
const { doc: protocolDoc } = usePolicyMarkdown('protocol')

useHead({
  title: t('protocol.title'),
  meta: [
    { name: 'description', content: t('protocol.description') },
  ],
})
</script>

<template>
  <div class="protocol-surface px-8 py-10 space-y-10">
    <ContentRenderer
      :value="protocolDoc ?? {}"
      class="prose prose-neutral dark:prose-invert max-w-none"
    />
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
