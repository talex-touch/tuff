<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxTag label="Beta" />
        <TxButton size="sm">
升级
</TxButton>
  </div>
  <div v-else>
        <TxTag label="Beta" />
        <TxButton size="sm">
Upgrade
</TxButton>
  </div>
</template>
