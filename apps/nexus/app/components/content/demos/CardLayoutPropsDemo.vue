<script setup lang="ts">
</script>

<template>
  <div style="width: 100%; overflow-x: auto;">
    <div style="min-width: 520px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">
      <TxCard variant="solid" background="glass" shadow="none" :padding="10" :radius="10">
        <div style="font-weight: 600;">
          padding
        </div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">
          padding=10
        </div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="none" :padding="18" :radius="10">
        <div style="font-weight: 600;">
          padding
        </div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">
          padding=18
        </div>
      </TxCard>

      <TxCard variant="plain" background="glass" shadow="none" :padding="14" :radius="22">
        <div style="font-weight: 600;">
          radius
        </div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">
          radius=22
        </div>
      </TxCard>
    </div>
  </div>
</template>
