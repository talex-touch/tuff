<script setup lang="ts">
definePageMeta({
  name: 'PilotSettingsHub',
  layout: 'admin',
  middleware: () => {
    return navigateTo('/admin/system/channels', { replace: true })
  },
  pageTransition: {
    name: 'rotate',
  },
})
</script>

<template>
  <div />
</template>
