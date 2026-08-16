<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const ICONS: Record<string, string> = {
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  dashboard: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  spaces: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  analytics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
}

const active = ref('tasks')
const query = ref('')
const badge = ref(4)
const lastEvent = ref<string | null>(null)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      groups: [
        { key: 'workspace', label: '工作区' },
        { key: 'objects', label: '对象' },
      ],
      labels: {
        activity: '主页',
        tasks: '智能体任务',
        dashboard: '收件箱',
        spaces: '供应商',
        analytics: '库存',
      },
      workspace: { name: '冰品运营', description: '生产工作区' },
      search: '快速搜索',
      action: '新建任务',
      addSupplier: '新增供应商',
      hint: '按下 `/` 聚焦搜索框；输入即时过滤，分组标题会随之收起。上游这两处都是纯装饰。',
      idle: '选择一项，或按 `/` 试试。',
    }
  }

  return {
    groups: [
      { key: 'workspace', label: 'Workspace' },
      { key: 'objects', label: 'Objects' },
    ],
    labels: {
      activity: 'Home',
      tasks: 'Agent tasks',
      dashboard: 'Inbox',
      spaces: 'Suppliers',
      analytics: 'Inventory',
    },
    workspace: { name: 'Creamery Ops', description: 'Production Workspace' },
    search: 'Quick search',
    action: 'New task',
    addSupplier: 'Add supplier',
    hint: 'Press `/` to focus the field; typing filters live and empty groups drop their header. Both are inert upstream.',
    idle: 'Pick a destination, or press `/`.',
  }
})

const items = computed(() => [
  { value: 'activity', label: copy.value.labels.activity, group: 'workspace' },
  { value: 'tasks', label: copy.value.labels.tasks, group: 'workspace', badge: badge.value },
  { value: 'dashboard', label: copy.value.labels.dashboard, group: 'workspace' },
  { value: 'spaces', label: copy.value.labels.spaces, group: 'objects', action: { label: copy.value.addSupplier } },
  { value: 'analytics', label: copy.value.labels.analytics, group: 'objects' },
])

function onSelect(item: { label: string }) {
  lastEvent.value = item.label
}

function onAction() {
  // Mirrors the upstream demo: the badge bumps, which replays its pop-in.
  badge.value += 1
  active.value = 'tasks'
  lastEvent.value = copy.value.action
}

function onItemAction(item: { label: string }) {
  lastEvent.value = `${copy.value.addSupplier} · ${item.label}`
}
</script>

<template>
  <div class="flex flex-wrap items-start gap-4">
    <TxSidebarNav
      v-model="active"
      v-model:query="query"
      :items="items"
      :groups="copy.groups"
      :workspace="copy.workspace"
      :search-placeholder="copy.search"
      search-hint="/"
      :action-label="copy.action"
      @select="onSelect"
      @action="onAction"
      @item-action="onItemAction"
      @workspace-click="lastEvent = copy.workspace.name"
    >
      <template #item-icon="{ item }">
        <svg
          v-if="ICONS[String(item.value)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path :d="ICONS[String(item.value)]" />
        </svg>
      </template>
    </TxSidebarNav>

    <div class="flex min-w-48 flex-col gap-2 text-xs text-[var(--tx-text-color-secondary)]">
      <p>{{ copy.hint }}</p>
      <p>
        <template v-if="lastEvent">
          <code>{{ lastEvent }}</code>
        </template>
        <template v-else>
          {{ copy.idle }}
        </template>
      </p>
      <p v-if="query">
        query: <code>{{ query }}</code>
      </p>
    </div>
  </div>
</template>
