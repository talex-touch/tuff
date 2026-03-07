<script setup lang="ts">
import TuffHomeV2 from '~/components/tuff/TuffHomeV2.vue'

definePageMeta({
  layout: 'home',
})

const pageTitle = computed(() => `Tuff Nexus V2`)

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
})
</script>

<template>
  <TuffHomeV2 />
</template>
