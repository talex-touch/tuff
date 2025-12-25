<script setup lang="ts">
</script>

<template>
  <div style="display: grid; gap: 10px; width: 520px; max-width: 100%;">
    <TxCard size="small" variant="solid" background="glass" shadow="none" :padding="undefined">
      <div style="font-weight: 600;">size=small</div>
      <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">Padding controlled by size</div>
    </TxCard>

    <TxCard size="medium" variant="solid" background="glass" shadow="none">
      <div style="font-weight: 600;">size=medium</div>
      <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">Default</div>
    </TxCard>

    <TxCard size="large" variant="solid" background="glass" shadow="none">
      <div style="font-weight: 600;">size=large</div>
      <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">More padding</div>
    </TxCard>
  </div>
</template>
