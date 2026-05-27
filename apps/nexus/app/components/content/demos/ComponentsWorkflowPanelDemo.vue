<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

interface WorkflowRow {
  id: number
  task: string
  owner: string
  status: string
  score: number
}

const { locale } = useI18n()
const query = ref('')
const selectedKeys = ref<Array<number | string>>([1])
const automationEnabled = ref(true)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '发布工作台',
      subtitle: '组合按钮、输入、状态、进度和表格，形成一个可操作的后台切片。',
      search: '搜索任务',
      selected: '已选择',
      automation: '自动同步',
      deploy: '发布',
      review: '审阅中',
      ready: '就绪',
      failed: '阻塞',
      progress: '完成度',
      task: '任务',
      owner: '负责人',
      status: '状态',
      score: '评分',
      items: [
        { id: 1, task: '组件截图核验', owner: 'Nexus', status: 'review', score: 84 },
        { id: 2, task: 'API 表格补齐', owner: 'Tuffex', status: 'ready', score: 92 },
        { id: 3, task: '暗色模式回归', owner: 'QA', status: 'failed', score: 48 },
      ],
    }
  }

  return {
    title: 'Release workspace',
    subtitle: 'Buttons, inputs, status, progress, and tables composed into an operational slice.',
    search: 'Search tasks',
    selected: 'Selected',
    automation: 'Auto sync',
    deploy: 'Deploy',
    review: 'Reviewing',
    ready: 'Ready',
    failed: 'Blocked',
    progress: 'Progress',
    task: 'Task',
    owner: 'Owner',
    status: 'Status',
    score: 'Score',
    items: [
      { id: 1, task: 'Verify component screenshots', owner: 'Nexus', status: 'review', score: 84 },
      { id: 2, task: 'Complete API tables', owner: 'Tuffex', status: 'ready', score: 92 },
      { id: 3, task: 'Dark-mode regression', owner: 'QA', status: 'failed', score: 48 },
    ],
  }
})

const columns = computed<DataTableColumn<WorkflowRow>[]>(() => [
  { key: 'task', title: labels.value.task },
  { key: 'owner', title: labels.value.owner, width: 110 },
  {
    key: 'status',
    title: labels.value.status,
    width: 130,
    format: value => statusLabel(value),
  },
  { key: 'score', title: labels.value.score, width: 86, sortable: true },
])

const filteredRows = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword)
    return labels.value.items
  return labels.value.items.filter(item => `${item.task} ${item.owner}`.toLowerCase().includes(keyword))
})

const progress = computed(() => {
  if (!filteredRows.value.length)
    return 0
  const total = filteredRows.value.reduce((sum, item) => sum + item.score, 0)
  return Math.round(total / filteredRows.value.length)
})

function statusLabel(value: string) {
  const map: Record<string, string> = {
    ready: labels.value.ready,
    failed: labels.value.failed,
    review: labels.value.review,
  }
  return map[value] ?? value
}

function statusTone(value: string) {
  if (value === 'ready')
    return 'success'
  if (value === 'failed')
    return 'danger'
  return 'warning'
}
</script>

<template>
  <div class="workflow-demo">
    <header class="workflow-demo__header">
      <div>
        <div class="workflow-demo__eyebrow">
          Tuffex UI
        </div>
        <h3>{{ labels.title }}</h3>
        <p>{{ labels.subtitle }}</p>
      </div>
      <TxButton variant="primary" size="sm" icon="i-carbon-rocket">
        {{ labels.deploy }}
      </TxButton>
    </header>

    <div class="workflow-demo__toolbar">
      <TuffInput
        v-model="query"
        :placeholder="labels.search"
        prefix-icon="i-carbon-search"
        clearable
      />
      <label class="workflow-demo__switch">
        <span>{{ labels.automation }}</span>
        <TuffSwitch v-model="automationEnabled" />
      </label>
    </div>

    <div class="workflow-demo__metrics">
      <div>
        <span>{{ labels.progress }}</span>
        <strong>{{ progress }}%</strong>
      </div>
      <TxProgressBar
        :percentage="progress"
        :status="progress < 60 ? 'warning' : 'success'"
        show-text
        height="10px"
        flow-effect="wave"
      />
    </div>

    <div class="workflow-demo__badges">
      <TxStatusBadge
        v-for="item in filteredRows"
        :key="`badge-${item.id}`"
        :text="statusLabel(item.status)"
        :status="statusTone(item.status)"
        size="sm"
      />
      <TxTag :label="`${labels.selected}: ${selectedKeys.length}`" icon="i-carbon-checkmark-outline" />
    </div>

    <TxDataTable
      v-model:selected-keys="selectedKeys"
      :columns="columns"
      :data="filteredRows"
      row-key="id"
      selectable
      striped
      hover
    />
  </div>
</template>

<style scoped>
.workflow-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 760px);
  padding: 18px;
  border-radius: 22px;
  border: 1px solid var(--tx-border-color-lighter);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--tx-color-primary) 18%, transparent), transparent 34%),
    var(--tx-bg-color);
}

.workflow-demo__header,
.workflow-demo__toolbar,
.workflow-demo__badges {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workflow-demo__header {
  align-items: flex-start;
}

.workflow-demo__eyebrow {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--tx-color-primary);
  text-transform: uppercase;
}

.workflow-demo h3 {
  margin: 0;
  font-size: 20px;
  color: var(--tx-text-color-primary);
}

.workflow-demo p {
  max-width: 520px;
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.workflow-demo__toolbar {
  align-items: stretch;
}

.workflow-demo__switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 14px;
  background: var(--tx-fill-color-light);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.workflow-demo__metrics {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
}

.workflow-demo__metrics > div {
  display: flex;
  justify-content: space-between;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.workflow-demo__metrics strong {
  color: var(--tx-text-color-primary);
}

.workflow-demo__badges {
  justify-content: flex-start;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .workflow-demo,
  .workflow-demo__header,
  .workflow-demo__toolbar {
    display: grid;
  }

  .workflow-demo__switch {
    min-height: 34px;
    justify-content: space-between;
  }
}
</style>
