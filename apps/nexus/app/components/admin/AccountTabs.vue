<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

const tabs = computed(() => [
  {
    id: 'users',
    to: '/admin/users',
    label: t('dashboard.sections.users.title', 'User Management'),
  },
  {
    id: 'subscriptions',
    to: '/admin/subscriptions',
    label: t('dashboard.sections.subscriptions.title', 'Subscription Management'),
  },
])

function isActive(path: string) {
  if (path === '/admin/subscriptions')
    return route.path.startsWith('/admin/subscriptions') || route.path.startsWith('/admin/codes')
  return route.path.startsWith(path)
}
</script>

<template>
  <nav class="flex flex-wrap gap-2 rounded-2xl bg-black/[0.03] p-1 dark:bg-white/[0.05]" aria-label="Account management tabs">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.id"
      :to="tab.to"
      class="rounded-xl px-4 py-2 text-sm no-underline transition"
      :class="isActive(tab.to) ? 'bg-white text-black shadow-sm dark:bg-white/12 dark:text-white' : 'text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white'"
    >
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>
