<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const query = ref('')
const selectedScope = ref<string | number>('all')
const lastSearch = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '后台筛选工具栏',
      subtitle: '组合搜索输入、搜索选择器和搜索空态，覆盖列表筛选的常见路径。',
      search: '搜索插件 / 文档 / 任务',
      scope: '筛选范围',
      all: '全部',
      plugins: '插件',
      docs: '文档',
      tasks: '任务',
      last: '上次搜索',
      results: '匹配结果',
      noResults: '没有匹配结果',
      noResultsDesc: '换一个关键词或筛选范围，再重新搜索。',
      reset: '重置筛选',
      open: '打开搜索面板',
    }
  }

  return {
    title: 'Dashboard filter toolbar',
    subtitle: 'Compose search input, search select, and search empty state for common list filtering paths.',
    search: 'Search plugins / docs / tasks',
    scope: 'Filter scope',
    all: 'All',
    plugins: 'Plugins',
    docs: 'Docs',
    tasks: 'Tasks',
    last: 'Last search',
    results: 'Matches',
    noResults: 'No matches',
    noResultsDesc: 'Try another keyword or filter scope, then search again.',
    reset: 'Reset filters',
    open: 'Open search panel',
  }
})

const scopeOptions = computed(() => [
  { value: 'all', label: labels.value.all },
  { value: 'plugins', label: labels.value.plugins },
  { value: 'docs', label: labels.value.docs },
  { value: 'tasks', label: labels.value.tasks },
])

const records = computed(() => [
  { type: 'plugins', title: locale.value === 'zh' ? '插件发布流水' : 'Plugin release stream' },
  { type: 'docs', title: locale.value === 'zh' ? 'Tuffex 组件教程' : 'Tuffex component tutorial' },
  { type: 'tasks', title: locale.value === 'zh' ? '截图核验任务' : 'Screenshot verification task' },
  { type: 'docs', title: locale.value === 'zh' ? '后台趋势图封装' : 'Dashboard chart wrapper' },
])

const filteredRecords = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const scope = String(selectedScope.value)
  return records.value.filter((item) => {
    const matchesScope = scope === 'all' || item.type === scope
    const matchesQuery = !keyword || item.title.toLowerCase().includes(keyword)
    return matchesScope && matchesQuery
  })
})

function onSearch(value: string) {
  lastSearch.value = value.trim()
}

function resetFilters() {
  query.value = ''
  selectedScope.value = 'all'
  lastSearch.value = ''
}
</script>

<template>
  <section class="search-demo">
    <header class="search-demo__header">
      <div>
        <p class="search-demo__eyebrow">
          Tuffex · Search
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>
      <TxButton variant="secondary" size="sm" icon="i-carbon-reset" @click="resetFilters">
        {{ labels.reset }}
      </TxButton>
    </header>

    <div class="search-demo__toolbar">
      <TxSearchInput
        v-model="query"
        :placeholder="labels.search"
        :search-debounce="180"
        remote
        @search="onSearch"
      />
      <TxSearchSelect
        v-model="selectedScope"
        :options="scopeOptions"
        :placeholder="labels.scope"
        panel-background="glass"
      />
    </div>

    <div class="search-demo__meta">
      <TxStatusBadge :text="`${labels.results}: ${filteredRecords.length}`" :status="filteredRecords.length ? 'success' : 'warning'" size="sm" />
      <TxTag :label="`${labels.last}: ${lastSearch || '-'}`" icon="i-carbon-search" />
      <TxTag :label="`${labels.scope}: ${scopeOptions.find(item => item.value === selectedScope)?.label || labels.all}`" icon="i-carbon-filter" />
    </div>

    <div v-if="filteredRecords.length" class="search-demo__results">
      <button
        v-for="item in filteredRecords"
        :key="item.title"
        type="button"
      >
        <span>{{ item.title }}</span>
        <TxStatusBadge :text="scopeOptions.find(option => option.value === item.type)?.label || item.type" status="info" size="sm" />
      </button>
    </div>

    <TxSearchEmpty
      v-else
      :title="labels.noResults"
      :description="labels.noResultsDesc"
      surface="card"
      :primary-action="{ label: labels.reset, type: 'primary', icon: 'i-carbon-reset' }"
      :secondary-action="{ label: labels.open, icon: 'i-carbon-search' }"
      @primary="resetFilters"
    />
  </section>
</template>

<style scoped>
.search-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 820px);
  padding: 18px;
  border-radius: 24px;
  border: 1px solid var(--tx-border-color-lighter);
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--tx-color-primary) 14%, transparent), transparent 34%),
    var(--tx-bg-color);
}

.search-demo__header,
.search-demo__toolbar,
.search-demo__meta,
.search-demo__results button {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-demo__header,
.search-demo__results button {
  justify-content: space-between;
}

.search-demo__header {
  align-items: flex-start;
}

.search-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.search-demo h3 {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.search-demo__header span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.search-demo__toolbar {
  align-items: stretch;
}

.search-demo__toolbar > :first-child {
  flex: 1;
}

.search-demo__toolbar > :last-child {
  width: 220px;
}

.search-demo__meta {
  flex-wrap: wrap;
}

.search-demo__results {
  display: grid;
  gap: 8px;
}

.search-demo__results button {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 16px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
  color: var(--tx-text-color-primary);
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease;
}

.search-demo__results button:hover {
  border-color: var(--tx-border-color);
  transform: translateY(-1px);
}

@media (max-width: 760px) {
  .search-demo__header,
  .search-demo__toolbar {
    display: grid;
  }

  .search-demo__toolbar > :last-child {
    width: 100%;
  }
}
</style>
