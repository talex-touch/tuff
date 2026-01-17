<script setup lang="ts">
</script>

<template>
  <div style="width: 520px; max-width: 100%;">
    <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="14">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
          <div style="font-weight: 600;">
            User info
          </div>
          <TxButton size="small" variant="text">
            More
          </TxButton>
        </div>
      </template>

      <div style="display: flex; gap: 12px; align-items: center;">
        <div style="width: 34px; height: 34px; border-radius: 12px; background: rgba(64,158,255,0.22);" />
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="font-weight: 600;">
            Zhang San
          </div>
          <div style="font-size: 12px; opacity: 0.75;">
            Frontend Engineer
          </div>
        </div>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
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
