<script setup lang="ts">
import { computed } from 'vue'

interface RowData {
  id: number
  name: string
  role: string
  score: number
}

const { locale } = useI18n()

const columns = computed(() => {
  if (locale.value === 'zh') {
    return [
      { key: 'name', title: '姓名' },
      { key: 'role', title: '角色' },
      { key: 'score', title: '评分', sortable: true },
    ]
  }

  return [
    { key: 'name', title: 'Name' },
    { key: 'role', title: 'Role' },
    { key: 'score', title: 'Score', sortable: true },
  ]
})

const data = computed<RowData[]>(() => {
  if (locale.value === 'zh') {
    return [
      { id: 1, name: '小林', role: '设计师', score: 92 },
      { id: 2, name: '小周', role: '工程师', score: 88 },
      { id: 3, name: '小陈', role: '产品经理', score: 95 },
    ]
  }

  return [
    { id: 1, name: 'Ava', role: 'Designer', score: 92 },
    { id: 2, name: 'Noah', role: 'Engineer', score: 88 },
    { id: 3, name: 'Mia', role: 'PM', score: 95 },
  ]
})
</script>

<template>
  <div class="group">
    <TxDataTable :columns="columns" :data="data" striped bordered />
  </div>
</template>
