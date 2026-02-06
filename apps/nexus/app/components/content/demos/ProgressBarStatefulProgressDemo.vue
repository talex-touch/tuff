<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxProgressBar :percentage="32" show-text />
        <TxProgressBar :percentage="68" status="warning" show-text />
        <TxProgressBar success message="完成" />
        <TxProgressBar loading message="同步中" />
  </div>
  <div v-else>
        <TxProgressBar :percentage="32" show-text />
        <TxProgressBar :percentage="68" status="warning" show-text />
        <TxProgressBar success message="Done" />
        <TxProgressBar loading message="Syncing" />
  </div>
</template>
