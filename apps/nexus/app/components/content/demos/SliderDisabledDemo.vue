<script setup lang="ts">
import { ref } from 'vue'

const value = ref(42)
</script>

<template>
  <div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxSlider v-model="value" disabled show-value />
  </div>
</template>
