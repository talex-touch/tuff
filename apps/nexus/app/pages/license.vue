<script setup lang="ts">
definePageMeta({
  layout: 'license',
})

const { t } = useI18n()

useHead({
  title: t('license.title'),
  meta: [
    { name: 'description', content: t('license.description') },
  ],
})
</script>

<template>
  <div class="license-surface px-8 py-10 space-y-10">
    <div class="prose prose-neutral dark:prose-invert max-w-none">
      <h1>{{ t('license.title') }}</h1>

      <p class="text-lg text-gray-600 dark:text-gray-300">
        {{ t('license.lastUpdated') }}: {{ new Date().toLocaleDateString() }}
      </p>

      <h2>{{ t('license.section1.title') }}</h2>
      <p>{{ t('license.section1.content') }}</p>

      <h2>{{ t('license.section2.title') }}</h2>
      <p>{{ t('license.section2.content') }}</p>

      <h2>{{ t('license.section3.title') }}</h2>
      <p>{{ t('license.section3.content') }}</p>

      <h2>{{ t('license.section4.title') }}</h2>
      <p>{{ t('license.section4.content') }}</p>

      <h2>{{ t('license.section5.title') }}</h2>
      <p>{{ t('license.section5.content') }}</p>

      <h2>{{ t('license.section6.title') }}</h2>
      <p>{{ t('license.section6.content') }}</p>

      <h2>{{ t('license.section7.title') }}</h2>
      <p>{{ t('license.section7.content') }}</p>

      <h2>{{ t('license.section8.title') }}</h2>
      <p>{{ t('license.section8.content') }}</p>

      <h2>{{ t('license.section9.title') }}</h2>
      <p>{{ t('license.section9.content') }}</p>

      <h2>{{ t('license.section10.title') }}</h2>
      <p>{{ t('license.section10.content') }}</p>

      <h2>{{ t('license.contact.title') }}</h2>
      <p>{{ t('license.contact.content') }}</p>
    </div>
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
