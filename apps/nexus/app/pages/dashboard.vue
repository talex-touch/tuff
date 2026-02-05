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
      class="grid gap-8 lg:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr]"
    >
      <DashboardNav />

      <div class="space-y-8">
        <NuxtPage />
      </div>
    </section>
    <div v-else class="rounded-3xl border border-primary/10 bg-white/70 p-8 text-center text-sm text-black/60 dark:border-light/10 dark:bg-dark/60 dark:text-light/70">
      {{ t('auth.redirecting', '正在跳转登录...') }}
    </div>
  </div>
</template>
