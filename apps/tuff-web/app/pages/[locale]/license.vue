<script setup lang="ts">
import LegalDocView from '~/components/views/LegalDocView.vue'

definePageMeta({
  layout: 'license',
  validate: route => /^(?:en|zh)$/i.test(String(route.params.locale || '')),
})
</script>

<template>
  <LegalDocView name="license" />
</template>
