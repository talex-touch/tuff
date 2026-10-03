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
  <!--
    ClientOnly renders a fragment, so using it as the page root made Nuxt warn that
    this page "does not have a single root node and will cause errors when navigating
    between routes", and left the declared fade pageTransition with nothing to animate.
  -->
  <AdminPageShell :title="t('dashboard.sections.intelligence.tabs.overview')">
    <ClientOnly>
      <LazyDashboardIntelligenceOverviewPanel />
      <template #fallback>
        <div class="space-y-6">
          <div class="grid gap-4 md:grid-cols-4">
            <div v-for="item in 4" :key="item" class="h-28 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
          </div>
          <div class="grid gap-4 lg:grid-cols-3">
            <div v-for="item in 3" :key="item" class="h-40 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
          </div>
        </div>
      </template>
    </ClientOnly>
  </AdminPageShell>
</template>
