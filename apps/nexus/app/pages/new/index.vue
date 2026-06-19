<script setup lang="ts">
import TuffHomeNew from '~/components/tuff/TuffHomeNew.vue'

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
  <TuffHomeNew />
</template>
