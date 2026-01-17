<script setup lang="ts">
</script>

<template>
  <div style="width: 100%; overflow-x: auto;">
    <div style="min-width: 680px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">
      <TxCard variant="solid" background="glass" shadow="none" :padding="14">
        <div style="font-weight: 600;">
          solid
        </div>
        <div style="font-size: 12px; opacity: 0.78; margin-top: 6px;">
          Border + hover feedback
        </div>
      </TxCard>

      <TxCard variant="dashed" background="glass" shadow="none" :padding="14">
        <div style="font-weight: 600;">
          dashed
        </div>
        <div style="font-size: 12px; opacity: 0.78; margin-top: 6px;">
          Dashed border
        </div>
      </TxCard>

      <TxCard variant="plain" background="glass" shadow="none" :padding="14">
        <div style="font-weight: 600;">
          plain
        </div>
        <div style="font-size: 12px; opacity: 0.78; margin-top: 6px;">
          No border, no hover
        </div>
      </TxCard>
    </div>
  </div>
</template>
