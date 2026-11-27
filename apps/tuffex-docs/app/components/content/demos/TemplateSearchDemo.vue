<script setup lang="ts">
// Search results template: one search field, type and date filters, a paged
// result list that highlights the keywords, and an empty state that clears
// every filter at once.
//
// The search field debounces its own `search` event (`search-debounce`), so
// the host keeps no timer and has nothing to release on unmount. Enter searches
// at once, and clearing the field restores every result.
//
// Shortcuts are bound on this template's root, never on window or document:
// app.vue owns ⌘K and / for the site. A press the root claims is prevented, and
// the site's own handler skips a press that is already claimed.
//
// The sample set is Tuff documentation, dated against a fixed day so the date
// filter reads the same on every visit.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Kind = 'doc' | 'plugin' | 'changelog'

interface Bi { zh: string, en: string }

interface Hit {
  id: string
  kind: Kind
  title: Bi
  summary: Bi
  source: Bi
  /** YYYY-MM-DD, read as UTC. */
  updatedAt: string
}

interface Segment { text: string, hit: boolean }

const HITS: Hit[] = [
  {
    id: 'corebox',
    kind: 'doc',
    title: { zh: 'CoreBox 快捷入口', en: 'CoreBox entry point' },
    summary: {
      zh: '按 ⌥Space 唤起搜索框，输入关键词后按类型列出插件结果。',
      en: 'Press ⌥Space to open the search box, then list plugin results by type.',
    },
    source: { zh: '快速开始 · 概览', en: 'Quickstart · Overview' },
    updatedAt: '2026-09-18',
  },
  {
    id: 'manifest',
    kind: 'doc',
    title: { zh: '清单文件 manifest.json', en: 'The manifest.json file' },
    summary: {
      zh: '声明插件的功能、命令与权限，是插件被发现的入口。',
      en: 'Declares the features, commands, and permissions of a plugin. It is how a plugin is found.',
    },
    source: { zh: '插件开发 · 基础', en: 'Plugin development · Basics' },
    updatedAt: '2026-09-12',
  },
  {
    id: 'changelog-091',
    kind: 'changelog',
    title: { zh: '0.9.1 更新日志', en: '0.9.1 changelog' },
    summary: {
      zh: '汇总本版本的功能、修复与迁移说明，升级前请先阅读。',
      en: 'Summarizes this release, its fixes, and its migration notes. Read it before upgrading.',
    },
    source: { zh: '发布 · 更新日志', en: 'Release · Changelog' },
    updatedAt: '2026-09-10',
  },
  {
    id: 'ocr',
    kind: 'doc',
    title: { zh: 'OCR 文字识别', en: 'OCR text recognition' },
    summary: {
      zh: '截图后优先调用系统 OCR，系统能力不可用时回退到 AI 服务商。',
      en: 'After a capture, system OCR runs first and an AI provider takes over when it is unavailable.',
    },
    source: { zh: '能力 · 识别', en: 'Capabilities · Recognition' },
    updatedAt: '2026-09-02',
  },
  {
    id: 'prelude',
    kind: 'doc',
    title: { zh: '先导脚本与展面', en: 'Prelude and surface' },
    summary: {
      zh: '先导脚本注册能力并处理回调，展面按需用 WebContents 渲染界面。',
      en: 'The prelude registers capabilities and handles callbacks. The surface renders UI on demand.',
    },
    source: { zh: '插件开发 · 架构', en: 'Plugin development · Architecture' },
    updatedAt: '2026-08-30',
  },
  {
    id: 'window-presets',
    kind: 'plugin',
    title: { zh: '窗口预设', en: 'Window presets' },
    summary: {
      zh: '保存常用的窗口布局，需要时一键恢复到工作状态。',
      en: 'Save common window layouts and restore a work setup in one step.',
    },
    source: { zh: '官方插件 · touch-window-presets', en: 'Official plugin · touch-window-presets' },
    updatedAt: '2026-08-21',
  },
  {
    id: 'quick-actions',
    kind: 'plugin',
    title: { zh: '快捷操作', en: 'Quick actions' },
    summary: {
      zh: '为常用命令设置关键词，在 CoreBox 中直接执行。',
      en: 'Give frequent commands keywords and run them straight from CoreBox.',
    },
    source: { zh: '官方插件 · touch-quick-actions', en: 'Official plugin · touch-quick-actions' },
    updatedAt: '2026-07-29',
  },
  {
    id: 'storage-quota',
    kind: 'doc',
    title: { zh: '插件文件存储配额', en: 'Plugin file storage quota' },
    summary: {
      zh: '每个插件的文件存储上限为 100 MB，单个文件与文件数量另有限制。',
      en: 'Each plugin gets 100 MB of file storage, with separate limits on file size and count.',
    },
    source: { zh: 'API · 存储', en: 'API · Storage' },
    updatedAt: '2026-07-14',
  },
  {
    id: 'changelog-090',
    kind: 'changelog',
    title: { zh: '0.9.0 更新日志', en: '0.9.0 changelog' },
    summary: {
      zh: '汇总 0.9.0 的功能与修复，包含插件接口的调整记录。',
      en: 'Summarizes 0.9.0 features and fixes, including plugin API adjustments.',
    },
    source: { zh: '发布 · 更新日志', en: 'Release · Changelog' },
    updatedAt: '2026-07-02',
  },
  {
    id: 'browser-links',
    kind: 'plugin',
    title: { zh: '网址快捷访问', en: 'Quick links' },
    summary: {
      zh: '手动固定常用网址并保留最近访问，不读取浏览器书签。',
      en: 'Pin frequent URLs and keep a recent list. Browser bookmarks are not read.',
    },
    source: { zh: '官方插件 · touch-browser-bookmarks', en: 'Official plugin · touch-browser-bookmarks' },
    updatedAt: '2026-06-18',
  },
  {
    id: 'clipboard-input',
    kind: 'doc',
    title: { zh: '剪贴板输入类型', en: 'Clipboard input types' },
    summary: {
      zh: '功能用 acceptedInputTypes 声明可接收的文本、图片、文件或 HTML。',
      en: 'A feature declares text, image, files, or HTML input with acceptedInputTypes.',
    },
    source: { zh: 'API · 剪贴板', en: 'API · Clipboard' },
    updatedAt: '2026-06-03',
  },
  {
    id: 'workspace-scripts',
    kind: 'plugin',
    title: { zh: '工作区脚本', en: 'Workspace scripts' },
    summary: {
      zh: '把一组命令存为工作区脚本，在终端面板中依次运行。',
      en: 'Save a set of commands as a workspace script and run them in order.',
    },
    source: { zh: '官方插件 · touch-workspace-scripts', en: 'Official plugin · touch-workspace-scripts' },
    updatedAt: '2026-05-27',
  },
  {
    id: 'permission',
    kind: 'doc',
    title: { zh: '权限与授权', en: 'Permissions and grants' },
    summary: {
      zh: '敏感能力需要先申请权限，授权与撤销都有明确的状态。',
      en: 'Sensitive capabilities need a permission first, and grants and revocations have clear states.',
    },
    source: { zh: 'API · 权限', en: 'API · Permission' },
    updatedAt: '2026-05-12',
  },
  {
    id: 'changelog-084',
    kind: 'changelog',
    title: { zh: '0.8.4 更新日志', en: '0.8.4 changelog' },
    summary: {
      zh: '汇总 0.8.4 的功能与修复，并列出已知问题。',
      en: 'Summarizes 0.8.4 features and fixes, and lists known issues.',
    },
    source: { zh: '发布 · 更新日志', en: 'Release · Changelog' },
    updatedAt: '2026-04-16',
  },
  {
    id: 'changelog-060',
    kind: 'changelog',
    title: { zh: '0.6.0 更新日志', en: '0.6.0 changelog' },
    summary: {
      zh: '早期版本的功能概览，部分接口后来已有调整。',
      en: 'An overview of an early release. Some APIs have changed since.',
    },
    source: { zh: '发布 · 更新日志', en: 'Release · Changelog' },
    updatedAt: '2025-08-11',
  },
]

// A fixed sample day, so "last 30 days" reads the same on every visit.
const TODAY = Date.UTC(2026, 8, 23)
const DAY = 86_400_000
const PAGE_SIZE = 3

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const lang = computed<'zh' | 'en'>(() => (zh.value ? 'zh' : 'en'))

const copy = computed(() => zh.value
  ? {
      title: '搜索结果',
      placeholder: '搜索文档、插件与更新日志',
      searchLabel: '搜索 Tuff 文档与更新日志',
      kindLabel: '按类型筛选',
      rangeLabel: '按时间筛选',
      kinds: { all: '全部', doc: '文档', plugin: '插件', changelog: '更新日志' },
      ranges: { any: '不限时间', '30d': '近 30 天', year: '近一年' },
      listLabel: '搜索结果列表',
      count: (n: number) => `共 ${n} 条结果`,
      empty: { title: '没有找到匹配的结果', description: '换个关键词，或清除全部筛选后再试。', clear: '清除筛选' },
      pagination: { aria: '结果分页', prev: '上一页', next: '下一页' },
      hint: '聚焦搜索',
    }
  : {
      title: 'Search results',
      placeholder: 'Search docs, plugins, and changelogs',
      searchLabel: 'Search Tuff docs and changelogs',
      kindLabel: 'Filter by type',
      rangeLabel: 'Filter by date',
      kinds: { all: 'All', doc: 'Docs', plugin: 'Plugins', changelog: 'Changelog' },
      ranges: { any: 'Any time', '30d': 'Last 30 days', year: 'Past year' },
      listLabel: 'Search result list',
      count: (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`,
      empty: { title: 'No matching results', description: 'Try another keyword, or clear every filter.', clear: 'Clear filters' },
      pagination: { aria: 'Result pages', prev: 'Previous page', next: 'Next page' },
      hint: 'focus search',
    })

const query = ref('')
const applied = ref('')
const kind = ref('all')
const range = ref('any')
const page = ref(1)
const searchRef = ref<{ focus: () => void } | null>(null)

// Lower-cased once, so every match and every highlight compares the same text.
const needle = computed(() => applied.value.trim().toLowerCase())

function inRange(hit: Hit): boolean {
  if (range.value === 'any')
    return true
  const age = (TODAY - Date.parse(`${hit.updatedAt}T00:00:00Z`)) / DAY
  return range.value === '30d' ? age <= 30 : age <= 365
}

function matches(hit: Hit): boolean {
  if (!needle.value)
    return true
  return [hit.title[lang.value], hit.summary[lang.value]]
    .some(text => text.toLowerCase().includes(needle.value))
}

// Everything the keyword and the date range allow, before the type filter.
const scoped = computed(() => HITS.filter(hit => inRange(hit) && matches(hit)))

// Chip counts follow the keyword and the date range, not the chosen type.
const counts = computed(() => {
  const tally: Record<string, number> = { all: scoped.value.length, doc: 0, plugin: 0, changelog: 0 }
  for (const hit of scoped.value)
    tally[hit.kind] = (tally[hit.kind] ?? 0) + 1
  return tally
})

const results = computed(() => scoped.value
  .filter(hit => kind.value === 'all' || hit.kind === kind.value)
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))

const pageRows = computed(() => results.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

const kindItems = computed(() => (['all', 'doc', 'plugin', 'changelog'] as const).map(value => ({
  value,
  label: copy.value.kinds[value],
  count: counts.value[value],
})))

const rangeItems = computed(() => (['any', '30d', 'year'] as const).map(value => ({
  value,
  label: copy.value.ranges[value],
})))

// A new keyword, type or date range starts again from the first page.
watch([applied, kind, range], () => {
  page.value = 1
})

function onSearch(value: string): void {
  applied.value = value
}

function resetFilters(): void {
  query.value = ''
  applied.value = ''
  kind.value = 'all'
  range.value = 'any'
  searchRef.value?.focus()
}

const dateFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}))

function formatDate(iso: string): string {
  return dateFormat.value.format(new Date(`${iso}T00:00:00Z`))
}

// Splits text around the keyword, so matches are wrapped without v-html.
function segments(text: string): Segment[] {
  const q = needle.value
  if (!q)
    return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const parts: Segment[] = []
  let cursor = 0
  let at = lower.indexOf(q)
  while (at !== -1) {
    if (at > cursor)
      parts.push({ text: text.slice(cursor, at), hit: false })
    parts.push({ text: text.slice(at, at + q.length), hit: true })
    cursor = at + q.length
    at = lower.indexOf(q, cursor)
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor), hit: false })
  return parts
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

// Bound to the template root: only a press that starts inside the template
// reaches it. A claimed press is prevented, so the site's handler skips it.
function onRootKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.altKey)
    return
  const modifier = event.metaKey || event.ctrlKey
  const isFocusKey = (modifier && event.key.toLowerCase() === 'k')
    || (!modifier && event.key === '/' && !isTyping(event.target))
  if (!isFocusKey)
    return
  event.preventDefault()
  searchRef.value?.focus()
}
</script>

<template>
  <TemplateFrame :title="copy.title" :height="580">
    <div class="tpl-search" @keydown="onRootKeydown">
      <TxSearchInput
        ref="searchRef"
        v-model="query"
        remote
        :search-debounce="220"
        :placeholder="copy.placeholder"
        :aria-label="copy.searchLabel"
        @search="onSearch"
      />

      <div class="tpl-search__filters">
        <TxFilterChips v-model="kind" :items="kindItems" :aria-label="copy.kindLabel" />
        <TxFilterChips v-model="range" :items="rangeItems" :aria-label="copy.rangeLabel" />
      </div>

      <TxSearchEmpty
        v-if="!results.length"
        size="small"
        surface="card"
        icon="i-carbon-search"
        :title="copy.empty.title"
        :description="copy.empty.description"
        :primary-action="{ label: copy.empty.clear, icon: 'i-carbon-filter-remove' }"
        @primary="resetFilters"
      />

      <ol v-else class="tpl-search__list" :aria-label="copy.listLabel">
        <li v-for="hit in pageRows" :key="hit.id" class="tpl-search__item">
          <div class="tpl-search__meta">
            <span class="tpl-search__kind">{{ copy.kinds[hit.kind] }}</span>
            <span>{{ hit.source[lang] }}</span>
            <time :datetime="hit.updatedAt">{{ formatDate(hit.updatedAt) }}</time>
          </div>
          <h3 class="tpl-search__title">
            <template v-for="(part, index) in segments(hit.title[lang])" :key="index">
              <mark v-if="part.hit">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </h3>
          <p class="tpl-search__summary">
            <template v-for="(part, index) in segments(hit.summary[lang])" :key="index">
              <mark v-if="part.hit">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </p>
        </li>
      </ol>

      <footer class="tpl-search__foot">
        <span class="tpl-search__count" aria-live="polite">{{ copy.count(results.length) }}</span>
        <span class="tpl-search__hint"><kbd>/</kbd> {{ copy.hint }}</span>
        <TxPagination
          v-if="results.length"
          v-model:current-page="page"
          :page-size="PAGE_SIZE"
          :total="results.length"
          prev-icon="i-carbon-chevron-left"
          next-icon="i-carbon-chevron-right"
          :aria-label="copy.pagination.aria"
          :prev-label="copy.pagination.prev"
          :next-label="copy.pagination.next"
        />
      </footer>
    </div>
  </TemplateFrame>
</template>

<style scoped>
.tpl-search {
  display: flex;
  height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.tpl-search__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.tpl-search__list {
  display: grid;
  min-height: 0;
  flex: 1;
  align-content: start;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.tpl-search__item {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.tpl-search__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.tpl-search__kind {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.tpl-search__title {
  margin: 6px 0 4px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.tpl-search__summary {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--tx-text-color-regular, #606266);
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tpl-search mark {
  padding: 0 2px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, transparent);
  color: inherit;
}

.tpl-search__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.tpl-search__count {
  font-variant-numeric: tabular-nums;
}

.tpl-search__hint kbd {
  padding: 1px 5px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed);
  font-family: inherit;
  font-size: 11px;
}

@container template (min-width: 640px) {
  .tpl-search {
    padding: 18px 22px;
  }
}

@container template (min-width: 960px) {
  .tpl-search__list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
