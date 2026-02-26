<script setup lang="ts">
import IntelligenceAgentWorkspace from '~/components/dashboard/intelligence/IntelligenceAgentWorkspace.vue'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)
</script>

<template>
  <IntelligenceAgentWorkspace />
</template>
