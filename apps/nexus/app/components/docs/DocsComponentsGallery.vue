<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Component } from 'vue'
import './DocsComponentsGallery.css'
import {
  ChartPalette,
  TxArcSeries,
  TxChart,
  TxChartLegendItem,
  TxChartTooltip,
  TxChoroplethMap,
  TxEChart,
  TxSankeyChart,
  TxTimeseriesChart,
} from '@talex-touch/tuffex/charts'
import type { EChartsOption } from 'echarts'
import { MINI_WORLD_GEO } from './mini-world-geo'
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
// Every `<ClientOnly>` below is this wrapper, not Nuxt's: each one sits directly
// in a cell's stage, and the wrapper adds the reset button that remounts the
// specimen so its entrance can be watched again.
import ClientOnly from './DocsGallerySpecimen.vue'
import GalleryEdgeMarquee from './gallery/GalleryEdgeMarquee.vue'
import GalleryFusion from './gallery/GalleryFusion.vue'
import GalleryFusionSurface from './gallery/GalleryFusionSurface.vue'
import GalleryLiquidMenu from './gallery/GalleryLiquidMenu.vue'
import GalleryTextMorph from './gallery/GalleryTextMorph.vue'
import GalleryTransitionLanes from './gallery/GalleryTransitionLanes.vue'
import GalleryVirtualList from './gallery/GalleryVirtualList.vue'

// One band per render: every suite has its own overview page, so the gallery
// only ever shows that page's suite. There is no cross-suite hub grid.
const props = defineProps<{ suite: 'base' | 'pro' | 'ai' | 'data' | 'flow' }>()

const { locale } = useI18n()

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
      autoSyncDesc: '有新版本时自动拉取插件更新',
      resetAlerts: '恢复已关闭的警示',
      partial: '部分选中',
      syncing: '同步中',
      dividerSection: '分组',
      formName: '名称',
      formEmail: '邮箱',
      contextHint: '右键此处',
      selectionHint: '选中这段文字试试。',
      toastSaved: '已保存',
      toastSavedBody: '草稿已同步到云端。',
      toastStack: '堆三条',
      toastUndo: '撤销',
      toastDeleted: '已删除 1 项',
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
        { key: 'stable', label: '稳定版', percent: 56, description: '面向所有用户的默认通道' },
        { key: 'beta', label: '测试版', percent: 30, description: '提前体验新特性' },
        { key: 'snapshot', label: '快照版', percent: 14, description: '主分支的每夜构建' },
      ],
      confidence: [
        { value: 1, label: '低', tone: 'var(--tx-color-danger)' },
        { value: 2, label: '中', tone: 'var(--tx-color-warning)' },
        { value: 3, label: '高', tone: 'var(--tx-color-success)' },
      ],
      screenCursor: '正在打开「照片」',
      screenAria: '智能体屏幕',
      flowAria: '订单工作流',
      flowNodes: {
        trigger: { label: '触发', title: '新订单创建', detail: '有新订单时触发' },
        branch: { label: '条件', title: '口味是 Rocky Road', detail: '否则按默认规则补货' },
      },
      working: '处理中',
      searching: '检索中',
      typing: '正在输入…',
      composerTray: '上下文',
      connectApps: '连接应用',
      selectProject: '选择项目',
      requestApproval: '请求批准',
      unrestricted: '无限制访问',
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
      edit: '编辑',
      releaseNotes: '发布说明',
      virtualTitle: '插件目录',
      virtualCount: (rendered: number, total: string) => `DOM 中 ${rendered} / ${total} 行`,
      liquidToggle: '展开菜单',
      liquidItems: ['收藏', '夜间模式', '音乐'] as [string, string, string],
      syncStages: ['连接中', '已连接', '同步 12 个文件', '同步 148 个文件', '已是最新'],
      next: '下一步',
      hoverMe: '悬停',
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
      autoSyncDesc: 'Pull plugin updates as they are released',
      resetAlerts: 'Restore the dismissed alerts',
      partial: 'Partial',
      syncing: 'Syncing',
      dividerSection: 'Section',
      formName: 'Name',
      formEmail: 'Email',
      contextHint: 'Right-click here',
      selectionHint: 'Select this text to see the actions.',
      toastSaved: 'Saved',
      toastSavedBody: 'Your draft is synced to the cloud.',
      toastStack: 'Stack 3',
      toastUndo: 'Undo',
      toastDeleted: 'Deleted 1 item',
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
        { key: 'stable', label: 'Stable', percent: 56, description: 'Default channel for everyone' },
        { key: 'beta', label: 'Beta', percent: 30, description: 'Early access to new features' },
        { key: 'snapshot', label: 'Snapshot', percent: 14, description: 'Nightly builds off main' },
      ],
      confidence: [
        { value: 1, label: 'Low', tone: 'var(--tx-color-danger)' },
        { value: 2, label: 'Mid', tone: 'var(--tx-color-warning)' },
        { value: 3, label: 'High', tone: 'var(--tx-color-success)' },
      ],
      screenCursor: 'Opening Photos',
      screenAria: 'Agent screen',
      flowAria: 'Order workflow',
      flowNodes: {
        trigger: { label: 'Trigger', title: 'New order created', detail: 'Runs when a new order arrives' },
        branch: { label: 'If / Else', title: 'Flavor is Rocky Road', detail: 'Otherwise restock by the default rule' },
      },
      working: 'Working',
      searching: 'Searching',
      typing: 'Typing…',
      composerTray: 'Context',
      connectApps: 'Connect apps',
      selectProject: 'Select a project',
      requestApproval: 'Request approval',
      unrestricted: 'Unrestricted access',
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
      edit: 'Edit',
      releaseNotes: 'Release notes',
      virtualTitle: 'Plugin registry',
      virtualCount: (rendered: number, total: string) => `${rendered} / ${total} rows in the DOM`,
      liquidToggle: 'Toggle menu',
      liquidItems: ['Favorite', 'Night mode', 'Music'] as [string, string, string],
      syncStages: ['Connecting', 'Connected', 'Syncing 12 files', 'Syncing 148 files', 'Up to date'],
      next: 'Next',
      hoverMe: 'hover me',
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

/*
 * ProgressBar specimen. A pinned percentage is a screenshot of a progress bar,
 * not a progress bar: the fill never eases, the tip glow never travels and the
 * shimmer has nothing to run over. The determinate bar walks a short loop
 * instead. Wrapping remounts it through `progressCycle`, because a fresh
 * element starts at its width rather than easing all the way back down — the
 * loop must never play in reverse.
 */
const PROGRESS_STEPS = [8, 26, 44, 63, 81, 94, 100]
const progressStep = ref(0)
const progressCycle = ref(0)
const progressPercent = computed(() => PROGRESS_STEPS[progressStep.value] ?? 0)
const progressDetail = computed(() => `${(progressPercent.value * 0.024).toFixed(1)} MB / 2.4 MB`)
const progressSegments = computed(() => [
  { value: 56, color: 'var(--tx-color-success)', label: copy.value.channels[0]?.label },
  { value: 30, color: 'var(--tx-color-primary)', label: copy.value.channels[1]?.label },
  { value: 14, color: 'var(--tx-color-warning)', label: copy.value.channels[2]?.label },
])
let progressTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // A bar that never settles is exactly what reduced motion asks us not to
  // ship, so those viewers get one mid-run frame and no timer.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    progressStep.value = 3
    return
  }

  progressTimer = setInterval(() => {
    const next = progressStep.value + 1
    if (next >= PROGRESS_STEPS.length) {
      progressStep.value = 0
      progressCycle.value += 1
    }
    else {
      progressStep.value = next
    }
  }, 1000)
})

onBeforeUnmount(() => {
  if (progressTimer)
    clearInterval(progressTimer)
})

/* IconChip specimen: the full tone ramp in both variants, so the cell shows
   what the tone/variant pair does rather than four chips of one kind. */
const iconChipTones = [
  { tone: 'red' as const, label: 'PDF' },
  { tone: 'orange' as const, label: 'ZIP' },
  { tone: 'green' as const, label: 'CSV' },
  { tone: 'accent' as const, label: 'DOC' },
  { tone: 'ink' as const, label: 'TS' },
  { tone: 'neutral' as const, label: 'TXT' },
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
const flatRadioViewValue = ref('grid')
const flatRadioAlertValues = ref(['mention', 'reply'])

// The Alert specimen is dismissible, so the cell needs a way back — otherwise a
// visitor who tries the close button is left with an empty cell for the rest of
// the session.
const alertsVisible = reactive({ success: true, error: true })
const alertsDismissed = computed(() =>
  Number(!alertsVisible.success) + Number(!alertsVisible.error))

function resetAlerts(): void {
  alertsVisible.success = true
  alertsVisible.error = true
}
const flatSelectValue = ref('json')
const flatInputValue = ref('')
const numberValue = ref(60)
const pickerValue = ref<(string | number)[]>(['beta'])
// A drum needs rows above and below the centre to actually read as one; three
// options only ever showed a flat, full list.
const pickerColumns = [{
  key: 'channel',
  options: [
    { value: 'stable', label: 'Stable' },
    { value: 'beta', label: 'Beta' },
    { value: 'snapshot', label: 'Snapshot' },
    { value: 'nightly', label: 'Nightly' },
    { value: 'canary', label: 'Canary' },
    { value: 'lts', label: 'LTS' },
    { value: 'edge', label: 'Edge' },
  ],
}]
const scrubWidth = ref(324)
const sensitiveValue = ref('sk_live_a1b2c3d4e5f6')
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
   shape the Dialog cell above already uses. ── */const navTab = ref('home')
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
const selectionBarRef = ref<{ el: HTMLElement | null } | null>(null)
// `ignore` is not optional in practice: clicking into the bar's own prompt field
// collapses the document selection, and without this the anchor reads that as
// the reader clearing their selection and drops the snapshot — so the bar
// dismissed itself the moment anyone tried to use it.
const { selection: selectionPayload } = useSelectionAnchor({
  root: selectionRootRef,
  ignore: () => [selectionBarRef.value?.el ?? null],
})

const TOAST_VARIANTS = ['success', 'warning', 'danger'] as const

function fireToast() {
  toast({ title: copy.value.toastSaved, description: copy.value.toastSavedBody, variant: 'success' })
}

function fireToastStack() {
  TOAST_VARIANTS.forEach((variant, i) => {
    globalThis.setTimeout(() => {
      toast({ title: copy.value.toastSaved, description: copy.value.toastSavedBody, variant })
    }, i * 140)
  })
}

function fireToastAction() {
  toast({
    title: copy.value.toastDeleted,
    variant: 'default',
    action: { label: copy.value.toastUndo },
  })
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
/* Inline SVG so the gallery never waits on (or fails) a network image. Three
   flat swatches read as colour chips, not as photographs, which made the cell
   look like the wrong component; a gradient with a horizon and a light source
   is enough for a thumbnail grid to read as one. */
function tileImage(from: string, to: string, sun: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120">`
    + `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>`
    + `</linearGradient></defs>`
    + `<rect width="160" height="120" fill="url(#s)"/>`
    + `<circle cx="38" cy="34" r="16" fill="${sun}" opacity="0.85"/>`
    + `<path d="M0 92 L46 62 L84 86 L118 60 L160 88 L160 120 L0 120 Z" fill="#0f172a" opacity="0.42"/>`
    + `<path d="M0 104 L54 78 L96 100 L134 80 L160 96 L160 120 L0 120 Z" fill="#0f172a" opacity="0.62"/>`
    + `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}
const galleryItems = [
  { id: 'a', url: tileImage('#1e3a8a', '#60a5fa', '#e0f2fe'), name: 'Dawn ridge' },
  { id: 'b', url: tileImage('#064e3b', '#4ade80', '#fef9c3'), name: 'Pine valley' },
  { id: 'c', url: tileImage('#7c2d12', '#fbbf24', '#fff7ed'), name: 'Dune pass' },
]
// Keyed rather than labelled: the list reorders this ref in place, so labels
// come from a locale lookup instead of being frozen into the items.
const sortableItems = ref([
  { id: 'clipboard', icon: 'i-carbon-paste', tone: 'primary', keys: ['⌘', '⇧', 'V'] },
  { id: 'browser', icon: 'i-carbon-earth', tone: 'success', keys: ['⌘', 'B'] },
  { id: 'actions', icon: 'i-carbon-flash', tone: 'warning', keys: ['⌘', 'K'] },
])
const sortableLabels = computed<Record<string, string>>(() => (localeKey.value === 'zh'
  ? { clipboard: '剪贴板', browser: '浏览器', actions: '快捷操作' }
  : { clipboard: 'Clipboard', browser: 'Browser', actions: 'Quick actions' }))
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
// The MarkdownView cell's own sample: one of each block it renders, so the
// specimen shows the typography rather than a two-line list.
const markdownDoc = computed(() => (localeKey.value === 'zh'
  ? '#### 快速开始\n安装 **TuffEx**，按需引入即可。\n\n- `pnpm add @talex-touch/tuffex`\n- Vue 3 · TypeScript · 支持 SSR\n\n> 每个组件都可以被 Tree-shaking。'
  : '#### Getting started\nInstall **TuffEx** and import only what you use.\n\n- `pnpm add @talex-touch/tuffex`\n- Vue 3 · TypeScript · SSR ready\n\n> Every component is tree-shakable.'))

/* ── Pro band. ── */
const codeSample = 'export function greet(name: string) {\n  return \'Hello \' + name\n}\n'
// JSON is the editor's default language and the one it lints; six lines fit
// the stage at the editor's natural height, so nothing has to crop it.
const manifestSample = '{\n  "id": "com.talex.clipboard",\n  "version": "1.2.0",\n  "sdkapi": 260713,\n  "features": ["history", "pin"]\n}'
// A ref, not a computed: the reader edits it in the dialog. Seeded in the
// page's language once; switching locale keeps whatever they wrote.
const markdownDraft = ref(localeKey.value === 'zh'
  ? '## 发布说明\n\n- **更快的** CoreBox 搜索\n- 每个插件一个*权限*面板\n'
  : '## Release notes\n\n- **Faster** CoreBox search\n- A *permissions* panel per plugin\n')
const markdownOpen = ref(false)
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
// Twice over, so the feed is tall enough to keep scrolling through the blur.
const blurFeed = [...galleryItems, ...galleryItems]
const staggerItems = [
  { icon: 'i-carbon-copy', label: 'Clipboard' },
  { icon: 'i-carbon-earth', label: 'Browser' },
  { icon: 'i-carbon-flash', label: 'Actions' },
  { icon: 'i-carbon-window-base', label: 'Windows' },
  { icon: 'i-carbon-terminal', label: 'Scripts' },
  { icon: 'i-carbon-machine-learning-model', label: 'AI' },
]
const laneStates = computed<[string, string]>(() => [copy.value.online, copy.value.syncing])
const logoModes = computed(() => [
  { value: 'once' as const, label: 'once' },
  { value: 'breathe' as const, label: 'breathe' },
  { value: 'hover' as const, label: copy.value.hoverMe },
])

/* ── AI band. ── */
const chatDraft = ref('')
// The ChatComposer specimen is the reference composer: a context tray that trades
// sides and a mode chip that morphs. Both are click-driven, so nothing loops.
const composerTray = ref<'top' | 'bottom'>('bottom')
const composerUnrestricted = ref(false)
const modeChipOn = ref(false)
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
type FlowSpecimenId = 'trigger' | 'branch'

// Flowchart is controlled: it reports a drag and leaves the write to the host.
// Positions live apart from the copy so a locale switch keeps a dragged node
// where the reader left it.
const flowPositions = ref<Record<FlowSpecimenId, { x: number, y: number }>>({
  trigger: { x: 200, y: 8 },
  branch: { x: 200, y: 150 },
})

const flowNodes = computed(() => [
  { id: 'trigger', tone: 'violet' as const, label: copy.value.flowNodes.trigger.label, ...flowPositions.value.trigger },
  { id: 'branch', tone: 'orange' as const, label: copy.value.flowNodes.branch.label, ...flowPositions.value.branch },
])

const flowEdges = [{ from: 'trigger', to: 'branch' }]

function flowCopy(id: string) {
  return copy.value.flowNodes[id as FlowSpecimenId]
}

function moveFlowNode({ id, x, y }: { id: string, x: number, y: number }): void {
  if (id in flowPositions.value)
    flowPositions.value[id as FlowSpecimenId] = { x, y }
}

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
/* ── Data band. Charts come from `@talex-touch/tuffex/charts`, which is aliased
   but not globally registered, so they are imported explicitly — and never as
   `TxGrid`, which would shadow the layout grid used above.
   Every specimen below is the component's real interaction rather than a
   still picture: hover reports values, and Cartesian charts carry both axes. ── */
const donutSlices = [
  { label: 'Stable', count: 4820 },
  { label: 'Beta', count: 3160 },
  { label: 'Snapshot', count: 940 },
]
const donutTotal = donutSlices.reduce((sum, slice) => sum + slice.count, 0)
const donutHover = ref<{ name?: string, index: number, value: number } | null>(null)
const donutRows = computed(() => donutHover.value
  ? [{
      name: 'Installs',
      color: ChartPalette.categoricalVar(donutHover.value.index),
      value: `${donutHover.value.value.toLocaleString()} · ${Math.round(donutHover.value.value / donutTotal * 100)}%`,
    }]
  : [])

const DAY = 86_400_000
const seriesStart = Date.UTC(2026, 1, 9)
const timeseriesData = [
  { name: 'Installs', data: Array.from({ length: 7 }, (_, i) => [seriesStart + i * DAY, 420 + (i % 3) * 80] as [number, number]) },
  { name: 'Errors', data: Array.from({ length: 7 }, (_, i) => [seriesStart + i * DAY, 40 + (i % 4) * 18] as [number, number]) },
]

/* Twelve evenly spaced days. Both series stay inside one value band so the y
   axis has something to label, and the gaps are uniform so the default
   monotone curve reads as a trend instead of a zig-zag. */
const sparkSeries = [
  { id: 'installs', label: 'Installs', color: ChartPalette.categoricalVar(0), data: [420, 468, 512, 494, 548, 610, 586, 642, 705, 678, 742, 804].map((value, time) => ({ time, value })) },
  { id: 'errors', label: 'Errors', color: ChartPalette.categoricalVar(2), data: [186, 204, 178, 216, 232, 208, 244, 226, 258, 240, 268, 286].map((value, time) => ({ time, value })) },
]
const sparkIndex = ref<number | null>(null)
const sparkRows = computed(() => sparkIndex.value === null
  ? []
  : sparkSeries.map(series => ({
      label: series.label,
      color: series.color,
      value: (series.data[sparkIndex.value!]?.value ?? 0).toLocaleString(),
    })))
const sparkTimeLabel = computed(() =>
  sparkIndex.value === null ? '' : `Mar ${sparkIndex.value + 1}`)
function sparkTick(value: number): string {
  return `Mar ${Math.round(value) + 1}`
}

/* The gallery's only raw-option chart: a bar plus a line on one grid, which is
   the proof that the escape hatch carries the themed axis chrome and tooltip
   without a typed wrapper. Bars and line share the category axis, so the trend
   is read against the same seven days. */
const echartDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const echartOption = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: {},
  grid: { left: 44, right: 12, top: 30, bottom: 28 },
  xAxis: { type: 'category', data: echartDays },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'Installs',
      type: 'bar',
      data: [420, 468, 512, 494, 548, 610, 586],
      barWidth: 14,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
    },
    {
      name: 'Sessions',
      type: 'line',
      data: [820, 932, 901, 934, 1290, 1330, 1320],
      smooth: true,
      showSymbol: false,
    },
  ],
}))

/* Ported from kumo's compact Sankey preview: every intermediate node's inflow
   and outflow balance, so nothing hangs below its links as an unaccounted tail. */
const sankeyNodes = [
  { name: 'Search', value: 50 },
  { name: 'Community', value: 40 },
  { name: 'Paid', value: 35 },
  { name: 'Install', value: 55 },
  { name: 'Store', value: 70 },
]
const sankeyLinks = [
  { source: 0, target: 3, value: 30 },
  { source: 0, target: 4, value: 20 },
  { source: 1, target: 3, value: 25 },
  { source: 1, target: 4, value: 15 },
  { source: 2, target: 4, value: 35 },
]
/* Real but rounded country outlines, inlined so the specimen never waits on a
   fetch — and joined on `properties.name`, which is the key the choropleth
   reads by default. */
const mapGeoJson = MINI_WORLD_GEO
const mapShares = [
  { country: 'United States of America', share: 31 },
  { country: 'Brazil', share: 12 },
  { country: 'China', share: 24 },
  { country: 'India', share: 14 },
  { country: 'Australia', share: 7 },
  { country: 'South Africa', share: 4 },
]
function mapValueFormat(value: number): string {
  return `${value}%`
}
const allocationKey = ref('stable')
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
 *
 * Each state carries its own copy. They used to share the component name as the
 * title and one library blurb as the description, which said nothing about the
 * state. LayoutSkeleton takes no props and gets none: a stray `title` falls
 * through to its root as a native tooltip.
 */
interface StatusCell {
  slug: string
  is: Component
  en: string
  zh: string
  props: Record<string, unknown>
  on?: Record<string, () => void>
  blockClass?: string
}

const STATUS_COPY: Record<string, Record<'en' | 'zh', [title: string, description: string]>> = {
  'blank-slate': { en: ['Start from scratch', 'Create your first workflow to get going.'], zh: ['从零开始', '创建第一个工作流，马上开始。'] },
  'empty': { en: ['Nothing here yet', 'Items you add will show up here.'], zh: ['这里还没有内容', '添加的内容会显示在这里。'] },
  'empty-state': { en: ['No plugins installed', 'Browse the store to add your first plugin.'], zh: ['还没有安装插件', '去插件市场添加第一个插件。'] },
  'error-state': { en: ['Something went wrong', 'We couldn’t load your plugins. Try again in a moment.'], zh: ['出了点问题', '插件列表加载失败，请稍后重试。'] },
  'guide-state': { en: ['Start here', 'Three quick steps to set up CoreBox.'], zh: ['从这里开始', '三步完成 CoreBox 设置。'] },
  'loading-state': { en: ['Loading plugins', 'This usually takes a second.'], zh: ['正在加载插件', '通常只需要一秒。'] },
  'no-data': { en: ['No data yet', 'Metrics appear after the first sync.'], zh: ['暂无数据', '首次同步后会显示指标。'] },
  'no-selection': { en: ['Nothing selected', 'Pick a plugin to see its details.'], zh: ['未选择任何项', '选择一个插件查看详情。'] },
  'offline-state': { en: ['You’re offline', 'Check your connection. We’ll retry automatically.'], zh: ['网络已断开', '请检查网络，恢复后会自动重试。'] },
  'permission-state': { en: ['Access required', 'Ask a workspace admin to grant access.'], zh: ['需要权限', '请联系工作区管理员授权。'] },
  'search-empty': { en: ['No results for “tuffex”', 'Try a different keyword or filter.'], zh: ['没有找到“tuffex”', '换个关键词或筛选条件试试。'] },
}

function statusCopy(slug: string) {
  const [title, description] = STATUS_COPY[slug]?.[localeKey.value] ?? ['', '']
  return { title, description }
}

// Retry is a real round trip: the illustration swaps for the spinner and the
// button locks until the attempt settles, rather than being a dead button.
const errorRetrying = ref(false)
let errorRetryTimer: ReturnType<typeof setTimeout> | null = null

function retryErrorState() {
  if (errorRetrying.value)
    return
  errorRetrying.value = true
  errorRetryTimer = setTimeout(() => {
    errorRetrying.value = false
    errorRetryTimer = null
  }, 1400)
}

onBeforeUnmount(() => {
  if (errorRetryTimer)
    clearTimeout(errorRetryTimer)
})

const statusStates = computed<StatusCell[]>(() => [
  { slug: 'blank-slate', is: TxBlankSlate, en: 'BlankSlate', zh: '空白板', props: statusCopy('blank-slate') },
  { slug: 'empty', is: TxEmpty, en: 'Empty', zh: '空', props: statusCopy('empty') },
  { slug: 'empty-state', is: TxEmptyState, en: 'EmptyState', zh: '空状态', props: statusCopy('empty-state') },
  {
    slug: 'error-state',
    is: TxErrorState,
    en: 'ErrorState',
    zh: '错误态',
    props: {
      ...statusCopy('error-state'),
      loading: errorRetrying.value,
      primaryAction: { label: localeKey.value === 'zh' ? '重试' : 'Retry', icon: 'i-carbon-renew', disabled: errorRetrying.value },
    },
    on: { primary: retryErrorState },
  },
  { slug: 'guide-state', is: TxGuideState, en: 'GuideState', zh: '引导态', props: statusCopy('guide-state') },
  { slug: 'layout-skeleton', is: TxLayoutSkeleton, en: 'LayoutSkeleton', zh: '布局骨架', props: {}, blockClass: 'docs-gallery__layout-skel' },
  { slug: 'loading-state', is: TxLoadingState, en: 'LoadingState', zh: '加载态', props: statusCopy('loading-state') },
  { slug: 'no-data', is: TxNoData, en: 'NoData', zh: '无数据', props: statusCopy('no-data') },
  { slug: 'no-selection', is: TxNoSelection, en: 'NoSelection', zh: '未选择', props: statusCopy('no-selection') },
  { slug: 'offline-state', is: TxOfflineState, en: 'OfflineState', zh: '离线态', props: statusCopy('offline-state') },
  { slug: 'permission-state', is: TxPermissionState, en: 'PermissionState', zh: '权限态', props: statusCopy('permission-state') },
  { slug: 'search-empty', is: TxSearchEmpty, en: 'SearchEmpty', zh: '搜索无结果', props: statusCopy('search-empty') },
])

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

    <div v-if="props.suite === 'base'" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('button')">
          {{ cellLabel('Button', '按钮') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__block--wide docs-gallery__stack">
              <!-- Live, so the specimen shows the easing fill, the tip glow
                   riding it and the stardust drifting over the filled part. -->
              <TxProgressBar
                :key="progressCycle"
                :percentage="progressPercent"
                :detail="progressDetail"
                text-placement="top"
                flow-effect="stardust"
                show-text
              />
              <TxProgressBar :percentage="100" status="success" />
              <TxProgressBar :percentage="38" status="error" />
              <TxProgressBar :segments="progressSegments" />
              <TxProgressBar indeterminate indeterminate-variant="elastic" />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <div class="docs-gallery__row">
                <TxIconChip
                  v-for="chip in iconChipTones"
                  :key="`solid-${chip.tone}`"
                  :size="26"
                  :tone="chip.tone"
                  :label="chip.label"
                />
              </div>
              <div class="docs-gallery__row">
                <TxIconChip
                  v-for="chip in iconChipTones"
                  :key="`soft-${chip.tone}`"
                  :size="26"
                  :tone="chip.tone"
                  :label="chip.label"
                  variant="soft"
                />
              </div>
              <!-- The size ladder and the circle shape, which the two tone rows
                   above hold constant. -->
              <div class="docs-gallery__row">
                <TxIconChip :size="14" tone="accent" label="v4" />
                <TxIconChip :size="20" tone="ink" label="TS" />
                <TxIconChip :size="32" shape="circle" tone="accent" label="AI" />
                <TxIconChip :size="32" shape="circle" tone="green" variant="soft" label="OK" />
              </div>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <!-- The xl tier leads: one specimen at the size the control is
                   actually meant to be read at, then the range below it. -->
              <div class="docs-gallery__row">
                <TxFlatRadio v-model="flatRadioValue" size="xl">
                  <TxFlatRadioItem value="light" label="Light" />
                  <TxFlatRadioItem value="dark" label="Dark" />
                  <TxFlatRadioItem value="auto" label="Auto" />
                </TxFlatRadio>
              </div>
              <div class="docs-gallery__row">
                <TxFlatRadio v-model="flatRadioViewValue">
                  <TxFlatRadioItem value="grid" icon="i-carbon-grid" label="Grid" />
                  <TxFlatRadioItem value="list" icon="i-carbon-list" label="List" />
                  <TxFlatRadioItem value="kanban" icon="i-carbon-column" label="Kanban" />
                </TxFlatRadio>
              </div>
              <div class="docs-gallery__row">
                <TxFlatRadio v-model="flatRadioAlertValues" size="sm" multiple>
                  <TxFlatRadioItem value="mention" icon="i-carbon-at" />
                  <TxFlatRadioItem value="reply" icon="i-carbon-reply" />
                  <TxFlatRadioItem value="archive" icon="i-carbon-archive" />
                  <TxFlatRadioItem value="mute" icon="i-carbon-volume-mute" />
                </TxFlatRadio>
              </div>
            </div>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- No fixed-width block here: the uploader's grid is `auto-fill`, so a
                 240px block gives it two tracks and parks the lone add tile in the
                 left one, off the centre of the stage. Letting it size to its own
                 content puts the tile where every other specimen sits. -->
            <TxImageUploader v-model="uploadImages" :max="3" accept="image/png,image/jpeg" />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <!-- Toolbar off: with no popup to confirm into, Cancel/Confirm are
                   dead controls that only make this cell taller than its row. -->
              <TxPicker
                v-model="pickerValue"
                :columns="pickerColumns"
                :popup="false"
                :show-toolbar="false"
                :visible-item-count="5"
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('sensitive-input')">
          {{ cellLabel('SensitiveInput', '敏感输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSensitiveInput v-model="sensitiveValue" />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- One row per line: a gutter only spaces columns, so four spans
                 wrapped inside a single row stacked with no gap between lines. -->
            <div class="docs-gallery__block">
              <TxContainer>
                <div class="docs-gallery__rows">
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
                  </TxRow>
                  <TxRow :gutter="8">
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
                </div>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxFlex :gap="8" wrap="wrap" justify="center">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxGroupBlock :name="copy.dividerSection">
                <TxBlockSwitch v-model="blockSwitch" :title="copy.autoSync" :description="copy.autoSyncDesc" />
                <!-- TxBlockLine is a title+description row, not a separator.
                     Propless it rendered as an empty band. -->
                <TxBlockLine :title="copy.installTitle" :description="copy.installBody" />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__framed docs-gallery__chrome">
              <TxNavBar :title="copy.suiteBase" show-back />
              <div class="docs-gallery__chrome-body" />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__sidebar">
              <TxSidebarNav v-model="navTab" :items="tabBarItems" />
            </div>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__framed docs-gallery__chrome docs-gallery__chrome--bottom">
              <TxTabBar v-model="navTab" :items="tabBarItems" :fixed="false" />
              <div class="docs-gallery__chrome-body" />
              <TxTabBar v-model="navTab" :items="tabBarItems" :fixed="false" indicator="line" />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__tabs">
              <TxTabs v-model="tabsActive" placement="top">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack docs-gallery__alerts">
              <button
                v-show="alertsDismissed > 0"
                class="docs-gallery__reset"
                type="button"
                :aria-label="copy.resetAlerts"
                :title="copy.resetAlerts"
                @click="resetAlerts"
              >
                <span class="i-carbon-reset" aria-hidden="true" />
              </button>
              <TransitionGroup name="docs-gallery-alert">
                <TxAlert
                  v-if="alertsVisible.success"
                  key="success"
                  :title="copy.online"
                  :message="copy.aboutBody"
                  type="success"
                  @close="alertsVisible.success = false"
                />
                <TxAlert
                  v-if="alertsVisible.error"
                  key="error"
                  :title="copy.failed"
                  :message="copy.dialogMessage"
                  type="error"
                  @close="alertsVisible.error = false"
                />
              </TransitionGroup>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- The bar has no resting form: it anchors to a live text
                 selection, so the specimen is the passage you select in. -->
            <div ref="selectionRootRef" class="docs-gallery__block">
              <p class="docs-gallery__muted">
                {{ copy.selectionHint }}
              </p>
              <TxSelectionActions ref="selectionBarRef" :selection="selectionPayload" />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxButton size="sm" @click="fireToast">
                {{ copy.toastSaved }}
              </TxButton>
              <TxButton size="sm" variant="ghost" @click="fireToastStack">
                {{ copy.toastStack }}
              </TxButton>
              <TxButton size="sm" variant="ghost" @click="fireToastAction">
                {{ copy.toastUndo }}
              </TxButton>
            </div>
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
        <NuxtLink class="docs-gallery__label" :to="docPath('data-table')">
          {{ cellLabel('DataTable', '数据表') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('filter-chips')">
          {{ cellLabel('FilterChips', '筛选标签') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('sortable-list')">
          {{ cellLabel('SortableList', '可排序列表') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <!-- Without `item-label` the live region announces the raw id. -->
              <TxSortableList
                v-model="sortableItems"
                handle
                :item-label="(item) => sortableLabels[item.id] ?? item.id"
                :aria-label="cellLabel('SortableList', '可排序列表')"
              >
                <template #item="{ item, handleAttrs }">
                  <div class="docs-gallery__sort-row">
                    <span class="docs-gallery__grip i-carbon-draggable" v-bind="handleAttrs" />
                    <span class="docs-gallery__sort-icon" :data-tone="item.tone" aria-hidden="true">
                      <span :class="item.icon" />
                    </span>
                    <span class="docs-gallery__sort-label">{{ sortableLabels[item.id] }}</span>
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
        <NuxtLink class="docs-gallery__label" :to="docPath('stat-card')">
          {{ cellLabel('StatCard', '指标卡') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxStatCard
                :value="1284"
                :label="copy.online"
                icon-class="i-carbon-analytics docs-gallery__stat-icon"
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
              <!-- The panel's own floor is 240px; the cell is 190. Without this the
                   specimen laid out past its stage instead of inside it. -->
              <TxTransfer v-model="transferValue" :data="transferData" min-height="140px" />
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
              <!-- Selection is on by default but was invisible here: the tree kept
                   no state of its own, so an unbound specimen never lit a row. -->
              <TxTree
                :nodes="treeNodes"
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

      <section v-for="state in statusStates" :key="state.slug" class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath(state.slug)">
          {{ cellLabel(state.en, state.zh) }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block" :class="state.blockClass">
              <component :is="state.is" v-bind="state.props" v-on="state.on ?? {}" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <div v-if="props.suite === 'pro'" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('version-capsule')">
          {{ cellLabel('VersionCapsule', '版本胶囊') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- text-clip, not the default adaptive. adaptive is a container
                 shimmer for images and cards: it blends with `screen`, which is
                 lighten-only, so a white band over a light page changes nothing
                 and the cell rendered as plain bold text. The component's own
                 docs say to use text-clip for text. -->
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxGlowText
                class="docs-gallery__glow"
                tag="span"
                mode="text-clip"
                :duration-ms="2600"
                :band-size="30"
                :opacity="1"
                color="var(--docs-accent)"
              >
                Tuffex
              </TxGlowText>
              <TxGlowText
                class="docs-gallery__glow-card"
                tag="div"
                :duration-ms="2600"
                :band-size="36"
                :opacity="0.6"
              >
                {{ copy.installBody }}
              </TxGlowText>
            </div>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- Editable, at its natural height. The old 128px frame cropped the
                 editor's 160px floor and took its bottom edge with it. -->
            <div class="docs-gallery__block docs-gallery__block--wide docs-gallery__editor">
              <TxCodeEditor :model-value="manifestSample" language="json" />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- The source here, the editor in a dialog: eleven actions and three
                 modes took three toolbar rows at this width and left a 12px
                 sliver of editor. The dialog is wide enough for one row. -->
            <div class="docs-gallery__block docs-gallery__doc docs-gallery__md-card">
              <div class="docs-gallery__doc-bar">
                <span class="docs-gallery__grow">release-notes.md</span>
                <TxButton size="sm" icon="i-carbon-edit" @click="markdownOpen = true">
                  {{ copy.edit }}
                </TxButton>
              </div>
              <pre class="docs-gallery__md-source">{{ markdownDraft }}</pre>
            </div>
            <TxModal v-model="markdownOpen" :title="copy.releaseNotes" width="min(92vw, 640px)">
              <TxMarkdownEditor v-model="markdownDraft" :min-height="220" :max-height="360" />
            </TxModal>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryVirtualList :title="copy.virtualTitle" :count-label="copy.virtualCount" />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- One per placement, each with a different kind of overlay. The
                 badges sit in a page-coloured ring: they are translucent tints
                 and read as smudges straight on a photo or an avatar. -->
            <div class="docs-gallery__row docs-gallery__row--loose">
              <figure class="docs-gallery__corner" style="--i: 0">
                <TxCornerOverlay placement="top-left" :offset-x="-6" :offset-y="-6">
                  <img class="docs-gallery__corner-thumb" :src="galleryItems[0]!.url" alt="">
                  <template #overlay>
                    <span class="docs-gallery__corner-ring"><TxBadge value="NEW" variant="primary" /></span>
                  </template>
                </TxCornerOverlay>
                <figcaption>top-left</figcaption>
              </figure>
              <figure class="docs-gallery__corner" style="--i: 1">
                <TxCornerOverlay placement="top-right" :offset-x="-6" :offset-y="-6">
                  <TxAvatar name="Kiri" shape="rounded" size="large" />
                  <template #overlay>
                    <span class="docs-gallery__corner-ring"><TxBadge :value="12" variant="error" /></span>
                  </template>
                </TxCornerOverlay>
                <figcaption>top-right</figcaption>
              </figure>
              <figure class="docs-gallery__corner" style="--i: 2">
                <TxCornerOverlay placement="bottom-left" :offset-x="-5" :offset-y="-5">
                  <TxIconChip :size="48" tone="red" label="PDF" />
                  <template #overlay>
                    <span class="docs-gallery__corner-ring docs-gallery__corner-check"><TxIcon name="check-circle" /></span>
                  </template>
                </TxCornerOverlay>
                <figcaption>bottom-left</figcaption>
              </figure>
              <figure class="docs-gallery__corner" style="--i: 3">
                <TxCornerOverlay placement="bottom-right" :offset-x="1" :offset-y="1">
                  <TxAvatar name="Talex" size="large" />
                  <template #overlay>
                    <span class="docs-gallery__dot" style="background: var(--tx-color-success)" />
                  </template>
                </TxCornerOverlay>
                <figcaption>bottom-right</figcaption>
              </figure>
            </div>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryEdgeMarquee />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <TxButton ref="flipTriggerRef" @click="flipped = true">
              {{ copy.aboutTitle }}
            </TxButton>
            <TxFlipOverlay
              v-model="flipped"
              :source="flipTriggerEl"
              :header-title="copy.aboutTitle"
              :card-style="{ width: 'min(92vw, 340px)' }"
            >
              <p class="docs-gallery__flip-body">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryFusion />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('fusion-surface')">
          {{ cellLabel('FusionSurface', '融合表面') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryFusionSurface />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- Glass needs something behind it to bend: over the flat cell the
                 displacement had nothing to act on and the surface was invisible. -->
            <div class="docs-gallery__block docs-gallery__glass-stage">
              <div class="docs-gallery__glass-scene" aria-hidden="true">
                <span v-for="orb in 5" :key="orb" class="docs-gallery__glass-orb" />
              </div>
              <TxGlassSurface :width="200" :height="88" :border-radius="18" :background-opacity="0.06">
                <span class="docs-gallery__glass-label">GlassSurface</span>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- A solid card inside, 2px in: its 14px radius is the ring's 16
                 minus the gap, so the two curves stay concentric. -->
            <div class="docs-gallery__block">
              <TxGradientBorder :border-radius="16" :border-width="2" :padding="2" :animation-duration="6">
                <div class="docs-gallery__gb-card">
                  <strong>{{ copy.aboutTitle }}</strong>
                  <span>{{ copy.aboutBody }}</span>
                </div>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- A feed that keeps moving through the blur band. The blur only
                 acts on what is behind it, and the old tiles sat in the top
                 34px while the band covered the empty bottom 40%. -->
            <div class="docs-gallery__block docs-gallery__blur-card">
              <div class="docs-gallery__blur-feed">
                <figure v-for="(shot, index) in blurFeed" :key="index" class="docs-gallery__blur-shot">
                  <img :src="shot.url" alt="">
                  <figcaption>{{ shot.name }}</figcaption>
                </figure>
              </div>
              <TxGradualBlur
                position="bottom"
                height="64px"
                :strength="2.5"
                :div-count="6"
                curve="bezier"
                exponential
                :z-index="1"
              />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- Token colours: the defaults are a dark fill for a light page and
                 left only a thin outline on the dark one. A phrase longer than
                 any one glyph's outline, or the dash ends before the glyph does. -->
            <TxKeyframeStrokeText
              text="Talex Touch"
              stroke-color="var(--tx-color-primary)"
              fill-color="var(--tx-text-color-primary)"
              :stroke-width="1.5"
              :font-size="44"
              :duration-ms="2400"
            />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryLiquidMenu :toggle-label="copy.liquidToggle" :item-labels="copy.liquidItems" />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- The variants side by side, colour on the ring only. The old cell
                 wrapped a bordered tile in the default ring: two grey lines that
                 read as a doubled border. `ring-inset` is left out — it paints
                 under the slot and an avatar covers it entirely. -->
            <div class="docs-gallery__row docs-gallery__row--loose">
              <div class="docs-gallery__meter">
                <TxOutlineBorder :ring-width="2" ring-color="var(--tx-color-primary)" :offset="3">
                  <TxAvatar name="Talex" :size="44" />
                </TxOutlineBorder>
                <span class="docs-gallery__meter-text">ring-offset</span>
              </div>
              <div class="docs-gallery__meter">
                <TxOutlineBorder variant="ring" :ring-width="2" ring-color="var(--tx-color-success)">
                  <TxAvatar name="Kiri" :size="44" />
                </TxOutlineBorder>
                <span class="docs-gallery__meter-text">ring</span>
              </div>
              <div class="docs-gallery__meter">
                <TxOutlineBorder
                  variant="border"
                  shape="rect"
                  :border-radius="15"
                  :border-width="2"
                  :padding="3"
                  border-color="var(--tx-color-warning)"
                >
                  <TxAvatar name="Ame" :size="40" shape="rounded" />
                </TxOutlineBorder>
                <span class="docs-gallery__meter-text">border</span>
              </div>
              <div class="docs-gallery__meter">
                <TxOutlineBorder clip-mode="mask" clip-shape="hexagon" variant="border" :border-width="0">
                  <TxAvatar name="Louis" :size="48" shape="square" />
                </TxOutlineBorder>
                <span class="docs-gallery__meter-text">mask</span>
              </div>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- Six items on a grid with a longer rise than the built-in 6px, so
                 the cascade is visible; the reset button plays it again. -->
            <TxStagger class="docs-gallery__stagger" name="docs-gallery-stagger" :duration="420" :delay-step="70">
              <div v-for="item in staggerItems" :key="item.label" class="docs-gallery__tile docs-gallery__stagger-item">
                <span :class="item.icon" aria-hidden="true" />
                {{ item.label }}
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryTextMorph :stages="copy.syncStages" :next-label="copy.next" />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryTransitionLanes :states="laneStates" />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- All three modes: at 72px one `once` run ended as a glowing dot,
                 and nothing said the logo could breathe or wait for a hover. -->
            <div class="docs-gallery__row docs-gallery__row--loose">
              <div v-for="mode in logoModes" :key="mode.value" class="docs-gallery__meter">
                <TxTuffLogoStroke :size="64" :mode="mode.value" />
                <span class="docs-gallery__meter-text">{{ mode.label }}</span>
              </div>
            </div>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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

    <div v-if="props.suite === 'ai'" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('thinking-orb')">
          {{ cellLabel('ThinkingOrb', '思考指示球') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('mode-chip')">
          {{ cellLabel('ModeChip', '模式芯片') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <TxModeChip
              :icon="modeChipOn ? 'i-carbon-unlocked' : 'i-carbon-touch-1'"
              :label="modeChipOn ? copy.unrestricted : copy.requestApproval"
              :tone="modeChipOn ? 'danger' : 'muted'"
              @click="modeChipOn = !modeChipOn"
            />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChatComposer
                v-model="chatDraft"
                :min-rows="1"
                :max-rows="3"
                :placeholder="copy.typeSomething"
                :tray-placement="composerTray"
                :tray-label="copy.composerTray"
              >
                <template #tray>
                  <TxModeChip
                    v-if="composerTray === 'bottom'"
                    icon="i-carbon-plug"
                    :label="copy.connectApps"
                    @click="composerTray = 'top'"
                  />
                  <TxModeChip
                    v-else
                    icon="i-carbon-folder"
                    :label="copy.selectProject"
                    @click="composerTray = 'bottom'"
                  />
                </template>
                <template #toolbar-left>
                  <TxModeChip
                    :icon="composerUnrestricted ? 'i-carbon-unlocked' : 'i-carbon-touch-1'"
                    :label="composerUnrestricted ? copy.unrestricted : copy.requestApproval"
                    :tone="composerUnrestricted ? 'danger' : 'muted'"
                    @click="composerUnrestricted = !composerUnrestricted"
                  />
                </template>
              </TxChatComposer>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('agent-screen')">
          {{ cellLabel('AgentScreen', '智能体屏幕') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAgentScreen
                :aria-label="copy.screenAria"
                :cursor="{ x: 46, y: 62, label: copy.screenCursor }"
              >
                <!-- A painted stand-in, as in the AgentScreen demo: the frame
                     takes any surface, and a gallery tile should not ship a
                     screenshot. -->
                <div class="docs-gallery__desktop">
                  <span class="docs-gallery__desktop-window is-back" />
                  <span class="docs-gallery__desktop-window is-front" />
                </div>
              </TxAgentScreen>
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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

    <div v-if="props.suite === 'data'" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('spark-chart')">
          {{ cellLabel('SparkChart', '迷你折线图') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__spark">
              <TxChartScrubber
                class="docs-gallery__spark-stage"
                :point-count="sparkSeries[0]?.data.length ?? 0"
                :active-index="sparkIndex"
                :rows="sparkRows"
                :time-label="sparkTimeLabel"
                @update:active-index="sparkIndex = $event"
              >
                <TxSparkChart
                  :series="sparkSeries"
                  :active-index="sparkIndex"
                  :padding="{ top: 14, right: 10, bottom: 24, left: 36 }"
                  :x-tick-format="sparkTick"
                  grid
                  x-axis
                  y-axis
                />
              </TxChartScrubber>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAllocationBar v-model="allocationKey" :segments="copy.allocation" detail />
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
        <NuxtLink class="docs-gallery__label" :to="docPath('chart-colors')">
          {{ cellLabel('ChartColors', '图表配色') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChart :height="150" :padding="8">
                <TxArcSeries
                  :data="donutSlices"
                  value="count"
                  name="label"
                  :inner-radius="0.65"
                  @slice-hover="donutHover = $event"
                />
                <template #overlay>
                  <TxChartTooltip
                    :open="donutHover !== null"
                    :title="donutHover?.name"
                    :rows="donutRows"
                  />
                </template>
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxChoroplethMap
                :geo-json="mapGeoJson"
                :data="mapShares"
                name="country"
                value="share"
                :height="176"
                :value-format="mapValueFormat"
                show-legend
              />
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
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSankeyChart :nodes="sankeyNodes" :links="sankeyLinks" :height="170" />
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
        <div class="docs-gallery__stage not-prose">
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
        <div class="docs-gallery__stage not-prose">
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

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
          {{ cellLabel('ECharts', 'ECharts 图表') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxEChart :option="echartOption" :height="220" aria-label="Installs and sessions by weekday" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <div v-if="props.suite === 'flow'" class="docs-gallery__grid docs-gallery__grid--single">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('flowchart')">
          {{ cellLabel('Flowchart', '流程画布') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__flow">
              <TxFlowchart
                :nodes="flowNodes"
                :edges="flowEdges"
                :height="260"
                :node-width="240"
                draggable
                :aria-label="copy.flowAria"
                @node-move="moveFlowNode"
              >
                <template #node="{ node }">
                  <div class="docs-gallery__flow-card">
                    <strong>{{ flowCopy(node.id).title }}</strong>
                    <small>{{ flowCopy(node.id).detail }}</small>
                  </div>
                </template>
              </TxFlowchart>
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
