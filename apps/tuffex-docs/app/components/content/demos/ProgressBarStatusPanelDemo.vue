<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'" class="progress-bar-status-panel-demo">
        <TxProgressBar :percentage="80" show-text message="上传中" />
        <TxStatusBadge text="进行中" status="warning" />
  </div>
  <div v-else class="progress-bar-status-panel-demo">
        <TxProgressBar :percentage="80" show-text message="Uploading" />
        <TxStatusBadge text="In progress" status="warning" />
  </div>
</template>

<style scoped>
.progress-bar-status-panel-demo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
</style>
