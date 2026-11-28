<script setup lang="ts">
import UpdatesView from '~/components/views/UpdatesView.vue'

definePageMeta({
  layout: 'home',
  validate: route => /^(?:en|zh)$/i.test(String(route.params.locale || '')),
})
</script>

<template>
  <UpdatesView />
</template>
