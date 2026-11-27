<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, provide, ref, shallowRef, type Component } from 'vue'
import './DocsComponentsGallery.css'
import type { AiChainStep, AiElementMessage } from '@tuffex-components/ai-elements'
import type { ContextChunk } from '@tuffex-components/context-cards'
import { ClientOnly as NuxtClientOnly } from '#components'
import { toLocalizedDocsPath } from '#shared/utils/docs-path'
import tuffexPkg from '../../../../../packages/tuffex/package.json'
// Every `<ClientOnly>` below is this gate, not Nuxt's: each one sits directly
// in a cell's stage. The gate mounts its specimen when this gallery's queue
// admits it, and the specimen wrapper adds the reset button that remounts it so
// its entrance can be watched again.
import ClientOnly from './gallery/GallerySpecimenGate.vue'
import DocsGalleryFrameworkBar from './DocsGalleryFrameworkBar.vue'
import { galleryText } from './gallery/gallery-text'
import { createSpecimenQueue, SPECIMEN_QUEUE_KEY } from './gallery/specimen-queue'
import { tileImage } from './gallery/tile-image'
import type { DocsSuiteKey } from '~/utils/docs-suites'
// One band per render: every suite has its own overview page, so the gallery
// only ever shows that page's suite. There is no cross-suite hub grid.
const props = defineProps<{ suite: Exclude<DocsSuiteKey, 'concepts' | 'templates'> }>()
// One queue per gallery, so this page's specimens mount in document order.
provide(SPECIMEN_QUEUE_KEY, createSpecimenQueue())
const galleryAmicroSpecimen = shallowRef<Component | null>(null)
const GalleryBaseSuite = defineAsyncComponent(() => import('./gallery/GalleryBaseSuite.vue'))
const GalleryChartLegend = defineAsyncComponent(() => import('./gallery/GalleryChartLegend.vue'))
const GalleryChoiceCard = defineAsyncComponent(() => import('./gallery/GalleryChoiceCard.vue'))
const GalleryChoroplethMap = defineAsyncComponent(() => import('./gallery/GalleryChoroplethMap.vue'))
const GalleryCustomChart = defineAsyncComponent(() => import('./gallery/GalleryCustomChart.vue'))
const GalleryEChart = defineAsyncComponent(() => import('./gallery/GalleryEChart.vue'))
const GalleryEdgeMarquee = defineAsyncComponent(() => import('./gallery/GalleryEdgeMarquee.vue'))
const GalleryFlowchart = defineAsyncComponent(() => import('./gallery/GalleryFlowchart.vue'))
const GalleryFusion = defineAsyncComponent(() => import('./gallery/GalleryFusion.vue'))
const GalleryFusionSurface = defineAsyncComponent(() => import('./gallery/GalleryFusionSurface.vue'))
const GalleryLearningCurve = defineAsyncComponent(() => import('./gallery/GalleryLearningCurve.vue'))
const GalleryLiquidMenu = defineAsyncComponent(() => import('./gallery/GalleryLiquidMenu.vue'))
const GalleryMatrixLoader = defineAsyncComponent(() => import('./gallery/GalleryMatrixLoader.vue'))
const GallerySankeyChart = defineAsyncComponent(() => import('./gallery/GallerySankeyChart.vue'))
const GallerySparkChart = defineAsyncComponent(() => import('./gallery/GallerySparkChart.vue'))
const GalleryStreamElement = defineAsyncComponent(() => import('./gallery/GalleryStreamElement.vue'))
const GalleryStreamMarkdown = defineAsyncComponent(() => import('./gallery/GalleryStreamMarkdown.vue'))
const GalleryStreamText = defineAsyncComponent(() => import('./gallery/GalleryStreamText.vue'))
const GalleryTextMorph = defineAsyncComponent(() => import('./gallery/GalleryTextMorph.vue'))
const GalleryThinkingOrb = defineAsyncComponent(() => import('./gallery/GalleryThinkingOrb.vue'))
const GalleryTimeseriesChart = defineAsyncComponent(() => import('./gallery/GalleryTimeseriesChart.vue'))
const GalleryTransitionLanes = defineAsyncComponent(() => import('./gallery/GalleryTransitionLanes.vue'))
const GalleryVirtualList = defineAsyncComponent(() => import('./gallery/GalleryVirtualList.vue'))
const GalleryAttachmentTray = defineAsyncComponent(() => import('./gallery/GalleryAttachmentTray.vue'))

const GalleryVoiceClip = defineAsyncComponent(() => import('./gallery/GalleryVoiceClip.vue'))

const GalleryImageGeneration = defineAsyncComponent(async () => {
  const { TxImageGeneration } = await import('@talex-touch/tuffex/image-generation')
  return TxImageGeneration
})
const { locale } = useI18n()

const localeKey = computed(() => (locale.value === 'zh' ? 'zh' : 'en'))
// Specimen data and the label props TuffEx takes in place of i18n.
const text = computed(() => galleryText[localeKey.value])

// The localized route, not the content path: `/docs/dev/components/button.zh` is a client-side
// navigation the `/docs → /en/docs` redirect never sees, so it opened the English page.
function docPath(slug: string) {
  return toLocalizedDocsPath(`/docs/dev/components/${slug}`, localeKey.value)
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
      close: '关闭', closeDrawer: '关闭抽屉', toastRegion: '通知', toastDismiss: '关闭通知',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      installTitle: '如何安装？',
      installBody: 'pnpm add @talex-touch/tuffex',
      contextTitle: '全部片段',
      contextChunk: {
        title: '按需引入',
        body: '新接入的应用和包优先使用子路径导入，默认避免业务 bundle 拉入包根入口和全量样式。',
        chars: '字符',
        source: 'README_ZHCN.md',
      },
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
      streamSentence: '开心果是这个月增长最快的口味，销量涨了 23%，核果类口味也在同一区间升温。',
      streamMarkdown: '### 开心果周报\n\n开心果本月**增长最快**，销量涨了 23%。\n\n- 核果类口味同步升温\n- 下周补货 `pistachio-base`',
      streamAnswer: '开心果这个月增长最快 [1]，建议：\n\n- 补货 `pistachio-base`\n- 周末加一场试吃',
      fineTune: {
        title: '微调', layoutLabel: '布局', layoutLabels: { row: '横向布局', col: '纵向布局', grid: '网格布局' }, typeLabel: '类型', typePlaceholder: '选择类型',
        adjustLabel: '可调整', editedLabel: '已修改', fieldLabels: { width: '宽', height: '高', radius: '圆角', opacity: '不透明' }, valueLabelFormatter: (label: string) => `${label}数值`,
      },
      next: '下一步',
      hoverMe: '悬停',
      foldCardTitle: '折角预览',
      foldCardHint: '悬停或点击右下角掀开',
      foldUnderTitle: '底层已解锁',
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
      close: 'Close', closeDrawer: 'Close drawer', toastRegion: 'Notifications', toastDismiss: 'Dismiss notification',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      installTitle: 'How to install?',
      installBody: 'pnpm add @talex-touch/tuffex',
      contextTitle: 'All chunks',
      contextChunk: {
        title: 'On-demand import',
        body: 'Use subpath imports for new app and package integrations. This keeps the package root and full stylesheet out of business bundles by default.',
        chars: 'characters',
        source: 'README.md',
      },
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
      streamSentence: 'Pistachio is your fastest-growing flavor, up 23% this month, and stone-fruit is trending in the same range.',
      streamMarkdown: '### Pistachio weekly\n\nPistachio is the **fastest-growing** flavor, up 23%.\n\n- Stone-fruit is warming up too\n- Restock `pistachio-base` next week',
      streamAnswer: 'Pistachio grew fastest this month [1], so:\n\n- Restock `pistachio-base`\n- Add a weekend tasting',
      fineTune: {
        title: 'Fine-tune', layoutLabel: 'Layout', layoutLabels: { row: 'Row layout', col: 'Column layout', grid: 'Grid layout' }, typeLabel: 'Type', typePlaceholder: 'Select type',
        adjustLabel: 'Adjust', editedLabel: 'Edited', fieldLabels: { width: 'W', height: 'H', radius: 'Radius', opacity: 'Opacity' },
      },
      next: 'Next',
      hoverMe: 'hover me',
      foldCardTitle: 'Corner Peel',
      foldCardHint: 'Hover or click corner to peel',
      foldUnderTitle: 'Underlay unlocked',
    }))

const channel = ref('')
const page = ref(2)
const segments = [
  { value: 0, label: 'S' },
  { value: 1, label: 'M' },
  { value: 2, label: 'L' },
  { value: 3, label: 'XL' },
]

onMounted(() => {
  if (props.suite === 'data' || props.suite === 'motion') {
    void import('./gallery/GalleryAmicroSpecimen.vue').then(({ default: component }) => {
      galleryAmicroSpecimen.value = component
    })
  }
})

const galleryTiles = [
  { id: 'a', url: tileImage('#1e3a8a', '#60a5fa', '#e0f2fe', 8), en: 'Dawn ridge', zh: '山脊晨光' },
  { id: 'b', url: tileImage('#064e3b', '#4ade80', '#fef9c3', 8), en: 'Pine valley', zh: '松谷' },
  { id: 'c', url: tileImage('#7c2d12', '#fbbf24', '#fff7ed', 8), en: 'Dune pass', zh: '沙丘垭口' },
]
const galleryItems = computed(() => galleryTiles.map(({ id, url, en, zh }) => ({ id, url, name: localeKey.value === 'zh' ? zh : en })))
// The StreamElement cell's one source, which its `[1]` resolves to.
const streamSources = [{ id: 'scoop', url: 'https://scoopdata.io/flavors/pistachio', title: 'Scoop Data' }]

/* ── Pro band. ── */
const codeSample = 'export function greet(name: string) {\n  return \'Hello \' + name\n}\n'
// JSON is the editor's default language and the one it lints; six lines fit
// the stage at the editor's natural height, so nothing has to crop it.
const manifestSample = '{\n  "id": "com.talex.clipboard",\n  "version": "1.2.0",\n  "sdkapi": 260713,\n  "features": ["history", "pin"]\n}'
const terminalLines = computed(() => [
  '\x1B[32mTuffEx TxTerminal\x1B[0m',
  localeKey.value === 'zh' ? 'ANSI 颜色 · 中文日志 ✓' : 'ANSI colors · Unicode logs ✓',
  localeKey.value === 'zh' ? '只读显示，无进程' : 'Read-only display, no process',
])
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
const flipped = ref(false)
const foldGalleryPeeled = ref(false)
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
const blurFeed = computed(() => [...galleryItems.value, ...galleryItems.value])
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
const contextChunks = computed<ContextChunk[]>(() => {
  const chunk = copy.value.contextChunk
  return [{
    id: 'c1',
    title: chunk.title,
    chars: `${chunk.body.length} ${chunk.chars}`,
    body: chunk.body,
    source: { name: chunk.source, badge: 'MD', tone: 'accent' },
  }]
})
const insightPages = computed(() => [
  { key: 'adoption', prose: copy.value.aboutBody, suggestion: copy.value.suggestions[0]?.text },
])
const fineTuneValues = {
  layout: 'grid' as const,
  width: 320,
  height: 180,
  radius: 14,
  opacity: 100,
  type: null,
}
const CHART_CATEGORICAL_FALLBACKS = ['#4290F0', '#F5B647', '#E8649D', '#8D58EE', '#50C3B6', '#D37536']

function categoricalVar(index: number): string {
  const slot = ((index % CHART_CATEGORICAL_FALLBACKS.length) + CHART_CATEGORICAL_FALLBACKS.length) % CHART_CATEGORICAL_FALLBACKS.length
  return `var(--tx-chart-categorical-${slot + 1}, ${CHART_CATEGORICAL_FALLBACKS[slot]})`
}

/* ── Data band. Its chart cells are async components under gallery/, so the
   other docs suites keep the chart implementation out of their route chunk.
   Every chart specimen is the component's real interaction rather than a
   still picture: hover reports values, and Cartesian charts carry both axes. ── */
const allocationKey = ref('stable')

const citeSources = [
  { id: 'repo', url: 'https://github.com/talex-touch/talex-touch' },
  { id: 'npm', url: 'https://www.npmjs.com/package/@talex-touch/tuffex' },
]
// `height` is the specimen's tallest height in px, given only where it outgrows
// the default stage, and `narrowHeight` its height in the narrowest two-column
// cells where that is taller still: the stage reserves both
// (`--docs-gallery-specimen` and `--docs-gallery-specimen-narrow`).
const motionGalleryItems = [
  { doc: 'motion-button', name: 'MotionButton', zh: '动效按钮', kind: 'motion-button' },
  { doc: 'card-spread', name: 'CardSpread', zh: '卡片展开', kind: 'card-spread', height: 264 },
  { doc: 'carousel-3d', name: 'Carousel3D', zh: '三维轮播', kind: 'carousel-3d', height: 279, narrowHeight: 318 },
  { doc: 'flip-book', name: 'FlipBook', zh: '翻页书', kind: 'flip-book', height: 253 },
  { doc: 'motion-loader', name: 'MotionLoader', zh: '加载动效', kind: 'motion-loader', height: 139 },
  { doc: 'dither-chart', name: 'DitherChart', zh: '抖动图表', kind: 'dither-chart', height: 331 },
  { doc: 'motion-text', name: 'MotionText', zh: '文字动效', kind: 'motion-text' },
  { doc: 'physics-motion', name: 'PhysicsMotion', zh: '物理动效', kind: 'physics-motion', height: 128 },
  { doc: 'motion-dock', name: 'MotionDock', zh: '动态应用栏', kind: 'motion-dock' },
  { doc: 'motion', name: 'Motion', zh: '悬停与滚动', kind: 'motion', height: 150 },
  { doc: 'motion-toggle', name: 'MotionToggle', zh: '动效切换', kind: 'motion-toggle' },
  { doc: 'motion-transition', name: 'MotionTransition', zh: '动效转场', kind: 'motion-transition', height: 198 },
] as const

function specimenStyle(item: { readonly doc?: string, readonly name?: string, readonly zh?: string, readonly kind?: string, readonly height?: number, readonly narrowHeight?: number }) {
  if (!item.height)
    return undefined
  return item.narrowHeight
    ? { '--docs-gallery-specimen': `${item.height}px`, '--docs-gallery-specimen-narrow': `${item.narrowHeight}px` }
    : { '--docs-gallery-specimen': `${item.height}px` }
}
</script>

<template>
  <div class="docs-gallery">
    <DocsGalleryFrameworkBar :suite="props.suite" :version="tuffexPkg.version" />

    <GalleryBaseSuite v-if="props.suite === 'base'" :doc-path="docPath" :cell-label="cellLabel" :locale-key="localeKey" />

    <div v-if="props.suite === 'pro'" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('motion-form')">
          {{ cellLabel('MotionForm', '动效表单') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-form" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('motion-control')">
          {{ cellLabel('MotionControl', '复合控件') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-control" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('motion-metric')">
          {{ cellLabel('MotionMetric', '复合指标') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="motion-metric" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('version-capsule')">
          {{ cellLabel('VersionCapsule', '版本胶囊') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <TxVersionCapsule :version="`v${tuffexPkg.version}`" channel="BETA" tone="preview" v-bind="text.versionCapsule" />
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
        <NuxtLink class="docs-gallery__label" :to="docPath('metal-fx')">
          {{ cellLabel('MetalFx', '液态金属') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxMetalFx preset="chromatic" theme="auto">
                <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 14px; border-radius: 999px; font-size: 13px">{{ text.upgrade }}</span>
              </TxMetalFx>
              <TxMetalBadge>New</TxMetalBadge>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('voice-beam')">
          {{ cellLabel('VoiceBeam', '语音光束') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <TxVoiceBeam color-variant="ocean" theme="auto" :border-radius="14">
              <div class="docs-gallery__beam-card">
                {{ text.askAnything }}
              </div>
            </TxVoiceBeam>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('image-generation')">
          {{ cellLabel('ImageGeneration', '生图占位') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 120px">
          <ClientOnly>
            <GalleryImageGeneration preset="pixels-organic">
              <div style="width: 180px; height: 120px; border-radius: 14px" />
            </GalleryImageGeneration>
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 135px">
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
            <TxModal v-model="markdownOpen" :title="copy.releaseNotes" :close-label="copy.close" width="min(92vw, 640px)">
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
              <TxSearchPanel v-model="searchPanelValue" :items="text.searchPanelItems" :placeholder="copy.searchPlugins" v-bind="text.searchPanel" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('terminal')">
          {{ cellLabel('Terminal', '终端显示') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__block--wide" style="height: 176px">
              <TxTerminal
                read-only
                :lines="terminalLines"
                :labels="{ ariaLabel: text.terminal }"
              />
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 160px">
          <ClientOnly>
            <GalleryVirtualList :title="copy.virtualTitle" :count-label="copy.virtualCount" :names="text.plugins" />
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
            <GalleryEdgeMarquee :names="text.plugins" />
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
        <NuxtLink class="docs-gallery__label" :to="docPath('fold-page')">
          {{ cellLabel('FoldPage', '折页') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 150px">
          <ClientOnly>
            <div class="docs-gallery__fold">
              <TxFoldCorner v-model="foldGalleryPeeled" corner="bottom-right" size="sm" :radius="14">
                <template #default>
                  <div class="docs-gallery__fold-sheet">
                    <span class="docs-gallery__fold-title">{{ copy.foldCardTitle }}</span>
                    <span class="docs-gallery__fold-hint">{{ copy.foldCardHint }}</span>
                  </div>
                </template>
                <template #under>
                  <div class="docs-gallery__fold-under">
                    <span class="docs-gallery__fold-title">{{ copy.foldUnderTitle }}</span>
                  </div>
                </template>
              </TxFoldCorner>
            </div>
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 128px">
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 132px">
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
        <NuxtLink class="docs-gallery__label" :to="docPath('prism-glow')">
          {{ cellLabel('PrismGlow', '棱镜光') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <!-- The glow's root is the card: its light paints over the card's
                 background and under the text, rising from the bottom edge. -->
            <TxPrismGlow class="docs-gallery__prism-card">
              {{ copy.searching }}…
            </TxPrismGlow>
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
              <div v-for="item in text.staggerItems" :key="item.icon" class="docs-gallery__tile docs-gallery__stagger-item">
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 154px">
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
                <TxTuffLogoStroke :size="64" :mode="mode.value" :aria-label="text.logoStroke" />
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
              <TuffSwitch v-model="resizeWide" :aria-label="text.widen" />
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
            <GalleryThinkingOrb />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('matrix-loader')">
          {{ cellLabel('MatrixLoader', '球面矩阵加载器') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryMatrixLoader />
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
        <NuxtLink class="docs-gallery__label" :to="docPath('choice-card')">
          {{ cellLabel('ChoiceCard', '选项卡片') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 272px">
          <ClientOnly>
            <div class="docs-gallery__block">
              <GalleryChoiceCard />
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
              <GalleryAttachmentTray />
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 195px; --docs-gallery-specimen-narrow: 219px">
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
                v-bind="text.chatComposer"
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
            <TxMessageActions :copy-text="copy.installBody" regenerable v-bind="text.messageActions" />
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
              <TxPromptBar v-model="promptDraft" :placeholder="copy.typeSomething" v-bind="text.promptBar" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('voice-clip')">
          {{ cellLabel('VoiceClip', '语音条') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <GalleryVoiceClip />
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
              <TxAgentTrace :rows="traceRows" working default-open v-bind="text.agentTrace" />
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
              <TxAgentsList :agents="aiAgents" v-bind="text.agentsList" />
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
                v-bind="text.approvalCard"
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
              <TxTaskRows :rows="taskRowItems" v-bind="text.taskRows" />
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
              <TxToolCallCard :tool-call="toolCall" default-expanded v-bind="text.toolCallCard" />
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
                v-bind="text.toolConfirmation"
                :aria-label="text.toolConfirmationName"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('bot-avatar')">
          {{ cellLabel('BotAvatar', '机器人头像') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxBotAvatar type="clover" state="working" :size="64" :aria-label="text.botAvatars.clover" />
              <TxBotAvatar type="mech" state="default" :size="64" :aria-label="text.botAvatars.mech" />
              <TxBotAvatar type="star" state="working" :size="64" :aria-label="text.botAvatars.star" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('miko')">
          {{ cellLabel('Miko', '伴侣猫') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxMiko state="idle" size="sm" />
              <TxMiko state="working" size="sm" />
              <TxMiko state="thinking" size="sm" />
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
              <TxChainOfThought :steps="cotSteps" default-open v-bind="text.chainOfThought" />
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
              <TxCodeStream :code="codeSample" lang="ts" filename="greet.ts" lang-label="TypeScript" v-bind="text.codeStream" />
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
              <TxReasoningDisclosure :text="copy.aboutBody" :duration-ms="2400" default-open v-bind="text.reasoning" />
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
              <TxSources :sources="aiSources" variant="stack" v-bind="text.sources" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('stream-element')">
          {{ cellLabel('StreamElement', '流式回答') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <GalleryStreamElement :markdown="copy.streamAnswer" :sources="streamSources" :locale="localeKey" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('stream-text')">
          {{ cellLabel('StreamText', '流式文字') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose">
          <ClientOnly>
            <div class="docs-gallery__block">
              <GalleryStreamText :text="copy.streamSentence" />
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 206px">
          <ClientOnly>
            <div class="docs-gallery__block">
              <GalleryStreamMarkdown :markdown="copy.streamMarkdown" />
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
              <TxContextCards :chunks="contextChunks" :title="copy.contextTitle" :total="32" />
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
            <TxContextIndicator :used-tokens="48000" :max-tokens="128000" v-bind="text.contextIndicator" />
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
              <TxFineTuneCard :values="fineTuneValues" v-bind="copy.fineTune" />
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
              <TxInsightCards :pages="insightPages" :title="copy.suiteAi" v-bind="text.insightCards" />
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
              <TxRecommendationCard v-bind="text.recommendationCard" :options="text.recommendationOptions" />
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
                :style="{ background: categoricalVar(index - 1) }"
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
          {{ cellLabel('Maps', '地图') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 204px">
          <ClientOnly>
            <GalleryChoroplethMap />
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 198px; --docs-gallery-specimen-narrow: 216px">
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 150px">
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 150px">
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
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 290px">
          <NuxtClientOnly>
            <ClientOnly>
            <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="mono-chart" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
            </ClientOnly>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </NuxtClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('diff-table')">
          {{ cellLabel('DiffTable', '差异表') }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 119px">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxDiffTable :columns="text.diffColumns" :rows="text.diffRows" play="auto" />
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
            <GalleryEChart />
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
            <GalleryFlowchart />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <div v-if="props.suite === 'motion'" class="docs-gallery__grid">
      <section v-for="item in motionGalleryItems" :key="item.kind" class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath(item.doc)">
          {{ cellLabel(item.name, item.zh) }}
        </NuxtLink>
        <div class="docs-gallery__stage not-prose" :style="specimenStyle(item)">
          <ClientOnly>
            <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" :kind="item.kind" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
</div>
  </div>
</template>
