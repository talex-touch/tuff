<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxNoSelection description="Select an item to see its details." />
  </div>
  <div v-else>
        <TxNoSelection description="Select an item to see its details." />
  </div>
</template>
