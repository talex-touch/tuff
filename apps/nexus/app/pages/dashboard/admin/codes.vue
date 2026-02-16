<script setup lang="ts">
definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { user } = useAuthUser()

watch(() => user.value, (current) => {
  if (!current)
    return
  if (current.role === 'admin') {
    navigateTo('/dashboard/admin/subscriptions')
    return
  }
  navigateTo('/dashboard/overview')
}, { immediate: true })
</script>

<template>
  <div />
</template>
