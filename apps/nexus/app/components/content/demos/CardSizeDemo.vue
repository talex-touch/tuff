<script setup lang="ts">
</script>

<template>
  <div class="card-size-grid">
    <TxCard size="small" variant="solid" background="glass" shadow="none" :padding="undefined">
      <div class="card-demo-title">
        size=small
      </div>
      <div class="card-demo-desc">
        Padding controlled by size
      </div>
    </TxCard>

    <TxCard size="medium" variant="solid" background="glass" shadow="none">
      <div class="card-demo-title">
        size=medium
      </div>
      <div class="card-demo-desc">
        Default
      </div>
    </TxCard>

    <TxCard size="large" variant="solid" background="glass" shadow="none">
      <div class="card-demo-title">
        size=large
      </div>
      <div class="card-demo-desc">
        More padding
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.card-size-grid {
  display: grid;
  gap: 10px;
  width: 520px;
  max-width: 100%;
}

.card-demo-title {
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.card-demo-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
