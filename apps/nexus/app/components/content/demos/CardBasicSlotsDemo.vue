<script setup lang="ts">
</script>

<template>
  <div class="card-demo-shell">
    <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="14">
      <template #header>
        <div class="card-demo-header">
          <div class="card-demo-title">
            Card title
          </div>
          <TxButton size="sm" variant="ghost">
            Action
          </TxButton>
        </div>
      </template>

      <div class="card-demo-desc">
        Slots: <code>header</code> / <code>default</code> / <code>footer</code>
      </div>

      <template #footer>
        <div class="card-demo-footer">
          <TxButton size="sm" variant="secondary">
            Cancel
          </TxButton>
          <TxButton size="sm" variant="primary">
            Confirm
          </TxButton>
        </div>
      </template>
    </TxCard>
  </div>
</template>

<style scoped>
.card-demo-shell {
  width: 520px;
  max-width: 100%;
}

.card-demo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card-demo-title {
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.card-demo-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-text-color-secondary, #909399);
}

.card-demo-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
