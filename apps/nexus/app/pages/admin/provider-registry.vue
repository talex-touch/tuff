<script setup lang="ts">
import AdminPageShell from '~/components/admin/AdminPageShell.vue'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
</script>

<template>
  <AdminPageShell :title="t('dashboard.providerRegistry.title', 'Provider Registry')">
    <ClientOnly>
      <LazyDashboardProviderRegistryAdminPanel />
      <template #fallback>
        <div class="space-y-4">
          <div class="h-24 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
          <div class="grid gap-3 md:grid-cols-3">
            <div v-for="item in 3" :key="item" class="h-20 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
          </div>
        </div>
      </template>
    </ClientOnly>
  </AdminPageShell>
</template>
