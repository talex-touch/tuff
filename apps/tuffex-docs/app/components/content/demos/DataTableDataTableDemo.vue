<script setup lang="ts">
import { computed } from 'vue'
import { DATA_TABLE_ZH_LABELS } from './data-table-demo-labels'

interface RowData {
  id: number
  name: string
  role: string
  score: number
  joinedAt: string
}

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh' ? DATA_TABLE_ZH_LABELS : undefined))

const columns = computed(() => {
  if (locale.value === 'zh') {
    return [
      { key: 'name', title: '姓名' },
      { key: 'role', title: '角色', type: 'tag' as const, filter: true },
      { key: 'score', title: '评分', type: 'number' as const, filter: true },
      { key: 'joinedAt', title: '加入日期', type: 'date' as const, filter: true },
    ]
  }

  return [
    { key: 'name', title: 'Name' },
    { key: 'role', title: 'Role', type: 'tag' as const, filter: true },
    { key: 'score', title: 'Score', type: 'number' as const, filter: true },
    { key: 'joinedAt', title: 'Joined', type: 'date' as const, filter: true },
  ]
})

const data = computed<RowData[]>(() => {
  if (locale.value === 'zh') {
    return [
      { id: 1, name: '小林', role: '设计师', score: 92, joinedAt: '2026-10-14' },
      { id: 2, name: '小周', role: '工程师', score: 88, joinedAt: '2026-10-13' },
      { id: 3, name: '小陈', role: '产品经理', score: 95, joinedAt: '2026-10-12' },
    ]
  }

  return [
    { id: 1, name: 'Ava', role: 'Designer', score: 92, joinedAt: '2026-10-14' },
    { id: 2, name: 'Noah', role: 'Engineer', score: 88, joinedAt: '2026-10-13' },
    { id: 3, name: 'Mia', role: 'PM', score: 95, joinedAt: '2026-10-12' },
  ]
})
</script>

<template>
  <div class="group not-prose">
    <TxDataTable :columns="columns" :data="data" :labels="labels" striped bordered />
  </div>
</template>
