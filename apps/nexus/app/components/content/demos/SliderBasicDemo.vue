<script setup lang="ts">
import { ref } from 'vue'

const value = ref(30)
</script>

<template>
  <div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxSlider v-model="value" :min="0" :max="100" :step="1" />
    <div style="margin-top: 8px; color: var(--tx-text-color-secondary);">
      Value: {{ value }}
    </div>
  </div>
</template>
