<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const value = ref('2026-01-02')
const fieldValue = ref('2026-03-18')
</script>

<template>
  <div style="display: grid; width: 360px; gap: 14px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton variant="primary" @click="visible = true">
        Open date picker
      </TxButton>
      <div style="color: var(--tx-text-color-secondary);">
        Value: {{ value }}
      </div>
    </div>

    <TxDatePicker
      v-model="value"
      v-model:visible="visible"
      title="Date"
      min="2025-01-01"
      max="2030-12-31"
    />

    <TxDatePicker
      v-model="fieldValue"
      variant="adaptive"
      placeholder="Select date"
      min="2026-01-01"
      max="2026-12-31"
    />
  </div>
</template>
