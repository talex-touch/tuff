<script setup lang="ts">
</script>

<template>
  <div class="card-variants-wrap">
    <div class="card-variants-grid">
      <TxCard variant="solid" background="glass" shadow="none" :padding="14">
        <div class="card-demo-title">
          solid
        </div>
        <div class="card-demo-desc">
          Border + hover feedback
        </div>
      </TxCard>

      <TxCard variant="dashed" background="glass" shadow="none" :padding="14">
        <div class="card-demo-title">
          dashed
        </div>
        <div class="card-demo-desc">
          Dashed border
        </div>
      </TxCard>

      <TxCard variant="plain" background="glass" shadow="none" :padding="14">
        <div class="card-demo-title">
          plain
        </div>
        <div class="card-demo-desc">
          No border, no hover
        </div>
      </TxCard>
    </div>
  </div>
</template>

<style scoped>
.card-variants-wrap {
  width: 100%;
  overflow-x: auto;
}

.card-variants-grid {
  min-width: 680px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
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
