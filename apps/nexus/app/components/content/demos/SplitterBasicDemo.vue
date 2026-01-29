<script setup lang="ts">
import { ref } from 'vue'

const ratio = ref(0.4)
</script>

<template>
  <div style="width: 520px; height: 240px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
    <TxSplitter v-model="ratio" style="width: 100%; height: 100%;">
      <template #a>
        <div style="height: 100%; padding: 12px; color: var(--tx-text-color-secondary);">
          A ({{ ratio.toFixed(2) }})
        </div>
      </template>
      <template #b>
        <div style="height: 100%; padding: 12px; color: var(--tx-text-color-secondary);">
          B
        </div>
      </template>
    </TxSplitter>
  </div>
</template>
