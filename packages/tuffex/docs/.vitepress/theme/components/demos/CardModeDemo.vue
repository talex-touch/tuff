<script setup lang="ts">
</script>

<template>
  <div style="width: 100%; overflow-x: auto;">
    <div style="min-width: 520px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
      <TxCard variant="solid" background="glass" shadow="none" :padding="14">
        <div style="font-weight: 600;">
          shadow=none
        </div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">
          Default
        </div>
      </TxCard>

      <TxCard variant="solid" background="glass" shadow="soft" :padding="14">
        <div style="font-weight: 600;">
          shadow=soft
        </div>
        <div style="font-size: 12px; opacity: 0.75; margin-top: 6px;">
          Elevated
        </div>
      </TxCard>
    </div>
  </div>
</template>
