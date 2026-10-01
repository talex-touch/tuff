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
  <AdminPageShell :title="t('dashboard.sections.intelligence.tabs.audits')">
    <ClientOnly>
      <LazyDashboardIntelligenceAuditsPanel />
      <template #fallback>
        <div class="space-y-6">
          <div class="h-[32rem] animate-pulse rounded-3xl bg-black/5 dark:bg-white/10" />
        </div>
      </template>
    </ClientOnly>
  </AdminPageShell>
</template>
