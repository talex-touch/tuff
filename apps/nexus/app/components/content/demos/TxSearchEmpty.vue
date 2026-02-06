<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 420px;">
      <TxSearchEmpty description="Try another keyword or filter." />
    </div>
  </div>
  <div v-else>
    <div style="max-width: 420px;">
      <TxSearchEmpty description="Try another keyword or filter." />
    </div>
  </div>
</template>
