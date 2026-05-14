<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const tabs = computed(() => [
  {
    id: 'reviews',
    to: '/dashboard/admin/reviews',
    label: t('dashboard.sections.reviews.title', 'Review Moderation'),
  },
  {
    id: 'doc-comments',
    to: '/dashboard/admin/doc-comments',
    label: t('dashboard.sections.docComments.title', 'Doc Comments'),
  },
])
</script>

<template>
  <nav class="flex flex-wrap gap-2 rounded-2xl bg-black/[0.03] p-1 dark:bg-white/[0.05]" aria-label="Comment management tabs">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.id"
      :to="tab.to"
      class="rounded-xl px-4 py-2 text-sm no-underline transition"
      :class="route.path.startsWith(tab.to) ? 'bg-white text-black shadow-sm dark:bg-white/12 dark:text-white' : 'text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white'"
    >
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>
