<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      title: '进度总览',
      waiting: '排队中',
      running: '进行中',
      review: '审核中',
      done: '已完成',
    }
  : {
      title: 'Progress Overview',
      waiting: 'Queued',
      running: 'Running',
      review: 'Review',
      done: 'Done',
    }))

const rows = computed(() => [
  { key: 'waiting', percentage: 18, status: 'info' as const },
  { key: 'running', percentage: 46, status: 'primary' as const },
  { key: 'review', percentage: 78, status: 'warning' as const },
  { key: 'done', percentage: 100, status: 'success' as const },
])
</script>

<template>
  <div style="display: grid; gap: 12px; width: 320px;">
    <strong style="font-size: 13px;">{{ labels.title }}</strong>
    <div v-for="row in rows" :key="row.key" style="display: grid; gap: 6px;">
      <span style="font-size: 12px; color: var(--tx-text-color-secondary);">
        {{ labels[row.key as keyof typeof labels] }}
      </span>
      <TxProgressBar :percentage="row.percentage" :status="row.status" />
    </div>
  </div>
</template>
