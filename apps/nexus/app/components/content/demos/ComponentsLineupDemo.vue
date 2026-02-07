<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      action: '操作',
      online: '在线',
      focus: '专注',
    }
  : {
      action: 'Action',
      online: 'Online',
      focus: 'Focus',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton size="sm">
      {{ labels.action }}
    </TxButton>
    <TuffSwitch :model-value="true" />
    <TxStatusBadge :text="labels.online" status="success" />
    <TxTag :label="labels.focus" />
    <TxProgressBar :percentage="62" style="width: 140px;" />
  </div>
</template>
