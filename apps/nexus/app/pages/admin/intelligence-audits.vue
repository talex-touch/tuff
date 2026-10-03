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

// ClientOnly renders a fragment, so it must not be the page root: Nuxt warns that a
// page without a single root node "will cause errors when navigating between routes".
// AdminPageShell is the single root. Keep explanations out of the template root too:
// development keeps template comments, and a root comment beside AdminPageShell made
// this page multi-root, which stalled the `out-in` transition and left the next
// page blank (guarded by test/guards/page-single-root.test.ts).

const { t } = useI18n()
</script>

<template>
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
