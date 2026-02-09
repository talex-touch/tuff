<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const loading = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="loading = !loading">
Toggle
</TxButton>
        <TxLoadingOverlay fullscreen :loading="loading" text="Loading..." />
  </div>
  <div v-else>
        <TxButton @click="loading = !loading">
Toggle
</TxButton>
        <TxLoadingOverlay fullscreen :loading="loading" text="Loading..." />
  </div>
</template>
