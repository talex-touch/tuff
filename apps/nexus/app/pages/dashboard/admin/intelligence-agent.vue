<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

await navigateTo('/dashboard/admin/intelligence')
</script>

<template>
  <div />
</template>
