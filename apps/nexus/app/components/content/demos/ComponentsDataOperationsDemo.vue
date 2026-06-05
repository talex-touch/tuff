<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { computed, ref } from 'vue'

interface OperationRow {
  id: number
  name: string
  status: 'ready' | 'running' | 'blocked'
  owner: string
  latency: number
  coverage: number
}

const { locale } = useI18n()
const page = ref(1)
const selectedKeys = ref<Array<number | string>>([1, 3])
const loading = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '数据运维面板',
      subtitle: '把表格选择、分页和骨架加载组合成一个后台数据区。',
      loading: '加载预览',
      selected: '已选',
      rows: '行',
      pageSize: '每页 4 条',
      stable: '稳定',
      syncing: '同步中',
      blocked: '阻塞',
      name: '任务',
      status: '状态',
      owner: '负责人',
      latency: '延迟',
      coverage: '覆盖率',
      skeleton: '加载骨架',
      layout: '布局骨架',
      pageInfo: '第 {current} / {total} 页',
    }
  }

  return {
    title: 'Data operations panel',
    subtitle: 'Compose table selection, pagination, and skeleton loading into one dashboard data region.',
    loading: 'Loading preview',
    selected: 'Selected',
    rows: 'rows',
    pageSize: '4 per page',
    stable: 'Stable',
    syncing: 'Syncing',
    blocked: 'Blocked',
    name: 'Task',
    status: 'Status',
    owner: 'Owner',
    latency: 'Latency',
    coverage: 'Coverage',
    skeleton: 'Loading skeleton',
    layout: 'Layout skeleton',
    pageInfo: 'Page {current} of {total}',
  }
})

const rows = computed<OperationRow[]>(() => {
  if (locale.value === 'zh') {
    return [
      { id: 1, name: '文档截图认证', status: 'ready', owner: 'Nexus', latency: 38, coverage: 96 },
      { id: 2, name: '组件 API 审阅', status: 'running', owner: 'Tuffex', latency: 64, coverage: 88 },
      { id: 3, name: '后台分页回归', status: 'ready', owner: 'Dashboard', latency: 42, coverage: 91 },
      { id: 4, name: '骨架屏占位校验', status: 'blocked', owner: 'QA', latency: 96, coverage: 72 },
      { id: 5, name: '暗色主题检查', status: 'running', owner: 'Design', latency: 58, coverage: 84 },
      { id: 6, name: '数据空态恢复', status: 'ready', owner: 'Nexus', latency: 35, coverage: 93 },
      { id: 7, name: '排序键盘交互', status: 'ready', owner: 'Tuffex', latency: 44, coverage: 89 },
      { id: 8, name: '发布质量门禁', status: 'blocked', owner: 'CI', latency: 120, coverage: 68 },
    ]
  }

  return [
    { id: 1, name: 'Verify doc screenshots', status: 'ready', owner: 'Nexus', latency: 38, coverage: 96 },
    { id: 2, name: 'Review component API', status: 'running', owner: 'Tuffex', latency: 64, coverage: 88 },
    { id: 3, name: 'Dashboard pagination QA', status: 'ready', owner: 'Dashboard', latency: 42, coverage: 91 },
    { id: 4, name: 'Skeleton placeholder check', status: 'blocked', owner: 'QA', latency: 96, coverage: 72 },
    { id: 5, name: 'Dark theme check', status: 'running', owner: 'Design', latency: 58, coverage: 84 },
    { id: 6, name: 'Data recovery path', status: 'ready', owner: 'Nexus', latency: 35, coverage: 93 },
    { id: 7, name: 'Sort keyboard workflow', status: 'ready', owner: 'Tuffex', latency: 44, coverage: 89 },
    { id: 8, name: 'Release quality gate', status: 'blocked', owner: 'CI', latency: 120, coverage: 68 },
  ]
})

const pageSize = 4
const totalPages = computed(() => Math.ceil(rows.value.length / pageSize))

const columns = computed<DataTableColumn<OperationRow>[]>(() => [
  { key: 'name', title: labels.value.name, width: 220 },
  { key: 'status', title: labels.value.status, width: 116 },
  { key: 'owner', title: labels.value.owner, width: 110 },
  { key: 'latency', title: labels.value.latency, sortable: true, width: 92, align: 'right', format: value => `${value}ms` },
  { key: 'coverage', title: labels.value.coverage, sortable: true, width: 100, align: 'right', format: value => `${value}%` },
])

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize
  return rows.value.slice(start, start + pageSize)
})

const selectedSummary = computed(() => `${labels.value.selected}: ${selectedKeys.value.length} ${labels.value.rows}`)

function statusText(status: OperationRow['status']) {
  if (status === 'ready')
    return labels.value.stable
  if (status === 'blocked')
    return labels.value.blocked
  return labels.value.syncing
}

function statusTone(status: OperationRow['status']) {
  if (status === 'ready')
    return 'success'
  if (status === 'blocked')
    return 'danger'
  return 'warning'
}
</script>

<template>
  <section class="data-ops-demo">
    <header class="data-ops-demo__header">
      <div>
        <p class="data-ops-demo__eyebrow">
          Tuffex · Data
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>
      <label class="data-ops-demo__loading">
        <span>{{ labels.loading }}</span>
        <TuffSwitch v-model="loading" size="small" />
      </label>
    </header>

    <div class="data-ops-demo__summary">
      <TxStatusBadge :text="selectedSummary" status="info" size="sm" />
      <TxTag :label="labels.pageSize" icon="i-carbon-table-split" />
      <TxStatusBadge :text="statusText(rows[0]?.status ?? 'running')" :status="statusTone(rows[0]?.status ?? 'running')" size="sm" />
    </div>

    <div class="data-ops-demo__body">
      <div class="data-ops-demo__table">
        <TxDataTable
          v-model:selected-keys="selectedKeys"
          :columns="columns"
          :data="pagedRows"
          :loading="loading"
          row-key="id"
          selectable
          striped
          bordered
        >
          <template #cell-status="{ row }">
            <TxStatusBadge :text="statusText(row.status)" :status="statusTone(row.status)" size="sm" />
          </template>
        </TxDataTable>

        <TxPagination
          v-model:current-page="page"
          :total="rows.length"
          :page-size="pageSize"
          show-info
          show-first-last
        >
          <template #info="{ currentPage, totalPages: pages }">
            {{ labels.pageInfo.replace('{current}', String(currentPage)).replace('{total}', String(pages)) }}
          </template>
        </TxPagination>
      </div>

      <aside class="data-ops-demo__skeletons">
        <div>
          <span>{{ labels.skeleton }}</span>
          <TxSkeleton :loading="true" :lines="3" height="10px" />
        </div>
        <div class="data-ops-demo__layout">
          <span>{{ labels.layout }}</span>
          <TxLayoutSkeleton />
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.data-ops-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 980px);
  padding: 18px;
  border-radius: 24px;
  border: 1px solid var(--tx-border-color-lighter);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--tx-color-primary) 16%, transparent), transparent 34%),
    var(--tx-bg-color);
}

.data-ops-demo__header,
.data-ops-demo__summary,
.data-ops-demo__body {
  display: flex;
  gap: 12px;
}

.data-ops-demo__header {
  align-items: flex-start;
  justify-content: space-between;
}

.data-ops-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.data-ops-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.data-ops-demo__header span,
.data-ops-demo__skeletons span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.data-ops-demo__loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 72%, transparent);
  white-space: nowrap;
}

.data-ops-demo__summary {
  flex-wrap: wrap;
  align-items: center;
}

.data-ops-demo__body {
  align-items: stretch;
}

.data-ops-demo__table {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 14px;
}

.data-ops-demo__skeletons {
  display: grid;
  width: 230px;
  gap: 12px;
}

.data-ops-demo__skeletons > div {
  display: grid;
  gap: 10px;
  min-height: 104px;
  padding: 12px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
}

.data-ops-demo__layout {
  height: 190px;
}

@media (max-width: 860px) {
  .data-ops-demo__header,
  .data-ops-demo__body {
    display: grid;
  }

  .data-ops-demo__skeletons {
    width: 100%;
  }
}
</style>
