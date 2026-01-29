<script setup lang="ts">
import { ref } from 'vue'

const value = ref(1)
const segments = [
  { value: 0, label: 'Small' },
  { value: 1, label: 'Medium' },
  { value: 2, label: 'Large' },
  { value: 3, label: 'XL' },
]
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px; width: 400px;">
    <div>
      <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
        当前值: {{ value }}
      </div>
      <TxSegmentedSlider v-model="value" :segments="segments" />
    </div>
  </div>
</template>
