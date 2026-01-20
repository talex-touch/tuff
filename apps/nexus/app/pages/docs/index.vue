<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const target = computed(() => localePath({ path: '/docs/dev/index' }))

if (import.meta.server) {
  await navigateTo(target.value, { redirectCode: 302 })
}
else {
  onMounted(() => {
    if (route.path !== target.value)
      navigateTo(target.value)
  })
}
</script>

<template>
  <div class="flex items-center justify-center py-24">
    <div class="inline-flex items-center gap-3 border border-primary/10 rounded-full bg-white/80 px-5 py-2 text-sm text-gray-600 shadow-sm dark:border-light/10 dark:bg-dark/70 dark:text-gray-200">
      <span class="i-carbon-circle-dash text-base" />
      {{ t('docs.redirecting') }}
    </div>
  </div>
</template>
