<script setup lang="ts">
</script>

<template>
  <div style="width: 520px; max-width: 100%;">
    <TxCard variant="solid" background="glass" shadow="none" :padding="14">
      <template #header>
        <div style="font-weight: 600;">
          Card title
        </div>
      </template>
      <div style="font-size: 12px; opacity: 0.78;">
        Using <code>header</code> slot
      </div>
    </TxCard>
  </div>
</template>
