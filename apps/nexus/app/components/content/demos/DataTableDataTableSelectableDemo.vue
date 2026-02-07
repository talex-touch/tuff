<script setup lang="ts">
import { computed, ref } from 'vue'

interface RowData {
  id: number
  name: string
  role: string
  score: number
}

const { locale } = useI18n()
const selectedKeys = ref<Array<number | string>>([])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      selected: '已选',
      rows: '行',
      empty: '无',
    }
  }

  return {
    selected: 'Selected',
    rows: 'rows',
    empty: 'None',
  }
})

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
    <div style="margin-bottom: 10px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
      {{ labels.selected }}：{{ selectedKeys.length ? selectedKeys.length : labels.empty }} {{ labels.rows }}
    </div>
    <TxDataTable
      v-model:selected-keys="selectedKeys"
      :columns="columns"
      :data="data"
      row-key="id"
      selectable
    />
  </div>
</template>
