<script setup lang="ts">
import './gallery-categories.css'
import type { DiffChangeKind } from '@tuffex-components/diff-table'
import type { Component } from 'vue'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { galleryText } from '../gallery-text'
import ClientOnly from '../GallerySpecimenGate.vue'
import { tileImage } from '../tile-image'

interface DiffSummaryCounts {
  added: number
  removed: number
  modified: number
  total: number
}

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const { t } = useI18n()

// Every chart specimen below sits inside `<ClientOnly>` and renders only on the client.
// Guarding the async loaders with `import.meta.server` ensures chart runtimes (ECharts,
// d3-geo, mini-world-geo) are never pulled into the Cloudflare Worker SSR bundle.
function clientAsync(loader: () => Promise<{ default: Component }>) {
  return defineAsyncComponent(() => {
    if (import.meta.server)
      return Promise.resolve({ render: () => null } as Component)
    return loader()
  })
}

const GalleryBubbleMap = clientAsync(() => import('../GalleryBubbleMap.vue'))
const GalleryChartLegend = clientAsync(() => import('../GalleryChartLegend.vue'))
const GalleryChoroplethMap = clientAsync(() => import('../GalleryChoroplethMap.vue'))
const GalleryCustomChart = clientAsync(() => import('../GalleryCustomChart.vue'))
const GalleryDitherChart = clientAsync(() => import('../GalleryDitherChart.vue'))
const GalleryEChart = clientAsync(() => import('../GalleryEChart.vue'))
const GalleryEChartFamily = clientAsync(() => import('../GalleryEChartFamily.vue'))
const GalleryImageGallery = defineAsyncComponent(() => import('../GalleryImageGallery.vue'))
const GalleryImagePreview = defineAsyncComponent(() => import('../GalleryImagePreview.vue'))
const GalleryLearningCurve = clientAsync(() => import('../GalleryLearningCurve.vue'))
const GalleryMonoChart = clientAsync(() => import('../GalleryMonoChart.vue'))
const GallerySankeyChart = clientAsync(() => import('../GallerySankeyChart.vue'))
const GallerySparkChart = clientAsync(() => import('../GallerySparkChart.vue'))
const GalleryTimeseriesChart = clientAsync(() => import('../GalleryTimeseriesChart.vue'))

type DataCategoryKey = 'charts' | 'echarts' | 'visualization' | 'data'

const CATEGORY_KEYS: DataCategoryKey[] = ['charts', 'echarts', 'visualization', 'data']

const categoryMeta = computed<Record<DataCategoryKey, { label: string, desc: string, icon: string, count: number }>>(() => ({
  charts: {
    label: t('docsSidebar.categories.charts'),
    desc: props.localeKey === 'zh'
      ? '图表基础、配色体系、自定义图、分级/气泡地图、桑基图、时序图、学习曲线、单色图与抖动图'
      : 'Primitives, palettes, custom charts, choropleth & bubble maps, Sankey, timeseries, learning curves, mono & dither charts',
    icon: 'i-carbon-chart-line',
    count: 10,
  },
  echarts: {
    label: props.localeKey === 'zh' ? 'ECharts 图表' : 'ECharts',
    desc: props.localeKey === 'zh'
      ? '组合图、折线、柱状、环形饼图、雷达、散点、漏斗、仪表盘、热力图与矩形树图'
      : 'Combo, line, bar, donut pie, radar, scatter, funnel, gauge, heatmap, and treemap',
    icon: 'i-carbon-chart-combo',
    count: 10,
  },
  visualization: {
    label: t('docsSidebar.categories.visualization'),
    desc: props.localeKey === 'zh'
      ? '迷你折线图、占比条、信号量表与差异表'
      : 'Sparklines, allocation bars, signal meters, and diff tables',
    icon: 'i-carbon-analytics',
    count: 4,
  },
  data: {
    label: t('docsSidebar.categories.data'),
    desc: props.localeKey === 'zh'
      ? '数据表、指标卡、描述列表、树形、排序、时间线、穿梭框、筛选标签、状态点与媒体预览'
      : 'Tables, stat cards, descriptions, trees, sortable lists, timelines, transfer, filter chips & media preview',
    icon: 'i-carbon-data-table',
    count: 13,
  },
}))

const categoryList = computed(() =>
  CATEGORY_KEYS.map(key => ({
    key,
    ...categoryMeta.value[key],
  })),
)

const activeCategory = ref<DataCategoryKey>('charts')
let catObserver: IntersectionObserver | null = null
let manualLockUntil = 0
let realignTimer: number | null = null
const STICKY_LANDING_OFFSET = 178

function scrollToCategory(key: DataCategoryKey) {
  activeCategory.value = key
  if (!import.meta.client || !hasDocument())
    return
  const el = document.getElementById(`data-cat-${key}`)
  if (!el)
    return
  manualLockUntil = Date.now() + 950
  if (realignTimer !== null) {
    window.clearTimeout(realignTimer)
    realignTimer = null
  }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const scrollOnce = () => {
    const top = el.getBoundingClientRect().top + window.scrollY - STICKY_LANDING_OFFSET
    window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' })
  }
  scrollOnce()
  realignTimer = window.setTimeout(() => {
    realignTimer = null
    const delta = Math.abs(el.getBoundingClientRect().top - STICKY_LANDING_OFFSET)
    if (delta > 32)
      scrollOnce()
  }, 420)
}

onMounted(() => {
  if (!hasWindow() || !('IntersectionObserver' in window))
    return
  const visible = new Set<DataCategoryKey>()
  catObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const key = entry.target.id.replace(/^data-cat-/, '') as DataCategoryKey
        if (entry.isIntersecting)
          visible.add(key)
        else
          visible.delete(key)
      }
      if (Date.now() < manualLockUntil)
        return
      const firstVisible = CATEGORY_KEYS.find(k => visible.has(k))
      if (firstVisible)
        activeCategory.value = firstVisible
    },
    { rootMargin: '-180px 0px -65% 0px', threshold: 0 },
  )
  for (const key of CATEGORY_KEYS) {
    const el = document.getElementById(`data-cat-${key}`)
    if (el)
      catObserver.observe(el)
  }
})

onBeforeUnmount(() => {
  catObserver?.disconnect()
  catObserver = null
  if (realignTimer !== null && hasWindow()) {
    window.clearTimeout(realignTimer)
    realignTimer = null
  }
})

const text = computed(() => galleryText[props.localeKey])

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      categoryCount: (n: number) => `${n} 个组件`,
      paletteCategorical: '分类色',
      paletteSequential: '连续色阶',
      paletteSemantic: '语义色',
      allocation: [
        { key: 'stable', label: '稳定版', percent: 56, color: 'var(--tx-chart-categorical-1, #4290f0)', description: '面向所有用户的默认通道' },
        { key: 'beta', label: '测试版', percent: 30, color: 'var(--tx-chart-categorical-4, #8d58ee)', description: '提前体验新特性' },
        { key: 'snapshot', label: '快照版', percent: 14, color: 'var(--tx-chart-categorical-5, #50c3b6)', description: '主分支的每夜构建' },
      ],
      confidence: [
        { value: 1, label: '低', tone: 'var(--tx-color-danger)' },
        { value: 2, label: '中', tone: 'var(--tx-color-warning)' },
        { value: 3, label: '高', tone: 'var(--tx-color-success)' },
      ],
      diffSummary: (counts: DiffSummaryCounts) => {
        const parts: string[] = []
        if (counts.removed > 0)
          parts.push(`${counts.removed} 项移除`)
        if (counts.added > 0)
          parts.push(`${counts.added} 项新增`)
        if (counts.modified > 0)
          parts.push(`${counts.modified} 项变更`)
        return parts.length ? parts.join(' · ') : '未选择变更'
      },
      diffApply: (count: number) => `应用 ${count} 项变更`,
      diffRowToggle: (accepted: boolean, _change: DiffChangeKind) => (accepted ? '取消采纳该变更' : '采纳该变更'),
      steps: ['下载', '安装', '完成'],
      online: '在线',
      reviewing: '审阅中',
      failed: '失败',
    }
  : {
      categoryCount: (n: number) => `${n} components`,
      paletteCategorical: 'Categorical',
      paletteSequential: 'Sequential',
      paletteSemantic: 'Semantic',
      allocation: [
        { key: 'stable', label: 'Stable', percent: 56, color: 'var(--tx-chart-categorical-1, #4290f0)', description: 'Default channel for everyone' },
        { key: 'beta', label: 'Beta', percent: 30, color: 'var(--tx-chart-categorical-4, #8d58ee)', description: 'Early access to new features' },
        { key: 'snapshot', label: 'Snapshot', percent: 14, color: 'var(--tx-chart-categorical-5, #50c3b6)', description: 'Nightly builds off main' },
      ],
      confidence: [
        { value: 1, label: 'Low', tone: 'var(--tx-color-danger)' },
        { value: 2, label: 'Mid', tone: 'var(--tx-color-warning)' },
        { value: 3, label: 'High', tone: 'var(--tx-color-success)' },
      ],
      diffSummary: (counts: DiffSummaryCounts) => {
        const parts: string[] = []
        if (counts.removed > 0)
          parts.push(`${counts.removed} ${counts.removed === 1 ? 'removal' : 'removals'}`)
        if (counts.added > 0)
          parts.push(`${counts.added} ${counts.added === 1 ? 'addition' : 'additions'}`)
        if (counts.modified > 0)
          parts.push(`${counts.modified} ${counts.modified === 1 ? 'change' : 'changes'}`)
        return parts.length ? parts.join(' · ') : 'No changes selected'
      },
      diffApply: (count: number) => `Apply ${count} ${count === 1 ? 'change' : 'changes'}`,
      diffRowToggle: (accepted: boolean, _change: DiffChangeKind) => (accepted ? 'Reject this change' : 'Accept this change'),
      steps: ['Download', 'Install', 'Ready'],
      online: 'Online',
      reviewing: 'Reviewing',
      failed: 'Failed',
    }))

const CATEGORICAL_SWATCHES = [
  'var(--tx-chart-categorical-1, #4290f0)',
  'var(--tx-chart-categorical-2, #f5b647)',
  'var(--tx-chart-categorical-3, #e8649d)',
  'var(--tx-chart-categorical-4, #8d58ee)',
  'var(--tx-chart-categorical-5, #50c3b6)',
  'var(--tx-chart-categorical-6, #d37536)',
]

const SEQUENTIAL_SWATCHES = [
  'var(--tx-chart-sequential-blues-1, #e1eaf4)',
  'var(--tx-chart-sequential-blues-2, #8ebcf6)',
  'var(--tx-chart-sequential-blues-3, #4290f0)',
  'var(--tx-chart-sequential-blues-4, #0e58b4)',
  'var(--tx-chart-sequential-blues-5, #03254f)',
]

const SEMANTIC_SWATCHES = [
  'var(--tx-chart-semantic-success, #00a63e)',
  'var(--tx-chart-semantic-warning, #f8a054)',
  'var(--tx-chart-semantic-attention, #fc574a)',
  'var(--tx-chart-semantic-neutral, #b9d6ff)',
]

const allocationKey = ref('stable')

/* ── Data display section state ── */
const descriptionFields = computed(() => (props.localeKey === 'zh'
  ? [
      { label: '插件', value: '剪贴板历史' },
      { label: '版本', value: '2.4.1' },
      { label: '通道', value: '稳定版' },
      { label: '主页', value: '' },
    ]
  : [
      { label: 'Plugin', value: 'Clipboard history' },
      { label: 'Version', value: '2.4.1' },
      { label: 'Channel', value: 'Stable' },
      { label: 'Homepage', value: '' },
    ]))

const sortableItems = ref([
  { id: 'clipboard', icon: 'i-carbon-paste', tone: 'primary', keys: ['⌘', '⇧', 'V'] },
  { id: 'browser', icon: 'i-carbon-earth', tone: 'success', keys: ['⌘', 'B'] },
  { id: 'actions', icon: 'i-carbon-flash', tone: 'warning', keys: ['⌘', 'K'] },
])

const transferValue = ref<string[]>(['clipboard'])

const filterChip = ref('all')
const filterTableTasks = computed(() => (props.localeKey === 'zh'
  ? [
      { id: 't1', name: '重构 Data Suite 视觉', status: 'in-progress', label: '进行中' },
      { id: 't2', name: '修复地图与桑基图样式', status: 'done', label: '已完成' },
      { id: 't3', name: '补充 ECharts 全家桶', status: 'todo', label: '待处理' },
    ]
  : [
      { id: 't1', name: 'Polish Data Suite UI', status: 'in-progress', label: 'In Progress' },
      { id: 't2', name: 'Fix map & Sankey styles', status: 'done', label: 'Completed' },
      { id: 't3', name: 'Add full ECharts family', status: 'todo', label: 'To do' },
    ]))

const filterChipItems = computed(() => (props.localeKey === 'zh'
  ? [
      { value: 'all', label: '全部', count: 3 },
      { value: 'todo', label: '待处理', count: 1, dot: 'var(--tx-color-warning)' },
      { value: 'in-progress', label: '进行中', count: 1, dot: 'var(--tx-color-primary)' },
      { value: 'done', label: '已完成', count: 1, dot: 'var(--tx-color-success)' },
    ]
  : [
      { value: 'all', label: 'All', count: 3 },
      { value: 'todo', label: 'To do', count: 1, dot: 'var(--tx-color-warning)' },
      { value: 'in-progress', label: 'In Progress', count: 1, dot: 'var(--tx-color-primary)' },
      { value: 'done', label: 'Completed', count: 1, dot: 'var(--tx-color-success)' },
    ]))

const filteredTasks = computed(() =>
  filterChip.value === 'all'
    ? filterTableTasks.value
    : filterTableTasks.value.filter(task => task.status === filterChip.value),
)

const filterTableColumns = computed(() => (props.localeKey === 'zh'
  ? [
      { key: 'name', title: '任务', dataIndex: 'name' },
      { key: 'label', title: '状态', dataIndex: 'label' },
    ]
  : [
      { key: 'name', title: 'Task', dataIndex: 'name' },
      { key: 'label', title: 'Status', dataIndex: 'label' },
    ]))

const markdownDoc = computed(() => (props.localeKey === 'zh'
  ? '#### 安装\n\n通过 `pnpm add @talex-touch/tuffex` 引入数据与图表组件，默认按需加载样式。'
  : '#### Install\n\nInstall via `pnpm add @talex-touch/tuffex` for tree-shakeable data & chart primitives.'))

const galleryTiles = [
  { id: 'a', url: tileImage('#1e3a8a', '#60a5fa', '#e0f2fe', 8), en: 'Dawn ridge', zh: '山脊晨光' },
  { id: 'b', url: tileImage('#064e3b', '#4ade80', '#fef9c3', 8), en: 'Pine valley', zh: '松谷' },
  { id: 'c', url: tileImage('#7c2d12', '#fbbf24', '#fff7ed', 8), en: 'Dune pass', zh: '沙丘垭口' },
]
const galleryItems = computed(() =>
  galleryTiles.map(({ id, url, en, zh }) => ({ id, url, name: props.localeKey === 'zh' ? zh : en })),
)
</script>

<template>
  <div class="docs-gallery__data-suite">
    <nav class="docs-gallery__cat-nav not-prose" aria-label="Data Suite categories">
      <a
        v-for="cat in categoryList"
        :key="cat.key"
        :href="`#data-cat-${cat.key}`"
        class="docs-gallery__cat-pill"
        :class="{ 'is-active': activeCategory === cat.key }"
        @click.prevent="scrollToCategory(cat.key)"
      >
        <span :class="cat.icon" class="docs-gallery__cat-pill-icon" aria-hidden="true" />
        <span>{{ cat.label }}</span>
        <span class="docs-gallery__cat-pill-count">{{ cat.count }}</span>
      </a>
    </nav>

    <!-- ── 1. Charts (10) ── -->
    <section id="data-cat-charts" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.charts.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.charts.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.charts.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.charts.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('chart-colors')">
            {{ cellLabel('ChartColors', '图表配色') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="data-suite__palettes">
                <div class="data-suite__palette-row">
                  <span class="data-suite__palette-name">{{ copy.paletteCategorical }}</span>
                  <div class="data-suite__palette-swatches">
                    <span
                      v-for="(color, idx) in CATEGORICAL_SWATCHES"
                      :key="`cat-${idx}`"
                      class="data-suite__swatch"
                      :style="{ background: color }"
                    />
                  </div>
                </div>
                <div class="data-suite__palette-row">
                  <span class="data-suite__palette-name">{{ copy.paletteSequential }}</span>
                  <div class="data-suite__palette-swatches">
                    <span
                      v-for="(color, idx) in SEQUENTIAL_SWATCHES"
                      :key="`seq-${idx}`"
                      class="data-suite__swatch"
                      :style="{ background: color }"
                    />
                  </div>
                </div>
                <div class="data-suite__palette-row">
                  <span class="data-suite__palette-name">{{ copy.paletteSemantic }}</span>
                  <div class="data-suite__palette-swatches">
                    <span
                      v-for="(color, idx) in SEMANTIC_SWATCHES"
                      :key="`sem-${idx}`"
                      class="data-suite__swatch"
                      :style="{ background: color }"
                    />
                  </div>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('charts')">
            {{ cellLabel('Charts', '图表基础') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 174px">
            <ClientOnly>
              <GalleryChartLegend />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('custom-chart')">
            {{ cellLabel('CustomChart', '自定义图表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <GalleryCustomChart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('maps')">
            {{ cellLabel('ChoroplethMap', '分级填色地图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 224px">
            <ClientOnly>
              <GalleryChoroplethMap />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('maps')">
            {{ cellLabel('BubbleMap', '气泡地图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 224px">
            <ClientOnly>
              <GalleryBubbleMap />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('sankey-chart')">
            {{ cellLabel('SankeyChart', '桑基图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px; --docs-gallery-specimen-narrow: 228px">
            <ClientOnly>
              <GallerySankeyChart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('timeseries-chart')">
            {{ cellLabel('TimeseriesChart', '时序图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 176px">
            <ClientOnly>
              <GalleryTimeseriesChart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('learning-curve')">
            {{ cellLabel('LearningCurve', '学习曲线') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 176px">
            <ClientOnly>
              <GalleryLearningCurve />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('mono-chart')">
            {{ cellLabel('MonoChart', '单色图表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 248px">
            <ClientOnly>
              <GalleryMonoChart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('dither-chart')">
            {{ cellLabel('DitherChart', '抖动图表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 248px">
            <ClientOnly>
              <GalleryDitherChart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- ── 2. ECharts (10) ── -->
    <section id="data-cat-echarts" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.echarts.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.echarts.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.echarts.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.echarts.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('EChart', '组合图表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 248px">
            <ClientOnly>
              <GalleryEChart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('LineChart', '折线图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="line" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('BarChart', '柱状图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="bar" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('PieChart', '环形饼图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="pie" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('RadarChart', '雷达图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="radar" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('ScatterChart', '散点图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="scatter" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('FunnelChart', '漏斗图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="funnel" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('GaugeChart', '仪表盘') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="gauge" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('HeatmapChart', '热力图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="heatmap" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
            {{ cellLabel('TreemapChart', '矩形树图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryEChartFamily kind="treemap" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- ── 3. Visualization (4) ── -->
    <section id="data-cat-visualization" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.visualization.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.visualization.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.visualization.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.visualization.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('spark-chart')">
            {{ cellLabel('SparkChart', '迷你折线图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <GallerySparkChart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('allocation-bar')">
            {{ cellLabel('AllocationBar', '占比条') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxAllocationBar v-model="allocationKey" :segments="copy.allocation" detail v-bind="text.allocationBar" />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('signal-meter')">
            {{ cellLabel('SignalMeter', '信号量表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__row docs-gallery__row--loose">
                <div v-for="level in copy.confidence" :key="level.value" class="docs-gallery__meter">
                  <TxSignalMeter :value="level.value" :max="3" :tone="level.tone" :bar-height="16" :bar-width="5" :label="level.label" />
                  <span class="docs-gallery__meter-text">{{ level.label }}</span>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('diff-table')">
            {{ cellLabel('DiffTable', '差异表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 232px">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxDiffTable
                  :title="localeKey === 'zh' ? '插件通道调整建议' : 'Proposed channel cleanup'"
                  :hint="localeKey === 'zh' ? '点击变更行切换' : 'Click changed rows to toggle'"
                  :columns="text.diffColumns"
                  :rows="text.diffRows"
                  :summary-formatter="copy.diffSummary"
                  :apply-label-formatter="copy.diffApply"
                  :row-toggle-label-formatter="copy.diffRowToggle"
                  play="settled"
                  selectable
                  footer
                />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- ── 4. Data Display (13) ── -->
    <section id="data-cat-data" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.data.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.data.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.data.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.data.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('data-table')">
            {{ cellLabel('DataTable', '数据表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxDataTable :columns="text.tableColumns" :data="text.tableRows" row-key="id" hover />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('stat-card')">
            {{ cellLabel('StatCard', '指标卡') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxStatCard
                  :value="12847"
                  :label="localeKey === 'zh' ? '周活跃用户' : 'Weekly active users'"
                  icon-class="i-carbon-user-multiple docs-gallery__stat-icon"
                  :insight="{ from: 11020, to: 12847, type: 'percent' }"
                />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('descriptions')">
            {{ cellLabel('Descriptions', '描述列表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxDescriptions :columns="1">
                  <TxDescriptionsItem v-for="field in descriptionFields" :key="field.label" :label="field.label">
                    {{ field.value }}
                  </TxDescriptionsItem>
                </TxDescriptions>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('tree')">
            {{ cellLabel('Tree', '树形控件') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxTree
                  v-bind="text.tree"
                  :nodes="text.treeNodes"
                  :default-expanded-keys="['plugins']"
                  :default-selected-keys="['clipboard']"
                />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('sortable-list')">
            {{ cellLabel('SortableList', '可排序列表') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxSortableList v-model="sortableItems" handle v-bind="text.sortableList">
                  <template #item="{ item, handleAttrs }">
                    <div class="docs-gallery__sort-row">
                      <span class="docs-gallery__grip i-carbon-draggable" v-bind="handleAttrs" />
                      <span class="docs-gallery__sort-icon" :data-tone="item.tone" aria-hidden="true">
                        <span :class="item.icon" />
                      </span>
                      <span class="docs-gallery__sort-label">{{ text.sortableList.itemLabel(item) }}</span>
                      <span class="docs-gallery__sort-keys" aria-hidden="true">
                        <TxKbd v-for="key in item.keys" :key="key" size="sm">{{ key }}</TxKbd>
                      </span>
                    </div>
                  </template>
                </TxSortableList>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('timeline')">
            {{ cellLabel('Timeline', '时间线') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxTimeline>
                  <TxTimelineItem v-for="(step, index) in copy.steps" :key="step" :title="step" :active="index === 0" />
                </TxTimeline>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('transfer')">
            {{ cellLabel('Transfer', '穿梭框') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__transfer">
                <TxTransfer v-model="transferValue" :data="text.transferData" v-bind="text.transfer" min-height="140px" />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('filter-chips')">
            {{ cellLabel('FilterChips', '筛选标签') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__stack">
                <TxFilterChips v-model="filterChip" :items="filterChipItems" v-bind="text.filterChips" />
                <TxDataTable :columns="filterTableColumns" :data="filteredTasks" row-key="id" hover />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('dot-indicator')">
            {{ cellLabel('DotIndicator', '状态点') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__stack">
                <TxDotIndicator color="var(--tx-color-success)" :label="copy.online" />
                <TxDotIndicator color="var(--tx-color-warning)" :label="copy.reviewing" />
                <TxDotIndicator color="var(--tx-color-danger)" :label="copy.failed" />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('cell-link')">
            {{ cellLabel('CellLink', '单元链接') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__stack">
                <TxCellLink href="https://www.npmjs.com/package/@talex-touch/tuffex" label="@talex-touch/tuffex" external />
                <TxCellLink href="https://github.com/talex-touch/talex-touch" label="talex-touch" external muted />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('markdown-view')">
            {{ cellLabel('MarkdownView', 'Markdown 视图') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 202px; --docs-gallery-specimen-narrow: 265px">
            <ClientOnly>
              <div class="docs-gallery__block">
                <div class="docs-gallery__doc">
                  <div class="docs-gallery__doc-bar">
                    <span class="i-carbon-document" aria-hidden="true" />
                    README.md
                  </div>
                  <TxMarkdownView :content="markdownDoc" />
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('image-gallery')">
            {{ cellLabel('ImageGallery', '图片画廊') }}
          </NuxtLink>
          <div class="docs-gallery__stage docs-gallery__stage--thumbs not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__thumbs">
                <GalleryImageGallery :items="galleryItems" />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('image-preview')">
            {{ cellLabel('ImagePreview', '图片预览') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block">
                <GalleryImagePreview />
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.data-suite__palettes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(300px, 100%);
}

.data-suite__palette-row {
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.data-suite__palette-name {
  font-size: 11.5px;
  color: var(--docs-muted);
  white-space: nowrap;
}

.data-suite__palette-swatches {
  display: flex;
  align-items: center;
  gap: 6px;
}

.data-suite__swatch {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, var(--tx-text-color-primary, currentColor) 12%, transparent);
}
</style>
