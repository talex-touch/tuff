<script setup lang="ts">
</script>

<template>
  <div class="card-mode-shell">
    <div class="card-mode-grid">
      <TxCard variant="solid" background="glass" shadow="none" :padding="14">
        <div class="card-mode-title">
          shadow=none
        </div>
        <div class="card-mode-desc">
          Default
        </div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="soft" :padding="14">
        <div class="card-mode-title">
          shadow=soft
        </div>
        <div class="card-mode-desc">
          Elevated
        </div>
      </TxCard>
    </div>
  </div>
</template>

<style scoped>
.card-mode-shell {
  width: 100%;
  overflow-x: auto;
}

.card-mode-grid {
  min-width: 520px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.card-mode-title {
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.card-mode-desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
