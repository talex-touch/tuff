<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadTuffexDocsNav } from '#build/tuffex-docs-nav'
import type { ComponentTier, DocsFramework, FrameworkCompatEntry, FrameworkSupportStatus } from '~/data/tuffex-framework-matrix'
import {
  DOCS_FRAMEWORK_META,
  formatFrameworkStatusLabel,
  formatTierDescription,
  getFrameworkCoverageSummary,
  TUFFEX_FRAMEWORK_MATRIX,
} from '~/data/tuffex-framework-matrix'
import { useDocsFramework } from '~/composables/useDocsFramework'
import { resolveTuffexComponentSlug, toLocalizedTuffexPath } from '~/utils/docs-route'

type SyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'
type MatrixFilterKey = 'all' | 'react-ready' | 'wc-ready' | 'tier-A' | 'tier-B' | 'tier-C' | 'tier-D'

interface NavMetaRecord {
  title: string
  path: string
  slug?: string
  syncStatus?: SyncStatusKey
  verified?: boolean
}

interface MatrixDisplayRow {
  id: string
  title: string
  path: string
  tier: ComponentTier
  category: FrameworkCompatEntry['category']
  vue: FrameworkSupportStatus
  react: FrameworkSupportStatus
  wc: FrameworkSupportStatus
  reactExports: readonly string[]
  wcTag?: string
  wcTags?: readonly string[]
  syncStatus: SyncStatusKey | null
  searchBlob: string
}

const { locale, t } = useI18n()
const { framework, setFramework } = useDocsFramework()

const localeKey = computed<'zh' | 'en'>(() => (locale.value === 'zh' ? 'zh' : 'en'))
const activeFilter = ref<MatrixFilterKey>('all')
const searchQuery = ref('')

// Hydration fix (7b88b75af): gate localized title overrides from static nav behind
// post-mount hydration so SSR and initial client VDOM always agree identically,
// while reusing the locale's static `#build/tuffex-docs-nav` chunk (ZERO extra fetch!).
const hydrated = ref(false)
const navItems = ref<NavMetaRecord[]>([])

onMounted(async () => {
  hydrated.value = true
  try {
    const nav = await loadTuffexDocsNav(localeKey.value)
    navItems.value = Array.isArray(nav?.items) ? (nav.items as NavMetaRecord[]) : []
  }
  catch {
    navItems.value = []
  }
})

const coverage = computed(() => getFrameworkCoverageSummary())

const summaryCards = computed(() => {
  const sum = coverage.value
  return [
    {
      id: 'vue' as DocsFramework,
      label: DOCS_FRAMEWORK_META.vue.label,
      icon: DOCS_FRAMEWORK_META.vue.icon,
      ready: sum.vue.ready,
      total: sum.total,
      percent: sum.vue.percent,
      filterKey: 'all' as MatrixFilterKey,
    },
    {
      id: 'react' as DocsFramework,
      label: DOCS_FRAMEWORK_META.react.label,
      icon: DOCS_FRAMEWORK_META.react.icon,
      ready: sum.react.ready,
      total: sum.total,
      percent: sum.react.percent,
      filterKey: 'react-ready' as MatrixFilterKey,
    },
    {
      id: 'wc' as DocsFramework,
      label: DOCS_FRAMEWORK_META.wc.label,
      icon: DOCS_FRAMEWORK_META.wc.icon,
      ready: sum.wc.ready,
      total: sum.total,
      percent: sum.wc.percent,
      filterKey: 'wc-ready' as MatrixFilterKey,
    },
  ]
})

const filterOptions = computed<Array<{ key: MatrixFilterKey, label: string, count: number }>>(() => {
  const sum = coverage.value
  return [
    { key: 'all', label: t('docs.framework.matrixFilterAll', localeKey.value === 'zh' ? '全部' : 'All'), count: sum.total },
    { key: 'react-ready', label: t('docs.framework.matrixFilterReactReady', localeKey.value === 'zh' ? 'React 就绪' : 'React Ready'), count: sum.react.ready },
    { key: 'wc-ready', label: t('docs.framework.matrixFilterWcReady', localeKey.value === 'zh' ? 'WC 就绪' : 'WC Ready'), count: sum.wc.ready },
    { key: 'tier-A', label: 'Tier A', count: sum.byTier.A.total },
    { key: 'tier-B', label: 'Tier B', count: sum.byTier.B.total },
    { key: 'tier-C', label: 'Tier C', count: sum.byTier.C.total },
    { key: 'tier-D', label: 'Tier D', count: sum.byTier.D.total },
  ]
})

const syncMetaBySlug = computed(() => {
  const map = new Map<string, NavMetaRecord>()
  if (!hydrated.value)
    return map
  for (const item of navItems.value) {
    const slug = item.slug || resolveTuffexComponentSlug(item.path)
    if (slug)
      map.set(slug, item)
  }
  return map
})

const allRows = computed<MatrixDisplayRow[]>(() => {
  const syncMap = syncMetaBySlug.value
  const targetLocale = localeKey.value

  return TUFFEX_FRAMEWORK_MATRIX
    .map((entry) => {
      const docRecord = syncMap.get(entry.id)
      const title = docRecord?.title || entry.name
      const path = toLocalizedTuffexPath(`/${entry.id}`, targetLocale)
      const wcLabel = entry.wcTags?.map(tag => `<${tag}>`).join(' ') ?? ''
      const reactLabel = entry.reactExports.join(' ')
      return {
        id: entry.id,
        title,
        path,
        tier: entry.tier,
        category: entry.category,
        vue: entry.vue,
        react: entry.react,
        wc: entry.wc,
        reactExports: entry.reactExports,
        wcTag: entry.wcTag,
        wcTags: entry.wcTags,
        syncStatus: docRecord?.syncStatus ?? null,
        searchBlob: `${entry.id} ${entry.name} ${title} ${entry.category} tier ${entry.tier} ${wcLabel} ${reactLabel}`.toLowerCase(),
      }
    })
    .sort((a, b) => {
      const readyDiff = Number(b.react === 'ready' || b.wc === 'ready') - Number(a.react === 'ready' || a.wc === 'ready')
      if (readyDiff !== 0)
        return readyDiff
      return a.title.localeCompare(b.title, targetLocale === 'zh' ? 'zh-CN' : 'en')
    })
})

const rows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const filter = activeFilter.value

  return allRows.value.filter((row) => {
    if (filter === 'react-ready' && row.react !== 'ready')
      return false
    if (filter === 'wc-ready' && row.wc !== 'ready')
      return false
    if (filter === 'tier-A' && row.tier !== 'A')
      return false
    if (filter === 'tier-B' && row.tier !== 'B')
      return false
    if (filter === 'tier-C' && row.tier !== 'C')
      return false
    if (filter === 'tier-D' && row.tier !== 'D')
      return false
    if (query && !row.searchBlob.includes(query))
      return false
    return true
  })
})

function statusText(status: FrameworkSupportStatus, fw: DocsFramework) {
  return formatFrameworkStatusLabel(status, localeKey.value, fw)
}

function tierHint(tier: ComponentTier) {
  return formatTierDescription(tier, localeKey.value)
}

function selectSummaryCard(id: DocsFramework, filterKey: MatrixFilterKey) {
  setFramework(id)
  activeFilter.value = activeFilter.value === filterKey ? 'all' : filterKey
}
</script>

<template>
  <div class="docs-sync-table not-prose">
    <div class="docs-sync-table__summary">
      <button
        v-for="card in summaryCards"
        :key="card.id"
        type="button"
        class="docs-sync-table__card"
        :class="{ 'is-active': framework === card.id || activeFilter === card.filterKey }"
        @click="selectSummaryCard(card.id, card.filterKey)"
      >
        <div class="docs-sync-table__card-head">
          <span class="docs-sync-table__card-icon" :class="card.icon" aria-hidden="true" />
          <span class="docs-sync-table__card-title">{{ card.label }}</span>
        </div>
        <div class="docs-sync-table__card-metric">
          <strong class="docs-sync-table__card-count">{{ card.ready }}/{{ card.total }}</strong>
          <span class="docs-sync-table__card-pct">{{ card.percent }}%</span>
        </div>
        <div class="docs-sync-table__card-bar" aria-hidden="true">
          <span class="docs-sync-table__card-fill" :style="{ width: `${card.percent}%` }" />
        </div>
      </button>
    </div>

    <div class="docs-sync-table__toolbar">
      <div class="docs-sync-table__filters" role="group" :aria-label="t('docs.framework.matrixTitle', 'Framework Compatibility Matrix')">
        <button
          v-for="opt in filterOptions"
          :key="opt.key"
          type="button"
          class="docs-sync-table__filter"
          :class="{ 'is-active': activeFilter === opt.key }"
          :aria-pressed="activeFilter === opt.key"
          @click="activeFilter = opt.key"
        >
          <span>{{ opt.label }}</span>
          <span class="docs-sync-table__filter-count">{{ opt.count }}</span>
        </button>
      </div>
      <div class="docs-sync-table__search">
        <span class="i-carbon-search docs-sync-table__search-icon" aria-hidden="true" />
        <input
          v-model="searchQuery"
          type="search"
          class="docs-sync-table__search-input"
          :placeholder="t('docs.framework.matrixSearchPlaceholder', localeKey === 'zh' ? '搜索组件或导出…' : 'Search components or exports…')"
          :aria-label="t('docs.framework.matrixSearchPlaceholder', 'Search components')"
        >
        <button
          v-if="searchQuery"
          type="button"
          class="docs-sync-table__search-clear"
          aria-label="Clear"
          @click="searchQuery = ''"
        >
          <span class="i-carbon-close" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="docs-sync-table__scroll">
      <table v-if="rows.length" class="docs-sync-table__table">
        <thead>
          <tr>
            <th>{{ t('docs.framework.matrixColumns.component', localeKey === 'zh' ? '组件' : 'Component') }}</th>
            <th>{{ t('docs.framework.matrixColumns.tier', 'Tier') }}</th>
            <th>{{ t('docs.framework.matrixColumns.vue', 'Vue') }}</th>
            <th>{{ t('docs.framework.matrixColumns.react', 'React') }}</th>
            <th>{{ t('docs.framework.matrixColumns.wc', 'WC') }}</th>
            <th>{{ t('docs.framework.matrixColumns.exports', localeKey === 'zh' ? '导出' : 'Exports') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td class="docs-sync-table__comp-cell">
              <NuxtLink :to="row.path" class="docs-sync-table__link">
                {{ row.title }}
              </NuxtLink>
              <span class="docs-sync-table__slug">{{ row.id }}</span>
            </td>
            <td>
              <span class="docs-sync-table__tier" :data-tier="row.tier" :title="tierHint(row.tier)">
                {{ row.tier }}
              </span>
            </td>
            <td>
              <span class="docs-sync-table__pill" :data-status="row.vue">
                {{ statusText(row.vue, 'vue') }}
              </span>
            </td>
            <td>
              <span class="docs-sync-table__pill" :data-status="row.react">
                {{ statusText(row.react, 'react') }}
              </span>
            </td>
            <td>
              <span class="docs-sync-table__pill" :data-status="row.wc">
                {{ statusText(row.wc, 'wc') }}
              </span>
            </td>
            <td class="docs-sync-table__exports">
              <code v-if="row.wcTag" class="docs-sync-table__code">&lt;{{ row.wcTag }}&gt;</code>
              <code v-if="row.reactExports[0]" class="docs-sync-table__code">{{ row.reactExports[0] }}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="docs-sync-table__empty">
        {{ t('docs.framework.matrixEmpty', localeKey === 'zh' ? '没有匹配的组件' : 'No matching components') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-sync-table {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--docs-ink);
  font-size: 13px;
  content-visibility: auto;
  contain-intrinsic-size: auto 640px;
}

.docs-sync-table__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 640px) {
  .docs-sync-table__summary {
    grid-template-columns: 1fr;
  }
}

.docs-sync-table__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 0;
  border-radius: 12px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.docs-sync-table__card:hover {
  box-shadow: inset 0 0 0 1px var(--docs-border);
}

.docs-sync-table__card.is-active {
  box-shadow: inset 0 0 0 1.5px var(--docs-accent);
}

.docs-sync-table__card-head {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
}

.docs-sync-table__card-icon {
  font-size: 15px;
}

.docs-sync-table__card-metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-variant-numeric: tabular-nums;
}

.docs-sync-table__card-count {
  font-size: 18px;
  font-weight: 600;
}

.docs-sync-table__card-pct {
  font-size: 12px;
  color: var(--docs-muted);
}

.docs-sync-table__card-bar {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--docs-ink) 10%, transparent);
  overflow: hidden;
}

.docs-sync-table__card-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--docs-accent);
}

.docs-sync-table__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.docs-sync-table__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.docs-sync-table__filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink-regular);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.docs-sync-table__filter.is-active {
  background: color-mix(in srgb, var(--docs-accent) 14%, var(--docs-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--docs-accent) 40%, transparent);
  color: var(--docs-ink);
  font-weight: 600;
}

.docs-sync-table__filter-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.72;
}

.docs-sync-table__search {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 220px;
  flex: 1 1 220px;
  max-width: 320px;
}

.docs-sync-table__search-icon {
  position: absolute;
  left: 10px;
  font-size: 14px;
  color: var(--docs-muted);
  pointer-events: none;
}

.docs-sync-table__search-input {
  width: 100%;
  height: 32px;
  padding: 0 30px 0 32px;
  border: 0;
  border-radius: 10px;
  background: var(--docs-surface);
  box-shadow: inset 0 0 0 1px var(--docs-border);
  color: var(--docs-ink);
  font: inherit;
  font-size: 13px;
}

.docs-sync-table__search-input:focus {
  outline: none;
  box-shadow: inset 0 0 0 1.5px var(--docs-accent);
}

.docs-sync-table__search-clear {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--docs-muted);
  cursor: pointer;
}

.docs-sync-table__scroll {
  overflow-x: auto;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  background: var(--docs-surface);
}

.docs-sync-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.docs-sync-table__table th,
.docs-sync-table__table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--docs-border-light);
  text-align: left;
  vertical-align: middle;
}

.docs-sync-table__table tbody tr:last-child td {
  border-bottom: 0;
}

.docs-sync-table__table th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--docs-muted);
  background: var(--docs-surface-subtle);
  white-space: nowrap;
}

.docs-sync-table__comp-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
}

.docs-sync-table__link {
  color: var(--docs-ink);
  text-decoration: none;
  font-weight: 600;
}

.docs-sync-table__link:hover {
  color: var(--docs-accent);
}

.docs-sync-table__slug {
  font-family: var(--docs-mono-font);
  font-size: 11px;
  color: var(--docs-muted);
}

.docs-sync-table__tier {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--docs-surface-subtle);
  color: var(--docs-ink-regular);
  font-size: 11px;
  font-weight: 600;
}

.docs-sync-table__pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.docs-sync-table__pill[data-status='ready'] {
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--docs-ink));
}

.docs-sync-table__pill[data-status='planned'] {
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 12%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--docs-ink));
}

.docs-sync-table__pill[data-status='unsupported'] {
  background: color-mix(in srgb, var(--docs-muted) 12%, transparent);
  color: var(--docs-ink-regular);
}

.docs-sync-table__exports {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 150px;
}

.docs-sync-table__code {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--docs-surface-subtle);
  color: var(--docs-ink-regular);
  font-family: var(--docs-mono-font);
  font-size: 11px;
  white-space: nowrap;
}

.docs-sync-table__empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--docs-muted);
}
</style>
