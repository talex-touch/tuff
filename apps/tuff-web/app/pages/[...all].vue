<script setup lang="ts">
import NotFoundPage from './__not-found.vue'

definePageMeta({
  layout: false,
})

if (import.meta.server)
  setResponseStatus(404)
</script>

<template>
  <NotFoundPage />
</template>
