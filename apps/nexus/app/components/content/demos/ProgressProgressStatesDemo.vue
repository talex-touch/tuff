<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffProgress :percentage="40" />
        <TuffProgress :percentage="72" status="warning" />
        <TuffProgress :percentage="100" status="success" />
  </div>
  <div v-else>
        <TuffProgress :percentage="40" />
        <TuffProgress :percentage="72" status="warning" />
        <TuffProgress :percentage="100" status="success" />
  </div>
</template>
