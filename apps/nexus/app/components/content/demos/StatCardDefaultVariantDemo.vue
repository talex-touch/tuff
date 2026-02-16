<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <TxStatCard
    :value="2847"
    :label="locale === 'zh' ? '插件总数' : 'Total Plugins'"
    icon-class="i-carbon-download text-6xl text-[var(--tx-color-primary)]"
    clickable
  />
</template>
