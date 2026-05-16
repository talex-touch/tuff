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
    <LazyDashboardProviderRegistryProviderRegistryAdminPanel />
    <template #fallback>
      <div class="space-y-4 p-6">
        <div class="h-8 w-64 animate-pulse rounded-xl bg-black/10 dark:bg-white/10" />
        <div class="h-24 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
        <div class="grid gap-3 md:grid-cols-3">
          <div v-for="item in 3" :key="item" class="h-20 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
        </div>
      </div>
    </template>
  </ClientOnly>
</template>
