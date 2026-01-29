<script setup lang="ts">
</script>

<template>
  <div style="width: 520px; max-width: 100%;">
    <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="14">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-weight: 600;">
            Card title
          </div>
          <TxButton size="small" variant="text">
            Action
          </TxButton>
        </div>
      </template>

      <div style="font-size: 12px; opacity: 0.78; line-height: 1.5;">
        Slots: <code>header</code> / <code>default</code> / <code>footer</code>
      </div>

      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
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
