<script setup lang="ts">
</script>

<template>
  <div class="card-layout-wrap">
    <div class="card-layout-grid">
      <TxCard variant="solid" background="glass" shadow="none" :padding="10" :radius="10">
        <div class="card-demo-title">
          padding
        </div>
        <div class="card-demo-desc">
          padding=10
        </div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" :padding="18" :radius="10">
        <div class="card-demo-title">
          padding
        </div>
        <div class="card-demo-desc">
          padding=18
        </div>
      </TxCard>

      <TxCard variant="plain" background="glass" shadow="none" :padding="14" :radius="22">
        <div class="card-demo-title">
          radius
        </div>
        <div class="card-demo-desc">
          radius=22
        </div>
      </TxCard>
    </div>
  </div>
</template>

<style scoped>
.card-layout-wrap {
  width: 100%;
  overflow-x: auto;
}

.card-layout-grid {
  min-width: 520px;
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
