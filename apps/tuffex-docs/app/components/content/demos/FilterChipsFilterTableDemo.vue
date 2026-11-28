<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

type Status = 'todo' | 'progress' | 'done'

interface Task {
  task: string
  /**
   * Epoch milliseconds. The visible column is a formatted date, but sorting
   * reads this field — comparing the rendered strings would order "Apr 14"
   * before "Dec 03" and call it chronological.
   */
  dueAt: number
  status: Status
  owner: string
}

const rows: Task[] = [
  { task: 'Restock mango sorbet', dueAt: Date.UTC(2026, 11, 3), status: 'todo', owner: 'Mango Moon Gelato' },
  { task: 'Churn black sesame', dueAt: Date.UTC(2026, 8, 22), status: 'progress', owner: 'Kumo Creamery' },
  { task: 'Print summer menu', dueAt: Date.UTC(2027, 0, 2), status: 'todo', owner: 'Coral Coast Sorbet' },
  { task: 'Taste-test batch 42', dueAt: Date.UTC(2026, 10, 8), status: 'progress', owner: 'Maple Orbit' },
  { task: 'Order waffle cones', dueAt: Date.UTC(2026, 3, 14), status: 'done', owner: 'Aurora Scoops' },
]

const STATUS_TONE: Record<Status, string> = {
  todo: '#f09a2f',
  progress: '#16a6c7',
  done: '#25a878',
}

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      label: '任务状态筛选',
      all: '全部',
      statuses: { todo: '待办', progress: '进行中', done: '已完成' } as Record<Status, string>,
      columns: { task: '任务名称', due: '日期', status: '状态', owner: '顾问' },
      empty: '没有符合条件的任务',
    }
  }

  return {
    label: 'Task status filter',
    all: 'All',
    statuses: { todo: 'To do', progress: 'In Progress', done: 'Completed' } as Record<Status, string>,
    columns: { task: 'Task name', due: 'Date', status: 'Status', owner: 'Advisor' },
    empty: 'No matching tasks',
  }
})

const filter = ref<'all' | Status>('all')

const items = computed(() => {
  const statuses: Status[] = ['todo', 'progress', 'done']
  return [
    { value: 'all', label: copy.value.all, count: rows.length },
    ...statuses.map(status => ({
      value: status,
      label: copy.value.statuses[status],
      dot: STATUS_TONE[status],
      // Derived from the same array the table renders, so a new row cannot
      // leave the badge lying.
      count: rows.filter(row => row.status === status).length,
    })),
  ]
})

const visibleRows = computed(() =>
  filter.value === 'all' ? rows : rows.filter(row => row.status === filter.value),
)

const dateFormatter = computed(() =>
  new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  }),
)

const columns = computed(() => [
  { key: 'task', title: copy.value.columns.task, minWidth: 180, nowrap: true },
  {
    key: 'dueAt',
    title: copy.value.columns.due,
    width: 110,
    sortable: true,
    sorter: (a: Task, b: Task) => a.dueAt - b.dueAt,
    format: (value: number) => dateFormatter.value.format(value),
  },
  { key: 'status', title: copy.value.columns.status, width: 140 },
  { key: 'owner', title: copy.value.columns.owner, minWidth: 160, nowrap: true },
])
</script>

<template>
  <div class="filter-table-demo">
    <TxFilterChips v-model="filter" :items="items" :aria-label="copy.label" />
    <TxDataTable
      :columns="columns"
      :data="visibleRows"
      row-key="task"
      :empty-text="copy.empty"
      table-layout="fixed"
    >
      <template #cell-status="{ value }">
        <TxTag
          :label="copy.statuses[value as Status]"
          :color="STATUS_TONE[value as Status]"
          :dot="STATUS_TONE[value as Status]"
          variant="soft"
        />
      </template>
    </TxDataTable>
  </div>
</template>

<style scoped>
.filter-table-demo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 560px;
}
</style>
