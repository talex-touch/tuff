<script setup lang="ts">
function onClick() {}
</script>

<template>
  <div class="card-states-wrap">
    <div class="card-states-grid">
      <TxCard variant="solid" background="glass" shadow="none" clickable :padding="14" @click="onClick">
        <div class="card-demo-title">
          clickable
        </div>
        <div class="card-demo-desc">
          Hover/active feedback
        </div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" :loading="true" :padding="14" :loading-spinner-size="12">
        <div class="card-demo-title">
          loading
        </div>
        <div class="card-demo-desc">
          spinner=12
        </div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" :loading="true" :padding="14" :loading-spinner-size="20">
        <div class="card-demo-title">
          loading
        </div>
        <div class="card-demo-desc">
          spinner=20
        </div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" disabled :padding="14">
        <div class="card-demo-title">
          disabled
        </div>
        <div class="card-demo-desc">
          Reduced opacity
        </div>
      </TxCard>
    </div>
  </div>
</template>

<style scoped>
.card-states-wrap {
  width: 100%;
  overflow-x: auto;
}

.card-states-grid {
  min-width: 720px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
