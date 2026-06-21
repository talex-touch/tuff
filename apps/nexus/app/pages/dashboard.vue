<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { isAuthenticated } = useAuthUser()
</script>

<template>
  <div class="relative">
    <section
      v-if="isAuthenticated"
      class="dashboard-shell grid gap-8 lg:grid-cols-[192px_minmax(0,1fr)] xl:grid-cols-[208px_minmax(0,1fr)]"
    >
      <DashboardNav />

      <div class="min-w-0 space-y-10 overflow-hidden">
        <NuxtPage />
      </div>
    </section>
    <div v-else class="rounded-3xl border border-primary/10 bg-white/70 p-8 text-center text-sm text-black/60 dark:border-light/10 dark:bg-dark/60 dark:text-light/70">
      {{ t('auth.redirecting', '正在跳转登录...') }}
    </div>
  </div>
</template>

<style scoped>
.dashboard-shell {
  width: 100%;
  max-width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
}
</style>
