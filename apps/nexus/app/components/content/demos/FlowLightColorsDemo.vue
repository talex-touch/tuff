<script setup lang="ts">
// Blue, purple, red and orange positions, replaced with a green family.
const forest = ['#06b6d4', '#14b8a6', '#22c55e', '#84cc16'] as const
</script>

<template>
  <div class="flow-light-colors-demo not-prose">
    <div class="flow-light-colors-demo__panel">
      <TxFlowLight variant="rim" :colors="forest" />
    </div>
    <div class="flow-light-colors-demo__panel">
      <TxFlowLight variant="aurora" :colors="forest" :intensity="1.4" />
    </div>
  </div>
</template>

<style scoped>
.flow-light-colors-demo {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.flow-light-colors-demo__panel {
  position: relative;
  height: 96px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 14px;
  background: var(--tx-bg-color-overlay, #fff);
}
</style>
