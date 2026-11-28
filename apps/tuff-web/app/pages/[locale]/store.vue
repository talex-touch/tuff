<script setup lang="ts">
import StoreView from '~/components/views/StoreView.vue'

definePageMeta({
  layout: 'store',
  validate: route => /^(?:en|zh)$/i.test(String(route.params.locale || '')),
})
</script>

<template>
  <StoreView />
</template>
