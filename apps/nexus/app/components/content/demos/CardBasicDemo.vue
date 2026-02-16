<script setup lang="ts">
</script>

<template>
  <div class="card-demo-shell">
    <TxCard variant="solid" background="glass" shadow="none" :padding="14">
      <div class="card-demo-title">
        Card
      </div>
      <div class="card-demo-desc">
        A generic container for content.
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.card-demo-shell {
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
