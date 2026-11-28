<script setup lang="ts">
import TuffHome from '~/components/tuff/TuffHome.vue'

definePageMeta({
  layout: 'home',
  colorMode: 'dark',
})

useSeoMeta({
  title: 'Tuff',
  ogTitle: 'Tuff',
})
</script>

<template>
  <TuffHome />
</template>
