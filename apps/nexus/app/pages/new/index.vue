<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const TuffHomeNexus = defineAsyncComponent(() => import('~/components/tuff/TuffHomeNexus.vue'))

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
