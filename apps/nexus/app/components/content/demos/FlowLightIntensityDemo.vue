<script setup lang="ts">
const levels = [0.5, 1, 1.6]
</script>

<template>
  <div class="flow-light-intensity-demo not-prose">
    <figure v-for="level in levels" :key="level" class="flow-light-intensity-demo__item">
      <div class="flow-light-intensity-demo__panel">
        <TxFlowLight variant="corners" :intensity="level" />
      </div>
      <figcaption>intensity {{ level }}</figcaption>
    </figure>
  </div>
</template>

<style scoped>
.flow-light-intensity-demo {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.flow-light-intensity-demo__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.flow-light-intensity-demo__panel {
  position: relative;
  height: 96px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 14px;
  background: var(--tx-bg-color-overlay, #fff);
}

figcaption {
  color: var(--tx-text-color-secondary, #909399);
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center;
}
</style>
