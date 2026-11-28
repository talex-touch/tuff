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
        <TxLoadingOverlay :loading="loading" text="Loading...">
          <div style="height: 120px; display: flex; align-items: center; justify-content: center;">
Content
</div>
        </TxLoadingOverlay>
  </div>
  <div v-else>
        <TxButton @click="loading = !loading">
Toggle
</TxButton>
        <TxLoadingOverlay :loading="loading" text="Loading...">
          <div style="height: 120px; display: flex; align-items: center; justify-content: center;">
Content
</div>
        </TxLoadingOverlay>
  </div>
</template>
