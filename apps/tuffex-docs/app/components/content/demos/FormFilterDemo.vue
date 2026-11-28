<script setup lang="ts">
import type { FormValues } from '@talex-touch/tuffex/form'
import { computed, reactive, ref } from 'vue'

const { locale } = useI18n()
const expanded = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      keyword: '关键词',
      status: '状态',
      statuses: [
        { value: 'all', label: '全部' },
        { value: 'active', label: '进行中' },
        { value: 'done', label: '已完成' },
      ],
      owner: '负责人',
      owners: [
        { value: 'all', label: '全部' },
        { value: 'lin', label: '林晓' },
        { value: 'zhou', label: '周舟' },
      ],
      priority: '优先级',
      priorities: [
        { value: 'all', label: '全部' },
        { value: 'high', label: '高' },
        { value: 'normal', label: '普通' },
      ],
      updated: '更新于',
      periods: [
        { value: 'all', label: '不限' },
        { value: '7', label: '近 7 天' },
        { value: '30', label: '近 30 天' },
      ],
      search: '查询',
      clear: '重置',
      more: (count: number) => count ? `更多筛选（${count}）` : '更多筛选',
      less: '收起',
      results: (count: number) => `${count} 个项目`,
    }
  }

  return {
    keyword: 'Keyword',
    status: 'Status',
    statuses: [
      { value: 'all', label: 'All' },
      { value: 'active', label: 'Active' },
      { value: 'done', label: 'Done' },
    ],
    owner: 'Owner',
    owners: [
      { value: 'all', label: 'All' },
      { value: 'lin', label: 'Lin Xiao' },
      { value: 'zhou', label: 'Zhou Zhou' },
    ],
    priority: 'Priority',
    priorities: [
      { value: 'all', label: 'All' },
      { value: 'high', label: 'High' },
      { value: 'normal', label: 'Normal' },
    ],
    updated: 'Updated',
    periods: [
      { value: 'all', label: 'Any time' },
      { value: '7', label: 'Last 7 days' },
      { value: '30', label: 'Last 30 days' },
    ],
    search: 'Search',
    clear: 'Reset',
    more: (count: number) => count ? `More filters (${count})` : 'More filters',
    less: 'Fewer filters',
    results: (count: number) => count === 1 ? '1 project' : `${count} projects`,
  }
})

const projects = [
  { name: 'CoreBox', status: 'active', owner: 'lin', priority: 'high', days: 2 },
  { name: 'Nexus', status: 'active', owner: 'zhou', priority: 'normal', days: 12 },
  { name: 'TuffEx', status: 'done', owner: 'lin', priority: 'normal', days: 5 },
  { name: 'Clipboard', status: 'done', owner: 'zhou', priority: 'high', days: 40 },
  { name: 'Intelligence', status: 'active', owner: 'lin', priority: 'normal', days: 26 },
]

function defaults() {
  return reactive({ keyword: '', status: 'all', owner: 'all', priority: 'all', updated: 'all' })
}

const filters = ref(defaults())
// What the list shows, and what the address would hold: the last search, not every keystroke.
const applied = ref<FormValues>({ ...filters.value })

// The fields behind "More filters" still filter while folded; the button says how many do.
const hiddenActive = computed(() => (['priority', 'updated'] as const).filter(key => filters.value[key] !== 'all').length)

const query = computed(() => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(applied.value)) {
    if (value && value !== 'all')
      params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `?${search}` : ''
})

const results = computed(() => {
  const { keyword, status, owner, priority, updated } = applied.value
  return projects.filter(project =>
    project.name.toLowerCase().includes(String(keyword).trim().toLowerCase())
    && (status === 'all' || project.status === status)
    && (owner === 'all' || project.owner === owner)
    && (priority === 'all' || project.priority === priority)
    && (updated === 'all' || project.days <= Number(updated)),
  )
})

function apply(values: FormValues) {
  applied.value = values
}

// Back to no filter at all, rather than to the last search the form would reset to.
function clear() {
  filters.value = defaults()
  apply({ ...filters.value })
}
</script>

<template>
  <div class="form-filter-demo not-prose">
    <TxForm :model="filters" layout="inline" :leave-confirm="false" @submit="apply">
      <TxFormItem :label="labels.keyword" prop="keyword" width="sm">
        <TuffInput v-model="filters.keyword" enterkeyhint="search" autocomplete="off" />
      </TxFormItem>
      <TxFormItem :label="labels.status" prop="status" width="sm">
        <TxSelect v-model="filters.status" :options="labels.statuses" />
      </TxFormItem>
      <TxFormItem :label="labels.owner" prop="owner" width="sm">
        <TxSelect v-model="filters.owner" :options="labels.owners" />
      </TxFormItem>
      <TxFormItem v-show="expanded" :label="labels.priority" prop="priority" width="sm">
        <TxSelect v-model="filters.priority" :options="labels.priorities" />
      </TxFormItem>
      <TxFormItem v-show="expanded" :label="labels.updated" prop="updated" width="sm">
        <TxSelect v-model="filters.updated" :options="labels.periods" />
      </TxFormItem>
      <div class="form-filter-demo__actions">
        <TxButton variant="primary" native-type="submit">
          {{ labels.search }}
        </TxButton>
        <TxButton @click="clear">
          {{ labels.clear }}
        </TxButton>
        <TxButton variant="ghost" :aria-expanded="expanded" @click="expanded = !expanded">
          {{ expanded ? labels.less : labels.more(hiddenActive) }}
        </TxButton>
      </div>
    </TxForm>
    <code class="form-filter-demo__url">/projects{{ query }}</code>
    <div class="form-filter-demo__results">
      <span class="form-filter-demo__count">{{ labels.results(results.length) }}</span>
      <ul>
        <li v-for="project in results" :key="project.name">
          {{ project.name }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.form-filter-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.form-filter-demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.form-filter-demo__url {
  align-self: flex-start;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-light, #f5f7fa);
  border-radius: 6px;
}

.form-filter-demo__results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-filter-demo__count {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.form-filter-demo__results ul {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.form-filter-demo__results li {
  padding: 2px 10px;
  font-size: 13px;
  color: var(--tx-text-color-primary, #303133);
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 999px;
}
</style>
