<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxSearchEmpty description="Try another keyword or filter." />
  </div>
  <div v-else>
        <TxSearchEmpty description="Try another keyword or filter." />
  </div>
</template>
