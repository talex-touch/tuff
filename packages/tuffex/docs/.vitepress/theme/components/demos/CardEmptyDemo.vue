<script setup lang="ts">
</script>

<template>
  <div class="card-empty-shell">
    <TxCard class="card-empty-mask" variant="plain" background="mask" shadow="none" :padding="16">
      <TxEmpty title="Nothing here" description="Create your first item to get started.">
        <template #action>
          <TxButton variant="primary" size="small">
            Create
          </TxButton>
        </template>
      </TxEmpty>
    </TxCard>

    <div class="card-empty-block">
      <TxEmpty title="Empty only" description="No Card wrapper, pure empty block." compact />
    </div>
  </div>
</template>

<style scoped>
.card-empty-shell {
  display: grid;
  gap: 12px;
  width: 420px;
  max-width: 100%;
}

.card-empty-mask {
  --tx-card-fake-background: color-mix(in srgb, var(--tx-fill-color-lighter, #fafafa) 82%, transparent);
}

.card-empty-block {
  padding: 14px;
  border-radius: 14px;
  border: 1px dashed color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
}
</style>
