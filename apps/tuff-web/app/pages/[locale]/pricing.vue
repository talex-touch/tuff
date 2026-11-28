<script setup lang="ts">
import PricingView from '~/components/views/PricingView.vue'

definePageMeta({
  layout: 'home',
  validate: route => /^(?:en|zh)$/i.test(String(route.params.locale || '')),
})
</script>

<template>
  <PricingView />
</template>
