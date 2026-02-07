<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 420px;">
      <TxNoSelection description="Select an item to see its details." />
    </div>
  </div>
  <div v-else>
    <div style="max-width: 420px;">
      <TxNoSelection description="Select an item to see its details." />
    </div>
  </div>
</template>
