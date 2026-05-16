<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)
</script>

<template>
  <ClientOnly>
    <LazyDashboardIntelligenceIntelligenceAdminPanel />
    <template #fallback>
      <div class="mx-auto max-w-7xl space-y-6">
        <div class="space-y-3">
          <div class="h-8 w-64 animate-pulse rounded-xl bg-black/10 dark:bg-white/10" />
          <div class="h-4 w-full max-w-2xl animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
        </div>
        <div class="grid gap-4 md:grid-cols-4">
          <div v-for="item in 4" :key="item" class="h-28 animate-pulse rounded-2xl bg-black/5 dark:bg-white/10" />
        </div>
        <div class="h-[32rem] animate-pulse rounded-3xl bg-black/5 dark:bg-white/10" />
      </div>
    </template>
  </ClientOnly>
</template>
