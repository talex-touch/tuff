<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const value = ref<(string | number)[]>(['b', 2])

const columns = [
  {
    key: 'letter',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ],
  },
  {
    key: 'number',
    options: [
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
      { value: 4, label: '4', disabled: true },
    ],
  },
]
</script>

<template>
  <div style="width: 360px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <div style="display: flex; gap: 8px; align-items: center;">
      <TxButton variant="primary" @click="visible = true">
        Open picker
      </TxButton>
      <div style="color: var(--tx-text-color-secondary);">
        Value: {{ value }}
      </div>
    </div>

    <TxPicker v-model="value" v-model:visible="visible" title="Picker" :columns="columns" />
  </div>
</template>
