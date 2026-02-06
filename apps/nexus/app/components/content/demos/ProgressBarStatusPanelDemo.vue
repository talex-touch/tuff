<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxProgressBar :percentage="80" show-text message="上传中" />
        <TxStatusBadge text="进行中" status="warning" />
  </div>
  <div v-else>
        <TxProgressBar :percentage="80" show-text message="Uploading" />
        <TxStatusBadge text="In progress" status="warning" />
  </div>
</template>
