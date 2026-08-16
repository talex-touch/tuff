<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      label: '任务状态筛选',
      all: '全部',
      todo: '待办',
      progress: '进行中',
      done: '已完成',
      selected: '当前筛选',
    }
  }

  return {
    label: 'Task status filter',
    all: 'All',
    todo: 'To do',
    progress: 'In Progress',
    done: 'Completed',
    selected: 'Current filter',
  }
})

/** Real rows, so every count below is derived rather than typed in by hand. */
const rows = [
  { task: 'Restock mango sorbet', status: 'todo' },
  { task: 'Churn black sesame', status: 'progress' },
  { task: 'Print summer menu', status: 'todo' },
  { task: 'Taste-test batch 42', status: 'progress' },
  { task: 'Order waffle cones', status: 'done' },
]

const filter = ref<string>('all')

function countOf(status: string): number {
  return rows.filter(row => row.status === status).length
}

const items = computed(() => [
  { value: 'all', label: copy.value.all, count: rows.length },
  { value: 'todo', label: copy.value.todo, dot: '#f09a2f', count: countOf('todo') },
  { value: 'progress', label: copy.value.progress, dot: '#16a6c7', count: countOf('progress') },
  { value: 'done', label: copy.value.done, dot: '#25a878', count: countOf('done') },
])

const activeLabel = computed(() => items.value.find(item => item.value === filter.value)?.label ?? '')
</script>

<template>
  <div class="filter-chips-demo">
    <TxFilterChips v-model="filter" :items="items" :aria-label="copy.label" />
    <p class="filter-chips-demo__readout">
      {{ copy.selected }}: <strong>{{ activeLabel }}</strong>
    </p>
  </div>
</template>

<style scoped>
.filter-chips-demo {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 420px;
}

.filter-chips-demo__readout {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
