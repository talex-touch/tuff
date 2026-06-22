<script setup lang="ts">
definePageMeta({
  layout: false,
})

defineI18nRoute(false)

const route = useRoute()

await navigateTo({
  path: '/sign-in',
  query: route.query,
}, { redirectCode: 307, replace: true })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center text-sm text-black/60 dark:text-light/70">
    Redirecting…
  </div>
</template>
