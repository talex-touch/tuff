<script setup lang="ts">
import TuffHomeNexus from '~/components/tuff/TuffHomeNexus.vue'

definePageMeta({
  layout: 'home',
})

const pageTitle = computed(() => `Tuff Nexus New`)

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
})
</script>

<template>
  <TuffHomeNexus />
</template>
