<script setup lang="ts">
import { ref } from 'vue'

const value = ref(30)
const formatValue = (next: number) => `${next}%`
</script>

<template>
  <div style="width: 320px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxSlider
      v-model="value"
      :min="0"
      :max="100"
      show-value
      :format-value="formatValue"
    />
  </div>
</template>
