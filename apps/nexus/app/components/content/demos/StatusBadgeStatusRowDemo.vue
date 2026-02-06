<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxAvatar name="TA" />
        <TxStatusBadge text="在线" status="success" />
  </div>
  <div v-else>
        <TxAvatar name="TA" />
        <TxStatusBadge text="Online" status="success" />
  </div>
</template>
