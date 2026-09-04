<script setup lang="ts">
import { computed, ref } from 'vue'
import './DocsComponentsGallery.css'
import {
  ChartPalette,
  TxArcSeries,
  TxChart,
  TxChartLegendItem,
  TxChoroplethMap,
  TxSankeyChart,
  TxTimeseriesChart,
} from '@talex-touch/tuffex-charts'
import type { FileUploaderFile } from '@tuffex-components/file-uploader'
import type { ImageUploaderFile } from '@tuffex-components/image-uploader'
import type { AiChainStep, AiElementMessage } from '@tuffex-components/ai-elements'
import type { OrbState } from '@tuffex-components/thinking-orb'
import {
  TxBlankSlate,
  TxEmpty,
  TxEmptyState,
  TxErrorState,
  TxGuideState,
  TxLayoutSkeleton,
  TxLoadingState,
  TxNoData,
  TxNoSelection,
  TxOfflineState,
  TxPermissionState,
  TxSearchEmpty,
} from '#components'
import { useSelectionAnchor } from '@talex-touch/tuffex/selection-actions'
import { toast } from '@talex-touch/tuffex/utils'
import tuffexPkg from '../../../../../packages/tuffex/package.json'

// Optional suite filter: suite overview pages embed only their own band and
// hide the cross-band jump tabs; without it the full hub grid renders.
const props = defineProps<{ suite?: 'base' | 'pro' | 'ai' | 'data' }>()

const { locale } = useI18n()

function bandVisible(key: 'base' | 'pro' | 'ai' | 'data') {
  return !props.suite || props.suite === key
}

const localeKey = computed(() => (locale.value === 'zh' ? 'zh' : 'en'))

function docPath(slug: string) {
  return `/docs/dev/components/${slug}.${localeKey.value}`
}

function cellLabel(en: string, zh: string) {
  return localeKey.value === 'zh' ? `${en} ${zh}` : en
}

const copy = computed(() => (localeKey.value === 'zh'
  ? {
      suiteBase: '基础',
      suitePro: '进阶',
      suiteAi: 'AI',
      suiteData: '数据',
      createPlugin: '新建插件',
      typeSomething: '输入点什么…',
      searchPlugins: '搜索插件…',
      password: '输入密码',
      selectChannel: '选择发布通道',
      channels: [
        { value: 'stable', label: '稳定版' },
        { value: 'beta', label: '测试版' },
        { value: 'snapshot', label: '快照版' },
      ],
      autoSync: '自动同步',
      partial: '部分选中',
      syncing: '同步中',
      dividerSection: '分组',
      formName: '名称',
      formEmail: '邮箱',
      contextHint: '右键此处',
      selectionHint: '选中这段文字试试。',
      toastSaved: '已保存',
      add: '添加',
      translate: '翻译',
      newPlugin: '新建插件',
      importWorkflow: '导入工作流',
      delete: '删除',
      dialogTitle: '删除插件？',
      dialogMessage: '该操作无法撤销。',
      confirm: '确认',
      online: '在线',
      reviewing: '审阅中',
      failed: '失败',
      aboutTitle: 'Tuffex 是什么？',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      installTitle: '如何安装？',
      installBody: 'pnpm add @talex-touch/tuffex',
      periods: [
        { value: 'day', label: '日' },
        { value: 'week', label: '周' },
        { value: 'month', label: '月' },
      ],
      tags: [
        { label: '稳定版', color: 'var(--tx-color-success)' },
        { label: '测试版', color: 'var(--tx-color-warning)' },
      ],
      closableTag: '可关闭',
      steps: ['下载', '安装', '完成'],
      allocation: [
        { key: 'stable', label: '稳定版', percent: 56 },
        { key: 'beta', label: '测试版', percent: 30 },
        { key: 'snapshot', label: '快照版', percent: 14 },
      ],
      confidence: [
        { value: 1, label: '低', tone: 'var(--tx-color-danger)' },
        { value: 2, label: '中', tone: 'var(--tx-color-warning)' },
        { value: 3, label: '高', tone: 'var(--tx-color-success)' },
      ],
      working: '处理中',
      searching: '检索中',
      typing: '正在输入…',
      suggestions: [
        { id: 's1', text: '如何发布插件？' },
        { id: 's2', text: '怎样声明权限？' },
        { id: 's3', text: '支持哪些平台？' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: '读取清单', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: '执行构建', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 次工具调用',
    }
  : {
      suiteBase: 'Basics',
      suitePro: 'Pro',
      suiteAi: 'AI',
      suiteData: 'Data',
      createPlugin: 'Create Plugin',
      typeSomething: 'Type something...',
      searchPlugins: 'Search plugins...',
      password: 'Password',
      selectChannel: 'Select channel',
      channels: [
        { value: 'stable', label: 'Stable' },
        { value: 'beta', label: 'Beta' },
        { value: 'snapshot', label: 'Snapshot' },
      ],
      autoSync: 'Auto sync',
      partial: 'Partial',
      syncing: 'Syncing',
      dividerSection: 'Section',
      formName: 'Name',
      formEmail: 'Email',
      contextHint: 'Right-click here',
      selectionHint: 'Select this text to see the actions.',
      toastSaved: 'Saved',
      add: 'Add',
      translate: 'Translate',
      newPlugin: 'New plugin',
      importWorkflow: 'Import workflow',
      delete: 'Delete',
      dialogTitle: 'Delete plugin?',
      dialogMessage: 'This action cannot be undone.',
      confirm: 'Confirm',
      online: 'Online',
      reviewing: 'Reviewing',
      failed: 'Failed',
      aboutTitle: 'What is Tuffex?',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      installTitle: 'How to install?',
      installBody: 'pnpm add @talex-touch/tuffex',
      periods: [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ],
      tags: [
        { label: 'Stable', color: 'var(--tx-color-success)' },
        { label: 'Beta', color: 'var(--tx-color-warning)' },
      ],
      closableTag: 'Closable',
      steps: ['Download', 'Install', 'Done'],
      allocation: [
        { key: 'stable', label: 'Stable', percent: 56 },
        { key: 'beta', label: 'Beta', percent: 30 },
        { key: 'snapshot', label: 'Snapshot', percent: 14 },
      ],
      confidence: [
        { value: 1, label: 'Low', tone: 'var(--tx-color-danger)' },
        { value: 2, label: 'Mid', tone: 'var(--tx-color-warning)' },
        { value: 3, label: 'High', tone: 'var(--tx-color-success)' },
      ],
      working: 'Working',
      searching: 'Searching',
      typing: 'Typing…',
      suggestions: [
        { id: 's1', text: 'How do I publish a plugin?' },
        { id: 's2', text: 'How to declare permissions?' },
        { id: 's3', text: 'Which platforms are supported?' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: 'Read manifest', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: 'Run build', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 tool calls',
    }))

const inputValue = ref('')
const searchValue = ref('tuffex')
const passwordValue = ref('talex-touch')
const channel = ref('')
const multiChannel = ref<string[]>(['stable', 'beta'])
const switchOn = ref(true)
const switchOff = ref(false)
const syncChecked = ref(true)
const pinnedTip = ref(true)
const sliderValue = ref(62)
const deleteOpen = ref(false)
const aboutOpen = ref<string[]>([])
const period = ref('week')
const periodStd = ref('day')
const rating = ref(4)
const page = ref(2)
const avatarNames = ['Talex', 'Kiri', 'Ame', 'Louis']

const avatarVariants = [
  { name: 'Talex', shape: 'circle' as const, tone: 'var(--tx-color-success)' },
  { name: 'Kiri', shape: 'rounded' as const, tone: 'var(--tx-color-warning)' },
  { name: 'Ame', shape: 'square' as const, tone: 'var(--tx-text-color-secondary)' },
]

/* ── Form band state. Every specimen is live, so each needs its own model. ── */
const cascaderValue = ref<string[]>([])
const cascaderOptions = [
  {
    value: 'plugins',
    label: 'Plugins',
    children: [
      { value: 'clipboard', label: 'Clipboard', leaf: true },
      { value: 'browser', label: 'Browser', leaf: true },
    ],
  },
  {
    value: 'system',
    label: 'System',
    children: [{ value: 'shortcuts', label: 'Shortcuts', leaf: true }],
  },
]
const dateValue = ref('2026-02-16')
const flatRadioValue = ref('auto')
const flatSelectValue = ref('json')
const flatInputValue = ref('')
const numberValue = ref(60)
const pickerValue = ref<(string | number)[]>(['beta'])
const pickerColumns = [{
  key: 'channel',
  options: [
    { value: 'stable', label: 'Stable' },
    { value: 'beta', label: 'Beta' },
    { value: 'snapshot', label: 'Snapshot' },
  ],
}]
const scrubWidth = ref(324)
const searchText = ref('')
const searchSelectValue = ref('')
const searchSelectOptions = [
  { value: 'clipboard', label: 'Clipboard' },
  { value: 'browser', label: 'Browser' },
  { value: 'intelligence', label: 'Intelligence' },
]
const segmentValue = ref(1)
const segments = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'L' },
  { value: 3, label: 'XL' },
]
const tagValues = ref(['stable', 'beta'])
const textareaValue = ref('')
const treeSelectValue = ref<string | number>('')
const treeSelectNodes = [
  {
    key: 'general',
    label: 'General',
    children: [
      { key: 'appearance', label: 'Appearance' },
      { key: 'language', label: 'Language' },
    ],
  },
  { key: 'account', label: 'Account', children: [{ key: 'profile', label: 'Profile' }] },
]
const uploadFiles = ref<FileUploaderFile[]>([])
const uploadImages = ref<ImageUploaderFile[]>([])
const formModel = ref({ name: '', email: '' })

/* ── Layout band. The structural components have nothing of their own to
   render, so each one lays out the same neutral tiles: what the specimen shows
   is the arrangement, not the contents. ── */
const layoutTiles = [1, 2, 3, 4, 5, 6]
const splitRatio = ref(0.42)
const blockSwitch = ref(true)

/* ── Navigation + feedback band. Overlay components have no resting appearance,
   so those specimens show the trigger and open for real on click — the same
   shape the Dialog cell above already uses. ── */
const navTab = ref('home')
const tabBarItems = computed(() => [
  { value: 'home', label: copy.value.suiteBase, iconClass: 'i-carbon-home' },
  { value: 'search', label: copy.value.searching, iconClass: 'i-carbon-search', badge: 3 },
  { value: 'profile', label: copy.value.formName, iconClass: 'i-carbon-user' },
])
const breadcrumbItems = computed(() => [
  { label: 'Tuffex', href: '/', icon: 'i-carbon-home' },
  { label: copy.value.suiteBase },
  { label: copy.value.dividerSection },
])
const modalOpen = ref(false)
const drawerOpen = ref(false)
const popoverOpen = ref(false)
const overlayLoading = ref(true)
const tabsActive = ref('')
const selectionRootRef = ref<HTMLElement | null>(null)
const { selection: selectionPayload } = useSelectionAnchor({ root: selectionRootRef })

function fireToast() {
  toast({ title: copy.value.toastSaved, description: copy.value.aboutBody })
}

/* ── Data band. ── */
const tableColumns = [
  { key: 'name', title: 'Plugin', dataIndex: 'name' },
  { key: 'channel', title: 'Channel', dataIndex: 'channel' },
]
const tableRows = [
  { id: 1, name: 'Clipboard', channel: 'Stable' },
  { id: 2, name: 'Browser', channel: 'Beta' },
  { id: 3, name: 'Intelligence', channel: 'Snapshot' },
]
const filterChip = ref('all')
const filterChipItems = computed(() => [
  { value: 'all', label: copy.value.suiteBase, count: 91 },
  { value: 'beta', label: copy.value.reviewing, count: 12, dot: 'var(--tx-color-warning)' },
])
/* Inline SVG so the gallery never waits on (or fails) a network image. */
function tileImage(hex: string) {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="${hex}"/></svg>`)}`
}
const galleryItems = [
  { id: 'a', url: tileImage('#3b82f6'), name: 'Blue' },
  { id: 'b', url: tileImage('#22c55e'), name: 'Green' },
  { id: 'c', url: tileImage('#f59e0b'), name: 'Amber' },
]
const sortableItems = ref([
  { id: 'clipboard', label: 'Clipboard' },
  { id: 'browser', label: 'Browser' },
  { id: 'actions', label: 'Quick actions' },
])
const transferValue = ref<Array<string | number>>(['browser'])
const transferData = [
  { key: 'clipboard', label: 'Clipboard' },
  { key: 'browser', label: 'Browser' },
  { key: 'actions', label: 'Quick actions' },
]
const treeNodes = [
  {
    key: 'plugins',
    label: 'Plugins',
    children: [
      { key: 'clipboard', label: 'Clipboard', leaf: true },
      { key: 'browser', label: 'Browser', leaf: true },
    ],
  },
]
const markdownSample = '### Tuffex\n\n- `pnpm add @talex-touch/tuffex`\n- Vue 3 + TypeScript'

/* ── Pro band. ── */
const codeSample = 'export function greet(name: string) {\n  return \'Hello \' + name\n}\n'
const markdownDraft = ref('## Release notes\n\n- Faster CoreBox\n')
const paletteOpen = ref(false)
const paletteItems = computed(() => [
  { id: 'new', title: copy.value.newPlugin, icon: 'i-carbon-add', shortcut: '⌘N' },
  { id: 'import', title: copy.value.importWorkflow, icon: 'i-carbon-download' },
])
const searchPanelValue = ref('')
const searchPanelItems = computed(() => [
  { id: 'clipboard', label: 'Clipboard' },
  { id: 'browser', label: 'Browser' },
  { id: 'actions', label: copy.value.newPlugin },
])
const virtualRows = Array.from({ length: 200 }, (_, index) => ({ id: index, label: `Row ${index + 1}` }))
const fusionOpen = ref(false)
const flipped = ref(false)
const resizeWide = ref(false)
const flipTriggerRef = ref<{ $el?: HTMLElement } | null>(null)
const flipTriggerEl = computed(() => flipTriggerRef.value?.$el ?? null)
const autoSizerRef = ref<{ size?: { width?: number, height?: number } } | null>(null)
const autoSizerLabel = computed(() => {
  const size = autoSizerRef.value?.size
  if (!size?.width)
    return '—'
  return `${Math.round(size.width)} × ${Math.round(size.height ?? 0)}`
})

/* ── AI band. ── */
const chatDraft = ref('')
const promptDraft = ref('')
const aiAttachments = ref([
  { kind: 'file' as const, id: 'a1', name: 'manifest.json', size: 2048, mime: 'application/json' },
])
const chatMessages = computed<AiElementMessage[]>(() => [
  { id: 'u1', role: 'user' as const, content: copy.value.suggestions[0]?.text ?? '', createdAt: 1_705_000_000_000 },
  { id: 'a1', role: 'assistant' as const, content: copy.value.aboutBody, createdAt: 1_705_000_001_000 },
])
const chatListMessages = computed(() => [
  { id: 'u1', role: 'user' as const, content: copy.value.suggestions[0]?.text ?? '', createdAt: 1_705_000_000_000 },
  { id: 'a1', role: 'assistant' as const, content: copy.value.aboutBody, createdAt: 1_705_000_001_000 },
])
const aiSampleMessage = computed(() => chatMessages.value[1] ?? chatMessages.value[0]!)
const traceRows = computed(() => [
  { id: 'read', primary: copy.value.toolRows[0]?.label ?? '', secondary: 'manifest.json', mono: true, status: 'done' as const },
  { id: 'run', primary: copy.value.toolRows[1]?.label ?? '', secondary: 'pnpm build', mono: true, status: 'active' as const },
])
const aiAgents = computed(() => [
  { id: 'chat', name: copy.value.suiteAi, description: copy.value.aboutBody, iconClass: 'i-carbon-chat', badgeText: 6 },
])
const taskRowItems = computed(() => [
  { id: 'verify', label: copy.value.reviewing, status: 'done' as const },
  { id: 'build', label: copy.value.working, status: 'running' as const },
])
const toolConfirmationInput = '{\n  "path": "src/main.ts"\n}'
const toolCall = {
  type: 'tool-call' as const,
  id: 'call-1',
  name: 'write_file',
  status: 'done' as const,
  input: toolConfirmationInput,
  output: 'ok',
}
const cotSteps = computed<AiChainStep[]>(() => [
  { id: 's1', kind: 'thinking', title: copy.value.searching, body: copy.value.aboutBody, status: 'done' },
  { id: 's2', kind: 'tool', title: copy.value.working, body: copy.value.installBody, status: 'active' },
])
const aiSources = [
  { id: 's1', url: 'https://github.com/talex-touch/talex-touch', title: 'talex-touch' },
  { id: 's2', url: 'https://www.npmjs.com/package/@talex-touch/tuffex' },
]
const contextChunks = computed(() => [
  { id: 'c1', title: 'manifest.json', excerpt: copy.value.installBody, source: { name: 'manifest.json', badge: 'JSON', tone: 'accent' as const } },
])
const insightPages = computed(() => [
  { key: 'adoption', prose: copy.value.aboutBody, suggestion: copy.value.suggestions[0]?.text },
])
const fineTuneValues = {
  layout: 'grid' as const,
  width: 320,
  height: 180,
  radius: 14,
  opacity: 1,
  type: null,
}
const recommendationOptions = computed(() => [
  { key: 'stable', label: copy.value.channels[0]?.label ?? '', short: copy.value.installBody, text: copy.value.installBody, confidence: 'high' as const },
  { key: 'beta', label: copy.value.channels[1]?.label ?? '', short: copy.value.aboutBody, text: copy.value.aboutBody, confidence: 'medium' as const },
])
/* ── Data band. Charts come from `@talex-touch/tuffex-charts`, which is aliased
   but not globally registered, so they are imported explicitly — and never as
   `TxGrid`, which would shadow the layout grid used above. ── */
const donutSlices = [
  { label: 'Stable', count: 4820 },
  { label: 'Beta', count: 3160 },
  { label: 'Snapshot', count: 940 },
]
const DAY = 86_400_000
const seriesStart = Date.UTC(2026, 1, 9)
const timeseriesData = [
  { name: 'Installs', data: Array.from({ length: 7 }, (_, i) => [seriesStart + i * DAY, 420 + (i % 3) * 80] as [number, number]) },
  { name: 'Errors', data: Array.from({ length: 7 }, (_, i) => [seriesStart + i * DAY, 40 + (i % 4) * 18] as [number, number]) },
]
const sankeyNodes = [
  { name: 'Search', value: 5200 },
  { name: 'Docs', value: 5200 },
  { name: 'Install', value: 3100 },
]
const sankeyLinks = [
  { source: 0, target: 1, value: 5200 },
  { source: 1, target: 2, value: 3100 },
]
/* Inline geometry so the map specimen never depends on a fetch. */
const miniGeoJson = {
  type: 'FeatureCollection' as const,
  features: [
    { type: 'Feature' as const, properties: { country: 'West' }, geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] } },
    { type: 'Feature' as const, properties: { country: 'East' }, geometry: { type: 'Polygon' as const, coordinates: [[[5, 0], [9, 0], [9, 4], [5, 4], [5, 0]]] } },
  ],
}
const miniGeoData = [
  { country: 'West', share: 62 },
  { country: 'East', share: 28 },
]
const diffColumns = [
  { key: 'name', title: 'Plugin', width: '55%' },
  { key: 'channel', title: 'Channel', width: '45%' },
]
const diffRows = [
  { key: 'clipboard', change: 'added' as const, data: { name: 'Clipboard', channel: 'Stable' } },
  { key: 'legacy', change: 'removed' as const, data: { name: 'Legacy', channel: 'Beta' } },
]

/*
 * The twelve status components are all thin `TxEmptyState` wrappers differing
 * only in their pinned `variant`, so they share one cell shape driven off this
 * table rather than twelve near-identical blocks.
 *
 * The components are imported rather than named as strings: `<component :is>`
 * resolves a string against the runtime registry, and tuffex components are
 * auto-imported at compile time now, so a string would resolve to nothing.
 */
const statusStates = computed(() => [
  { slug: 'blank-slate', is: TxBlankSlate, en: 'BlankSlate', zh: '空白板' },
  { slug: 'empty', is: TxEmpty, en: 'Empty', zh: '空' },
  { slug: 'empty-state', is: TxEmptyState, en: 'EmptyState', zh: '空状态' },
  { slug: 'error-state', is: TxErrorState, en: 'ErrorState', zh: '错误态' },
  { slug: 'guide-state', is: TxGuideState, en: 'GuideState', zh: '引导态' },
  { slug: 'layout-skeleton', is: TxLayoutSkeleton, en: 'LayoutSkeleton', zh: '布局骨架' },
  { slug: 'loading-state', is: TxLoadingState, en: 'LoadingState', zh: '加载态' },
  { slug: 'no-data', is: TxNoData, en: 'NoData', zh: '无数据' },
  { slug: 'no-selection', is: TxNoSelection, en: 'NoSelection', zh: '未选择' },
  { slug: 'offline-state', is: TxOfflineState, en: 'OfflineState', zh: '离线态' },
  { slug: 'permission-state', is: TxPermissionState, en: 'PermissionState', zh: '权限态' },
  { slug: 'search-empty', is: TxSearchEmpty, en: 'SearchEmpty', zh: '搜索无结果' },
])

const sparkSeries = [{
  id: 'adoption',
  data: [4, 6, 5, 8, 7, 10, 9, 12, 11].map((value, time) => ({ time, value })),
}]

const orbStates: OrbState[] = ['working', 'searching', 'solving']

const citeSources = [
  { id: 'repo', url: 'https://github.com/talex-touch/talex-touch' },
  { id: 'npm', url: 'https://www.npmjs.com/package/@talex-touch/tuffex' },
]

const INSTALL_CMD = 'pnpm add @talex-touch/tuffex'
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function copyInstall() {
  try {
    await navigator.clipboard.writeText(INSTALL_CMD)
  }
  catch {
    return
  }
  copied.value = true
  if (copyTimer)
    clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 1600)
}

const suites = computed(() => [
  { key: 'base', label: copy.value.suiteBase },
  { key: 'pro', label: copy.value.suitePro },
  { key: 'ai', label: copy.value.suiteAi },
  { key: 'data', label: copy.value.suiteData },
])

function scrollToSuite(key: string) {
  document.getElementById(`docs-gallery-suite-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="docs-gallery">
    <div class="docs-gallery__bar">
      <button
        type="button"
        class="docs-gallery__install"
        :aria-label="`Copy: ${INSTALL_CMD}`"
        @click="copyInstall"
      >
        <span class="docs-gallery__install-prompt" aria-hidden="true">$</span>
        <span>{{ INSTALL_CMD }}</span>
        <span class="docs-gallery__install-icon" :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
      </button>
      <span class="docs-gallery__version">v{{ tuffexPkg.version }}</span>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-base" class="docs-gallery__suite" :aria-label="copy.suiteBase">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'base' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('base')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('button')">
          {{ cellLabel('Button', '按钮') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack">
              <TxButton icon="i-carbon-add">
                {{ copy.createPlugin }}
              </TxButton>
              <TxButton variant="primary" icon="i-carbon-add">
                {{ copy.createPlugin }}
              </TxButton>
              <TxButton loading>
                {{ copy.createPlugin }}
              </TxButton>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('input')">
          {{ cellLabel('Input', '输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TuffInput v-model="inputValue" :placeholder="copy.typeSomething" />
              <TuffInput v-model="searchValue" prefix-icon="i-carbon-search" :placeholder="copy.searchPlugins" clearable />
              <TuffInput v-model="passwordValue" type="password" prefix-icon="i-carbon-locked" :placeholder="copy.password" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('select')">
          {{ cellLabel('Select', '选择器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TuffSelect v-model="channel" :placeholder="copy.selectChannel">
                <TuffSelectItem
                  v-for="option in copy.channels"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                />
              </TuffSelect>
              <TuffSelect v-model="multiChannel" multiple :placeholder="copy.selectChannel">
                <TuffSelectItem
                  v-for="option in copy.channels"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                />
              </TuffSelect>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('switch')">
          {{ cellLabel('Switch', '开关') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TuffSwitch v-model="switchOn" />
              <TuffSwitch v-model="switchOff" />
              <!-- Pinned on: the ring brightens with the thumb, so it reads
                   against the active track instead of grey on grey. -->
              <TuffSwitch :model-value="true" loading />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('checkbox')">
          {{ cellLabel('Checkbox', '复选框') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxCheckbox v-model="syncChecked" :label="copy.autoSync" />
              <TxCheckbox :model-value="false" indeterminate :label="copy.partial" />
              <!-- Checked so the ring keeps the primary hue, which is what the
                   loading state uses to say "still on" while the commit lands. -->
              <TxCheckbox :model-value="true" loading :label="copy.syncing" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('slider')">
          {{ cellLabel('Slider', '滑块') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSlider v-model="sliderValue" :min="0" :max="100" :step="1" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tooltip')">
          {{ cellLabel('Tooltip', '提示') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <!--
                Pinned through v-model rather than a fixed `:model-value="true"`:
                the anchor-delay service preempts hint-over-hint by calling the
                tooltip's close, and a literal prop pins the getter so that close
                can never land — both bubbles would sit on screen together. The
                trigger is `manual` so leaving the pinned button cannot dismiss
                the specimen, and the neighbour's close restores it.
              -->
              <TxTooltip v-model="pinnedTip" trigger="manual" :content="copy.add">
                <TxButton circle icon="i-carbon-add" />
              </TxTooltip>
              <TxTooltip :content="copy.translate" @close="pinnedTip = true">
                <TxButton circle icon="i-carbon-translate" />
              </TxTooltip>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('dropdown-menu')">
          {{ cellLabel('DropdownMenu', '下拉菜单') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxDropdownMenu>
              <template #trigger>
                <TxButton icon="i-carbon-add">
                  {{ copy.add }}
                </TxButton>
              </template>
              <TxDropdownItem>{{ copy.newPlugin }}</TxDropdownItem>
              <TxDropdownItem>{{ copy.importWorkflow }}</TxDropdownItem>
              <TxDropdownItem danger>
                {{ copy.delete }}
              </TxDropdownItem>
            </TxDropdownMenu>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('dialog')">
          {{ cellLabel('Dialog', '弹窗') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxButton @click="deleteOpen = true">
              {{ copy.delete }}
            </TxButton>
            <TxBlowDialog
              v-if="deleteOpen"
              :title="copy.dialogTitle"
              :message="copy.dialogMessage"
              :confirm-text="copy.confirm"
              :close="() => (deleteOpen = false)"
            />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('status-badge')">
          {{ cellLabel('StatusBadge', '状态徽标') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxStatusBadge :text="copy.online" status="success" />
              <TxStatusBadge :text="copy.reviewing" status="warning" />
              <TxStatusBadge :text="copy.failed" status="danger" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('progress-bar')">
          {{ cellLabel('ProgressBar', '进度条') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TxProgressBar :percentage="62" />
              <TxProgressBar indeterminate />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('collapse')">
          {{ cellLabel('Collapse', '折叠') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxCollapse v-model="aboutOpen">
                <TxCollapseItem :title="copy.aboutTitle" name="about">
                  {{ copy.aboutBody }}
                </TxCollapseItem>
                <TxCollapseItem :title="copy.installTitle" name="install">
                  {{ copy.installBody }}
                </TxCollapseItem>
              </TxCollapse>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('radio')">
          {{ cellLabel('Radio', '单选') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxRadioGroup v-model="period" type="button">
                <TxRadio
                  v-for="option in copy.periods"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                />
              </TxRadioGroup>
              <TxRadioGroup v-model="periodStd" type="standard" direction="row">
                <TxRadio
                  v-for="option in copy.periods.slice(0, 2)"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                  type="standard"
                />
              </TxRadioGroup>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('rating')">
          {{ cellLabel('Rating', '评分') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxRating v-model="rating" />
              <TxRating :model-value="3.5" :precision="0.5" readonly />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tag')">
          {{ cellLabel('Tag', '标签') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxTag
                v-for="tag in copy.tags"
                :key="tag.label"
                :label="tag.label"
                :color="tag.color"
              />
              <TxTag :label="copy.closableTag" closable />
              <TxTag label="+3" variant="plain" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('badge')">
          {{ cellLabel('Badge', '徽标') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxBadge variant="error" :value="3" />
              <TxBadge variant="primary" value="PRO" />
              <TxBadge variant="success" dot />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('avatar')">
          {{ cellLabel('Avatar', '头像') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxAvatarGroup :max="3">
                <TxAvatar v-for="name in avatarNames" :key="name" :name="name" />
              </TxAvatarGroup>
              <div class="docs-gallery__row">
                <TxAvatar name="Talex" status="online" />
                <TxAvatar name="Kiri" shape="rounded" />
                <TxAvatar icon="user" shape="square" />
              </div>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('steps')">
          {{ cellLabel('Steps', '步骤条') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxSteps :active="1" size="small">
              <TxStep
                v-for="(title, index) in copy.steps"
                :key="title"
                :step="index"
                :title="title"
              />
            </TxSteps>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('pagination')">
          {{ cellLabel('Pagination', '分页') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxPagination v-model:current-page="page" :total-pages="5" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('skeleton')">
          {{ cellLabel('Skeleton', '骨架屏') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <div class="docs-gallery__row">
                <TxSkeleton loading variant="circle" :width="32" :height="32" />
                <div class="docs-gallery__grow">
                  <TxSkeleton loading :lines="2" width="100%" />
                </div>
              </div>
              <TxSkeleton loading :lines="2" width="100%" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('divider')">
          {{ cellLabel('Divider', '分割线') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TxDivider />
              <TxDivider text-placement="left">
                {{ copy.dividerSection }}
              </TxDivider>
              <TxDivider dashed />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('icon')">
          {{ cellLabel('Icon', '图标') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxStatusIcon name="i-carbon-cloud-upload" :size="24" tone="info" />
              <TxStatusIcon name="i-carbon-checkmark" :size="24" tone="success" />
              <TxStatusIcon name="i-carbon-warning" :size="24" tone="warning" />
              <TxStatusIcon name="i-carbon-close" :size="24" tone="error" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('icon-chip')">
          {{ cellLabel('IconChip', '图标徽标') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxIconChip :size="14" tone="red" label="PDF" />
              <TxIconChip :size="14" tone="green" label="CSV" />
              <TxIconChip :size="14" tone="accent" label="DOC" />
              <TxIconChip :size="14" tone="neutral" variant="soft" label="TXT" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('kbd')">
          {{ cellLabel('Kbd', '按键') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxKbd tone="primary">
                ⌘
              </TxKbd>
              <TxKbd tone="primary">
                K
              </TxKbd>
              <TxKbd>⇧</TxKbd>
              <TxKbd>Esc</TxKbd>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('avatar-variants')">
          {{ cellLabel('AvatarVariants', '头像变体') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxCornerOverlay
                v-for="variant in avatarVariants"
                :key="variant.name"
                placement="bottom-right"
                :offset-x="-2"
                :offset-y="-2"
              >
                <TxAvatar :name="variant.name" :shape="variant.shape" />
                <template #overlay>
                  <span class="docs-gallery__dot" :style="{ background: variant.tone }" />
                </template>
              </TxCornerOverlay>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('cascader')">
          {{ cellLabel('Cascader', '级联选择') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxCascader v-model="cascaderValue" :options="cascaderOptions" :placeholder="copy.selectChannel" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('date-picker')">
          {{ cellLabel('DatePicker', '日期选择') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxDatePicker v-model="dateValue" variant="field" :popup="false" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('file-uploader')">
          {{ cellLabel('FileUploader', '文件上传') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxFileUploader v-model="uploadFiles" accept=".pdf,.png" :max="3" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('flat-input')">
          {{ cellLabel('FlatInput', '扁平输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxFlatInput v-model="flatInputValue" :placeholder="copy.typeSomething" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('flat-radio')">
          {{ cellLabel('FlatRadio', '扁平单选') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxFlatRadio v-model="flatRadioValue">
              <TxFlatRadioItem value="light" label="Light" />
              <TxFlatRadioItem value="dark" label="Dark" />
              <TxFlatRadioItem value="auto" label="Auto" />
            </TxFlatRadio>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('flat-select')">
          {{ cellLabel('FlatSelect', '扁平选择') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxFlatSelect v-model="flatSelectValue">
                <TxFlatSelectItem value="json" label="JSON" />
                <TxFlatSelectItem value="csv" label="CSV" />
                <TxFlatSelectItem value="xml" label="XML" />
              </TxFlatSelect>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('form')">
          {{ cellLabel('Form', '表单') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxForm :model="formModel" label-width="64px">
                <TxFormItem :label="copy.formName" prop="name">
                  <TuffInput v-model="formModel.name" :placeholder="copy.typeSomething" />
                </TxFormItem>
                <TxFormItem :label="copy.formEmail" prop="email">
                  <TuffInput v-model="formModel.email" placeholder="you@talex.cc" />
                </TxFormItem>
              </TxForm>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('image-uploader')">
          {{ cellLabel('ImageUploader', '图片上传') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxImageUploader v-model="uploadImages" :max="3" accept="image/png,image/jpeg" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('number-input')">
          {{ cellLabel('NumberInput', '数字输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxNumberInput v-model="numberValue" :min="0" :max="100" :step="5" :precision="0" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('picker')">
          {{ cellLabel('Picker', '滚动选择') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <!-- Toolbar off: with no popup to confirm into, Cancel/Confirm are
                   dead controls that only make this cell taller than its row. -->
              <TxPicker
                v-model="pickerValue"
                :columns="pickerColumns"
                :popup="false"
                :show-toolbar="false"
                :visible-item-count="3"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('scrub-field')">
          {{ cellLabel('ScrubField', '拖拽数值') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxScrubField v-model="scrubWidth" label="W" :min="40" :max="999" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('search-input')">
          {{ cellLabel('SearchInput', '搜索输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSearchInput v-model="searchText" :placeholder="copy.searchPlugins" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('search-select')">
          {{ cellLabel('SearchSelect', '搜索选择') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSearchSelect v-model="searchSelectValue" :options="searchSelectOptions" :placeholder="copy.searchPlugins" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('segmented-slider')">
          {{ cellLabel('SegmentedSlider', '分段滑块') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSegmentedSlider v-model="segmentValue" :segments="segments" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tag-input')">
          {{ cellLabel('TagInput', '标签输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxTagInput v-model="tagValues" :placeholder="copy.typeSomething" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('textarea')">
          {{ cellLabel('Textarea', '多行输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxTextarea v-model="textareaValue" :placeholder="copy.typeSomething" :max-length="120" show-count />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tree-select')">
          {{ cellLabel('TreeSelect', '树选择') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxTreeSelect v-model="treeSelectValue" :nodes="treeSelectNodes" :placeholder="copy.selectChannel" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('card')">
          {{ cellLabel('Card', '卡片') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxCard :padding="14" :radius="14">
                <strong>{{ copy.aboutTitle }}</strong>
                <p class="docs-gallery__muted">
                  {{ copy.aboutBody }}
                </p>
              </TxCard>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('card-item')">
          {{ cellLabel('CardItem', '卡片条目') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TxCardItem title="Clipboard" subtitle="com.talex.clipboard" avatar-text="C" />
              <TxCardItem title="Browser" subtitle="com.talex.browser" avatar-text="B" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('container')">
          {{ cellLabel('Container', '容器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxContainer>
                <TxRow :gutter="8">
                  <TxCol :span="12">
                    <div class="docs-gallery__tile">
                      12
                    </div>
                  </TxCol>
                  <TxCol :span="12">
                    <div class="docs-gallery__tile">
                      12
                    </div>
                  </TxCol>
                  <TxCol :span="8">
                    <div class="docs-gallery__tile">
                      8
                    </div>
                  </TxCol>
                  <TxCol :span="16">
                    <div class="docs-gallery__tile">
                      16
                    </div>
                  </TxCol>
                </TxRow>
              </TxContainer>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('flex')">
          {{ cellLabel('Flex', '弹性布局') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxFlex :gap="8" wrap="wrap">
                <div v-for="tile in layoutTiles" :key="tile" class="docs-gallery__tile">
                  {{ tile }}
                </div>
              </TxFlex>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('grid')">
          {{ cellLabel('Grid', '栅格') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxGrid :cols="3" :gap="8">
                <TxGridItem v-for="tile in layoutTiles" :key="tile">
                  <div class="docs-gallery__tile">
                    {{ tile }}
                  </div>
                </TxGridItem>
              </TxGrid>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('grid-layout')">
          {{ cellLabel('GridLayout', '网格布局') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxGridLayout>
                <div v-for="tile in layoutTiles" :key="tile" class="tx-grid-layout__item docs-gallery__tile">
                  {{ tile }}
                </div>
              </TxGridLayout>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('group-block')">
          {{ cellLabel('GroupBlock', '设置分组') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxGroupBlock :name="copy.dividerSection">
                <TxBlockSwitch v-model="blockSwitch" :title="copy.autoSync" :description="copy.installBody" />
                <TxBlockLine />
                <TxBlockInput v-model="flatInputValue" :title="copy.formName" :placeholder="copy.typeSomething" />
              </TxGroupBlock>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('scroll')">
          {{ cellLabel('Scroll', '滚动容器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxScroll class="docs-gallery__scroll">
                <div v-for="tile in [1, 2, 3, 4, 5, 6, 7, 8]" :key="tile" class="docs-gallery__scroll-row">
                  {{ copy.dividerSection }} {{ tile }}
                </div>
              </TxScroll>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('splitter')">
          {{ cellLabel('Splitter', '分栏') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__splitter">
              <TxSplitter v-model="splitRatio" :min="0.25" :max="0.75">
                <template #a>
                  <div class="docs-gallery__tile docs-gallery__tile--fill">
                    A
                  </div>
                </template>
                <template #b>
                  <div class="docs-gallery__tile docs-gallery__tile--fill">
                    B
                  </div>
                </template>
              </TxSplitter>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('stack')">
          {{ cellLabel('Stack', '堆叠') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxStack direction="vertical" :gap="8">
                <div v-for="tile in [1, 2, 3]" :key="tile" class="docs-gallery__tile">
                  {{ tile }}
                </div>
              </TxStack>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('breadcrumb')">
          {{ cellLabel('Breadcrumb', '面包屑') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxBreadcrumb :items="breadcrumbItems" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('context-menu')">
          {{ cellLabel('ContextMenu', '右键菜单') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxContextMenu>
              <template #default>
                <div class="docs-gallery__tile docs-gallery__context-target">
                  {{ copy.contextHint }}
                </div>
              </template>
              <template #menu>
                <TxDropdownItem>{{ copy.newPlugin }}</TxDropdownItem>
                <TxDropdownItem>{{ copy.importWorkflow }}</TxDropdownItem>
              </template>
            </TxContextMenu>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('flat-dropdown')">
          {{ cellLabel('FlatDropdown', '扁平下拉') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxFlatDropdown trigger="hover" placement="bottom-start" :offset="10" close-on-content-click>
              <template #trigger="{ open }">
                <TxButton size="sm" :variant="open ? 'primary' : 'secondary'">
                  {{ copy.add }}
                </TxButton>
              </template>
              <TxFlatSelectItem value="new" :label="copy.newPlugin" />
              <TxFlatSelectItem value="import" :label="copy.importWorkflow" />
            </TxFlatDropdown>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('nav-bar')">
          {{ cellLabel('NavBar', '导航栏') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__framed">
              <TxNavBar :title="copy.suiteBase" show-back />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('sidebar-nav')">
          {{ cellLabel('SidebarNav', '侧边导航') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxSidebarNav v-model="navTab" :items="tabBarItems" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tab-bar')">
          {{ cellLabel('TabBar', '标签栏') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__framed">
              <TxTabBar v-model="navTab" :items="tabBarItems" :fixed="false" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tabs')">
          {{ cellLabel('Tabs', '标签页') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__tabs">
              <TxTabs v-model="tabsActive">
                <!-- `:activation="true"`, not the `activation` shorthand: TxTabs
                     picks the initial tab off the raw vnode props, where the
                     shorthand is the empty string and reads as false. -->
                <TxTabItem :name="copy.suiteBase" icon-class="i-carbon-settings" :activation="true">
                  <p class="docs-gallery__muted">
                    {{ copy.aboutBody }}
                  </p>
                </TxTabItem>
                <TxTabItem :name="copy.suitePro" icon-class="i-carbon-rocket">
                  <p class="docs-gallery__muted">
                    {{ copy.installBody }}
                  </p>
                </TxTabItem>
              </TxTabs>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('alert')">
          {{ cellLabel('Alert', '警示') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TxAlert :title="copy.online" :message="copy.aboutBody" type="success" />
              <TxAlert :title="copy.failed" :message="copy.dialogMessage" type="error" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('drawer')">
          {{ cellLabel('Drawer', '抽屉') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxButton @click="drawerOpen = true">
              {{ copy.dividerSection }}
            </TxButton>
            <TxDrawer v-model:visible="drawerOpen" :title="copy.aboutTitle">
              <p class="docs-gallery__muted">
                {{ copy.aboutBody }}
              </p>
            </TxDrawer>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('loading-overlay')">
          {{ cellLabel('LoadingOverlay', '加载遮罩') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxLoadingOverlay :loading="overlayLoading" :text="copy.working">
                <div class="docs-gallery__tile docs-gallery__overlay-body">
                  {{ copy.aboutBody }}
                </div>
              </TxLoadingOverlay>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('modal')">
          {{ cellLabel('Modal', '模态框') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxButton variant="primary" @click="modalOpen = true">
              {{ copy.aboutTitle }}
            </TxButton>
            <TxModal v-model="modalOpen" :title="copy.aboutTitle" width="min(92vw, 420px)">
              <p class="docs-gallery__muted">
                {{ copy.aboutBody }}
              </p>
            </TxModal>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('popover')">
          {{ cellLabel('Popover', '气泡卡片') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxPopover v-model="popoverOpen" trigger="click">
              <template #reference>
                <TxButton>{{ copy.installTitle }}</TxButton>
              </template>
              <p class="docs-gallery__muted docs-gallery__popover-body">
                {{ copy.installBody }}
              </p>
            </TxPopover>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('progress')">
          {{ cellLabel('Progress', '进度') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TuffProgress :percentage="60" />
              <TuffProgress :percentage="92" status="success" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('selection-actions')">
          {{ cellLabel('SelectionActions', '选区操作') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <!-- The bar has no resting form: it anchors to a live text
                 selection, so the specimen is the passage you select in. -->
            <div ref="selectionRootRef" class="docs-gallery__block">
              <p class="docs-gallery__muted">
                {{ copy.selectionHint }}
              </p>
              <TxSelectionActions :selection="selectionPayload" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('spinner')">
          {{ cellLabel('Spinner', '加载指示') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxSpinner />
              <TxSpinner :size="28" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('toast')">
          {{ cellLabel('Toast', '轻提示') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxButton @click="fireToast">
              {{ copy.confirm }}
            </TxButton>
            <TxToastHost />
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
        <div class="docs-gallery__stage">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('data-table')">
          {{ cellLabel('DataTable', '数据表') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxDataTable :columns="tableColumns" :data="tableRows" row-key="id" hover />
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
        <div class="docs-gallery__stage">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('filter-chips')">
          {{ cellLabel('FilterChips', '筛选标签') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxFilterChips v-model="filterChip" :items="filterChipItems" />
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxImageGallery :items="galleryItems" />
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxMarkdownView :content="markdownSample" />
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSortableList v-model="sortableItems">
                <template #item="{ item }">
                  <div class="docs-gallery__scroll-row">
                    {{ item.label }}
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
        <NuxtLink class="docs-gallery__label" :to="docPath('stat-card')">
          {{ cellLabel('StatCard', '指标卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxStatCard
                :value="1284"
                :label="copy.online"
                icon-class="i-carbon-analytics"
                :insight="{ from: 1100, to: 1284, type: 'percent' }"
              />
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
        <div class="docs-gallery__stage">
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxTransfer v-model="transferValue" :data="transferData" />
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxTree :nodes="treeNodes" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section v-for="state in statusStates" :key="state.slug" class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath(state.slug)">
          {{ cellLabel(state.en, state.zh) }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <component :is="state.is" :title="state.en" :description="copy.aboutBody" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-pro" class="docs-gallery__suite" :aria-label="copy.suitePro">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'pro' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('pro')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('version-capsule')">
          {{ cellLabel('VersionCapsule', '版本胶囊') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxVersionCapsule :version="`v${tuffexPkg.version}`" channel="BETA" tone="preview" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('glow-text')">
          {{ cellLabel('GlowText', '扫光') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxGlowText class="docs-gallery__glow" tag="span">
              Tuffex
            </TxGlowText>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('border-beam')">
          {{ cellLabel('BorderBeam', '流光边框') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxBorderBeam size="md" color-variant="ocean" theme="auto">
              <div class="docs-gallery__beam-card">
                @talex-touch/tuffex
              </div>
            </TxBorderBeam>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('code-editor')">
          {{ cellLabel('CodeEditor', '代码编辑器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__code">
              <TxCodeEditor :model-value="codeSample" language="javascript" read-only line-numbers />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('command-palette')">
          {{ cellLabel('CommandPalette', '命令面板') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxButton icon="i-carbon-search" @click="paletteOpen = true">
              ⌘K
            </TxButton>
            <TxCommandPalette v-model="paletteOpen" :commands="paletteItems" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('markdown-editor')">
          {{ cellLabel('MarkdownEditor', 'Markdown 编辑器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__code">
              <TxMarkdownEditor v-model="markdownDraft" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('search-panel')">
          {{ cellLabel('SearchPanel', '搜索面板') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSearchPanel v-model="searchPanelValue" :items="searchPanelItems" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('virtual-list')">
          {{ cellLabel('VirtualList', '虚拟列表') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxVirtualList :items="virtualRows" :item-height="32" :height="104" item-key="id">
                <template #item="{ item }">
                  <div class="docs-gallery__scroll-row">
                    {{ item.label }}
                  </div>
                </template>
              </TxVirtualList>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('corner-overlay')">
          {{ cellLabel('CornerOverlay', '角标叠层') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-4">
              <TxAvatar name="Talex" shape="rounded" />
              <template #overlay>
                <TxBadge :value="3" />
              </template>
            </TxCornerOverlay>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('edge-fade-mask')">
          {{ cellLabel('EdgeFadeMask', '边缘渐隐') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxEdgeFadeMask axis="horizontal" :size="32">
                <div class="docs-gallery__fade-row">
                  <div v-for="tileIndex in 10" :key="tileIndex" class="docs-gallery__tile">
                    {{ tileIndex }}
                  </div>
                </div>
              </TxEdgeFadeMask>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('flip-overlay')">
          {{ cellLabel('FlipOverlay', '翻转叠层') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxButton ref="flipTriggerRef" @click="flipped = true">
              {{ copy.aboutTitle }}
            </TxButton>
            <TxFlipOverlay
              v-model="flipped"
              :source="flipTriggerEl"
              :header-title="copy.aboutTitle"
            >
              <p class="docs-gallery__muted docs-gallery__flip-body">
                {{ copy.aboutBody }}
              </p>
            </TxFlipOverlay>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('fusion')">
          {{ cellLabel('Fusion', '融合') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxFusion v-model="fusionOpen" trigger="hover">
              <template #a>
                <TxButton circle icon="i-carbon-add" />
              </template>
              <template #b>
                <TxButton circle icon="i-carbon-edit" />
              </template>
            </TxFusion>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('glass-surface')">
          {{ cellLabel('GlassSurface', '玻璃表面') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxGlassSurface>
                <div class="docs-gallery__tile docs-gallery__overlay-body">
                  {{ copy.aboutTitle }}
                </div>
              </TxGlassSurface>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('gradient-border')">
          {{ cellLabel('GradientBorder', '渐变描边') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxGradientBorder :padding="14" border-radius="14px">
                <strong>{{ copy.aboutTitle }}</strong>
              </TxGradientBorder>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('gradual-blur')">
          {{ cellLabel('GradualBlur', '渐进模糊') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__blur-stage">
              <div class="docs-gallery__fade-row">
                <div v-for="tileIndex in 8" :key="tileIndex" class="docs-gallery__tile">
                  {{ tileIndex }}
                </div>
              </div>
              <TxGradualBlur position="bottom" :strength="2" height="40%" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('keyframe-stroke-text')">
          {{ cellLabel('KeyframeStrokeText', '描边文字') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxKeyframeStrokeText text="Tuffex" :font-size="34" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('liquid')">
          {{ cellLabel('Liquid', '液态') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxLiquid>
              <TxLiquidItem v-for="tileIndex in 3" :key="tileIndex">
                <div class="docs-gallery__tile">
                  {{ tileIndex }}
                </div>
              </TxLiquidItem>
            </TxLiquid>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('outline-border')">
          {{ cellLabel('OutlineBorder', '描边边框') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxOutlineBorder border-radius="14px">
                <div class="docs-gallery__tile docs-gallery__overlay-body">
                  {{ copy.installTitle }}
                </div>
              </TxOutlineBorder>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('stagger')">
          {{ cellLabel('Stagger', '错峰入场') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxStagger appear :delay-step="80">
              <div v-for="tileIndex in 3" :key="tileIndex" class="docs-gallery__tile">
                {{ tileIndex }}
              </div>
            </TxStagger>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('text-transformer')">
          {{ cellLabel('TextTransformer', '文字变换') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxTextTransformer :text="switchOn ? copy.online : copy.failed" />
              <TuffSwitch v-model="switchOn" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('transition')">
          {{ cellLabel('Transition', '过渡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxTransitionFade>
                <div v-if="switchOn" class="docs-gallery__tile">
                  {{ copy.online }}
                </div>
              </TxTransitionFade>
              <TuffSwitch v-model="switchOn" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tuff-logo-stroke')">
          {{ cellLabel('TuffLogoStroke', 'Logo 描边') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxTuffLogoStroke :size="72" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('auto-sizer')">
          {{ cellLabel('AutoSizer', '尺寸感知') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__autosizer">
              <TxAutoSizer ref="autoSizerRef">
                <div class="docs-gallery__tile docs-gallery__overlay-body">
                  {{ autoSizerLabel }}
                </div>
              </TxAutoSizer>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('base-anchor')">
          {{ cellLabel('BaseAnchor', '锚点基座') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxTooltip :content="copy.aboutTitle" trigger="click">
              <TxButton>{{ copy.dividerSection }}</TxButton>
            </TxTooltip>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('base-surface')">
          {{ cellLabel('BaseSurface', '表面基座') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxBaseSurface preset="card" background="refraction">
                <div class="docs-gallery__tile docs-gallery__overlay-body">
                  {{ copy.aboutTitle }}
                </div>
              </TxBaseSurface>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('floating')">
          {{ cellLabel('Floating', '浮动') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxFloating>
              <TxButton circle icon="i-carbon-add" />
            </TxFloating>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('resize-box')">
          {{ cellLabel('ResizeBox', '尺寸过渡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxResizeBox :width="resizeWide ? 200 : 110">
                <div class="docs-gallery__tile docs-gallery__overlay-body">
                  {{ resizeWide ? 200 : 110 }}px
                </div>
              </TxResizeBox>
              <TuffSwitch v-model="resizeWide" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-ai" class="docs-gallery__suite" :aria-label="copy.suiteAi">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'ai' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('ai')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('thinking-orb')">
          {{ cellLabel('ThinkingOrb', '思考指示球') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row docs-gallery__row--loose">
              <TxThinkingOrb
                v-for="state in orbStates"
                :key="state"
                :state="state"
                :size="20"
                :display-size="36"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('working-indicator')">
          {{ cellLabel('WorkingIndicator', '工作指示器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxWorkingIndicator :label="copy.working" variant="drive" />
              <TxWorkingIndicator :label="copy.searching" variant="orbit" :show-elapsed="false" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('typing-indicator')">
          {{ cellLabel('TypingIndicator', '打字中') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row docs-gallery__row--loose">
              <TxTypingIndicator variant="dots" :text="copy.typing" />
              <TxTypingIndicator variant="ring" :show-text="false" :aria-label="copy.typing" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('suggestion-chips')">
          {{ cellLabel('SuggestionChips', '建议胶囊') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSuggestionChips :suggestions="copy.suggestions" layout="list" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tool-chips')">
          {{ cellLabel('ToolChips', '工具调用流') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__block--wide">
              <TxToolChips
                :rows="copy.toolRows"
                :diffs="[{ file: 'index.ts', add: 12, del: 3 }]"
                :summary="copy.toolSummary"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('inline-citation')">
          {{ cellLabel('InlineCitation', '行内引用') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxInlineCitation
                v-for="source in citeSources"
                :key="source.id"
                :source="source"
                :appear="false"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('attachment-tray')">
          {{ cellLabel('AttachmentTray', '附件托盘') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAttachmentTray :attachments="aiAttachments" removable />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('chat')">
          {{ cellLabel('Chat', '对话') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChatList :messages="chatListMessages" markdown />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('chat-composer')">
          {{ cellLabel('ChatComposer', '对话输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChatComposer v-model="chatDraft" :min-rows="1" :max-rows="3" :placeholder="copy.typeSomething" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('conversation-stream')">
          {{ cellLabel('ConversationStream', '对话流') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stream">
              <TxConversationStream :items="chatMessages" :item-key="(item: AiElementMessage) => item.id">
                <template #item="{ item }">
                  <p class="docs-gallery__muted">
                    {{ item.content }}
                  </p>
                </template>
              </TxConversationStream>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('message-actions')">
          {{ cellLabel('MessageActions', '消息操作') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxMessageActions :copy-text="copy.installBody" regenerable />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('prompt-bar')">
          {{ cellLabel('PromptBar', '提示栏') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxPromptBar v-model="promptDraft" :placeholder="copy.typeSomething" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('agent-trace')">
          {{ cellLabel('AgentTrace', '智能体轨迹') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAgentTrace :rows="traceRows" working default-open />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('agents')">
          {{ cellLabel('Agents', '智能体列表') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAgentsList :agents="aiAgents" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('approval-card')">
          {{ cellLabel('ApprovalCard', '审批卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxApprovalCard
                :title="copy.dialogTitle"
                :questions="[{
                  id: 'confirm',
                  question: copy.dialogMessage,
                  options: [{ value: 'yes', label: copy.confirm }, { value: 'no', label: copy.delete }],
                }]"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('task-rows')">
          {{ cellLabel('TaskRows', '任务行') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxTaskRows :rows="taskRowItems" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tool-call-card')">
          {{ cellLabel('ToolCallCard', '工具调用卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxToolCallCard :tool-call="toolCall" default-expanded />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tool-confirmation')">
          {{ cellLabel('ToolConfirmation', '工具确认') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxToolConfirmation
                tool-name="write_file"
                risk="write"
                :summary="copy.dialogMessage"
                :input="toolConfirmationInput"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('ai-elements')">
          {{ cellLabel('AiElements', 'AI 元件') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAiMessage :message="aiSampleMessage" :show-avatar="false" compact />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('chain-of-thought')">
          {{ cellLabel('ChainOfThought', '思维链') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChainOfThought :steps="cotSteps" default-open />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('code-stream')">
          {{ cellLabel('CodeStream', '代码流') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__code">
              <TxCodeStream :code="codeSample" lang="ts" filename="greet.ts" lang-label="TypeScript" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('reasoning-disclosure')">
          {{ cellLabel('ReasoningDisclosure', '推理折叠') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxReasoningDisclosure :text="copy.aboutBody" :duration-ms="2400" default-open />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('sources')">
          {{ cellLabel('Sources', '来源') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSources :sources="aiSources" variant="stack" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('stream-markdown')">
          {{ cellLabel('StreamMarkdown', '流式 Markdown') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxStreamMarkdown :content="markdownSample" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('context-cards')">
          {{ cellLabel('ContextCards', '上下文卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxContextCards :chunks="contextChunks" :total="32" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('context-indicator')">
          {{ cellLabel('ContextIndicator', '上下文用量') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxContextIndicator :used-tokens="48000" :max-tokens="128000" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('fine-tune-card')">
          {{ cellLabel('FineTuneCard', '微调卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxFineTuneCard :values="fineTuneValues" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('insight-cards')">
          {{ cellLabel('InsightCards', '洞察卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxInsightCards :pages="insightPages" :title="copy.suiteAi" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('recommendation-card')">
          {{ cellLabel('RecommendationCard', '推荐卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxRecommendationCard :title="copy.aboutTitle" :options="recommendationOptions" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-data" class="docs-gallery__suite" :aria-label="copy.suiteData">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'data' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('data')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('spark-chart')">
          {{ cellLabel('SparkChart', '迷你折线图') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__spark">
              <TxSparkChart :series="sparkSeries" grid />
            </div>
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAllocationBar :segments="copy.allocation" />
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
        <div class="docs-gallery__stage">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('chart-colors')">
          {{ cellLabel('ChartColors', '图表配色') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <span
                v-for="index in 6"
                :key="index"
                class="docs-gallery__swatch"
                :style="{ background: ChartPalette.categoricalVar(index - 1) }"
              />
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack">
              <TxChartLegendItem name="Installs" :color="ChartPalette.categoricalVar(0)" value="4,820" />
              <TxChartLegendItem name="Errors" :color="ChartPalette.categoricalVar(2)" value="87" />
            </div>
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChart :height="150" :padding="8">
                <TxArcSeries :data="donutSlices" value="count" name="label" :inner-radius="0.65" />
              </TxChart>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('maps')">
          {{ cellLabel('Maps', '地图') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChoroplethMap :geo-json="miniGeoJson" :data="miniGeoData" name="country" value="share" :height="140" />
            </div>
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSankeyChart :nodes="sankeyNodes" :links="sankeyLinks" :height="150" />
            </div>
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxTimeseriesChart type="bar" :data="timeseriesData" :height="150" />
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
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxDiffTable :columns="diffColumns" :rows="diffRows" play="auto" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>
  </div>
</template>
