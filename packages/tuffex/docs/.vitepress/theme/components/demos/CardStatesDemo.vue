<script setup lang="ts">
function onClick() {}
</script>

<template>
  <div style="width: 100%; overflow-x: auto;">
    <div style="min-width: 720px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;">
      <TxCard variant="solid" background="glass" shadow="none" clickable :padding="14" @click="onClick">
        <div style="font-weight: 600;">clickable</div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">Hover/active feedback</div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" :loading="true" :padding="14" :loading-spinner-size="12">
        <div style="font-weight: 600;">loading</div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">spinner=12</div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" :loading="true" :padding="14" :loading-spinner-size="20">
        <div style="font-weight: 600;">loading</div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">spinner=20</div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" disabled :padding="14">
        <div style="font-weight: 600;">disabled</div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">Reduced opacity</div>
      </TxCard>
    </div>
  </div>
</template>
