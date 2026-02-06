<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      online: '在线',
      offline: '离线',
      busy: '忙碌',
      away: '离开',
    }
  : {
      online: 'Online',
      offline: 'Offline',
      busy: 'Busy',
      away: 'Away',
    }))
</script>

<template>
  <div style="display: flex; gap: 12px; align-items: center;">
    <TxAvatar status="online" :name="labels.online" />
    <TxAvatar status="offline" :name="labels.offline" />
    <TxAvatar status="busy" :name="labels.busy" />
    <TxAvatar status="away" :name="labels.away" />
  </div>
</template>
