<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxBadge :value="8" />
        <TxBadge value="New" variant="primary" />
        <TxBadge value="99+" variant="success" />
        <TxBadge dot variant="error" />
  </div>
  <div v-else>
        <TxBadge :value="8" />
        <TxBadge value="New" variant="primary" />
        <TxBadge value="99+" variant="success" />
        <TxBadge dot variant="error" />
  </div>
</template>
