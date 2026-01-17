<script setup lang="ts">
import { ref } from 'vue'

const value = ref<string | number>('')

const options = [
  { value: 'foo', label: 'Foo' },
  { value: 'bar', label: 'Bar' },
  { value: 'baz', label: 'Baz' },
  { value: 'disabled', label: 'Disabled', disabled: true },
]
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 10px; width: 320px;">
    <TxSearchSelect v-model="value" :options="options" placeholder="Search and pick" />
    <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
      Value: {{ value }}
    </div>
  </div>
</template>
