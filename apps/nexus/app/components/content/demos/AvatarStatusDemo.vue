<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar status="online" name="Online" />
          <TxAvatar status="offline" name="Offline" />
          <TxAvatar status="busy" name="Busy" />
          <TxAvatar status="away" name="Away" />
        </div>
  </div>
  <div v-else>
        <div style="display: flex; gap: 12px; align-items: center;">
          <TxAvatar status="online" name="Online" />
          <TxAvatar status="offline" name="Offline" />
          <TxAvatar status="busy" name="Busy" />
          <TxAvatar status="away" name="Away" />
        </div>
  </div>
</template>
