<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  requiresAuth: true,
})

defineI18nRoute(false)

await navigateTo('/admin/users', { replace: true })
</script>

<template>
  <div />
</template>
