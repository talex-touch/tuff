<script setup lang="ts">
</script>

<template>
  <div style="display: grid; gap: 12px; width: 420px; max-width: 100%;">
    <TxCard variant="plain" background="mask" shadow="none" :padding="16">
      <TxEmpty title="Nothing here" description="Create your first item to get started.">
        <template #action>
          <TxButton variant="primary" size="small">Create</TxButton>
        </template>
      </TxEmpty>
    </TxCard>

    <div style="padding: 14px; border-radius: 14px; border: 1px dashed rgba(255,255,255,0.18);">
      <TxEmpty title="Empty only" description="No Card wrapper, pure empty block." compact />
    </div>
  </div>
</template>
