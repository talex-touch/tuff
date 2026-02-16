<script setup lang="ts">
</script>

<template>
  <div class="card-actions-shell">
    <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="14">
      <template #header>
        <div class="card-actions-header">
          <div class="card-actions-title">
            User info
          </div>
          <TxButton size="small" variant="text">
            More
          </TxButton>
        </div>
      </template>

      <div class="card-actions-body">
        <div class="card-actions-avatar" />
        <div class="card-actions-meta">
          <div class="card-actions-name">
            Zhang San
          </div>
          <div class="card-actions-role">
            Frontend Engineer
          </div>
        </div>
      </div>

      <template #footer>
        <div class="card-actions-footer">
          <TxButton size="small" variant="outline">
            Cancel
          </TxButton>
          <TxButton size="small" variant="primary">
            Confirm
          </TxButton>
        </div>
      </template>
    </TxCard>
  </div>
</template>

<style scoped>
.card-actions-shell {
  width: 520px;
  max-width: 100%;
}

.card-actions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card-actions-title,
.card-actions-name {
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.card-actions-body {
  display: flex;
  gap: 12px;
  align-items: center;
}

.card-actions-avatar {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 24%, transparent);
}

.card-actions-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-actions-role {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.card-actions-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
