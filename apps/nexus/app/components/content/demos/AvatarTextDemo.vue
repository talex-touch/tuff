<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar>张</TxAvatar>
          <TxAvatar>AB</TxAvatar>
          <TxAvatar>User</TxAvatar>
        </div>
  </div>
  <div v-else>
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar>张</TxAvatar>
          <TxAvatar>AB</TxAvatar>
          <TxAvatar>User</TxAvatar>
        </div>
  </div>
</template>
