<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)
</script>

<template>
  <!--
    ClientOnly renders a fragment, so using it as the page root made Nuxt warn that
    this page "does not have a single root node and will cause errors when navigating
    between routes", and left the declared fade pageTransition with nothing to animate.
  -->
  <div>
    <ClientOnly>
      <LazyDashboardIntelligenceIntelligenceAuditsPanel />
      <template #fallback>
        <div class="space-y-6">
          <div class="space-y-3">
            <div class="h-8 w-64 animate-pulse rounded-xl bg-black/10 dark:bg-white/10" />
            <div class="h-4 max-w-2xl w-full animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
          </div>
          <div class="h-[32rem] animate-pulse rounded-3xl bg-black/5 dark:bg-white/10" />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
