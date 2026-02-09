<script setup lang="ts">
import { computed } from 'vue'

type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

const { locale } = useI18n()

const { data: componentDocs, pending, error } = await useAsyncData(
  'docs-components-sync',
  () => queryCollection('docs')
    .where('path', 'LIKE', '/docs/dev/components/%')
    .all(),
)

const STATUS_LABELS: Record<string, Record<SyncStatusKey, string>> = {
  zh: {
    not_started: '未迁移',
    in_progress: '迁移中',
    migrated: '已迁移',
    verified: '已确认',
  },
  en: {
    not_started: 'Not migrated',
    in_progress: 'In progress',
    migrated: 'Migrated',
    verified: 'Verified',
  },
}

const STATUS_ALIASES: Record<string, SyncStatusKey> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

const localeKey = computed(() => (locale.value === 'zh' ? 'zh' : 'en'))

function resolveDocLocale(path?: string | null) {
  if (!path)
    return 'en'
  if (path.endsWith('.zh'))
    return 'zh'
  if (path.endsWith('.en'))
    return 'en'
  return 'en'
}

function normalizeStatus(raw: unknown, verified: boolean): SyncStatusKey {
  if (verified)
    return 'verified'
  const value = typeof raw === 'string' ? raw.trim() : ''
  return STATUS_ALIASES[value] ?? 'not_started'
}

const rows = computed(() => {
  const items = (componentDocs.value ?? []) as any[]
  const targetLocale = localeKey.value
  return items
    .filter(item => typeof item?.path === 'string')
    .filter(item => item.path.includes('/docs/dev/components/'))
    .filter(item => !item.path.endsWith('/index.zh') && !item.path.endsWith('/index.en'))
    .filter(item => resolveDocLocale(item.path) === targetLocale)
    .map((item) => {
      const statusKey = normalizeStatus(item?.syncStatus, item?.verified === true)
      const labelMap = (STATUS_LABELS[targetLocale] ?? STATUS_LABELS.en ?? STATUS_LABELS.zh)!
      const statusLabel = labelMap[statusKey]
      const icon = statusKey === 'verified' || statusKey === 'migrated'
        ? '✅'
        : statusKey === 'in_progress'
          ? '🟡'
          : '—'
      return {
        title: item?.title ? String(item.title) : String(item.path),
        path: String(item.path),
        statusKey,
        statusDisplay: `${icon} ${statusLabel}`,
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title, targetLocale === 'zh' ? 'zh-CN' : 'en'))
})
</script>

<template>
  <div class="docs-sync-table">
    <div v-if="pending" class="docs-sync-table__hint">
      {{ localeKey === 'zh' ? '加载中...' : 'Loading...' }}
    </div>
    <div v-else-if="error" class="docs-sync-table__hint">
      {{ localeKey === 'zh' ? '同步状态加载失败' : 'Failed to load sync status.' }}
    </div>
    <table v-else class="docs-sync-table__table">
      <thead>
        <tr>
          <th>{{ localeKey === 'zh' ? '组件' : 'Component' }}</th>
          <th>{{ localeKey === 'zh' ? '同步状态' : 'Sync Status' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.path">
          <td>
            <NuxtLink :to="row.path" class="docs-sync-table__link">
              {{ row.title }}
            </NuxtLink>
          </td>
          <td class="docs-sync-table__status" :data-status="row.statusKey">
            {{ row.statusDisplay }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.docs-sync-table__hint {
  font-size: 13px;
  color: rgba(100, 116, 139, 0.85);
}

.docs-sync-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.docs-sync-table__table th,
.docs-sync-table__table td {
  padding: 10px 8px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  text-align: left;
}

.docs-sync-table__table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(100, 116, 139, 0.9);
}

.docs-sync-table__link {
  color: rgba(15, 23, 42, 0.9);
  text-decoration: none;
  font-weight: 600;
}

.docs-sync-table__link:hover {
  color: var(--docs-accent-strong);
}

.docs-sync-table__status {
  font-weight: 600;
  color: rgba(71, 85, 105, 0.9);
}

.docs-sync-table__status[data-status='verified'] {
  color: rgba(14, 116, 144, 0.9);
}

.docs-sync-table__status[data-status='migrated'] {
  color: rgba(15, 118, 110, 0.9);
}

.docs-sync-table__status[data-status='in_progress'] {
  color: rgba(180, 83, 9, 0.9);
}

::global(.dark .docs-sync-table__table th),
::global([data-theme='dark'] .docs-sync-table__table th) {
  color: rgba(148, 163, 184, 0.85);
}

::global(.dark .docs-sync-table__table td),
::global([data-theme='dark'] .docs-sync-table__table td) {
  border-color: rgba(51, 65, 85, 0.6);
}

::global(.dark .docs-sync-table__link),
::global([data-theme='dark'] .docs-sync-table__link) {
  color: rgba(226, 232, 240, 0.92);
}

::global(.dark .docs-sync-table__status),
::global([data-theme='dark'] .docs-sync-table__status) {
  color: rgba(226, 232, 240, 0.75);
}

::global(.dark .docs-sync-table__status[data-status='verified']),
::global([data-theme='dark'] .docs-sync-table__status[data-status='verified']) {
  color: rgba(125, 211, 252, 0.92);
}

::global(.dark .docs-sync-table__status[data-status='migrated']),
::global([data-theme='dark'] .docs-sync-table__status[data-status='migrated']) {
  color: rgba(94, 234, 212, 0.92);
}

::global(.dark .docs-sync-table__status[data-status='in_progress']),
::global([data-theme='dark'] .docs-sync-table__status[data-status='in_progress']) {
  color: rgba(253, 186, 116, 0.92);
}
</style>
