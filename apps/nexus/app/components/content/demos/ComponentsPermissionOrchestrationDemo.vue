<script setup lang="ts">
import type { TimelineItemColor, TreeNode } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

interface TimelineStep {
  time: string
  title: string
  description: string
  color: TimelineItemColor
}

const { locale } = useI18n()
const query = ref('')
const selectedScope = ref<string | number>('release')
const ownerTeam = ref<string | number | undefined>('docs')
const assignedKeys = ref<Array<string | number>>(['read-docs', 'publish-notes'])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '权限编排面板',
      subtitle: '用树形范围、树选择器、穿梭框和时间线串起后台授权流程。',
      eyebrow: 'Tuffex · Data Flow',
      search: '过滤权限域',
      selected: '当前范围',
      owner: '归属团队',
      source: '可分配资源',
      target: '已授权',
      filter: '筛选资源',
      empty: '暂无资源',
      add: '添加选中资源',
      remove: '移除选中资源',
      ready: '授权待发布',
      selectedCount: '已授权 {count} 项',
      scopeRelease: '发布控制',
      timeline: [
        { time: '09:30', title: '选择权限域', description: 'release', color: 'primary' },
        { time: '10:20', title: '分配资源', description: 'docs + notes', color: 'success' },
        { time: '11:05', title: '等待复核', description: 'security review', color: 'warning' },
      ] satisfies TimelineStep[],
    }
  }

  return {
    title: 'Permission orchestration panel',
    subtitle: 'Connect tree scopes, tree select, transfer, and timeline into one admin authorization flow.',
    eyebrow: 'Tuffex · Data Flow',
    search: 'Filter scopes',
    selected: 'Selected scope',
    owner: 'Owner team',
    source: 'Assignable resources',
    target: 'Granted',
    filter: 'Filter resources',
    empty: 'No resources',
    add: 'Add selected resources',
    remove: 'Remove selected resources',
    ready: 'Grant pending release',
    selectedCount: '{count} granted',
    scopeRelease: 'Release control',
    timeline: [
      { time: '09:30', title: 'Pick scope', description: 'release', color: 'primary' },
      { time: '10:20', title: 'Assign resources', description: 'docs + notes', color: 'success' },
      { time: '11:05', title: 'Await review', description: 'security review', color: 'warning' },
    ] satisfies TimelineStep[],
  }
})

const scopeNodes = computed(() => {
  if (locale.value === 'zh') {
    return [
      {
        key: 'workspace',
        label: '工作区',
        icon: 'i-carbon-workspace',
        children: [
          { key: 'release', label: '发布控制', icon: 'i-carbon-rocket' },
          { key: 'audit', label: '审计日志', icon: 'i-carbon-report' },
        ],
      },
      {
        key: 'platform',
        label: '平台',
        icon: 'i-carbon-cloud-service-management',
        children: [
          { key: 'billing', label: '订阅计费', icon: 'i-carbon-wallet' },
          { key: 'security', label: '安全策略', icon: 'i-carbon-security' },
        ],
      },
    ]
  }

  return [
    {
      key: 'workspace',
      label: 'Workspace',
      icon: 'i-carbon-workspace',
      children: [
        { key: 'release', label: 'Release control', icon: 'i-carbon-rocket' },
        { key: 'audit', label: 'Audit logs', icon: 'i-carbon-report' },
      ],
    },
    {
      key: 'platform',
      label: 'Platform',
      icon: 'i-carbon-cloud-service-management',
      children: [
        { key: 'billing', label: 'Billing', icon: 'i-carbon-wallet' },
        { key: 'security', label: 'Security policy', icon: 'i-carbon-security' },
      ],
    },
  ]
})

const teamNodes = computed(() => {
  if (locale.value === 'zh') {
    return [
      {
        key: 'ops',
        label: '运营组',
        children: [
          { key: 'docs', label: '文档维护' },
          { key: 'release', label: '发布管理' },
        ],
      },
      {
        key: 'risk',
        label: '风控组',
        children: [
          { key: 'security', label: '安全复核' },
          { key: 'finance', label: '账务复核' },
        ],
      },
    ]
  }

  return [
    {
      key: 'ops',
      label: 'Operations',
      children: [
        { key: 'docs', label: 'Docs maintainers' },
        { key: 'release', label: 'Release managers' },
      ],
    },
    {
      key: 'risk',
      label: 'Risk control',
      children: [
        { key: 'security', label: 'Security review' },
        { key: 'finance', label: 'Finance review' },
      ],
    },
  ]
})

const transferItems = computed(() => {
  if (locale.value === 'zh') {
    return [
      { key: 'read-docs', label: '读取文档' },
      { key: 'publish-notes', label: '发布日志' },
      { key: 'manage-assets', label: '管理资源' },
      { key: 'rotate-keys', label: '轮换密钥', disabled: true },
      { key: 'view-billing', label: '查看账单' },
    ]
  }

  return [
    { key: 'read-docs', label: 'Read docs' },
    { key: 'publish-notes', label: 'Publish notes' },
    { key: 'manage-assets', label: 'Manage assets' },
    { key: 'rotate-keys', label: 'Rotate keys', disabled: true },
    { key: 'view-billing', label: 'View billing' },
  ]
})

const selectedScopeLabel = computed(() => {
  const queue: TreeNode[] = [...scopeNodes.value]
  while (queue.length) {
    const current = queue.shift()
    if (!current)
      continue
    if (current.key === selectedScope.value)
      return current.label
    if (current.children?.length)
      queue.push(...current.children)
  }
  return labels.value.scopeRelease
})

const selectedCountText = computed(() => labels.value.selectedCount.replace('{count}', String(assignedKeys.value.length)))
</script>

<template>
  <section class="permission-demo">
    <header class="permission-demo__header">
      <div>
        <p class="permission-demo__eyebrow">
          {{ labels.eyebrow }}
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>
      <TxStatusBadge :text="labels.ready" status="warning" size="sm" />
    </header>

    <div class="permission-demo__summary">
      <TxTag :label="`${labels.selected}: ${selectedScopeLabel}`" icon="i-carbon-tree-view-alt" />
      <TxStatusBadge :text="selectedCountText" status="success" size="sm" />
    </div>

    <div class="permission-demo__grid">
      <section class="permission-demo__panel permission-demo__panel--scopes">
        <TxSearchInput v-model="query" :placeholder="labels.search" />
        <TxTree
          v-model="selectedScope"
          :nodes="scopeNodes"
          :default-expanded-keys="['workspace', 'platform']"
          :filter-text="query"
        />
      </section>

      <section class="permission-demo__panel permission-demo__panel--main">
        <label>
          <span>{{ labels.owner }}</span>
          <TxTreeSelect
            v-model="ownerTeam"
            :nodes="teamNodes"
            :placeholder="labels.owner"
            :default-expanded-keys="['ops']"
            :dropdown-max-height="220"
          />
        </label>

        <TxTransfer
          v-model="assignedKeys"
          :data="transferItems"
          :titles="[labels.source, labels.target]"
          filterable
          :filter-placeholder="labels.filter"
          :empty-text="labels.empty"
          :add-aria-label="labels.add"
          :remove-aria-label="labels.remove"
        />
      </section>

      <aside class="permission-demo__panel permission-demo__panel--timeline">
        <TxTimeline>
          <TxTimelineItem
            v-for="(item, index) in labels.timeline"
            :key="item.time"
            :time="item.time"
            :title="item.title"
            :color="item.color"
            :active="index === 1"
          >
            {{ item.description }}
          </TxTimelineItem>
        </TxTimeline>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.permission-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 1080px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 18%, var(--tx-border-color-lighter));
  border-radius: 24px;
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--tx-color-primary) 14%, transparent), transparent 32%),
    radial-gradient(circle at 94% 10%, color-mix(in srgb, var(--tx-color-success) 14%, transparent), transparent 34%),
    color-mix(in srgb, var(--tx-bg-color) 88%, transparent);
  box-shadow: 0 18px 48px rgb(15 23 42 / 0.08);
}

.permission-demo__header,
.permission-demo__summary,
.permission-demo__grid {
  display: flex;
  gap: 12px;
}

.permission-demo__header {
  align-items: flex-start;
  justify-content: space-between;
}

.permission-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.permission-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.permission-demo__header span,
.permission-demo__panel label > span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.permission-demo__summary {
  flex-wrap: wrap;
}

.permission-demo__grid {
  align-items: stretch;
}

.permission-demo__panel {
  min-width: 0;
  padding: 14px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 76%, transparent);
}

.permission-demo__panel--scopes {
  display: grid;
  align-content: flex-start;
  gap: 12px;
  width: 220px;
}

.permission-demo__panel--main {
  display: grid;
  flex: 1;
  gap: 14px;
}

.permission-demo__panel--main label {
  display: grid;
  gap: 6px;
}

.permission-demo__panel--timeline {
  width: 220px;
  background: color-mix(in srgb, var(--tx-bg-color) 72%, transparent);
}

@media (max-width: 960px) {
  .permission-demo__grid,
  .permission-demo__header {
    display: grid;
  }

  .permission-demo__panel--scopes,
  .permission-demo__panel--timeline {
    width: auto;
  }
}
</style>
