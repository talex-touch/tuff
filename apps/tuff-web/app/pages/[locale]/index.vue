<script setup lang="ts">
import TuffHome from '~/components/tuff/TuffHome.vue'

definePageMeta({
  layout: 'home',
  colorMode: 'dark',
  validate: route => /^(?:en|zh)$/i.test(String(route.params.locale || '')),
})

useSeoMeta({
  title: 'Tuff',
  ogTitle: 'Tuff',
})
</script>

<template>
  <TuffHome />
</template>
