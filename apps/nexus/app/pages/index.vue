<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const TuffHome = defineAsyncComponent(() => import('~/components/tuff/TuffHome.vue'))

definePageMeta({
  layout: 'home',
  colorMode: 'dark',
})

useHead({
  htmlAttrs: { class: 'dark' },
})

const pageTitle = computed(() => `Tuff`)

useSeoMeta({
  title: pageTitle,
  ogTitle: pageTitle,
})
</script>

<template>
  <TuffHome />
</template>
