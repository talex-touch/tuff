<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxEmpty title="No results" description="Try changing filters." />
  </div>
  <div v-else>
        <TxEmpty title="No results" description="Try changing filters." />
  </div>
</template>
