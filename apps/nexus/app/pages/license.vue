<script setup lang="ts">
import { usePolicyMarkdown } from '~/composables/usePolicyMarkdown'

definePageMeta({
  layout: 'license',
})

const { t } = useI18n()
const { doc: licenseDoc } = usePolicyMarkdown('license')

useHead({
  title: t('license.title'),
  meta: [
    { name: 'description', content: t('license.description') },
  ],
})
</script>

<template>
  <div class="license-surface px-8 py-10 space-y-10">
    <ContentRenderer
      :value="licenseDoc ?? {}"
      class="prose prose-neutral dark:prose-invert max-w-none"
    />
  </div>
</template>

<style scoped>
.license-surface {
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
