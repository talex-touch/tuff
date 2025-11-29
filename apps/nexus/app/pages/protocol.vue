<script setup lang="ts">
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
      <h1>{{ t('protocol.title') }}</h1>
      
      <p class="text-lg text-gray-600 dark:text-gray-300">
        {{ t('protocol.lastUpdated') }}: {{ new Date().toLocaleDateString() }}
      </p>

      <h2>{{ t('protocol.section1.title') }}</h2>
      <p>{{ t('protocol.section1.content') }}</p>

      <h2>{{ t('protocol.section2.title') }}</h2>
      <p>{{ t('protocol.section2.content') }}</p>

      <h2>{{ t('protocol.section3.title') }}</h2>
      <p>{{ t('protocol.section3.content') }}</p>

      <h2>{{ t('protocol.section4.title') }}</h2>
      <p>{{ t('protocol.section4.content') }}</p>

      <h2>{{ t('protocol.section5.title') }}</h2>
      <p>{{ t('protocol.section5.content') }}</p>

      <h2>{{ t('protocol.section6.title') }}</h2>
      <p>{{ t('protocol.section6.content') }}</p>

      <h2>{{ t('protocol.section7.title') }}</h2>
      <p>{{ t('protocol.section7.content') }}</p>

      <h2>{{ t('protocol.section8.title') }}</h2>
      <p>{{ t('protocol.section8.content') }}</p>

      <h2>{{ t('protocol.section9.title') }}</h2>
      <p>{{ t('protocol.section9.content') }}</p>

      <h2>{{ t('protocol.section10.title') }}</h2>
      <p>{{ t('protocol.section10.content') }}</p>

      <h2>{{ t('protocol.contact.title') }}</h2>
      <p>{{ t('protocol.contact.content') }}</p>
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
