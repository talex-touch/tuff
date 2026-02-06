<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffInput placeholder="搜索..." />
        <TxButton size="sm">
搜索
</TxButton>
</div>
  <div v-else>
        <TuffInput placeholder="Search..." />
        <TxButton size="sm">
Go
</TxButton>
</div>
</template>
