<script setup lang="ts">
import './gallery-categories.css'
import type { AiAttachment, AiChainStep, AiElementMessage } from '@tuffex-components/ai-elements'
import type { ContextChunk } from '@tuffex-components/context-cards'
import type { FineTuneTypeOption, FineTuneValues } from '@tuffex-components/fine-tune-card'
import type { MikoState } from '@tuffex-components/miko'
import type { PromptBarCommand, PromptBarModel, PromptBarSource } from '@tuffex-components/prompt-bar'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { galleryText } from '../gallery-text'
import ClientOnly from '../GallerySpecimenGate.vue'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const { t } = useI18n()

const GalleryAttachmentTray = defineAsyncComponent(() => import('../GalleryAttachmentTray.vue'))
const GalleryChoiceCard = defineAsyncComponent(() => import('../GalleryChoiceCard.vue'))
const GalleryConversationStream = defineAsyncComponent(() => import('../GalleryConversationStream.vue'))
const GalleryFlowchart = defineAsyncComponent(() => import('../GalleryFlowchart.vue'))
const GalleryMatrixLoader = defineAsyncComponent(() => import('../GalleryMatrixLoader.vue'))
const GalleryStreamElement = defineAsyncComponent(() => import('../GalleryStreamElement.vue'))
const GalleryStreamMarkdown = defineAsyncComponent(() => import('../GalleryStreamMarkdown.vue'))
const GalleryStreamText = defineAsyncComponent(() => import('../GalleryStreamText.vue'))
const GalleryThinkingOrb = defineAsyncComponent(() => import('../GalleryThinkingOrb.vue'))
const GalleryVoiceClip = defineAsyncComponent(() => import('../GalleryVoiceClip.vue'))

type AiCategoryKey = 'aichat' | 'aiagent' | 'aireasoning' | 'aicontext'

const categoryMeta = computed<Record<AiCategoryKey, { label: string, desc: string, icon: string, count: number }>>(() => ({
  aichat: {
    label: t('docsSidebar.categories.aiChat'),
    desc: props.localeKey === 'zh'
      ? '对话列表、输入框、语音条、附件托盘、提示栏与建议胶囊'
      : 'Chat lists, composers, voice clips, attachment trays, prompt bars, and suggestion chips',
    icon: 'i-carbon-chat',
    count: 11,
  },
  aiagent: {
    label: t('docsSidebar.categories.aiAgent'),
    desc: props.localeKey === 'zh'
      ? '智能体列表、屏幕、轨迹、审批卡、工具确认、伴侣形象与流程画布'
      : 'Agent lists, screens, traces, approval cards, tool confirmations, companion avatars, and flowcharts',
    icon: 'i-carbon-bot',
    count: 12,
  },
  aireasoning: {
    label: t('docsSidebar.categories.aiReasoning'),
    desc: props.localeKey === 'zh'
      ? '思考球、矩阵加载器、思维链、推理折叠、引用来源与流式渲染'
      : 'Thinking orbs, matrix loaders, chains of thought, reasoning disclosures, citations, and streaming',
    icon: 'i-carbon-machine-learning-model',
    count: 11,
  },
  aicontext: {
    label: t('docsSidebar.categories.aiContext'),
    desc: props.localeKey === 'zh'
      ? '上下文卡、用量指示、微调面板、洞察卡与推荐决策卡'
      : 'Context cards, token usage indicators, fine-tune controls, insight cards, and recommendations',
    icon: 'i-carbon-layers',
    count: 5,
  },
}))

const categoryList = computed(() =>
  (['aichat', 'aiagent', 'aireasoning', 'aicontext'] as const).map(key => ({
    key,
    ...categoryMeta.value[key],
  })),
)

const activeCategory = ref<AiCategoryKey>('aichat')
let catObserver: IntersectionObserver | null = null
let manualLockUntil = 0
let realignTimer: number | null = null
let reconcileTimer: number | null = null
const visibleCategories = new Set<AiCategoryKey>()
const CATEGORY_KEYS: AiCategoryKey[] = ['aichat', 'aiagent', 'aireasoning', 'aicontext']
const STICKY_LANDING_OFFSET = 178

function syncActiveCategory() {
  const firstVisible = CATEGORY_KEYS.find(k => visibleCategories.has(k))
  if (firstVisible)
    activeCategory.value = firstVisible
}

function scrollToCategory(key: AiCategoryKey) {
  activeCategory.value = key
  if (!import.meta.client || !hasDocument())
    return
  const el = document.getElementById(`ai-cat-${key}`)
  if (!el)
    return
  manualLockUntil = Date.now() + 950
  if (realignTimer !== null) {
    window.clearTimeout(realignTimer)
    realignTimer = null
  }
  if (reconcileTimer !== null) {
    window.clearTimeout(reconcileTimer)
    reconcileTimer = null
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
  reconcileTimer = window.setTimeout(() => {
    reconcileTimer = null
    if (Date.now() >= manualLockUntil)
      syncActiveCategory()
  }, 980)
}

onMounted(() => {
  if (!hasWindow() || !('IntersectionObserver' in window))
    return
  catObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const key = entry.target.id.replace(/^ai-cat-/, '') as AiCategoryKey
        if (entry.isIntersecting)
          visibleCategories.add(key)
        else
          visibleCategories.delete(key)
      }
      if (Date.now() < manualLockUntil)
        return
      syncActiveCategory()
    },
    { rootMargin: '-180px 0px -65% 0px', threshold: 0 },
  )
  for (const key of CATEGORY_KEYS) {
    const el = document.getElementById(`ai-cat-${key}`)
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
  if (reconcileTimer !== null && hasWindow()) {
    window.clearTimeout(reconcileTimer)
    reconcileTimer = null
  }
})

const text = computed(() => galleryText[props.localeKey])

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      categoryCount: (n: number) => `${n} 个组件`,
      suiteAi: 'AI',
      typeSomething: '输入点什么…',
      delete: '删除',
      dialogTitle: '删除插件？',
      dialogMessage: '该操作无法撤销。',
      confirm: '确认',
      reviewing: '审阅中',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      installBody: 'pnpm add @talex-touch/tuffex',
      contextTitle: '全部片段',
      contextChunk: {
        title: '按需引入',
        body: '新接入的应用和包优先使用子路径导入，默认避免业务 bundle 拉入包根入口和全量样式。',
        chars: '字符',
        source: 'README_ZHCN.md',
      },
      screenCursor: '正在打开「照片」',
      screenAria: '智能体屏幕',
      screenHint: '点击放大 · 示教',
      working: '处理中',
      searching: '检索中',
      synthesizing: '整理中',
      typing: '正在输入…',
      composerTray: '上下文',
      connectApps: '连接应用',
      selectProject: '选择项目',
      requestApproval: '请求批准',
      unrestricted: '无限制访问',
      deepThink: '深度思考',
      fastReply: '极速回复',
      webSearch: '联网检索',
      localCache: '本地缓存',
      citationBefore: 'TuffEx 支持子路径按需导入，组件源码托管于',
      citationBetween: '，并发布至',
      citationAfter: '供业务直接安装。',
      contextLevels: { ok: '正常', warning: '预警', danger: '临界' },
      aiElementPrompt: '检查按需样式闭包是否在预算内？',
      aiElementReasoning: '扫描 style-deps.json 并核对 chat 子路径闭包样式总大小。',
      suggestions: [
        { id: 's1', text: '如何发布插件？' },
        { id: 's2', text: '怎样声明权限？' },
        { id: 's3', text: '支持哪些平台？' },
        { id: 's4', text: '查看按需引入' },
      ],
      streamTurns: [
        { id: 't1', role: 'user' as const, content: '帮我检查一下 TuffEx 的按需样式闭环。' },
        { id: 't2', role: 'assistant' as const, content: '已扫描 style-deps.json，chat 页面闭包 28 份样式表均在预算内。' },
        { id: 't3', role: 'user' as const, content: '需要额外引入全局 CSS 吗？' },
        { id: 't4', role: 'assistant' as const, content: '只需引入 base.css 与目标组件子路径，无需拉入全量包。' },
        { id: 't5', role: 'user' as const, content: '好的，顺便生成一份变更摘要。' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: '读取清单', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: '执行构建', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 次工具调用',
      approvalQuestions: [
        {
          id: 'channel',
          question: '选择此次发布的默认通道？',
          options: [
            { value: 'stable', label: 'Stable · 面向全体用户' },
            { value: 'beta', label: 'Beta · 灰度尝鲜通道' },
          ],
        },
        {
          id: 'scope',
          question: '允许插件申请哪些运行时权限？',
          type: 'checkbox' as const,
          options: [
            { value: 'clipboard', label: '读取剪贴板历史' },
            { value: 'fs', label: '访问当前工作区文件' },
          ],
        },
      ],
      agents: [
        { id: 'coder', name: '代码助手', description: '分析仓库改动、生成补丁并运行测试', iconClass: 'i-carbon-code', badgeText: 6 },
        { id: 'research', name: '检索智能体', description: '聚合文档、依赖与变更记录上下文', iconClass: 'i-carbon-search', badgeText: 3 },
        { id: 'ops', name: '发布守卫', description: '校验签发物与跨平台构建清单', iconClass: 'i-carbon-terminal', disabled: true },
      ],
      taskDetails: {
        verify: [
          { label: '检查类型定义', meta: '12 ms' },
          { label: '校验样式体积预算', meta: '191.8 KiB' },
        ],
        build: [
          { label: '编译 ES 模块产物', meta: '进行中' },
          { label: '生成 style-deps 清单', meta: '排队中' },
        ],
      },
      contextChunk2: {
        title: '样式依赖清单',
        body: 'style-deps.json 精确声明组件样式闭包，让页面仅加载真实渲染到的样式表。',
        source: 'style-deps.json',
      },
      insights: [
        { key: 'adoption', prose: '子路径按需引入已覆盖全部核心视图，单页首屏样式体积下降 81%。', suggestion: '查看按需引入指南' },
        { key: 'contrast', prose: '暗色与高对比度主题均通过 WCAG AA 文本对比度校验。', suggestion: '对比配色规范' },
        { key: 'motion', prose: '所有流式揭示与状态切换均尊重系统减少动态效果偏好。', suggestion: '了解动效契约' },
      ],
      fineTuneTypes: [
        { value: 'card', label: '悬浮卡片' },
        { value: 'panel', label: '玻璃面板' },
        { value: 'pill', label: '胶囊条' },
      ] satisfies FineTuneTypeOption[],
      mikoCaptions: {
        idle: '待命',
        working: '执行中',
        thinking: '思考中',
        coffee: '喝咖啡',
        celebrating: '庆祝',
      },
      promptSources: [
        { key: 'docs', name: 'TuffEx 文档', desc: '组件与设计规范', connectable: true, connected: true },
        { key: 'repo', name: '工作区代码', desc: 'packages/tuffex', connectable: true, connected: false },
      ] satisfies PromptBarSource[],
      promptCommands: [
        { key: 'review', name: '/review', desc: '审查当前改动与视觉细节' },
        { key: 'audit', name: '/audit', desc: '检查包体积与对比度门槛' },
      ] satisfies PromptBarCommand[],
      aiElementBody: '已校验 `style-deps.json`，**28 份**按需样式表全部处于体积预算内。',
      toolConfirmSummary: '即将写入并更新当前工作区内的 src/main.ts。',
      cotBody1: '定位 `packages/tuffex` 子路径导出与样式依赖闭环，确认无重复规则。',
      reasoningBody: '先比对浅色与深色模式下的对比度与圆角嵌套关系，再校验按需样式闭包体积是否满足上限，最后输出精简修改方案。',
      streamSentence: '开心果是这个月增长最快的口味，销量涨了 23%，核果类口味也在同一区间升温。',
      streamMarkdown: '### 开心果周报\n\n开心果本月**增长最快**，销量涨了 23%，下周补货 `pistachio-base`。\n\n- 烘焙批次：**42 批**，产能稳定\n- 复购率：`98.4%`，环比 `+3.1%`\n\n```ts\nconst restock = { flavor: \'pistachio\', delta: \'+23%\' }\n```',
      streamAnswer: '开心果这个月增长最快 [1]，建议：\n\n- 补货 `pistachio-base`\n- 周末加一场试吃',
      fineTune: {
        title: '微调',
        layoutLabel: '布局',
        layoutLabels: { row: '横向布局', col: '纵向布局', grid: '网格布局' },
        typeLabel: '类型',
        typePlaceholder: '选择类型',
        adjustLabel: '可调整',
        editedLabel: '已修改',
        fieldLabels: { width: '宽', height: '高', radius: '圆角', opacity: '不透明' },
        valueLabelFormatter: (label: string) => `${label}数值`,
      },
    }
  : {
      categoryCount: (n: number) => `${n} components`,
      suiteAi: 'AI',
      typeSomething: 'Type something...',
      delete: 'Delete',
      dialogTitle: 'Delete plugin?',
      dialogMessage: 'This action cannot be undone.',
      confirm: 'Confirm',
      reviewing: 'Reviewing',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      installBody: 'pnpm add @talex-touch/tuffex',
      contextTitle: 'All chunks',
      contextChunk: {
        title: 'On-demand import',
        body: 'Use subpath imports for new app and package integrations. This keeps the package root and full stylesheet out of business bundles by default.',
        chars: 'characters',
        source: 'README.md',
      },
      screenCursor: 'Opening Photos',
      screenAria: 'Agent screen',
      screenHint: 'Expand · Teach',
      working: 'Working',
      searching: 'Searching',
      synthesizing: 'Synthesizing',
      typing: 'Typing…',
      composerTray: 'Context',
      connectApps: 'Connect apps',
      selectProject: 'Select a project',
      requestApproval: 'Request approval',
      unrestricted: 'Unrestricted access',
      deepThink: 'Deep think',
      fastReply: 'Fast reply',
      webSearch: 'Web search',
      localCache: 'Local cache',
      citationBefore: 'TuffEx supports subpath imports — source lives on',
      citationBetween: 'and packages ship via',
      citationAfter: '.',
      contextLevels: { ok: 'Normal', warning: 'Warning', danger: 'Critical' },
      aiElementPrompt: 'Verify the on-demand CSS closure stays within budget.',
      aiElementReasoning: 'Auditing style-deps.json and checking total sheet size for the chat subpath.',
      suggestions: [
        { id: 's1', text: 'How do I publish a plugin?' },
        { id: 's2', text: 'How to declare permissions?' },
        { id: 's3', text: 'Supported platforms?' },
        { id: 's4', text: 'On-demand imports' },
      ],
      streamTurns: [
        { id: 't1', role: 'user' as const, content: 'Audit the on-demand style closure for TuffEx chat.' },
        { id: 't2', role: 'assistant' as const, content: 'Scanned style-deps.json: 28 sheets in the chat closure, all within budget.' },
        { id: 't3', role: 'user' as const, content: 'Do we still need the full stylesheet?' },
        { id: 't4', role: 'assistant' as const, content: 'No — load base.css plus each component subpath stylesheet only.' },
        { id: 't5', role: 'user' as const, content: 'Great, draft a concise release note.' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: 'Read manifest', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: 'Run build', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 tool calls',
      approvalQuestions: [
        {
          id: 'channel',
          question: 'Which channel should this build target?',
          options: [
            { value: 'stable', label: 'Stable · default for everyone' },
            { value: 'beta', label: 'Beta · early preview rollout' },
          ],
        },
        {
          id: 'scope',
          question: 'Grant runtime permissions for this plugin?',
          type: 'checkbox' as const,
          options: [
            { value: 'clipboard', label: 'Read clipboard history' },
            { value: 'fs', label: 'Access active workspace files' },
          ],
        },
      ],
      agents: [
        { id: 'coder', name: 'Code Agent', description: 'Inspect diffs, patch modules, and verify tests', iconClass: 'i-carbon-code', badgeText: 6 },
        { id: 'research', name: 'Research Agent', description: 'Synthesize docs, tokens, and release notes', iconClass: 'i-carbon-search', badgeText: 3 },
        { id: 'ops', name: 'Release Guard', description: 'Verify artifacts and cross-platform manifests', iconClass: 'i-carbon-terminal', disabled: true },
      ],
      taskDetails: {
        verify: [
          { label: 'Validate TypeScript exports', meta: '12 ms' },
          { label: 'Audit stylesheet size budget', meta: '191.8 KiB' },
        ],
        build: [
          { label: 'Compile ES module bundle', meta: 'Running' },
          { label: 'Emit style-deps graph', meta: 'Queued' },
        ],
      },
      contextChunk2: {
        title: 'Style dependency graph',
        body: 'style-deps.json declares exact component closures so each page ships only rendered sheets.',
        source: 'style-deps.json',
      },
      insights: [
        { key: 'adoption', prose: 'Subpath imports now cover every core surface, cutting first-load CSS by 81%.', suggestion: 'Read import guide' },
        { key: 'contrast', prose: 'Both dark and high-contrast themes pass WCAG AA text contrast thresholds.', suggestion: 'Inspect color tokens' },
        { key: 'motion', prose: 'Every streaming reveal and state morph respects prefers-reduced-motion.', suggestion: 'Review motion contract' },
      ],
      fineTuneTypes: [
        { value: 'card', label: 'Floating card' },
        { value: 'panel', label: 'Glass panel' },
        { value: 'pill', label: 'Capsule bar' },
      ] satisfies FineTuneTypeOption[],
      mikoCaptions: {
        idle: 'Idle',
        working: 'Working',
        thinking: 'Thinking',
        coffee: 'Coffee',
        celebrating: 'Celebrate',
      },
      promptSources: [
        { key: 'docs', name: 'TuffEx Docs', desc: 'Components & design rules', connectable: true, connected: true },
        { key: 'repo', name: 'Workspace', desc: 'packages/tuffex', connectable: true, connected: false },
      ] satisfies PromptBarSource[],
      promptCommands: [
        { key: 'review', name: '/review', desc: 'Review current diff & visuals' },
        { key: 'audit', name: '/audit', desc: 'Run size & contrast audits' },
      ] satisfies PromptBarCommand[],
      aiElementBody: 'Verified `style-deps.json`: all **28 sheets** in the on-demand closure fit the CSS budget.',
      toolConfirmSummary: 'Will write and patch src/main.ts in the active workspace.',
      cotBody1: 'Checked `packages/tuffex` subpath exports and verified zero duplicate rules across style sheets.',
      reasoningBody: 'Comparing light and dark contrast ratios with concentric corner radii first, then confirming the on-demand CSS closure stays within budget before finalizing edits.',
      streamSentence: 'Pistachio is your fastest-growing flavor, up 23% this month, and stone-fruit is trending in the same range.',
      streamMarkdown: '### Pistachio weekly\n\nPistachio is the **fastest-growing** flavor, up 23% — restock `pistachio-base` next week.\n\n- Roast batches: **42**, on schedule\n- Repeat rate: `98.4%`, up `+3.1%` WoW\n\n```ts\nconst restock = { flavor: \'pistachio\', delta: \'+23%\' }\n```',
      streamAnswer: 'Pistachio grew fastest this month [1], so:\n\n- Restock `pistachio-base`\n- Add a weekend tasting',
      fineTune: {
        title: 'Fine-tune',
        layoutLabel: 'Layout',
        layoutLabels: { row: 'Row layout', col: 'Column layout', grid: 'Grid layout' },
        typeLabel: 'Type',
        typePlaceholder: 'Select type',
        adjustLabel: 'Adjust',
        editedLabel: 'Edited',
        fieldLabels: { width: 'W', height: 'H', radius: 'Radius', opacity: 'Opacity' },
      },
    }))

const codeSample = 'export function greet(name: string) {\n  return \'Hi, \' + name.trim()\n}\n'
const codeDiffSample = [
  { number: 1, content: 'export function greet(name: string) {' },
  { number: 2, kind: 'removed' as const, content: '  return \'Hello \' + name' },
  { number: 2, kind: 'added' as const, content: '  return \'Hi, \' + name.trim()' },
  { number: 3, content: '}' },
]
const toolDiffSamples = [
  {
    file: 'flavors.css',
    add: 13,
    del: 0,
    lines: [
      { text: '.scoop-card {' },
      { kind: 'del' as const, text: '  gap: 14px;' },
      { kind: 'add' as const, text: '  gap: 12px;' },
      { kind: 'add' as const, text: '  container-type: inline-size;' },
      { text: '}' },
    ],
  },
  {
    file: 'index.ts',
    add: 12,
    del: 3,
    lines: [
      { text: 'export function resolveChannel(id: string) {' },
      { kind: 'del' as const, text: '  return channels.find(c => c.id === id)' },
      { kind: 'add' as const, text: '  return channels.get(id) ?? defaultChannel' },
      { text: '}' },
    ],
  },
]
// The StreamElement cell's one source, which its `[1]` resolves to.
const streamSources = [{ id: 'scoop', url: 'https://scoopdata.io/flavors/pistachio', title: 'Scoop Data' }]

const GITHUB_FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#24292f"/><circle cx="8" cy="8" r="3.6" fill="#fff"/></svg>')
const NPM_FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#cb3837"/><path d="M3.5 5h9v6h-2.2V7.2H8.2V11H3.5z" fill="#fff"/></svg>')

const typingVariants = [
  { id: 'dots', label: 'dots' },
  { id: 'bars', label: 'bars' },
  { id: 'ring', label: 'ring' },
  { id: 'pure', label: 'pure' },
  { id: 'circle-dash', label: 'dash' },
  { id: 'ai', label: 'ai' },
] as const

const mikoShowcaseStates: readonly MikoState[] = ['idle', 'working', 'thinking', 'coffee', 'celebrating']

const chatDraft = ref('')
// The ChatComposer specimen is the reference composer: a context tray that trades
// sides and a mode chip that morphs. Both are click-driven, so nothing loops.
const composerTray = ref<'top' | 'bottom'>('bottom')
const composerUnrestricted = ref(false)
const modeChipOn = ref(false)
const modeChipThinking = ref(true)
const modeChipWeb = ref(true)
const speakState = ref<'idle' | 'speaking'>('idle')
const promptDraft = ref('')
const promptModel = ref('tuff-pro')
const promptAttachments = ref<AiAttachment[]>([
  { kind: 'file', id: 'spec-md', name: 'spec.md', size: 14_540, mime: 'text/markdown' },
])
const selectedAgentId = ref<string>('coder')

function removePromptAttachment(id: string): void {
  promptAttachments.value = promptAttachments.value.filter(item => item.id !== id)
}

function attachPromptSample(): void {
  if (promptAttachments.value.some(item => item.id === 'spec-md'))
    return
  promptAttachments.value = [
    ...promptAttachments.value,
    { kind: 'file', id: 'spec-md', name: 'spec.md', size: 14_540, mime: 'text/markdown' },
  ]
}

const promptModels: PromptBarModel[] = [
  { key: 'tuff-pro', name: 'Tuff Pro', tag: 'Default', effort: 'Auto' },
  { key: 'claude-4', name: 'Claude 4', tag: 'Reasoning' },
  { key: 'gpt-5', name: 'GPT-5', tag: 'Fast' },
]

function toggleSpeak() {
  speakState.value = speakState.value === 'speaking' ? 'idle' : 'speaking'
}

const chatListMessages = computed(() => [
  { id: 'u1', role: 'user' as const, name: props.localeKey === 'zh' ? '你' : 'You', content: copy.value.suggestions[0]?.text ?? '', createdAt: 1_705_000_000_000 },
  { id: 'a1', role: 'assistant' as const, name: 'Tuff AI', content: copy.value.aboutBody, createdAt: 1_705_000_001_000 },
])
const aiSources = [
  { id: 's1', url: 'https://github.com/talex-touch/talex-touch', title: 'talex-touch', favicon: GITHUB_FAVICON },
  { id: 's2', url: 'https://www.npmjs.com/package/@talex-touch/tuffex', title: '@talex-touch/tuffex', favicon: NPM_FAVICON },
]
const aiElementMessages = computed<AiElementMessage[]>(() => [
  {
    id: 'ai-el-u1',
    role: 'user',
    name: props.localeKey === 'zh' ? '你' : 'You',
    content: copy.value.aiElementPrompt,
  },
  {
    id: 'ai-el-1',
    role: 'assistant',
    name: 'Tuff AI',
    content: copy.value.aiElementBody,
    parts: [
      { type: 'reasoning', text: copy.value.aiElementReasoning, done: true, durationMs: 1200 },
      { type: 'tool-call', id: 'ai-el-call', name: 'audit_styles', summary: 'style-deps.json', status: 'done', durationMs: 210, output: '28 sheets · within budget' },
      { type: 'text', text: copy.value.aiElementBody },
      { type: 'sources', sources: aiSources },
    ],
  },
])
const traceRows = computed(() => [
  { id: 'read', primary: copy.value.toolRows[0]?.label ?? '', secondary: 'manifest.json', mono: true, status: 'done' as const },
  { id: 'run', primary: copy.value.toolRows[1]?.label ?? '', secondary: 'pnpm build', mono: true, status: 'active' as const },
])
const aiAgents = computed(() => copy.value.agents)
const taskRowItems = computed(() => [
  { id: 'verify', label: copy.value.reviewing, status: 'done' as const, details: copy.value.taskDetails.verify },
  { id: 'build', label: copy.value.working, status: 'running' as const, details: copy.value.taskDetails.build },
])
const toolConfirmationInput = '{\n  "path": "src/main.ts",\n  "mode": "patch"\n}'
const toolCall = {
  type: 'tool-call' as const,
  id: 'call-1',
  name: 'write_file',
  summary: 'src/main.ts',
  status: 'done' as const,
  durationMs: 420,
  input: toolConfirmationInput,
  output: 'Updated 1 file (+12 -3)',
}
const cotSteps = computed<AiChainStep[]>(() => [
  { id: 's1', kind: 'thinking', title: copy.value.searching, body: copy.value.cotBody1, status: 'done', durationMs: 840 },
  { id: 's2', kind: 'tool', title: copy.value.working, body: copy.value.installBody, status: 'active' },
])
const contextChunks = computed<ContextChunk[]>(() => {
  const chunk = copy.value.contextChunk
  const chunk2 = copy.value.contextChunk2
  return [
    {
      id: 'c1',
      title: chunk.title,
      chars: `${chunk.body.length} ${chunk.chars}`,
      body: chunk.body,
      source: { name: chunk.source, badge: 'MD', tone: 'accent' },
    },
    {
      id: 'c2',
      title: chunk2.title,
      chars: `${chunk2.body.length} ${chunk.chars}`,
      body: chunk2.body,
      source: { name: chunk2.source, badge: 'JSON', tone: 'neutral' },
    },
  ]
})
const insightPages = computed(() => copy.value.insights)
interface InsightMetricItem {
  label: string
  color: string
  value?: number
  delta?: string
  unit?: string
  precision?: number
  detail: string
  tone?: 'positive' | 'negative' | 'neutral'
}
const insightMetricsByKey = computed<Record<string, InsightMetricItem[]>>(() => (props.localeKey === 'zh'
  ? {
      adoption: [
        { label: '首屏样式', color: 'var(--tx-bui-green, #189a4d)', value: -81.2, precision: 1, detail: '217 KiB / 1.03 MiB', tone: 'positive' },
        { label: '按需覆盖', color: 'var(--tx-bui-accent, #0285ff)', delta: '100%', detail: '37 个 AI 子路径', tone: 'neutral' },
      ],
      contrast: [
        { label: 'AA 通过率', color: 'var(--tx-bui-green, #189a4d)', delta: '100%', detail: '412 份样式清零', tone: 'positive' },
        { label: '暗色均值', color: 'var(--tx-bui-accent, #0285ff)', delta: '10.5:1', detail: 'WCAG AAA 级别', tone: 'neutral' },
      ],
      motion: [
        { label: '渲染帧率', color: 'var(--tx-bui-green, #189a4d)', delta: '60 fps', detail: 'GPU 合成零重排', tone: 'positive' },
        { label: '降级支持', color: 'var(--tx-bui-amber, #d9822b)', delta: '100%', detail: 'reduced-motion', tone: 'neutral' },
      ],
    }
  : {
      adoption: [
        { label: 'First-load CSS', color: 'var(--tx-bui-green, #189a4d)', value: -81.2, precision: 1, detail: '217 KiB / 1.03 MiB', tone: 'positive' },
        { label: 'Subpath cover', color: 'var(--tx-bui-accent, #0285ff)', delta: '100%', detail: '37 AI subpaths', tone: 'neutral' },
      ],
      contrast: [
        { label: 'AA pass rate', color: 'var(--tx-bui-green, #189a4d)', delta: '100%', detail: '412 sheets clean', tone: 'positive' },
        { label: 'Dark ratio', color: 'var(--tx-bui-accent, #0285ff)', delta: '10.5:1', detail: 'WCAG AAA band', tone: 'neutral' },
      ],
      motion: [
        { label: 'Frame pacing', color: 'var(--tx-bui-green, #189a4d)', delta: '60 fps', detail: 'Zero layout thrash', tone: 'positive' },
        { label: 'Reduced motion', color: 'var(--tx-bui-amber, #d9822b)', delta: '100%', detail: 'Instant settle', tone: 'neutral' },
      ],
    }))
const fineTuneDefaults: FineTuneValues = {
  layout: 'grid',
  width: 320,
  height: 180,
  radius: 14,
  opacity: 100,
  type: 'panel',
}
const fineTuneValues = ref<FineTuneValues>({ ...fineTuneDefaults })
const citeSources = [
  { id: 'repo', url: 'https://github.com/talex-touch/talex-touch', favicon: GITHUB_FAVICON },
  { id: 'npm', url: 'https://www.npmjs.com/package/@talex-touch/tuffex', favicon: NPM_FAVICON },
]
</script>

<template>
  <div class="docs-gallery__ai-suite">
    <nav class="docs-gallery__cat-nav not-prose" aria-label="AI Suite categories">
      <a
        v-for="cat in categoryList"
        :key="cat.key"
        :href="`#ai-cat-${cat.key}`"
        class="docs-gallery__cat-pill"
        :class="{ 'is-active': activeCategory === cat.key }"
        @click.prevent="scrollToCategory(cat.key)"
      >
        <span :class="cat.icon" class="docs-gallery__cat-pill-icon" aria-hidden="true" />
        <span>{{ cat.label }}</span>
        <span class="docs-gallery__cat-pill-count">{{ cat.count }}</span>
      </a>
    </nav>

    <!-- ── 1. AiChat (11) ── -->
    <section id="ai-cat-aichat" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.aichat.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.aichat.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.aichat.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.aichat.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('typing-indicator')">
            {{ cellLabel('TypingIndicator', '打字中') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__typing-grid">
                <div v-for="item in typingVariants" :key="item.id" class="docs-gallery__typing-item">
                  <TxTypingIndicator
                    :variant="item.id"
                    :show-text="false"
                    :loader-size="22"
                    :aria-label="`${copy.typing} (${item.label})`"
                  />
                  <span class="docs-gallery__typing-name">{{ item.label }}</span>
                </div>
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
                <TxSuggestionChips :suggestions="copy.suggestions" />
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
              <div class="docs-gallery__row">
                <TxModeChip
                  :icon="modeChipThinking ? 'i-carbon-idea' : 'i-carbon-flash'"
                  :label="modeChipThinking ? copy.deepThink : copy.fastReply"
                  :tone="modeChipThinking ? 'info' : 'success'"
                  @click="modeChipThinking = !modeChipThinking"
                />
                <TxModeChip
                  :icon="modeChipWeb ? 'i-carbon-earth' : 'i-carbon-data-base'"
                  :label="modeChipWeb ? copy.webSearch : copy.localCache"
                  :tone="modeChipWeb ? 'warning' : 'success'"
                  @click="modeChipWeb = !modeChipWeb"
                />
                <TxModeChip
                  :icon="modeChipOn ? 'i-carbon-unlocked' : 'i-carbon-touch-1'"
                  :label="modeChipOn ? copy.unrestricted : copy.requestApproval"
                  :tone="modeChipOn ? 'danger' : 'muted'"
                  @click="modeChipOn = !modeChipOn"
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
                <TxChatList :messages="chatListMessages" markdown copyable regenerable />
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
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 214px">
            <ClientOnly>
              <GalleryConversationStream />
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
              <div class="docs-gallery__msg-actions-card">
                <p class="docs-gallery__msg-actions-text">
                  {{ copy.aboutBody }}
                </p>
                <TxMessageActions
                  :copy-text="copy.installBody"
                  regenerable
                  speakable
                  :speak-state="speakState"
                  v-bind="text.messageActions"
                  @speak="toggleSpeak"
                />
              </div>
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
              <div class="docs-gallery__block docs-gallery__block--wide">
                <TxPromptBar
                  v-model="promptDraft"
                  v-model:model="promptModel"
                  :models="promptModels"
                  :sources="copy.promptSources"
                  :commands="copy.promptCommands"
                  :attachments="promptAttachments"
                  :context-usage="{ used: 38000, max: 128000, label: localeKey === 'zh' ? '上下文' : 'Context' }"
                  dictatable
                  :placeholder="copy.typeSomething"
                  v-bind="text.promptBar"
                  @attachment-remove="removePromptAttachment"
                  @attach="attachPromptSample"
                />
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
      </div>
    </section>

    <!-- ── 2. AiAgent (11) ── -->
    <section id="ai-cat-aiagent" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.aiagent.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.aiagent.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.aiagent.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.aiagent.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
        <section class="docs-gallery__cell">
          <NuxtLink class="docs-gallery__label" :to="docPath('working-indicator')">
            {{ cellLabel('WorkingIndicator', '工作指示器') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__working-list">
                <div class="docs-gallery__working-row">
                  <TxWorkingIndicator :label="copy.working" variant="drive" />
                  <span class="docs-gallery__working-tag">drive</span>
                </div>
                <div class="docs-gallery__working-row">
                  <TxWorkingIndicator :label="copy.synthesizing" variant="dots" :show-elapsed="false" />
                  <span class="docs-gallery__working-tag">dots</span>
                </div>
                <div class="docs-gallery__working-row">
                  <TxWorkingIndicator :label="copy.searching" variant="orbit" :show-elapsed="false" />
                  <span class="docs-gallery__working-tag">orbit</span>
                </div>
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
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__block--wide">
                <TxToolChips
                  :rows="copy.toolRows"
                  :diffs="toolDiffSamples"
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
                  :label="copy.screenAria"
                  :cursor="{ x: 46, y: 62, label: copy.screenCursor }"
                  expandable
                  teachable
                  :expand-label="localeKey === 'zh' ? '放大查看' : 'Expand screen'"
                  :close-label="localeKey === 'zh' ? '关闭' : 'Close'"
                  :teach-label="localeKey === 'zh' ? '示教任务' : 'Teach a task'"
                  :stop-teach-label="localeKey === 'zh' ? '停止录制' : 'Stop recording'"
                >
                  <div class="docs-gallery__desktop">
                    <span class="docs-gallery__desktop-window is-back" />
                    <span class="docs-gallery__desktop-window is-front" />
                  </div>
                  <template #label>
                    <span class="docs-gallery__screen-foot">
                      <span>{{ copy.screenAria }}</span>
                      <span class="docs-gallery__screen-hint">{{ copy.screenHint }}</span>
                    </span>
                  </template>
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
                <TxAgentsList
                  :agents="aiAgents"
                  :selected-id="selectedAgentId"
                  v-bind="text.agentsList"
                  @select="selectedAgentId = $event"
                />
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
                  skippable
                  :questions="copy.approvalQuestions"
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
                <TxTaskRows :rows="taskRowItems" :default-open-ids="['verify']" v-bind="text.taskRows" />
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
                  :summary="copy.toolConfirmSummary"
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
              <div class="docs-gallery__row docs-gallery__row--loose">
                <div class="docs-gallery__bot-item">
                  <TxBotAvatar type="clover" state="working" :size="60" :aria-label="text.botAvatars.clover" />
                  <span class="docs-gallery__bot-caption">clover</span>
                </div>
                <div class="docs-gallery__bot-item">
                  <TxBotAvatar type="mech" state="default" :size="60" :aria-label="text.botAvatars.mech" />
                  <span class="docs-gallery__bot-caption">mech</span>
                </div>
                <div class="docs-gallery__bot-item">
                  <TxBotAvatar type="star" state="working" :size="60" :aria-label="text.botAvatars.star" />
                  <span class="docs-gallery__bot-caption">star</span>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell docs-gallery__cell--full">
          <NuxtLink class="docs-gallery__label" :to="docPath('miko')">
            {{ cellLabel('Miko', '伴侣猫') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <div class="docs-gallery__miko-grid">
                <div v-for="state in mikoShowcaseStates" :key="state" class="docs-gallery__miko-item">
                  <TxMiko :state="state" size="md" interactive />
                  <span class="docs-gallery__miko-caption">{{ copy.mikoCaptions[state as keyof typeof copy.mikoCaptions] }}</span>
                </div>
              </div>
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>

        <section class="docs-gallery__cell docs-gallery__cell--full">
          <NuxtLink class="docs-gallery__label" :to="docPath('flowchart')">
            {{ cellLabel('Flowchart', '流程画布') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 300px">
            <ClientOnly>
              <GalleryFlowchart />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- ── 3. AiReasoning (11) ── -->
    <section id="ai-cat-aireasoning" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.aireasoning.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.aireasoning.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.aireasoning.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.aireasoning.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
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
          <NuxtLink class="docs-gallery__label" :to="docPath('inline-citation')">
            {{ cellLabel('InlineCitation', '行内引用') }}
          </NuxtLink>
          <div class="docs-gallery__stage not-prose">
            <ClientOnly>
              <p class="docs-gallery__citation-card">
                {{ copy.citationBefore }}
                <TxInlineCitation :source="citeSources[0]!" :appear="false" />
                {{ copy.citationBetween }}
                <TxInlineCitation :source="citeSources[1]!" :appear="false" />
                {{ copy.citationAfter }}
              </p>
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
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 244px">
            <ClientOnly>
              <div class="docs-gallery__block docs-gallery__block--wide">
                <TxAiConversation :messages="aiElementMessages" show-avatar compact />
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
                <TxCodeStream
                  :code="codeSample"
                  :diff="codeDiffSample"
                  diff-toggle
                  default-view="code"
                  lang="ts"
                  filename="greet.ts"
                  lang-label="TS"
                  :code-label="localeKey === 'zh' ? '代码' : 'Code'"
                  :diff-label="localeKey === 'zh' ? '对比' : 'Diff'"
                  v-bind="text.codeStream"
                />
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
                <TxReasoningDisclosure :text="copy.reasoningBody" :duration-ms="2400" default-open v-bind="text.reasoning" />
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
                <TxSources :sources="aiSources" variant="stack" default-open v-bind="text.sources" />
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
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 184px">
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
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 184px">
            <ClientOnly>
              <div class="docs-gallery__block">
                <GalleryStreamText :text="copy.streamSentence" :locale="localeKey" />
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
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 256px">
            <ClientOnly>
              <GalleryStreamMarkdown :markdown="copy.streamMarkdown" :locale="localeKey" />
              <template #fallback>
                <div class="docs-gallery__ph" />
              </template>
            </ClientOnly>
          </div>
        </section>
      </div>
    </section>

    <!-- ── 4. AiContext (5) ── -->
    <section id="ai-cat-aicontext" class="docs-gallery__cat-section">
      <header class="docs-gallery__cat-head not-prose">
        <div class="docs-gallery__cat-meta">
          <span class="docs-gallery__cat-title-wrap">
            <span :class="categoryMeta.aicontext.icon" class="docs-gallery__cat-icon" aria-hidden="true" />
            <h3 class="docs-gallery__cat-title">{{ categoryMeta.aicontext.label }}</h3>
          </span>
          <span class="docs-gallery__cat-desc">{{ categoryMeta.aicontext.desc }}</span>
        </div>
        <span class="docs-gallery__cat-count">{{ copy.categoryCount(categoryMeta.aicontext.count) }}</span>
      </header>
      <div class="docs-gallery__grid">
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
              <div class="docs-gallery__context-meters">
                <TxContextIndicator :used-tokens="48000" :max-tokens="128000" v-bind="text.contextIndicator">
                  <template #detail="{ ratio }">
                    <span class="docs-gallery__context-tag">{{ copy.contextLevels.ok }} · {{ Math.round(ratio * 100) }}%</span>
                  </template>
                </TxContextIndicator>
                <TxContextIndicator :used-tokens="108000" :max-tokens="128000" v-bind="text.contextIndicator">
                  <template #detail="{ ratio }">
                    <span class="docs-gallery__context-tag is-warning">{{ copy.contextLevels.warning }} · {{ Math.round(ratio * 100) }}%</span>
                  </template>
                </TxContextIndicator>
                <TxContextIndicator :used-tokens="124000" :max-tokens="128000" v-bind="text.contextIndicator">
                  <template #detail="{ ratio }">
                    <span class="docs-gallery__context-tag is-danger">{{ copy.contextLevels.danger }} · {{ Math.round(ratio * 100) }}%</span>
                  </template>
                </TxContextIndicator>
              </div>
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
                <TxFineTuneCard
                  v-model:values="fineTuneValues"
                  :defaults="fineTuneDefaults"
                  :type-options="copy.fineTuneTypes"
                  v-bind="copy.fineTune"
                />
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
          <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 232px">
            <ClientOnly>
              <div class="docs-gallery__block">
                <TxInsightCards :pages="insightPages" :title="copy.suiteAi" v-bind="text.insightCards">
                  <template #default="{ page }">
                    <div class="docs-gallery__insight-metrics">
                      <TxInsightMetric
                        v-for="metric in (insightMetricsByKey[page.key] ?? [])"
                        :key="metric.label"
                        :label="metric.label"
                        :color="metric.color"
                        :value="metric.value"
                        :delta="metric.delta"
                        :precision="metric.precision"
                        :detail="metric.detail"
                        :tone="metric.tone"
                      />
                    </div>
                  </template>
                </TxInsightCards>
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
    </section>
  </div>
</template>
