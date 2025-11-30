<script setup lang="ts">
import TuffHome from '~/components/tuff/TuffHome.vue'

definePageMeta({
  layout: 'home',
})

const pageTitle = computed(() => `Tuff Nexus`)

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
})
</script>

<template>
  <TuffHome />
</template>
