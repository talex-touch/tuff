<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useUser()

// Admin check - redirect if not admin
const isAdmin = computed(() => {
  const metadata = (user.value?.publicMetadata ?? {}) as Record<string, unknown>
  return metadata?.role === 'admin'
})

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-black dark:text-light">
          {{ t('dashboard.sections.reviews.title', 'Review Moderation') }}
        </h1>
        <p class="mt-1 text-sm text-black/60 dark:text-light/60">
          {{ t('dashboard.sections.reviews.subtitle', 'Review and manage community feedback.') }}
        </p>
      </div>
    </div>
    <section class="rounded-2xl border border-primary/10 bg-white/80 p-5 dark:border-light/10 dark:bg-dark/60">
      <p class="text-sm text-black/60 dark:text-light/60">
        {{ t('dashboard.sections.reviews.empty', 'No pending reviews yet.') }}
      </p>
    </section>
  </div>
</template>
