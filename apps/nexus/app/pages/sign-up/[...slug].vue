<script setup lang="ts">
definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const route = useRoute()

watchEffect(() => {
  navigateTo({
    path: '/sign-up',
    query: route.query,
  }, { replace: true })
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center text-sm text-black/60 dark:text-light/70">
    Redirecting…
  </div>
</template>
