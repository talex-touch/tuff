<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const TuffHome = defineAsyncComponent(() => import('~/components/tuff/TuffHome.vue'))

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
