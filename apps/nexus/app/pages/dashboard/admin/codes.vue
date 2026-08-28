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
  // `replace` matters: this route only forwards, so leaving it in history means
  // Back lands here and is immediately forwarded again — the reader cannot get
  // out of the subscriptions page with the Back button.
  if (current.role === 'admin') {
    navigateTo('/dashboard/admin/subscriptions', { replace: true })
    return
  }
  navigateTo('/dashboard/overview', { replace: true })
}, { immediate: true })
</script>

<template>
  <div />
</template>
