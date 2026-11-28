<script lang="ts" name="WorkspaceFileViewer" setup>
import type { MarkdownEditorLabels } from '@talex-touch/tuffex/markdown-editor'
import type { SelectionActionItem, SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import type { WorkspaceReadFileResult } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { TxBorderBeam } from '@talex-touch/tuffex/border-beam'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxMarkdownEditor } from '@talex-touch/tuffex/markdown-editor'
import { TxPopover } from '@talex-touch/tuffex/popover'
import {
  registerSelectionHighlight,
  TxSelectionActions,
  useSelectionAnchor
} from '@talex-touch/tuffex/selection-actions'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { segmentWords, useStreamPacer, type StreamPacer } from '@talex-touch/tuffex/stream-text'
import { TxTouchSurface } from '@talex-touch/tuffex/touch-surface'
import { hasDocument, hasWindow, isElectronRenderer } from '@talex-touch/utils/env'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { ConversationReviewEvents } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import {
  computed,
  effectScope,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
  type EffectScope
} from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import { basenameOfPath } from '~/modules/browser-workspace/preview-url'
import {
  revokeBlobUrls,
  rewriteInlineScriptsToBlobs
} from '~/modules/widget-sandbox/inline-script-blobs'
import {
  buildTdsDomProbeScript,
  computeTdsContentDigest,
  runStaticTdsLint,
  type TdsLintIssue
} from '~/modules/tds-lint'
import {
  captureFrameAndProbe,
  mergeLintIssues,
  releaseCaptureSession
} from '~/modules/tds-lint/live-capture-client'
import {
  getDeviceCategoryIcon,
  getDevicePresetById,
  isResponsivePreset,
  resolveDeviceDimensions,
  RESPONSIVE_PRESET_ID,
  searchDevicePresets,
  type DeviceCategory,
  type DeviceOrientation,
  type DevicePreset
} from './tds-devices'
import TdsDeviceFrame from './TdsDeviceFrame.vue'
import TdsLintPopover from './TdsLintPopover.vue'
import WorkspaceCanvasLaunchFlight, {
  type CanvasLaunchFlightPayload
} from './WorkspaceCanvasLaunchFlight.vue'
import WorkspaceCanvasRippleOverlay from './WorkspaceCanvasRippleOverlay.vue'
import {
  applyCanvasRevisionToSource,
  computeCanvasLineDiff,
  computeChangedBlockIndices,
  computeInlineRevealSegments,
  extractCanvasRevisionFromReply,
  findTargetAssistantMessage,
  isClaimedDiskUpdateReply,
  formatCanvasImprovePrompt,
  inspectMessageFileWrites,
  isMessageStreamingCanvasEdit,
  isStreamingTurnTargetingFile,
  normalizeMarkdownMatchText,
  type CanvasDiffSummary,
  type CanvasTurnBaseline,
  type SourceRange
} from './workspace-canvas-edit'
import {
  buildPathBreadcrumbs,
  extractMarkdownHeadings,
  formatBatchCommentsPrompt,
  formatCompactFileSize,
  formatSingleSelectionPrompt,
  readSessionReviewComments,
  resolveFileIconClass,
  writeSessionReviewComments,
  type MarkdownReviewComment,
  type WorkspaceFileAiActionKind,
  type WorkspaceFileAiActionPayload
} from './workspace-file-tree'

const props = withDefaults(
  defineProps<{
    filePath: string
    displayPath?: string
    workspaceRoot?: string
    conversationId?: string | null
    /** Active conversation transcript, used to sync and auto-apply AI document edits. */
    messages?: ConversationMessage[]
    /** Whether the host conversation currently has an AI response in flight. */
    aiStreaming?: boolean
    line?: number
    refreshToken?: number
    /** Show a local back button when the host maintains preview navigation history. */
    canGoBack?: boolean
    /** Hide the "Open in Built-in Browser" button when already rendered inside BrowserPage. */
    showOpenInBrowser?: boolean
    /** Enable Markdown text selection AI actions & review comments when hosted beside an AI chat. */
    aiActionsEnabled?: boolean
    /** When true, clicking a parent folder breadcrumb asks the host to reveal it in the file tree. */
    preferTreeForBreadcrumbs?: boolean
  }>(),
  {
    displayPath: '',
    workspaceRoot: '',
    conversationId: null,
    messages: () => [],
    aiStreaming: false,
    line: undefined,
    refreshToken: 0,
    canGoBack: false,
    showOpenInBrowser: true,
    aiActionsEnabled: false,
    preferTreeForBreadcrumbs: false
  }
)

const emit = defineEmits<{
  (event: 'back'): void
  (event: 'navigate', payload: { path: string; displayPath: string }): void
  (event: 'reveal-dir', dirPath: string): void
  (event: 'open-in-browser', payload: { path: string; displayPath: string; line?: number }): void
  (event: 'ai-action', payload: WorkspaceFileAiActionPayload): void
}>()

const { t, locale } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null

const MARKDOWN_EDITOR_ZH_LABELS: Partial<MarkdownEditorLabels> = {
  wysiwyg: '所见即所得',
  source: 'Markdown',
  preview: '预览',
  modeGroup: '编辑模式',
  toolbar: '格式',
  heading: '标题',
  heading1: '一级标题',
  heading2: '二级标题',
  heading3: '三级标题',
  slashMenu: '插入',
  bold: '加粗',
  italic: '斜体',
  strike: '删除线',
  code: '行内代码',
  highlight: '高亮',
  highlightColors: '高亮颜色',
  highlightYellow: '黄色',
  highlightGreen: '绿色',
  highlightBlue: '蓝色',
  highlightPink: '粉色',
  highlightPurple: '紫色',
  removeHighlight: '移除高亮',
  quote: '引用',
  calloutNote: '备注',
  calloutTip: '提示',
  calloutImportant: '重要',
  calloutWarning: '警告',
  calloutCaution: '注意',
  bulletList: '无序列表',
  orderedList: '有序列表',
  taskList: '任务列表',
  link: '链接',
  image: '图片',
  table: '表格',
  codeBlock: '代码块',
  math: '公式',
  divider: '分割线',
  emoji: '表情',
  undo: '撤销',
  redo: '重做',
  emojiSearch: '搜索表情',
  emojiEmpty: '没有找到表情',
  emojiRecent: '最近使用',
  linkPlaceholder: '粘贴或输入链接',
  apply: '应用',
  removeLink: '移除链接',
  mathPlaceholder: 'TeX，例如 E = mc^2',
  tableColumn: '列'
}

const markdownEditorLabels = computed<Partial<MarkdownEditorLabels> | undefined>(() =>
  String(locale?.value ?? '')
    .toLowerCase()
    .startsWith('zh')
    ? MARKDOWN_EDITOR_ZH_LABELS
    : undefined
)

function resolveAppSdk() {
  try {
    return typeof useAppSdk === 'function' ? useAppSdk() : null
  } catch {
    return null
  }
}

function extractDomNode(value: unknown): Node | null {
  if (value instanceof Node) return value
  if (value && typeof value === 'object') {
    if ('el' in value && value.el instanceof Node) return value.el
    if ('$el' in value && value.$el instanceof Node) return value.$el
  }
  return null
}

const loading = ref(false)
const error = ref('')
const data = ref<WorkspaceReadFileResult | null>(null)
const viewMode = ref<'preview' | 'source'>('preview')
const wrapLines = ref(true)
const imageZoom = ref(1)
const pdfBlobUrl = ref('')
const moreMenuOpen = ref(false)
const outlineOpen = ref(false)
const viewportMenuOpen = ref(false)
const lintPopoverOpen = ref(false)
const lintAntiSlop = ref(true)
const viewportPresetId = ref<string>(RESPONSIVE_PRESET_ID)
const viewportOrientation = ref<DeviceOrientation>('portrait')
const showDeviceShell = ref(true)
const viewportQuery = ref('')
const viewportCategory = ref<DeviceCategory | 'all'>('all')

const codeContainerRef = ref<HTMLElement | null>(null)
const markdownContainerRef = ref<HTMLElement | null>(null)
const selectionBarRef = ref<{ updatePosition?: () => void; el?: HTMLElement | null } | null>(null)
const selectionPrompt = ref('')
const commentInputRef = ref<HTMLTextAreaElement | null>(null)

const commentComposerOpen = ref(false)
const commentDraftQuote = ref('')
const commentDraftText = ref('')
const commentsExpanded = ref(false)
const comments = ref<MarkdownReviewComment[]>([])
const sendingAiAction = ref(false)

let loadGeneration = 0

function revokePdfUrl(): void {
  if (pdfBlobUrl.value) {
    URL.revokeObjectURL(pdfBlobUrl.value)
    pdfBlobUrl.value = ''
  }
}

const resolvedPath = computed(() => data.value?.path || props.filePath)
const fileName = computed(
  () => data.value?.name || basenameOfPath(props.displayPath || props.filePath)
)
const fileExt = computed(() => {
  if (data.value?.ext) return data.value.ext.toLowerCase()
  const name = fileName.value
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : ''
})

const isHtml = computed(
  () => data.value?.kind === 'text' && (fileExt.value === 'html' || fileExt.value === 'htm')
)
const isSvg = computed(() => data.value?.kind === 'text' && fileExt.value === 'svg')
const isMarkdown = computed(
  () => data.value?.kind === 'text' && ['md', 'markdown', 'mdc', 'mdx'].includes(fileExt.value)
)
const isJson = computed(() => data.value?.kind === 'text' && fileExt.value === 'json')
const supportsPreviewToggle = computed(
  () => isHtml.value || isSvg.value || isMarkdown.value || isJson.value
)

const showDeviceViewportControls = computed(
  () => (isHtml.value || isSvg.value) && viewMode.value === 'preview'
)
const showTopBar = computed(() =>
  Boolean(props.canGoBack || showDeviceViewportControls.value || data.value?.kind === 'image')
)
const staticLintIssues = computed<TdsLintIssue[]>(() => {
  if (!showDeviceViewportControls.value) return []
  const source = data.value?.text ?? ''
  if (!source) return []
  return runStaticTdsLint(source, {
    antiSlop: lintAntiSlop.value,
    sourceKind: isSvg.value ? 'svg' : 'html'
  })
})
const domLintIssues = ref<TdsLintIssue[]>([])
const mergedLintIssues = computed<TdsLintIssue[]>(() =>
  mergeLintIssues(staticLintIssues.value, domLintIssues.value)
)
const lintContentDigest = computed<string>(() => {
  if (!showDeviceViewportControls.value) return ''
  const source = data.value?.text ?? ''
  if (!source.trim()) return ''
  const kind = isSvg.value ? 'svg' : 'html'
  return computeTdsContentDigest(
    `${resolvedPath.value}\n${kind}\nantiSlop:${lintAntiSlop.value ? '1' : '0'}\n${source}`
  )
})

const LIVE_DOM_PROBE_DEBOUNCE_MS = 300
let domProbeTimer: ReturnType<typeof setTimeout> | null = null
let domProbeGeneration = 0
let activeDomProbeSessionKey = ''

function cancelPendingDomProbe(): void {
  domProbeGeneration += 1
  if (domProbeTimer !== null) {
    clearTimeout(domProbeTimer)
    domProbeTimer = null
  }
}
const activeDevicePreset = computed(() => getDevicePresetById(viewportPresetId.value))
const isDevicePresetActive = computed(() => !isResponsivePreset(activeDevicePreset.value))
const activeDeviceDimensions = computed(() =>
  resolveDeviceDimensions(activeDevicePreset.value, viewportOrientation.value)
)
const canFlipOrientation = computed(
  () => isDevicePresetActive.value && Boolean(activeDevicePreset.value.orientable)
)
const viewportFilterCategories = computed<Array<{ id: DeviceCategory | 'all'; label: string }>>(
  () => [
    { id: 'all', label: t('home.sidePanel.deviceCategoryAll') },
    { id: 'phone', label: t('home.sidePanel.deviceCategoryPhone') },
    { id: 'tablet', label: t('home.sidePanel.deviceCategoryTablet') },
    { id: 'watch', label: t('home.sidePanel.deviceCategoryWatch') },
    { id: 'desktop', label: t('home.sidePanel.deviceCategoryDesktop') },
    { id: 'paper', label: t('home.sidePanel.deviceCategoryPaper') }
  ]
)
const filteredViewportPresets = computed(() =>
  searchDevicePresets(viewportQuery.value, viewportCategory.value)
)

function selectViewportPreset(preset: DevicePreset): void {
  viewportPresetId.value = preset.id
  if (!preset.orientable) {
    viewportOrientation.value = 'portrait'
  }
  viewportMenuOpen.value = false
}

function toggleViewportOrientation(): void {
  if (!canFlipOrientation.value) return
  viewportOrientation.value = viewportOrientation.value === 'portrait' ? 'landscape' : 'portrait'
}

function formatViewportPresetLabel(preset: DevicePreset): string {
  return preset.id === RESPONSIVE_PRESET_ID ? t('home.sidePanel.deviceResponsive') : preset.name
}

const fileIcon = computed(() =>
  resolveFileIconClass(fileName.value, data.value?.kind === 'directory')
)

const breadcrumbs = computed(() =>
  buildPathBreadcrumbs(resolvedPath.value, props.workspaceRoot || undefined)
)

const displayPathForAi = computed(() => {
  const root = props.workspaceRoot?.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  const norm = resolvedPath.value.replace(/\\/g, '/')
  if (root && norm.startsWith(`${root}/`)) {
    return norm.slice(root.length + 1)
  }
  return props.displayPath || resolvedPath.value
})

const markdownHeadings = computed(() =>
  isMarkdown.value && viewMode.value === 'preview'
    ? extractMarkdownHeadings(data.value?.text ?? '')
    : []
)

const imageDataUrl = computed(() => {
  if (data.value?.kind === 'image' && data.value.base64) {
    return `data:${data.value.mimeType};base64,${data.value.base64}`
  }
  return ''
})

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * Outer-CSP sandboxed srcdoc wrapper (matching TxCodeStream): gives the opened HTML/SVG an opaque
 * origin (no `allow-same-origin`) with zero network exfiltration while letting interactive pure-HTML
 * prototypes (forms, inline scripts rewritten to `blob:` URLs, dialogs) work cleanly under
 * CoreApp's inherited parent CSP (`script-src 'self' 'unsafe-eval' blob:`, no `'unsafe-inline'`).
 */
const sandboxedHtmlSrcdoc = ref('')
let previewScriptBlobUrls: string[] = []

function revokePreviewScriptBlobs(): void {
  if (previewScriptBlobUrls.length === 0) return
  revokeBlobUrls(previewScriptBlobUrls)
  previewScriptBlobUrls = []
}

watch(
  [() => data.value?.text ?? '', isHtml, isSvg],
  ([source, htmlMode, svgMode]) => {
    revokePreviewScriptBlobs()
    if (!source || (!htmlMode && !svgMode)) {
      sandboxedHtmlSrcdoc.value = ''
      return
    }
    let inner = svgMode
      ? `<!doctype html><meta charset="utf-8"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff">${source}</body>`
      : source
    if (htmlMode) {
      const rewritten = rewriteInlineScriptsToBlobs(inner)
      inner = rewritten.html
      previewScriptBlobUrls = rewritten.blobUrls
    }
    const csp =
      "default-src 'none'; frame-src about:; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src blob:"
    const innerSandbox = htmlMode ? 'allow-scripts allow-forms allow-modals' : ''
    sandboxedHtmlSrcdoc.value = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}iframe{display:block;width:100%;height:100%;border:0}</style><iframe sandbox="${innerSandbox}" srcdoc="${escapeAttribute(inner)}"></iframe>`
  },
  { immediate: true }
)

const formattedJson = computed(() => {
  if (!isJson.value || !data.value?.text) return data.value?.text ?? ''
  try {
    return JSON.stringify(JSON.parse(data.value.text), null, 2)
  } catch {
    return data.value.text
  }
})

const displayedText = computed(() => {
  if (isJson.value && viewMode.value === 'preview') return formattedJson.value
  return data.value?.text ?? ''
})

const codeLines = computed(() => displayedText.value.split('\n'))

const parentDirectoryPath = computed(() => {
  const current = resolvedPath.value.replace(/[/\\]+$/, '')
  if (!current || current === '/') return null
  const cut = Math.max(current.lastIndexOf('/'), current.lastIndexOf('\\'))
  if (cut < 0) return null
  if (cut === 0) return '/'
  return current.slice(0, cut)
})

// ── Markdown Selection Quick AI Actions, Comments & GPT Canvas Auto-Apply ───────────
type CanvasEditPhase = 'idle' | 'thinking' | 'streaming' | 'applying' | 'applied'
type CanvasAppliedSource = 'improve' | 'sync'

interface PendingCanvasSession {
  opToken: number
  filePath: string
  actionId: string
  scope: 'selection' | 'document'
  selectedText: string
  sourceRange: SourceRange | null
  autoApply: boolean
  beforeText: string
  beforeMtimeMs: number
  beforeBlockTexts: string[]
  beforeRawBlockTexts: string[]
  baseline: CanvasTurnBaseline
  lastSeenWriteCount: number
  diskApplied: boolean
}

interface AppliedCanvasSnapshot {
  filePath: string
  source: CanvasAppliedSource
  actionId: string
  scope: 'selection' | 'document'
  selectedText: string
  sourceRange: SourceRange | null
  beforeText: string
  afterText: string
  beforeMtimeMs: number
  afterMtimeMs: number
  diff: CanvasDiffSummary
  beforeBlockTexts: string[]
  beforeRawBlockTexts: string[]
  changedBlockIndices: Set<number>
}

interface AmbientBeforeSnapshot {
  filePath: string
  beforeText: string
  beforeMtimeMs: number
  beforeBlockTexts: string[]
  beforeRawBlockTexts: string[]
}

interface CanvasComposeSession {
  scope: 'selection' | 'document'
  selectedText: string
  sourceRange: SourceRange | null
  rects: DOMRect[]
  blockIndices: Set<number>
  range?: Range
}

interface OldMarkdownSnapshot {
  node: HTMLElement
  top: number
  left: number
  width: number
  height: number
  contentBottom: number
}

const markdownEditorRef = ref<InstanceType<typeof TxMarkdownEditor> | null>(null)
const oldSnapshotHostRef = ref<HTMLElement | null>(null)
const canvasPhase = ref<CanvasEditPhase>('idle')
const canvasPending = ref<PendingCanvasSession | null>(null)
const canvasApplied = ref<AppliedCanvasSnapshot | null>(null)
const canvasCompose = ref<CanvasComposeSession | null>(null)
const commentDraftRange = ref<Range | null>(null)
const canvasComposePrompt = ref('')
const canvasComposeInputRef = ref<HTMLInputElement | null>(null)
const canvasDockWrapRef = ref<HTMLElement | null>(null)
const launchFlight = ref<CanvasLaunchFlightPayload | null>(null)
const canvasShowDiff = ref(false)
const canvasUndoing = ref(false)
const canvasConflictRefreshAvailable = ref(false)
const canvasSweepActive = ref(false)
const canvasSweepKey = ref(0)
const canvasSweepStyle = ref<Record<string, string>>({
  top: '0px',
  height: '100%',
  '--canvas-sweep-travel': '240px'
})
const pendingDomBlockIndices = ref<Set<number>>(new Set())
const ambientBeforeSnapshot = ref<AmbientBeforeSnapshot | null>(null)
const ambientSettledMessageId = ref<string | null>(null)
const beamTheme = ref<'light' | 'dark'>('light')

let launchFlightSeq = 0
let canvasOpToken = 0
let isUnmounted = false

let sweepTimer: ReturnType<typeof setTimeout> | null = null
let replaceSweepRaf: number | null = null
let revealPacerScope: EffectScope | null = null
let revealPacer: StreamPacer | null = null
let revealPacerStopWatch: (() => void) | null = null
let revealWordSpans: HTMLElement[] = []
let revealPacedBlocks: HTMLElement[] = []
let canvasWriteInFlight = false
let canvasFinalizeInFlight = false
let lastAppliedAssistantId: string | null = null
let ambientLastHandledMsgId: string | null = null
let ambientLastWriteCount = 0
let disposeReviewListener: (() => void) | null = null
let themeObserver: MutationObserver | null = null
let themeMediaQuery: MediaQueryList | null = null

const currentFileIdentity = computed(() => ({
  fileName: fileName.value,
  displayPath: displayPathForAi.value,
  filePath: resolvedPath.value
}))

const isTruncatedText = computed(() => Boolean(data.value?.kind === 'text' && data.value.truncated))

function isCanvasOpActive(token: number, expectedPath?: string): boolean {
  if (isUnmounted || token !== canvasOpToken) return false
  if (expectedPath !== undefined && resolvedPath.value !== expectedPath) return false
  return true
}

function captureEditorSourceRange(): SourceRange | null {
  const editor = markdownEditorRef.value as unknown as {
    getSelection?: () => { from: number; to: number } | null
  } | null
  const sel = editor?.getSelection?.()
  if (!sel || typeof sel.from !== 'number' || typeof sel.to !== 'number') return null
  const start = Math.min(sel.from, sel.to)
  const end = Math.max(sel.from, sel.to)
  return end > start ? { start, end } : null
}

function resolveDocumentTheme(): 'light' | 'dark' {
  if (!hasDocument()) return 'light'
  const root = document.documentElement
  const body = document.body
  const explicit = root.getAttribute('data-theme') || body?.getAttribute('data-theme')
  if (explicit === 'dark') return 'dark'
  if (explicit === 'light') return 'light'
  if (root.classList.contains('dark') || body?.classList.contains('dark')) return 'dark'
  if (hasWindow() && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

function syncBeamTheme(): void {
  beamTheme.value = resolveDocumentTheme()
}

const isPendingCanvasBusy = computed(
  () =>
    canvasPhase.value === 'thinking' ||
    canvasPhase.value === 'streaming' ||
    canvasPhase.value === 'applying'
)

const isAmbientAiEditing = computed(() => {
  if (!props.aiActionsEnabled || !data.value || data.value.kind !== 'text') return false
  if (isPendingCanvasBusy.value) return false
  const tail = props.messages.at(-1)
  // Once edits from this assistant turn have been synced to the viewer and no further file write is
  // running, release the lock so the user can review/accept immediately — and stay unlocked even
  // after they click Accept/Undo while AI finishes streaming its summary.
  if (
    tail?.role === 'assistant' &&
    tail.id === ambientSettledMessageId.value &&
    !inspectMessageFileWrites(tail, currentFileIdentity.value).running
  ) {
    return false
  }
  return isStreamingTurnTargetingFile(props.messages, currentFileIdentity.value, props.aiStreaming)
})

const isCanvasLocked = computed(() => isPendingCanvasBusy.value || isAmbientAiEditing.value)

const showCanvasDock = computed(
  () =>
    Boolean(canvasCompose.value) ||
    isCanvasLocked.value ||
    (canvasPhase.value === 'applied' && Boolean(canvasApplied.value))
)

const canvasComposePresets = computed(() => [
  {
    id: 'polish',
    label: t('home.sidePanel.canvasComposePresetPolish'),
    suggestion: ''
  },
  {
    id: 'concise',
    label: t('home.sidePanel.canvasComposePresetConcise'),
    suggestion: t('home.sidePanel.canvasComposePresetConcisePrompt')
  },
  {
    id: 'vivid',
    label: t('home.sidePanel.canvasComposePresetVivid'),
    suggestion: t('home.sidePanel.canvasComposePresetVividPrompt')
  },
  {
    id: 'grammar',
    label: t('home.sidePanel.canvasComposePresetGrammar'),
    suggestion: t('home.sidePanel.canvasComposePresetGrammarPrompt')
  }
])

const canvasStatusText = computed(() => {
  if (canvasPhase.value === 'applying') return t('home.sidePanel.canvasStatusApplying')
  if (canvasPhase.value === 'streaming') return t('home.sidePanel.canvasStatusRewriting')
  const tail = props.messages.at(-1)
  if (tail?.role === 'assistant' && tail.status === 'streaming') {
    const writes = inspectMessageFileWrites(tail, currentFileIdentity.value)
    if (writes.running || isMessageStreamingCanvasEdit(tail)) {
      return t('home.sidePanel.canvasStatusRewriting')
    }
  }
  return t('home.sidePanel.canvasStatusOptimizing')
})

const canvasAppliedTitle = computed(() =>
  canvasApplied.value?.source === 'improve'
    ? t('home.sidePanel.canvasAppliedTitle')
    : t('home.sidePanel.canvasSyncedTitle')
)

const markdownSelectionActive = computed(() =>
  Boolean(props.aiActionsEnabled && isMarkdown.value && viewMode.value === 'preview')
)

const { selection: mdSelection, clear: clearMdSelection } = useSelectionAnchor({
  root: markdownContainerRef,
  disabled: () => !markdownSelectionActive.value || isCanvasLocked.value || canvasShowDiff.value,
  ignore: () => {
    const node = extractDomNode(selectionBarRef.value)
    return node instanceof Element ? [node] : []
  },
  minLength: 2
})

const activeSelectionPayload = computed<SelectionPayload | null>(() => {
  if (
    !markdownSelectionActive.value ||
    isCanvasLocked.value ||
    canvasShowDiff.value ||
    Boolean(canvasCompose.value)
  ) {
    return null
  }
  return mdSelection.value
})

const mdSelectionActions = computed<SelectionActionItem[]>(() => [
  { id: 'comment', label: t('home.sidePanel.selectionComment') },
  { id: 'explain', label: t('home.sidePanel.selectionExplain') },
  ...(isTruncatedText.value
    ? []
    : [
        {
          id: 'improve',
          label: t('home.sidePanel.selectionImprove'),
          busyLabel: t('home.sidePanel.selectionImproving')
        }
      ]),
  { id: 'quote', label: t('home.sidePanel.selectionQuote'), more: true },
  { id: 'translate', label: t('home.sidePanel.selectionTranslate'), more: true },
  { id: 'copy', label: t('home.copy'), more: true }
])

function prefersReducedMotion(): boolean {
  return (
    hasWindow() &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function teardownInlineReveal(): void {
  if (replaceSweepRaf !== null && hasWindow() && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(replaceSweepRaf)
    replaceSweepRaf = null
  }
  if (revealPacerStopWatch) {
    revealPacerStopWatch()
    revealPacerStopWatch = null
  }
  if (revealPacer) {
    revealPacer.stop()
    revealPacer = null
  }
  if (revealPacerScope) {
    revealPacerScope.stop()
    revealPacerScope = null
  }
  if (oldSnapshotHostRef.value) {
    oldSnapshotHostRef.value.replaceChildren()
    oldSnapshotHostRef.value.style.removeProperty('top')
    oldSnapshotHostRef.value.style.removeProperty('left')
    oldSnapshotHostRef.value.style.removeProperty('width')
  }
  if (markdownContainerRef.value) {
    markdownContainerRef.value.style.removeProperty('--canvas-replace-y')
    markdownContainerRef.value.style.removeProperty('--canvas-replace-start')
    markdownContainerRef.value.style.removeProperty('--canvas-replace-old-top')
    markdownContainerRef.value.style.removeProperty('--canvas-replace-veil-opacity')
    markdownContainerRef.value.style.removeProperty('min-height')
  }
  const parentsToNormalize = new Set<Node>()
  for (const span of revealWordSpans) {
    const parent = span.parentNode
    if (!parent) continue
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span)
    }
    parent.removeChild(span)
    parentsToNormalize.add(parent)
  }
  for (const parent of parentsToNormalize) {
    if (parent instanceof Element || parent instanceof DocumentFragment) {
      parent.normalize()
    }
  }
  for (const block of revealPacedBlocks) {
    block.classList.remove('is-canvas-word-paced')
  }
  revealWordSpans = []
  revealPacedBlocks = []
}

function clearSweepTimer(): void {
  if (sweepTimer !== null) {
    clearTimeout(sweepTimer)
    sweepTimer = null
  }
  teardownInlineReveal()
}

function finishCanvasSweep(): void {
  clearSweepTimer()
  canvasSweepActive.value = false
  for (const el of getMarkdownBodyBlocks()) {
    el.classList.remove('is-canvas-entering', 'is-canvas-word-paced')
    el.style.removeProperty('--canvas-reveal-delay')
  }
}

const PLAIN_REVEAL_BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE'])

function isPlainRevealBlock(el: HTMLElement): boolean {
  if (!PLAIN_REVEAL_BLOCK_TAGS.has(el.tagName)) return false
  if (el.childNodes.length === 0) return false
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType !== Node.TEXT_NODE) return false
  }
  return Boolean((el.textContent ?? '').trim())
}

function getLiveMarkdownBody(): HTMLElement | null {
  const container = markdownContainerRef.value
  if (!container) return null
  return (
    container.querySelector<HTMLElement>(
      '.WorkspaceFileViewer-MarkdownEditor .tx-markdown-editor__surface.markdown-body'
    ) ??
    container.querySelector<HTMLElement>('.WorkspaceFileViewer-MarkdownEditor .markdown-body') ??
    container.querySelector<HTMLElement>('.tx-markdown-editor__surface.markdown-body') ??
    container.querySelector<HTMLElement>('.markdown-body:not([data-canvas-old-snapshot])')
  )
}

function captureOldMarkdownSnapshot(): OldMarkdownSnapshot | null {
  const container = markdownContainerRef.value
  const body = getLiveMarkdownBody()
  if (!container || !body) return null
  const containerRect = container.getBoundingClientRect()
  const bodyRect = body.getBoundingClientRect()
  const hasLayout = containerRect.width > 0 && bodyRect.height > 0
  const clone = body.cloneNode(true) as HTMLElement
  clone.setAttribute('data-canvas-old-snapshot', 'true')
  clone.removeAttribute('contenteditable')
  clone.removeAttribute('tabindex')
  clone.removeAttribute('id')
  clone.removeAttribute('data-testid')
  clone.classList.remove('tx-markdown-editor__surface')
  for (const span of Array.from(clone.querySelectorAll('.WorkspaceFileViewer-RevealWord'))) {
    const parent = span.parentNode
    if (!parent) continue
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span)
    }
    parent.removeChild(span)
  }
  for (const el of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
    el.removeAttribute('id')
    el.removeAttribute('contenteditable')
    el.removeAttribute('tabindex')
    el.removeAttribute('data-testid')
    el.classList.remove(
      'is-canvas-targeted',
      'is-canvas-pending',
      'is-canvas-changed',
      'is-canvas-entering',
      'is-canvas-word-paced'
    )
  }
  const lastChild = body.lastElementChild
  const contentBottom =
    hasLayout && lastChild
      ? Math.max(0, Math.round(lastChild.getBoundingClientRect().bottom - bodyRect.top))
      : hasLayout
        ? Math.round(bodyRect.height)
        : 0
  return {
    node: clone,
    top: hasLayout ? bodyRect.top - containerRect.top : 16,
    left: hasLayout ? bodyRect.left - containerRect.left : 22,
    width: hasLayout ? bodyRect.width : 0,
    height: hasLayout ? bodyRect.height : 0,
    contentBottom
  }
}

function getMarkdownBodyBlocks(): HTMLElement[] {
  const body = getLiveMarkdownBody()
  if (!body) return []
  return Array.from(body.children).filter((el): el is HTMLElement => el instanceof HTMLElement)
}

function snapshotMarkdownBlockTexts(): string[] {
  return getMarkdownBodyBlocks().map((el) => normalizeMarkdownMatchText(el.textContent ?? ''))
}

function snapshotRawMarkdownBlockTexts(): string[] {
  return getMarkdownBodyBlocks().map((el) => el.textContent ?? '')
}

function resolvePendingBlockIndices(selection: SelectionPayload): Set<number> {
  const blocks = getMarkdownBodyBlocks()
  const indices = new Set<number>()
  if (blocks.length === 0) return indices

  if (selection.range && typeof selection.range.intersectsNode === 'function') {
    for (let i = 0; i < blocks.length; i += 1) {
      try {
        if (selection.range.intersectsNode(blocks[i]!)) {
          indices.add(i)
        }
      } catch {
        // Ignore detached ranges
      }
    }
  }
  if (indices.size > 0) return indices

  const selLines = selection.text
    .split(/\r?\n/)
    .map((line) => normalizeMarkdownMatchText(line))
    .filter(Boolean)
  if (selLines.length === 0) return indices

  for (let i = 0; i < blocks.length; i += 1) {
    const blockNorm = normalizeMarkdownMatchText(blocks[i]!.textContent ?? '')
    if (!blockNorm) continue
    if (selLines.some((line) => blockNorm.includes(line) || line.includes(blockNorm))) {
      indices.add(i)
    }
  }
  return indices
}

function measureBlocksClientRects(indices: ReadonlySet<number>): DOMRect[] {
  const blocks = getMarkdownBodyBlocks()
  const rects: DOMRect[] = []
  for (const idx of indices) {
    const el = blocks[idx]
    if (!el || typeof el.getBoundingClientRect !== 'function') continue
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      rects.push(rect)
    }
  }
  return rects
}

function syncMarkdownBlockClasses(entering = false): void {
  const container = markdownContainerRef.value
  const blocks = getMarkdownBodyBlocks()
  for (const el of blocks) {
    el.classList.remove(
      'is-canvas-targeted',
      'is-canvas-pending',
      'is-canvas-changed',
      'is-canvas-entering'
    )
    el.style.removeProperty('--canvas-stagger-idx')
    el.style.removeProperty('--canvas-reveal-delay')
  }

  if (canvasCompose.value) {
    for (const idx of canvasCompose.value.blockIndices) {
      blocks[idx]?.classList.add('is-canvas-targeted')
    }
    return
  }

  if (isCanvasLocked.value) {
    for (const idx of pendingDomBlockIndices.value) {
      blocks[idx]?.classList.add('is-canvas-pending')
    }
    return
  }

  if (canvasPhase.value === 'applied' && canvasApplied.value && blocks.length > 0) {
    const changed = canvasApplied.value.changedBlockIndices
    const targets: HTMLElement[] = []
    let staggerOrder = 0
    for (let i = 0; i < blocks.length; i += 1) {
      if (changed.size > 0 && !changed.has(i)) continue
      const el = blocks[i]!
      el.classList.add('is-canvas-changed')
      if (entering) {
        el.classList.add('is-canvas-entering')
        el.style.setProperty('--canvas-stagger-idx', String(Math.min(staggerOrder, 10)))
        staggerOrder += 1
      }
      targets.push(el)
    }

    if (container && targets.length > 0) {
      const first = targets[0]!
      const last = targets[targets.length - 1]!
      const containerRect = container.getBoundingClientRect()
      const firstRect = first.getBoundingClientRect()
      const lastRect = last.getBoundingClientRect()
      const hasLayout = containerRect.height > 0 && (firstRect.height > 0 || lastRect.height > 0)
      const rawTop = hasLayout ? firstRect.top - containerRect.top : first.offsetTop
      const rawBottom = hasLayout
        ? lastRect.bottom - containerRect.top
        : last.offsetTop + last.offsetHeight
      const top = Math.max(0, Math.round(rawTop - 10))
      const height = Math.max(96, Math.round(rawBottom - rawTop + 20))
      canvasSweepStyle.value = {
        top: `${top}px`,
        height: `${height}px`,
        '--canvas-sweep-travel': `${height}px`
      }

      if (entering) {
        for (let idx = 0; idx < targets.length; idx += 1) {
          const el = targets[idx]!
          let progress = targets.length > 1 ? idx / (targets.length - 1) : 0
          if (hasLayout && height > 0) {
            const elTop = el.getBoundingClientRect().top - containerRect.top
            progress = Math.max(0, Math.min(1, (elTop - top) / Math.max(1, height)))
          }
          el.style.setProperty('--canvas-reveal-delay', `${Math.round(progress * 820)}ms`)
        }
      }

      if (entering && typeof first.scrollIntoView === 'function') {
        first.scrollIntoView({
          block: 'nearest',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth'
        })
      }
    } else {
      canvasSweepStyle.value = {
        top: '0px',
        height: '100%',
        '--canvas-sweep-travel': `${Math.max(240, Math.round(container?.clientHeight ?? 240))}px`
      }
    }
  }
}

function resetCanvasState(options?: { clearAmbientSettled?: boolean }): void {
  canvasOpToken += 1
  clearSweepTimer()
  canvasPhase.value = 'idle'
  canvasPending.value = null
  canvasApplied.value = null
  canvasCompose.value = null
  canvasComposePrompt.value = ''
  canvasShowDiff.value = false
  canvasConflictRefreshAvailable.value = false
  canvasSweepActive.value = false
  pendingDomBlockIndices.value = new Set()
  ambientBeforeSnapshot.value = null
  if (options?.clearAmbientSettled) {
    ambientSettledMessageId.value = null
  }
  syncMarkdownBlockClasses(false)
}

function closeCanvasCompose(): void {
  if (!canvasCompose.value) return
  canvasCompose.value = null
  canvasComposePrompt.value = ''
  syncMarkdownBlockClasses(false)
}

function triggerCanvasLaunchFlight(label: string, originEl?: HTMLElement | null): void {
  if (!hasWindow() || !hasDocument()) return
  const sourceRect =
    originEl?.getBoundingClientRect() ??
    canvasDockWrapRef.value?.getBoundingClientRect() ??
    markdownContainerRef.value?.getBoundingClientRect()
  if (!sourceRect) return

  const originX = sourceRect.left + sourceRect.width * 0.5
  const originY = sourceRect.top + sourceRect.height * 0.5

  // Aim toward the left conversation stream when docked beside chat; otherwise arc upward into stage.
  const chatTarget =
    document.querySelector<HTMLElement>('.HomePage-Stream, .TxConversationStream') ??
    document.querySelector<HTMLElement>('.HomePage-ComposerGroup')
  let targetX = originX
  let targetY = Math.max(80, originY - 180)
  if (chatTarget) {
    const rect = chatTarget.getBoundingClientRect()
    if (rect.width > 40 && rect.height > 40) {
      targetX = rect.left + Math.min(rect.width * 0.62, rect.width - 64)
      targetY = rect.bottom - Math.min(88, rect.height * 0.22)
    }
  }

  const trimmed = label.trim() || t('home.sidePanel.canvasComposePresetPolish')
  launchFlightSeq += 1
  launchFlight.value = {
    id: launchFlightSeq,
    label: trimmed.length > 32 ? `${trimmed.slice(0, 31)}…` : trimmed,
    originX,
    originY,
    targetX,
    targetY,
    theme: beamTheme.value
  }
}

function handleLaunchFlightComplete(id: number): void {
  if (launchFlight.value?.id === id) {
    launchFlight.value = null
  }
}

async function openCanvasCompose(options: {
  scope: 'selection' | 'document'
  selection?: SelectionPayload
}): Promise<void> {
  if (!data.value || data.value.kind !== 'text' || data.value.truncated || isCanvasLocked.value) {
    return
  }
  const fullText = data.value.text ?? ''
  const isDoc = options.scope === 'document'
  const selectedText = isDoc ? fullText : (options.selection?.text.trim() ?? '')
  if (!selectedText.trim()) return

  const sourceRange = isDoc ? null : captureEditorSourceRange()
  const blockIndices =
    !isDoc && options.selection ? resolvePendingBlockIndices(options.selection) : new Set<number>()
  canvasApplied.value = null
  canvasShowDiff.value = false
  canvasConflictRefreshAvailable.value = false
  canvasPhase.value = 'idle'
  canvasComposePrompt.value = ''
  canvasCompose.value = {
    scope: isDoc ? 'document' : 'selection',
    selectedText,
    sourceRange,
    rects: options.selection?.rects ? [...options.selection.rects] : [],
    blockIndices,
    range: !isDoc ? options.selection?.range?.cloneRange() : undefined
  }

  clearMdSelection()
  selectionPrompt.value = ''
  window.getSelection()?.removeAllRanges()
  await nextTick()
  syncMarkdownBlockClasses(false)
  canvasComposeInputRef.value?.focus()
}

async function submitCanvasCompose(
  overrideSuggestion?: string,
  overrideLabel?: string
): Promise<void> {
  const compose = canvasCompose.value
  if (!compose || isCanvasLocked.value || isTruncatedText.value) return
  const suggestion = (overrideSuggestion ?? canvasComposePrompt.value).trim()
  const flightLabel =
    overrideLabel?.trim() ||
    suggestion ||
    (compose.scope === 'document'
      ? t('home.sidePanel.canvasComposeDocumentScope')
      : t('home.sidePanel.canvasComposePresetPolish'))

  canvasCompose.value = null
  canvasComposePrompt.value = ''
  const started = await startCanvasImprove(
    compose.selectedText,
    { text: compose.selectedText, rects: compose.rects },
    {
      userSuggestion: suggestion,
      isFullDocument: compose.scope === 'document',
      blockIndices: compose.blockIndices,
      sourceRange: compose.sourceRange
    }
  )
  if (started) {
    triggerCanvasLaunchFlight(flightLabel, canvasDockWrapRef.value)
  }
}

function onCanvasComposeKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeCanvasCompose()
    return
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void submitCanvasCompose()
  }
}

function cancelCanvasPending(): void {
  if (!isPendingCanvasBusy.value) return
  resetCanvasState()
}

function keepCanvasEdit(): void {
  resetCanvasState()
  clearMdSelection()
  selectionPrompt.value = ''
}

function mountMonochromePacedWords(): number {
  const snapshot = canvasApplied.value
  if (!snapshot) return 0
  const blocks = getMarkdownBodyBlocks()
  if (blocks.length === 0) return 0

  const changed = snapshot.changedBlockIndices
  const segLocale = String(locale?.value ?? 'zh') || 'zh'
  const spans: HTMLElement[] = []
  const pacedBlocks: HTMLElement[] = []

  for (let i = 0; i < blocks.length; i += 1) {
    if (changed.size > 0 && !changed.has(i)) continue
    const el = blocks[i]!
    if (!isPlainRevealBlock(el)) continue
    const afterText = el.textContent ?? ''
    const beforeText = snapshot.beforeRawBlockTexts[i] ?? ''
    const segments = computeInlineRevealSegments(beforeText, afterText)
    if (!segments.some((seg) => seg.kind === 'reveal' && seg.text.length > 0)) continue

    const doc = el.ownerDocument
    const frag = doc.createDocumentFragment()
    let blockWordCount = 0
    for (const seg of segments) {
      if (seg.kind === 'anchor') {
        frag.appendChild(doc.createTextNode(seg.text))
        continue
      }
      const words = segmentWords(seg.text, segLocale)
      for (const unit of words) {
        const span = doc.createElement('span')
        span.className = 'WorkspaceFileViewer-RevealWord'
        span.textContent = unit.text
        frag.appendChild(span)
        spans.push(span)
        blockWordCount += 1
        if (unit.ws) {
          frag.appendChild(doc.createTextNode(unit.ws))
        }
      }
    }
    if (blockWordCount > 0) {
      el.textContent = ''
      el.appendChild(frag)
      el.classList.add('is-canvas-word-paced')
      pacedBlocks.push(el)
    }
  }

  revealWordSpans = spans
  revealPacedBlocks = pacedBlocks
  return spans.length
}

function triggerCanvasSweepAnimation(oldSnapshot: OldMarkdownSnapshot | null = null): void {
  clearSweepTimer()
  syncMarkdownBlockClasses(true)
  if (prefersReducedMotion()) {
    canvasSweepActive.value = false
    return
  }

  const container = markdownContainerRef.value
  const body = getLiveMarkdownBody()
  const blocks = getMarkdownBodyBlocks()
  const changed = canvasApplied.value?.changedBlockIndices ?? new Set<number>()
  const targets = changed.size > 0 ? blocks.filter((_, idx) => changed.has(idx)) : blocks

  const firstChangedIdx = changed.size > 0 ? Math.min(...Array.from(changed.values())) : 0

  // Diagonal reading-flow angle (175deg: gentle 5deg tilt so left leads right across each line).
  const TILT_RAD = (5 * Math.PI) / 180
  const SIN_TILT = Math.sin(TILT_RAD)
  const COS_TILT = Math.cos(TILT_RAD)

  let startY = 0
  let endY = 260
  let sweepWidth = 520
  let oldTop = oldSnapshot?.top ?? 16
  let hasRealLayout = false
  if (body && targets.length > 0) {
    const bodyRect = body.getBoundingClientRect()
    const firstRect = targets[0]!.getBoundingClientRect()
    const lastRect = targets[targets.length - 1]!.getBoundingClientRect()
    hasRealLayout = bodyRect.height > 0 && (firstRect.height > 0 || lastRect.height > 0)
    if (hasRealLayout) {
      startY = Math.max(0, Math.round(firstRect.top - bodyRect.top))
      const newEndY = Math.round(lastRect.bottom - bodyRect.top)
      const isTailEdited = targets[targets.length - 1] === blocks[blocks.length - 1]
      const oldEndY =
        isTailEdited && oldSnapshot && oldSnapshot.contentBottom > 0
          ? oldSnapshot.contentBottom
          : newEndY
      endY = Math.max(newEndY, oldEndY, startY + 72)
      sweepWidth = Math.min(840, Math.max(240, Math.round(bodyRect.width)))
    }
    if (container && bodyRect.height > 0) {
      const containerRect = container.getBoundingClientRect()
      oldTop = bodyRect.top - containerRect.top
      const lastLive = body.lastElementChild
      const liveBottom = lastLive
        ? Math.round(lastLive.getBoundingClientRect().bottom - bodyRect.top)
        : Math.round(bodyRect.height)
      const reserveHeight = Math.max(
        oldTop + liveBottom + 28,
        oldSnapshot && oldSnapshot.contentBottom > 0
          ? oldSnapshot.top + oldSnapshot.contentBottom + 28
          : 0
      )
      if (reserveHeight > 0) {
        container.style.minHeight = `${Math.round(reserveHeight)}px`
      }
    }
  }

  // Mount the frozen OLD document snapshot underneath so old text stays quietly visible
  // in receding muted ink while the fresh NEW layer sweeps diagonally over it.
  if (oldSnapshot && oldSnapshotHostRef.value) {
    const oldChildren = Array.from(oldSnapshot.node.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement
    )
    for (let idx = 0; idx < oldChildren.length; idx += 1) {
      if (idx < firstChangedIdx) {
        oldChildren[idx]!.classList.add('is-canvas-old-static')
      }
    }
    const host = oldSnapshotHostRef.value
    host.replaceChildren(oldSnapshot.node)
    host.style.top = `${oldSnapshot.top}px`
    host.style.left = `${oldSnapshot.left}px`
    if (oldSnapshot.width > 0) {
      host.style.width = `${oldSnapshot.width}px`
    } else {
      host.style.removeProperty('width')
    }
  }

  const totalWords = mountMonochromePacedWords()

  // Measure each paced word's exact diagonal coordinate (using first line-box rect so
  // multi-line wrapped words never report x=0 and jump ahead of earlier words).
  const wordDiags: number[] = []
  if (hasRealLayout && body && revealWordSpans.length > 0) {
    const bodyRect = body.getBoundingClientRect()
    let prevDiag = 0
    for (const span of revealWordSpans) {
      const r = span.getClientRects()[0] ?? span.getBoundingClientRect()
      const dx = Math.max(0, r.left - bodyRect.left)
      const dy = Math.max(0, r.top - bodyRect.top)
      const diag = Math.max(prevDiag, dx * SIN_TILT + dy * COS_TILT)
      wordDiags.push(diag)
      prevDiag = diag
    }
  }

  const startD = Math.round(startY * COS_TILT)
  const endD = Math.round(endY * COS_TILT + sweepWidth * SIN_TILT)
  const sweepSpan = Math.max(180, endD - startD)
  const sweepDurationMs = Math.min(2900, Math.max(2100, Math.round(sweepSpan * 8.2)))
  const fromD = startD - 28
  const toD = endD + 66

  if (container) {
    container.style.setProperty('--canvas-replace-start', `${startD}px`)
    container.style.setProperty('--canvas-replace-old-top', `${Math.round(oldTop)}px`)
    container.style.setProperty('--canvas-replace-y', `${fromD}px`)
    container.style.setProperty('--canvas-replace-veil-opacity', '0')
  }

  canvasSweepKey.value += 1
  canvasSweepActive.value = true

  let sweepDone = !container || !isMarkdown.value || viewMode.value !== 'preview'
  let pacerDone = totalWords === 0

  const maybeFinish = (): void => {
    if (sweepDone && pacerDone) {
      finishCanvasSweep()
    }
  }

  if (!sweepDone && container) {
    let startTs: number | null = null
    const applySweepFrame = (rawProgress: number): void => {
      const clamped = Math.max(0, Math.min(1, rawProgress))
      // Smooth easeInOutSine: gentle launch, natural reading cadence, soft effortless settle.
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * clamped)
      const curD = fromD + (toD - fromD) * eased
      const veilAlpha =
        clamped < 0.08 ? clamped / 0.08 : clamped > 0.86 ? Math.max(0, (1 - clamped) / 0.14) : 1
      container.style.setProperty('--canvas-replace-y', `${curD.toFixed(1)}px`)
      container.style.setProperty('--canvas-replace-veil-opacity', veilAlpha.toFixed(3))

      if (wordDiags.length === revealWordSpans.length && wordDiags.length > 0) {
        for (let idx = 0; idx < wordDiags.length; idx += 1) {
          const wd = wordDiags[idx]!
          if (wd <= curD + 16) {
            revealWordSpans[idx]?.classList.add('is-revealed')
          }
          if (wd <= curD - 74) {
            revealWordSpans[idx]?.classList.add('is-settled')
          }
        }
      }
    }

    applySweepFrame(0)
    if (hasWindow() && typeof requestAnimationFrame === 'function') {
      const tick = (now: number): void => {
        if (!canvasSweepActive.value) return
        if (startTs === null) {
          startTs = now
        }
        const elapsed = Math.max(0, now - startTs)
        const progress = Math.min(1, elapsed / sweepDurationMs)
        applySweepFrame(progress)
        if (progress >= 1) {
          replaceSweepRaf = null
          sweepDone = true
          maybeFinish()
          return
        }
        replaceSweepRaf = requestAnimationFrame(tick)
      }
      replaceSweepRaf = requestAnimationFrame(tick)
    } else {
      sweepDone = true
    }
  }

  if (totalWords > 0) {
    const drainWindowMs = Math.round(sweepDurationMs * 0.9)
    const wordPaceMs = Math.max(16, Math.min(30, Math.round(drainWindowMs / totalWords)))
    const settleWindowMs = 520
    const scope = effectScope(true)
    revealPacerScope = scope
    scope.run(() => {
      const pacer = useStreamPacer({
        total: () => totalWords,
        streaming: () => false,
        appear: true,
        wordMs: () => wordPaceMs,
        maxLagMs: () => 1400,
        drainMs: () => drainWindowMs,
        settleMs: () => settleWindowMs,
        paced: () => true
      })
      revealPacer = pacer

      let lastRevealed = 0
      let lastSettled = 0
      revealPacerStopWatch = watch(
        [pacer.revealed, pacer.settled, pacer.state],
        ([revealedCount, settledCount, state]) => {
          // When layout coordinates exist, the 175deg frontier drives exact glyph timing;
          // pacer still acts as the rhythmic completion & headless/jsdom driver.
          if (wordDiags.length === 0) {
            for (
              let idx = lastRevealed;
              idx < revealedCount && idx < revealWordSpans.length;
              idx += 1
            ) {
              revealWordSpans[idx]?.classList.add('is-revealed')
            }
            lastRevealed = Math.max(lastRevealed, revealedCount)
            for (
              let idx = lastSettled;
              idx < settledCount && idx < revealWordSpans.length;
              idx += 1
            ) {
              revealWordSpans[idx]?.classList.add('is-settled')
            }
            lastSettled = Math.max(lastSettled, settledCount)
          }
          if (state === 'done' && settledCount >= revealWordSpans.length) {
            pacerDone = true
            maybeFinish()
          }
        },
        { immediate: true }
      )
    })

    // Safety cleanup in case rAF is throttled in a background tab.
    sweepTimer = setTimeout(
      () => {
        finishCanvasSweep()
      },
      Math.min(4000, Math.max(2500, sweepDurationMs + settleWindowMs + 420))
    )
    return
  }

  sweepTimer = setTimeout(() => {
    finishCanvasSweep()
  }, sweepDurationMs + 320)
}

// ── Direct Markdown Editing & Safe Debounced Disk Persistence ───────────────────────
type MarkdownSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

interface RetainedDraftEntry {
  text: string
  baseMtimeMs: number | undefined
  diskText: string
  conflict: boolean
}

const EDITOR_AUTOSAVE_DEBOUNCE_MS = 550
const editorSaveState = ref<MarkdownSaveState>('idle')
const editorSaveConflict = ref(false)
const draftConflictDiskSnapshot = ref<WorkspaceReadFileResult | null>(null)
const showDraftConflictDiff = ref(false)
const markdownEditorReadonly = computed(
  () => isCanvasLocked.value || Boolean(data.value?.truncated)
)

const draftConflictDiff = computed<CanvasDiffSummary | null>(() => {
  if (
    !showDraftConflictDiff.value ||
    !draftConflictDiskSnapshot.value ||
    data.value?.kind !== 'text'
  ) {
    return null
  }
  return computeCanvasLineDiff(draftConflictDiskSnapshot.value.text ?? '', data.value.text ?? '')
})

let editorSaveTimer: ReturnType<typeof setTimeout> | null = null
let editorSavedResetTimer: ReturnType<typeof setTimeout> | null = null
let editorSaveInFlight = false
let activeSavePromise: Promise<boolean> | null = null
let activeSavePath = ''
let lastPersistedPath = ''
let lastPersistedText = ''
let lastPersistedMtimeMs: number | undefined
const retainedDrafts = new Map<string, RetainedDraftEntry>()

function clearEditorSaveTimers(): void {
  if (editorSaveTimer !== null) {
    clearTimeout(editorSaveTimer)
    editorSaveTimer = null
  }
  if (editorSavedResetTimer !== null) {
    clearTimeout(editorSavedResetTimer)
    editorSavedResetTimer = null
  }
}

function hasUnsavedLocalDraft(targetPath = resolvedPath.value): boolean {
  if (!targetPath || !data.value || data.value.kind !== 'text' || data.value.truncated) {
    return false
  }
  if (data.value.path && data.value.path !== targetPath) return false
  if (
    editorSaveState.value === 'dirty' ||
    editorSaveState.value === 'error' ||
    editorSaveConflict.value
  ) {
    return true
  }
  return targetPath === lastPersistedPath && (data.value.text ?? '') !== lastPersistedText
}

function markDiskSynced(path: string, text: string, mtimeMs?: number): void {
  lastPersistedPath = path
  lastPersistedText = text
  lastPersistedMtimeMs = mtimeMs ?? (data.value?.path === path ? data.value.mtimeMs : undefined)
  clearEditorSaveTimers()
  editorSaveState.value = 'idle'
  editorSaveConflict.value = false
  draftConflictDiskSnapshot.value = null
  showDraftConflictDiff.value = false
  retainedDrafts.delete(path)
}

function estimateUtf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).byteLength
  }
  return text.length
}

async function fetchConflictingDiskSnapshot(targetPath: string): Promise<void> {
  if (!transport || !targetPath) return
  try {
    const fresh = await transport.send(AgentWorkspaceEvents.readFile, {
      path: targetPath,
      conversationId: props.conversationId ?? null
    })
    if (isUnmounted || resolvedPath.value !== targetPath || fresh.kind !== 'text') return
    if (editorSaveConflict.value) {
      draftConflictDiskSnapshot.value = fresh
    }
  } catch {
    // Keep existing conflict state even if inspection read fails.
  }
}

async function persistMarkdownSnapshot(
  targetPath: string,
  content: string,
  expectedMtimeMs: number | undefined,
  options?: { force?: boolean; allowOverwriteOnConflict?: boolean }
): Promise<boolean> {
  if (!transport || !targetPath) return false
  if (editorSaveInFlight) {
    if (activeSavePromise && activeSavePath === targetPath) {
      await activeSavePromise
      if (!options?.force && targetPath === lastPersistedPath && content === lastPersistedText) {
        return true
      }
      if (editorSaveInFlight) return false
    } else {
      return false
    }
  }
  if (
    !options?.force &&
    !options?.allowOverwriteOnConflict &&
    targetPath === lastPersistedPath &&
    content === lastPersistedText
  ) {
    if (resolvedPath.value === targetPath) {
      editorSaveState.value = 'idle'
      editorSaveConflict.value = false
    }
    return true
  }

  editorSaveInFlight = true
  activeSavePath = targetPath
  canvasWriteInFlight = true
  if (resolvedPath.value === targetPath) {
    editorSaveState.value = 'saving'
  }

  const runSave = (async (): Promise<boolean> => {
    try {
      const written = await transport.send(AgentWorkspaceEvents.writeFile, {
        path: targetPath,
        content,
        conversationId: props.conversationId ?? null,
        ...(expectedMtimeMs !== undefined && !options?.allowOverwriteOnConflict
          ? { expectedMtimeMs }
          : {})
      })
      lastPersistedPath = targetPath
      lastPersistedText = content
      lastPersistedMtimeMs = written.mtimeMs
      retainedDrafts.delete(targetPath)
      if (!isUnmounted && resolvedPath.value === targetPath && data.value?.kind === 'text') {
        editorSaveConflict.value = false
        draftConflictDiskSnapshot.value = null
        showDraftConflictDiff.value = false
        const currentText = data.value.text ?? ''
        data.value = {
          ...data.value,
          size: currentText === content ? written.size : estimateUtf8ByteLength(currentText),
          mtimeMs: written.mtimeMs,
          truncated: false
        }
        if (currentText !== content) {
          editorSaveState.value = 'dirty'
          scheduleMarkdownAutoSave()
        } else {
          editorSaveState.value = 'saved'
          if (editorSavedResetTimer !== null) clearTimeout(editorSavedResetTimer)
          editorSavedResetTimer = setTimeout(() => {
            if (editorSaveState.value === 'saved') editorSaveState.value = 'idle'
            editorSavedResetTimer = null
          }, 1800)
        }
      }
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isConflict = /WORKSPACE_FILE_CONFLICT/i.test(msg)
      retainedDrafts.set(targetPath, {
        text: content,
        baseMtimeMs: expectedMtimeMs,
        diskText: targetPath === lastPersistedPath ? lastPersistedText : '',
        conflict: isConflict
      })
      if (!isUnmounted && resolvedPath.value === targetPath) {
        editorSaveState.value = 'error'
        if (isConflict) {
          editorSaveConflict.value = true
          void fetchConflictingDiskSnapshot(targetPath)
        }
      }
      if (isConflict) {
        toast.error(t('home.sidePanel.editorSaveConflict'))
      } else {
        toast.error(t('home.sidePanel.canvasApplyFailed'))
      }
      return false
    } finally {
      canvasWriteInFlight = false
      editorSaveInFlight = false
      if (activeSavePath === targetPath) {
        activeSavePath = ''
      }
    }
  })()

  activeSavePromise = runSave
  try {
    return await runSave
  } finally {
    if (activeSavePromise === runSave) {
      activeSavePromise = null
    }
  }
}

async function saveMarkdownEdits(options?: {
  force?: boolean
  allowOverwriteOnConflict?: boolean
}): Promise<boolean> {
  if (editorSaveTimer !== null) {
    clearTimeout(editorSaveTimer)
    editorSaveTimer = null
  }
  if (!isMarkdown.value || !data.value || data.value.kind !== 'text' || data.value.truncated) {
    return false
  }
  if (isCanvasLocked.value) return false
  const expectedMtime =
    resolvedPath.value === lastPersistedPath && lastPersistedMtimeMs !== undefined
      ? lastPersistedMtimeMs
      : data.value.mtimeMs
  return persistMarkdownSnapshot(resolvedPath.value, data.value.text ?? '', expectedMtime, options)
}

async function ensureDraftSavedBeforeAiAction(): Promise<boolean> {
  const targetPath = resolvedPath.value
  if (activeSavePromise && activeSavePath === targetPath) {
    const inFlightOk = await activeSavePromise
    if (isUnmounted || resolvedPath.value !== targetPath) return false
    if (!inFlightOk && hasUnsavedLocalDraft(targetPath)) return false
  }
  if (!hasUnsavedLocalDraft(targetPath)) return true
  return await saveMarkdownEdits({ force: true })
}

async function reloadFromConflictingDisk(): Promise<void> {
  const targetPath = resolvedPath.value
  if (!targetPath) return
  retainedDrafts.delete(targetPath)
  const snapshot = draftConflictDiskSnapshot.value
  if (snapshot && snapshot.kind === 'text' && (snapshot.path || targetPath) === targetPath) {
    data.value = snapshot
    markDiskSynced(snapshot.path || targetPath, snapshot.text ?? '', snapshot.mtimeMs)
    return
  }
  await loadFile({ discardDraft: true })
}

async function overwriteDiskWithLocalDraft(): Promise<void> {
  await saveMarkdownEdits({ force: true, allowOverwriteOnConflict: true })
}

function scheduleMarkdownAutoSave(): void {
  if (editorSaveTimer !== null) clearTimeout(editorSaveTimer)
  editorSaveTimer = setTimeout(() => {
    editorSaveTimer = null
    void saveMarkdownEdits()
  }, EDITOR_AUTOSAVE_DEBOUNCE_MS)
}

function handleMarkdownEditorInput(nextText: string): void {
  if (!data.value || data.value.kind !== 'text' || markdownEditorReadonly.value) return
  if (nextText === (data.value.text ?? '')) return
  if (canvasPhase.value === 'applied') {
    resetCanvasState()
  }
  data.value = {
    ...data.value,
    text: nextText,
    size: estimateUtf8ByteLength(nextText)
  }
  if (
    !editorSaveConflict.value &&
    resolvedPath.value === lastPersistedPath &&
    nextText === lastPersistedText
  ) {
    clearEditorSaveTimers()
    editorSaveState.value = 'idle'
    retainedDrafts.delete(resolvedPath.value)
    return
  }
  if (editorSaveConflict.value) {
    retainedDrafts.set(resolvedPath.value, {
      text: nextText,
      baseMtimeMs: lastPersistedMtimeMs ?? data.value.mtimeMs,
      diskText: lastPersistedText,
      conflict: true
    })
    return
  }
  editorSaveState.value = 'dirty'
  scheduleMarkdownAutoSave()
}

function handleMarkdownEditorBlur(): void {
  if (editorSaveState.value === 'dirty' && !editorSaveConflict.value) {
    void saveMarkdownEdits()
  }
}

function commitCanvasVisualTransition(
  nextData: WorkspaceReadFileResult,
  beforeText: string,
  beforeMtimeMs: number,
  beforeBlockTexts: string[],
  beforeRawBlockTexts: string[],
  meta: {
    source: CanvasAppliedSource
    actionId: string
    scope: 'selection' | 'document'
    selectedText: string
    sourceRange: SourceRange | null
  }
): void {
  const afterText = nextData.text ?? ''
  const diff = computeCanvasLineDiff(beforeText, afterText)
  const targetPath = nextData.path || resolvedPath.value
  // Capture the rendered OLD document pixel-for-pixel BEFORE committing nextData,
  // so old text remains cleanly visible underneath while the new layer sweeps over it.
  const oldSnapshot =
    isMarkdown.value && viewMode.value === 'preview' ? captureOldMarkdownSnapshot() : null
  data.value = nextData
  markDiskSynced(targetPath, afterText, nextData.mtimeMs)
  canvasPhase.value = 'applied'
  canvasShowDiff.value = false
  canvasConflictRefreshAvailable.value = false
  pendingDomBlockIndices.value = new Set()

  canvasApplied.value = {
    filePath: targetPath,
    source: meta.source,
    actionId: meta.actionId,
    scope: meta.scope,
    selectedText: meta.selectedText,
    sourceRange: meta.sourceRange,
    beforeText,
    afterText,
    beforeMtimeMs,
    afterMtimeMs: nextData.mtimeMs,
    diff,
    beforeBlockTexts,
    beforeRawBlockTexts,
    changedBlockIndices: new Set()
  }

  const transitionToken = canvasOpToken
  void nextTick(() => {
    if (!isCanvasOpActive(transitionToken, targetPath) || !canvasApplied.value) return
    const afterBlockTexts = snapshotMarkdownBlockTexts()
    const changedBlocks = computeChangedBlockIndices(beforeBlockTexts, afterBlockTexts)
    canvasApplied.value = {
      ...canvasApplied.value,
      changedBlockIndices: changedBlocks
    }
    triggerCanvasSweepAnimation(oldSnapshot)
  })
}

async function syncFromDisk(options: {
  reason: CanvasAppliedSource
  fromTool?: boolean
  expectedOpToken?: number
}): Promise<boolean> {
  if (!transport || canvasWriteInFlight) return false
  const targetPath = resolvedPath.value.trim()
  if (!targetPath) return false
  const current = data.value
  if (!current) return false

  const session = canvasPending.value
  const opToken = options.expectedOpToken ?? session?.opToken ?? canvasOpToken
  const ambientSnap =
    ambientBeforeSnapshot.value?.filePath === targetPath ? ambientBeforeSnapshot.value : null
  const diskBaselineText =
    targetPath === lastPersistedPath ? lastPersistedText : (current.text ?? '')
  const beforeText = session
    ? session.beforeText
    : ambientSnap
      ? ambientSnap.beforeText
      : diskBaselineText
  const beforeMtimeMs = session
    ? session.beforeMtimeMs
    : ambientSnap
      ? ambientSnap.beforeMtimeMs
      : (lastPersistedMtimeMs ?? current.mtimeMs)
  const beforeBlockTexts = session
    ? session.beforeBlockTexts
    : ambientSnap
      ? ambientSnap.beforeBlockTexts
      : snapshotMarkdownBlockTexts()
  const beforeRawBlockTexts = session
    ? session.beforeRawBlockTexts
    : ambientSnap
      ? ambientSnap.beforeRawBlockTexts
      : snapshotRawMarkdownBlockTexts()

  try {
    const fresh = await transport.send(AgentWorkspaceEvents.readFile, {
      path: targetPath,
      conversationId: props.conversationId ?? null
    })
    if (isUnmounted || resolvedPath.value !== targetPath) return false
    if (options.expectedOpToken !== undefined && !isCanvasOpActive(opToken, targetPath)) {
      return false
    }
    if (
      session &&
      (canvasPending.value !== session || !isCanvasOpActive(session.opToken, targetPath))
    ) {
      return false
    }
    if (fresh.kind !== 'text') {
      if (fresh.mtimeMs !== current.mtimeMs) {
        data.value = fresh
      }
      return false
    }
    const freshText = fresh.text ?? ''
    const latestSyncedText = targetPath === lastPersistedPath ? lastPersistedText : diskBaselineText
    if (freshText === diskBaselineText || freshText === latestSyncedText) {
      return false
    }

    // Preserve unsaved local draft instead of silently overwriting it when disk changes concurrently.
    const liveLocalText = data.value?.kind === 'text' ? (data.value.text ?? '') : ''
    if (hasUnsavedLocalDraft(targetPath) && freshText !== liveLocalText) {
      draftConflictDiskSnapshot.value = fresh
      editorSaveConflict.value = true
      editorSaveState.value = 'error'
      retainedDrafts.set(targetPath, {
        text: liveLocalText,
        baseMtimeMs: lastPersistedMtimeMs ?? current.mtimeMs,
        diskText: diskBaselineText,
        conflict: true
      })
      if (session && session.filePath === targetPath) {
        session.diskApplied = true
        canvasPending.value = null
      }
      canvasPhase.value = 'idle'
      pendingDomBlockIndices.value = new Set()
      ambientBeforeSnapshot.value = null
      const tail = props.messages.at(-1)
      ambientSettledMessageId.value = tail?.role === 'assistant' ? tail.id : null
      toast.error(t('home.sidePanel.editorSaveConflict'))
      return true
    }

    if (fresh.truncated) {
      if (session && session.filePath === targetPath) {
        session.diskApplied = true
      }
      data.value = fresh
      markDiskSynced(fresh.path || targetPath, freshText, fresh.mtimeMs)
      resetCanvasState()
      return true
    }

    if (session && session.filePath === targetPath) {
      session.diskApplied = true
      canvasPending.value = null
    }
    ambientBeforeSnapshot.value = null
    const tail = props.messages.at(-1)
    ambientSettledMessageId.value = tail?.role === 'assistant' ? tail.id : null
    commitCanvasVisualTransition(
      fresh,
      beforeText,
      beforeMtimeMs,
      beforeBlockTexts,
      beforeRawBlockTexts,
      {
        source: options.reason,
        actionId: session?.actionId ?? 'sync',
        scope: session?.scope ?? 'selection',
        selectedText: session?.selectedText ?? '',
        sourceRange: session?.sourceRange ?? null
      }
    )
    return true
  } catch {
    return false
  }
}

async function finalizePendingCanvasSession(target: ConversationMessage): Promise<void> {
  const session = canvasPending.value
  if (!session || canvasFinalizeInFlight) return
  const opToken = session.opToken
  if (!isCanvasOpActive(opToken, session.filePath)) {
    resetCanvasState()
    return
  }
  if (session.diskApplied) {
    lastAppliedAssistantId = target.id
    canvasPending.value = null
    return
  }

  canvasFinalizeInFlight = true
  lastAppliedAssistantId = target.id
  try {
    // 1. Disk-first check: if the agent edited the file via file.write / bash / Herdr, adopt it.
    let syncedFromDisk = await syncFromDisk({ reason: 'improve', expectedOpToken: opToken })
    if (syncedFromDisk) return
    if (!isCanvasOpActive(opToken, session.filePath) || canvasPending.value !== session) return

    const writes = inspectMessageFileWrites(target, currentFileIdentity.value)
    if (writes.completedCount > 0 || writes.unknownCompletedCount > 0) {
      // Allow a brief flush window when a real file-write tool completed right before turn end.
      await new Promise((resolve) => setTimeout(resolve, 180))
      if (!isCanvasOpActive(opToken, session.filePath) || canvasPending.value !== session) return
      syncedFromDisk = await syncFromDisk({ reason: 'improve', expectedOpToken: opToken })
      if (syncedFromDisk) return
      if (!isCanvasOpActive(opToken, session.filePath) || canvasPending.value !== session) return
    }

    if (!session.autoApply) {
      resetCanvasState()
      return
    }

    // Never auto-write over a truncated file preview.
    if (!data.value || data.value.kind !== 'text' || data.value.truncated) {
      resetCanvasState()
      return
    }

    // 2. Fallback: extract revised passage from assistant reply and persist cleanly.
    const extracted = extractCanvasRevisionFromReply(target.content ?? '', {
      originalSource: session.beforeText,
      selectedText: session.selectedText,
      fileExt: fileExt.value
    })
    if (!extracted) {
      if (!isCanvasOpActive(opToken, session.filePath) || canvasPending.value !== session) return
      resetCanvasState()
      const claimedDiskUpdate =
        writes.completedCount === 0 &&
        writes.unknownCompletedCount === 0 &&
        isClaimedDiskUpdateReply(target.content ?? '')
      if (claimedDiskUpdate) {
        toast.warning(t('home.sidePanel.canvasFalseWriteClaim'))
      } else {
        toast.info(t('home.sidePanel.canvasNoRevisionExtracted'))
      }
      return
    }

    const merged = applyCanvasRevisionToSource(
      session.beforeText,
      session.selectedText,
      extracted,
      {
        scope: session.scope,
        sourceRange: session.sourceRange
      }
    )
    if (!merged || !merged.changed) {
      if (!isCanvasOpActive(opToken, session.filePath) || canvasPending.value !== session) return
      resetCanvasState()
      toast.info(t('home.sidePanel.canvasNoRevisionExtracted'))
      return
    }

    if (
      !transport ||
      !data.value ||
      data.value.kind !== 'text' ||
      data.value.truncated ||
      !isCanvasOpActive(opToken, session.filePath) ||
      canvasPending.value !== session
    ) {
      return
    }

    canvasPhase.value = 'applying'
    canvasWriteInFlight = true
    try {
      const written = await transport.send(AgentWorkspaceEvents.writeFile, {
        path: session.filePath,
        content: merged.nextContent,
        conversationId: props.conversationId ?? null,
        expectedMtimeMs: session.beforeMtimeMs
      })
      if (!isCanvasOpActive(opToken, session.filePath) || canvasPending.value !== session) {
        return
      }
      if (!data.value || data.value.kind !== 'text') {
        resetCanvasState()
        return
      }
      const nextData: WorkspaceReadFileResult = {
        ...data.value,
        text: merged.nextContent,
        size: written.size,
        mtimeMs: written.mtimeMs,
        truncated: false
      }
      canvasPending.value = null
      commitCanvasVisualTransition(
        nextData,
        session.beforeText,
        session.beforeMtimeMs,
        session.beforeBlockTexts,
        session.beforeRawBlockTexts,
        {
          source: 'improve',
          actionId: session.actionId,
          scope: session.scope,
          selectedText: session.selectedText,
          sourceRange: session.sourceRange
        }
      )
    } catch (err) {
      if (!isCanvasOpActive(opToken, session.filePath) || canvasPending.value !== session) {
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      // If disk changed concurrently right before our write, check disk once before reporting failure.
      if (/WORKSPACE_FILE_CONFLICT/i.test(msg)) {
        const adopted = await syncFromDisk({ reason: 'improve', expectedOpToken: opToken })
        if (adopted) return
        if (!isCanvasOpActive(opToken, session.filePath)) return
      }
      resetCanvasState()
      toast.error(t('home.sidePanel.canvasApplyFailed'))
    } finally {
      canvasWriteInFlight = false
    }
  } finally {
    canvasFinalizeInFlight = false
  }
}

async function refreshAfterCanvasConflict(): Promise<void> {
  resetCanvasState()
  await loadFile({ discardDraft: true })
}

async function undoCanvasEdit(): Promise<void> {
  const snapshot = canvasApplied.value
  if (!snapshot || canvasUndoing.value || !transport || !data.value || data.value.kind !== 'text') {
    return
  }
  const opToken = canvasOpToken
  canvasUndoing.value = true
  canvasWriteInFlight = true
  try {
    const written = await transport.send(AgentWorkspaceEvents.writeFile, {
      path: snapshot.filePath,
      content: snapshot.beforeText,
      conversationId: props.conversationId ?? null,
      expectedMtimeMs: snapshot.afterMtimeMs
    })
    if (!isCanvasOpActive(opToken, snapshot.filePath)) return
    if (data.value?.kind === 'text') {
      data.value = {
        ...data.value,
        text: snapshot.beforeText,
        size: written.size,
        mtimeMs: written.mtimeMs
      }
      markDiskSynced(snapshot.filePath, snapshot.beforeText, written.mtimeMs)
    }
    resetCanvasState()
    toast.success(t('home.sidePanel.canvasUndone'))
  } catch (err) {
    if (!isCanvasOpActive(opToken, snapshot.filePath)) return
    const msg = err instanceof Error ? err.message : String(err)
    if (/WORKSPACE_FILE_CONFLICT/i.test(msg)) {
      canvasConflictRefreshAvailable.value = true
      toast.error(t('home.sidePanel.canvasUndoConflict'))
    } else {
      toast.error(t('home.sidePanel.canvasApplyFailed'))
    }
  } finally {
    canvasWriteInFlight = false
    canvasUndoing.value = false
  }
}

async function startCanvasImprove(
  selectedText: string,
  selection: SelectionPayload,
  options?: {
    userSuggestion?: string
    isFullDocument?: boolean
    blockIndices?: Set<number>
    sourceRange?: SourceRange | null
  }
): Promise<boolean> {
  if (!data.value || data.value.kind !== 'text' || data.value.truncated || isCanvasLocked.value) {
    return false
  }
  const initialPath = resolvedPath.value
  const savedBeforeDispatch = await ensureDraftSavedBeforeAiAction()
  if (!savedBeforeDispatch) return false
  if (
    isUnmounted ||
    resolvedPath.value !== initialPath ||
    !data.value ||
    data.value.kind !== 'text' ||
    data.value.truncated ||
    isCanvasLocked.value
  ) {
    return false
  }

  const targetPath = resolvedPath.value
  const scope: 'selection' | 'document' = options?.isFullDocument ? 'document' : 'selection'
  const beforeText = data.value.text ?? ''
  const beforeMtimeMs = data.value.mtimeMs
  const beforeBlockTexts = snapshotMarkdownBlockTexts()
  const beforeRawBlockTexts = snapshotRawMarkdownBlockTexts()
  const pendingIndices = options?.blockIndices
    ? new Set(options.blockIndices)
    : resolvePendingBlockIndices(selection)
  const sourceRange =
    scope === 'document' ? null : (options?.sourceRange ?? captureEditorSourceRange())

  const formatted = formatCanvasImprovePrompt({
    displayPath: displayPathForAi.value,
    selectedText,
    userSuggestion: options?.userSuggestion,
    isFullDocument: scope === 'document',
    instruction:
      scope === 'document'
        ? t('home.sidePanel.canvasPromptFullDocument')
        : t('home.sidePanel.selectionPromptImprove')
  })

  const opToken = ++canvasOpToken
  pendingDomBlockIndices.value = pendingIndices
  canvasApplied.value = null
  canvasShowDiff.value = false
  canvasConflictRefreshAvailable.value = false
  ambientBeforeSnapshot.value = null
  ambientSettledMessageId.value = null
  canvasPhase.value = 'thinking'
  canvasPending.value = {
    opToken,
    filePath: targetPath,
    actionId: 'improve',
    scope,
    selectedText,
    sourceRange,
    autoApply: true,
    beforeText,
    beforeMtimeMs,
    beforeBlockTexts,
    beforeRawBlockTexts,
    baseline: {
      knownMessageIds: new Set(props.messages.map((m) => m.id)),
      initialCount: props.messages.length,
      requestPrompt: formatted
    },
    lastSeenWriteCount: 0,
    diskApplied: false
  }

  clearMdSelection()
  selectionPrompt.value = ''
  window.getSelection()?.removeAllRanges()
  void nextTick(() => syncMarkdownBlockClasses(false))

  const accepted = await dispatchAiAction('send', selectedText, formatted, {
    actionKind: 'improve',
    autoApply: true
  })
  if (!accepted) {
    if (isCanvasOpActive(opToken, targetPath)) {
      resetCanvasState()
    }
    return false
  }
  return true
}

async function retryCanvasEdit(): Promise<void> {
  const snapshot = canvasApplied.value
  if (!snapshot || canvasUndoing.value || !transport || !data.value || data.value.kind !== 'text') {
    return
  }
  const opToken = canvasOpToken
  const origSelected = snapshot.selectedText
  const origScope = snapshot.scope
  const origSourceRange = snapshot.sourceRange
  const origRects = measureBlocksClientRects(snapshot.changedBlockIndices)
  canvasUndoing.value = true
  canvasWriteInFlight = true
  try {
    const written = await transport.send(AgentWorkspaceEvents.writeFile, {
      path: snapshot.filePath,
      content: snapshot.beforeText,
      conversationId: props.conversationId ?? null,
      expectedMtimeMs: snapshot.afterMtimeMs
    })
    if (!isCanvasOpActive(opToken, snapshot.filePath)) return
    if (data.value?.kind === 'text') {
      data.value = {
        ...data.value,
        text: snapshot.beforeText,
        size: written.size,
        mtimeMs: written.mtimeMs
      }
      markDiskSynced(snapshot.filePath, snapshot.beforeText, written.mtimeMs)
    }
    resetCanvasState()
    await nextTick()
  } catch (err) {
    if (!isCanvasOpActive(opToken, snapshot.filePath)) return
    const msg = err instanceof Error ? err.message : String(err)
    if (/WORKSPACE_FILE_CONFLICT/i.test(msg)) {
      canvasConflictRefreshAvailable.value = true
      toast.error(t('home.sidePanel.canvasUndoConflict'))
    } else {
      toast.error(t('home.sidePanel.canvasApplyFailed'))
    }
    return
  } finally {
    canvasWriteInFlight = false
    canvasUndoing.value = false
  }

  await startCanvasImprove(
    origSelected,
    { text: origSelected, rects: origRects },
    {
      isFullDocument: origScope === 'document',
      sourceRange: origSourceRange
    }
  )
}

function dismissMdSelection(): void {
  clearMdSelection()
  selectionPrompt.value = ''
  window.getSelection()?.removeAllRanges()
}

watchEffect((onCleanup) => {
  const persistedRange =
    canvasCompose.value?.range ?? (commentComposerOpen.value ? commentDraftRange.value : null)
  if (!persistedRange) return
  onCleanup(registerSelectionHighlight(persistedRange))
})

watch(commentComposerOpen, (open) => {
  if (!open) commentDraftRange.value = null
})

watch(
  resolvedPath,
  (nextPath) => {
    comments.value = readSessionReviewComments(nextPath)
    commentComposerOpen.value = false
    commentDraftRange.value = null
    commentDraftQuote.value = ''
    commentDraftText.value = ''
    commentsExpanded.value = false
    clearMdSelection()
    selectionPrompt.value = ''
    resetCanvasState({ clearAmbientSettled: true })
  },
  { immediate: true }
)

watch(isCanvasLocked, (locked, prevLocked) => {
  if (locked) {
    clearEditorSaveTimers()
    clearMdSelection()
    selectionPrompt.value = ''
    commentComposerOpen.value = false
    outlineOpen.value = false
    moreMenuOpen.value = false
    viewportMenuOpen.value = false
    lintPopoverOpen.value = false
    window.getSelection()?.removeAllRanges()
    if (!canvasPending.value && data.value?.kind === 'text' && !ambientBeforeSnapshot.value) {
      const targetPath = resolvedPath.value
      const diskText =
        targetPath === lastPersistedPath ? lastPersistedText : (data.value.text ?? '')
      ambientBeforeSnapshot.value = {
        filePath: targetPath,
        beforeText: diskText,
        beforeMtimeMs:
          targetPath === lastPersistedPath && lastPersistedMtimeMs !== undefined
            ? lastPersistedMtimeMs
            : data.value.mtimeMs,
        beforeBlockTexts: snapshotMarkdownBlockTexts(),
        beforeRawBlockTexts: snapshotRawMarkdownBlockTexts()
      }
    }
  } else if (prevLocked && ambientBeforeSnapshot.value && canvasPhase.value !== 'applied') {
    const ambientToken = canvasOpToken
    const ambientPath = ambientBeforeSnapshot.value.filePath
    // Streaming finished without an explicit tool-write event; do one final disk check to adopt
    // any silent file write (e.g. shell redirect), otherwise surface a warning if AI falsely claimed a write.
    void syncFromDisk({ reason: 'sync', expectedOpToken: ambientToken })
      .then((synced) => {
        if (synced || !isCanvasOpActive(ambientToken, ambientPath)) return
        const tail = props.messages.at(-1)
        if (!tail || tail.role !== 'assistant' || tail.status !== 'complete') return
        const writes = inspectMessageFileWrites(tail, currentFileIdentity.value)
        const claimedDiskUpdate =
          writes.completedCount === 0 &&
          writes.unknownCompletedCount === 0 &&
          isClaimedDiskUpdateReply(tail.content ?? '')
        if (claimedDiskUpdate) {
          toast.warning(t('home.sidePanel.canvasFalseWriteClaim'))
        }
      })
      .finally(() => {
        if (ambientBeforeSnapshot.value?.filePath === ambientPath) {
          ambientBeforeSnapshot.value = null
        }
      })
  }
  void nextTick(() => {
    if (!canvasSweepActive.value) {
      syncMarkdownBlockClasses(false)
    }
  })
})

watch(canvasShowDiff, (open) => {
  if (open && canvasSweepActive.value) {
    finishCanvasSweep()
  }
})

watch(viewMode, (mode) => {
  if (mode !== 'preview' && canvasSweepActive.value) {
    finishCanvasSweep()
  }
  if (!isCanvasLocked.value) {
    clearMdSelection()
    selectionPrompt.value = ''
  }
  outlineOpen.value = false
  viewportMenuOpen.value = false
  lintPopoverOpen.value = false
  if (mode === 'preview' && canvasPhase.value === 'applied') {
    void nextTick(() => syncMarkdownBlockClasses(false))
  }
})

watch(
  [() => props.messages, () => props.aiStreaming],
  ([messages, streaming]) => {
    if (!props.aiActionsEnabled) return

    const session = canvasPending.value
    if (session && session.filePath === resolvedPath.value) {
      const target = findTargetAssistantMessage(messages, session.baseline)
      if (!target) return

      const writes = inspectMessageFileWrites(target, currentFileIdentity.value)
      if (
        canvasPhase.value === 'thinking' &&
        (writes.running || writes.unknownRunning || isMessageStreamingCanvasEdit(target))
      ) {
        canvasPhase.value = 'streaming'
      }

      if (target.status === 'failed') {
        cancelCanvasPending()
        return
      }

      const isTerminal = target.status === 'complete' && !streaming
      if (writes.completedCount > session.lastSeenWriteCount) {
        session.lastSeenWriteCount = writes.completedCount
        if (!isTerminal) {
          void syncFromDisk({ reason: 'improve', fromTool: true, expectedOpToken: session.opToken })
          return
        }
      }

      if (isTerminal && lastAppliedAssistantId !== target.id) {
        void finalizePendingCanvasSession(target)
      }
      return
    }

    // Ambient sync: if the AI completes a file-write tool touching this open file from normal chat
    // or review comments, silently sync & animate the right pane automatically.
    const tail = messages.at(-1)
    if (!tail || tail.role !== 'assistant' || !data.value) return
    const writes = inspectMessageFileWrites(tail, currentFileIdentity.value)
    if (writes.completedCount === 0) return
    if (tail.id === ambientLastHandledMsgId && writes.completedCount <= ambientLastWriteCount) {
      return
    }
    ambientLastHandledMsgId = tail.id
    ambientLastWriteCount = writes.completedCount
    void syncFromDisk({ reason: 'sync', fromTool: true })
  },
  { deep: true }
)

watch(viewportMenuOpen, (open) => {
  if (!open) {
    viewportQuery.value = ''
  }
})

async function handleLintSendToAi(payload: {
  prompt: string
  issues: TdsLintIssue[]
}): Promise<void> {
  if (sendingAiAction.value || !payload.prompt.trim()) return
  const summary = payload.issues
    .map((issue) => `${issue.ruleId}${issue.line !== undefined ? `:L${issue.line}` : ''}`)
    .join(', ')
  sendingAiAction.value = true
  try {
    const accepted = await dispatchAiAction('send', summary, payload.prompt)
    if (accepted) {
      lintPopoverOpen.value = false
    }
  } finally {
    sendingAiAction.value = false
  }
}

async function handleLintSelectIssue(issue: TdsLintIssue): Promise<void> {
  if (!issue.line || issue.line <= 0) return
  lintPopoverOpen.value = false
  viewMode.value = 'source'
  await nextTick()
  const row = codeContainerRef.value?.querySelector<HTMLElement>(`[data-line="${issue.line}"]`)
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function dispatchAiAction(
  mode: 'send' | 'quote',
  selectedText: string,
  prompt: string,
  meta?: {
    actionKind?: WorkspaceFileAiActionKind
    autoApply?: boolean
  }
): Promise<boolean> {
  if (mode === 'send') {
    const saved = await ensureDraftSavedBeforeAiAction()
    if (!saved) return false
  }
  let settled: Promise<boolean> | null = null
  emit('ai-action', {
    mode,
    ...(meta?.actionKind ? { actionKind: meta.actionKind } : {}),
    ...(meta?.autoApply ? { autoApply: true } : {}),
    filePath: resolvedPath.value,
    displayPath: displayPathForAi.value,
    selectedText,
    prompt,
    settle: (result) => {
      settled = Promise.resolve(result)
    }
  })
  if (!settled) return true
  try {
    return await settled
  } catch {
    return false
  }
}

async function handleMdSelectionAction(payload: {
  id: string
  selection: SelectionPayload
}): Promise<void> {
  const selectedText = payload.selection.text.trim()
  if (!selectedText) {
    dismissMdSelection()
    return
  }

  if (payload.id === 'copy') {
    try {
      await navigator.clipboard.writeText(selectedText)
      toast.success(t('home.copied'))
    } catch {
      // ignore clipboard errors
    }
    dismissMdSelection()
    return
  }

  if (payload.id === 'comment') {
    commentDraftQuote.value = selectedText
    commentDraftText.value = ''
    commentDraftRange.value = payload.selection.range?.cloneRange() ?? null
    commentComposerOpen.value = true
    dismissMdSelection()
    await nextTick()
    commentInputRef.value?.focus()
    return
  }

  if (payload.id === 'quote') {
    const formatted = formatSingleSelectionPrompt({
      displayPath: displayPathForAi.value,
      selectedText,
      instruction: ''
    })
    const accepted = await dispatchAiAction('quote', selectedText, formatted)
    if (accepted) dismissMdSelection()
    return
  }

  if (payload.id === 'improve') {
    await openCanvasCompose({ scope: 'selection', selection: payload.selection })
    return
  }

  const instructionMap: Record<string, { text: string; kind: WorkspaceFileAiActionKind }> = {
    explain: { text: t('home.sidePanel.selectionPromptExplain'), kind: 'explain' },
    translate: { text: t('home.sidePanel.selectionPromptTranslate'), kind: 'translate' }
  }
  const entry = instructionMap[payload.id]
  if (entry?.text) {
    const formatted = formatSingleSelectionPrompt({
      displayPath: displayPathForAi.value,
      selectedText,
      instruction: entry.text
    })
    const accepted = await dispatchAiAction('send', selectedText, formatted, {
      actionKind: entry.kind
    })
    if (!accepted) return
  }
  dismissMdSelection()
}

async function handleMdSelectionSubmit(payload: {
  prompt: string
  selection: SelectionPayload
}): Promise<void> {
  const selectedText = payload.selection.text.trim()
  const instruction = payload.prompt.trim()
  if (!selectedText || !instruction) return
  const barNode = extractDomNode(selectionBarRef.value)
  const formatted = formatSingleSelectionPrompt({
    displayPath: displayPathForAi.value,
    selectedText,
    instruction
  })
  const accepted = await dispatchAiAction('send', selectedText, formatted, {
    actionKind: 'custom'
  })
  if (accepted) {
    triggerCanvasLaunchFlight(instruction, barNode instanceof HTMLElement ? barNode : null)
    dismissMdSelection()
  }
}

function saveDraftComment(): void {
  const text = commentDraftText.value.trim()
  const quote = commentDraftQuote.value.trim()
  if (!text || !quote) return
  const next: MarkdownReviewComment[] = [
    ...comments.value,
    {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      quote,
      comment: text,
      createdAt: Date.now()
    }
  ]
  comments.value = next
  writeSessionReviewComments(resolvedPath.value, next)
  commentDraftQuote.value = ''
  commentDraftText.value = ''
  commentComposerOpen.value = false
  commentsExpanded.value = true
}

function removeCommentsForPath(targetPath: string, idsToRemove: ReadonlySet<string>): void {
  const currentStored =
    resolvedPath.value === targetPath ? comments.value : readSessionReviewComments(targetPath)
  const next = currentStored.filter((item) => !idsToRemove.has(item.id))
  writeSessionReviewComments(targetPath, next)
  if (resolvedPath.value === targetPath) {
    comments.value = next
    if (next.length === 0) commentsExpanded.value = false
  }
}

async function sendDraftCommentNow(): Promise<void> {
  if (sendingAiAction.value) return
  const text = commentDraftText.value.trim()
  const quote = commentDraftQuote.value.trim()
  if (!text || !quote) return
  const targetPath = resolvedPath.value
  const formatted = formatSingleSelectionPrompt({
    displayPath: displayPathForAi.value,
    selectedText: quote,
    instruction: text
  })
  sendingAiAction.value = true
  try {
    const accepted = await dispatchAiAction('send', quote, formatted)
    if (!accepted) return
    if (
      resolvedPath.value === targetPath &&
      commentDraftQuote.value.trim() === quote &&
      commentDraftText.value.trim() === text
    ) {
      commentDraftQuote.value = ''
      commentDraftText.value = ''
      commentComposerOpen.value = false
    }
  } finally {
    sendingAiAction.value = false
  }
}

function removeComment(id: string): void {
  removeCommentsForPath(resolvedPath.value, new Set([id]))
}

function clearAllComments(): void {
  comments.value = []
  writeSessionReviewComments(resolvedPath.value, [])
  commentsExpanded.value = false
}

async function sendSingleComment(item: MarkdownReviewComment): Promise<void> {
  if (sendingAiAction.value) return
  const targetPath = resolvedPath.value
  const formatted = formatSingleSelectionPrompt({
    displayPath: displayPathForAi.value,
    selectedText: item.quote,
    instruction: item.comment
  })
  sendingAiAction.value = true
  try {
    const accepted = await dispatchAiAction('send', item.quote, formatted)
    if (!accepted) return
    removeCommentsForPath(targetPath, new Set([item.id]))
  } finally {
    sendingAiAction.value = false
  }
}

async function sendAllCommentsToAi(): Promise<void> {
  if (sendingAiAction.value || comments.value.length === 0) return
  const targetPath = resolvedPath.value
  const snapshot = [...comments.value]
  const sentIds = new Set(snapshot.map((item) => item.id))
  const formatted = formatBatchCommentsPrompt({
    displayPath: displayPathForAi.value,
    comments: snapshot,
    intro: t('home.sidePanel.commentsSendIntro')
  })
  sendingAiAction.value = true
  try {
    const accepted = await dispatchAiAction(
      'send',
      snapshot.map((item) => item.quote).join('\n'),
      formatted
    )
    if (!accepted) return
    removeCommentsForPath(targetPath, sentIds)
  } finally {
    sendingAiAction.value = false
  }
}

function onCommentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    commentComposerOpen.value = false
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    saveDraftComment()
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!activeSelectionPayload.value) return
  if (isCanvasLocked.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  const barNode = extractDomNode(selectionBarRef.value)
  if (barNode?.contains(target)) return
  dismissMdSelection()
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    if (isMarkdown.value && viewMode.value === 'preview' && !markdownEditorReadonly.value) {
      const active = document.activeElement
      if (
        markdownContainerRef.value?.contains(active) ||
        editorSaveState.value === 'dirty' ||
        editorSaveState.value === 'error'
      ) {
        event.preventDefault()
        // Keep expectedMtimeMs conflict guard on ordinary Cmd/Ctrl+S saves.
        void saveMarkdownEdits({ force: true })
        return
      }
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    if (
      props.aiActionsEnabled &&
      isMarkdown.value &&
      viewMode.value === 'preview' &&
      !isCanvasLocked.value &&
      !isTruncatedText.value
    ) {
      const active = document.activeElement
      if (markdownContainerRef.value?.contains(active) || activeSelectionPayload.value) {
        event.preventDefault()
        if (activeSelectionPayload.value) {
          void openCanvasCompose({ scope: 'selection', selection: activeSelectionPayload.value })
        } else {
          void openCanvasCompose({ scope: 'document' })
        }
        return
      }
    }
  }
  if (event.key !== 'Escape') return
  if (canvasCompose.value) {
    closeCanvasCompose()
    return
  }
  if (isPendingCanvasBusy.value) {
    cancelCanvasPending()
    return
  }
  if (canvasShowDiff.value) {
    canvasShowDiff.value = false
    return
  }
  if (mdSelection.value) {
    dismissMdSelection()
  }
}

function onBodyScroll(): void {
  if (activeSelectionPayload.value) {
    selectionBarRef.value?.updatePosition?.()
  }
}

onMounted(() => {
  syncBeamTheme()
  if (typeof MutationObserver !== 'undefined' && hasDocument()) {
    themeObserver = new MutationObserver(syncBeamTheme)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })
    if (document.body) {
      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme']
      })
    }
  }
  if (hasWindow() && typeof window.matchMedia === 'function') {
    themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    themeMediaQuery.addEventListener?.('change', syncBeamTheme)
  }
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeyDown)
  if (transport && typeof transport.on === 'function') {
    disposeReviewListener = transport.on(ConversationReviewEvents.changed, (notification) => {
      if (!props.aiActionsEnabled) return
      if (!props.conversationId || notification.conversationId !== props.conversationId) return
      void syncFromDisk({ reason: canvasPending.value ? 'improve' : 'sync', fromTool: true })
    })
  }
})

function scrollToMarkdownHeading(headingIndex: number): void {
  outlineOpen.value = false
  const container = markdownContainerRef.value
  if (!container) return
  const headingEls = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4')
  const target = headingEls[headingIndex]
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function scrollToTargetLine(): Promise<void> {
  if (!props.line || props.line <= 0) return
  await nextTick()
  const row = codeContainerRef.value?.querySelector<HTMLElement>(`[data-line="${props.line}"]`)
  row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function loadFile(options?: { discardDraft?: boolean }): Promise<void> {
  const target = props.filePath.trim()
  const generation = ++loadGeneration
  const prevPath = resolvedPath.value
  const prevData = data.value
  const hadUnsavedPrevDraft = !options?.discardDraft && hasUnsavedLocalDraft(prevPath)
  const capturedPrevDraft: RetainedDraftEntry | null =
    hadUnsavedPrevDraft && prevData?.kind === 'text'
      ? {
          text: prevData.text ?? '',
          baseMtimeMs:
            prevPath === lastPersistedPath && lastPersistedMtimeMs !== undefined
              ? lastPersistedMtimeMs
              : prevData.mtimeMs,
          diskText: prevPath === lastPersistedPath ? lastPersistedText : '',
          conflict: editorSaveConflict.value
        }
      : null

  clearEditorSaveTimers()
  canvasOpToken += 1

  // Flush or retain the previous file's unsaved draft BEFORE replacing `data`.
  if (capturedPrevDraft && prevPath) {
    if (capturedPrevDraft.conflict) {
      retainedDrafts.set(prevPath, capturedPrevDraft)
    } else {
      if (activeSavePromise && activeSavePath === prevPath) {
        await activeSavePromise
        if (generation !== loadGeneration || isUnmounted) return
      }
      const stillUnsaved =
        prevPath !== lastPersistedPath || capturedPrevDraft.text !== lastPersistedText
      if (stillUnsaved) {
        const saved = await persistMarkdownSnapshot(
          prevPath,
          capturedPrevDraft.text,
          capturedPrevDraft.baseMtimeMs,
          { force: true }
        )
        if (generation !== loadGeneration || isUnmounted) return
        if (!saved) {
          retainedDrafts.set(prevPath, {
            ...capturedPrevDraft,
            conflict: editorSaveConflict.value || capturedPrevDraft.conflict
          })
        }
      }
    }
  }

  revokePdfUrl()
  error.value = ''
  imageZoom.value = 1

  if (!target) {
    data.value = null
    loading.value = false
    return
  }

  if (!transport) {
    data.value = null
    error.value = t('home.preview.readFailed')
    loading.value = false
    return
  }

  loading.value = true
  try {
    const result = await transport.send(AgentWorkspaceEvents.readFile, {
      path: target,
      conversationId: props.conversationId ?? null
    })
    if (generation !== loadGeneration || isUnmounted) return
    const loadedPath = result.path || target
    const retained = !options?.discardDraft ? retainedDrafts.get(loadedPath) : undefined
    if (retained && result.kind === 'text') {
      const isConflict = retained.conflict || (result.text ?? '') !== retained.diskText
      lastPersistedPath = loadedPath
      lastPersistedText = isConflict ? retained.diskText : (result.text ?? '')
      lastPersistedMtimeMs = isConflict ? retained.baseMtimeMs : result.mtimeMs
      data.value = {
        ...result,
        text: retained.text,
        size: estimateUtf8ByteLength(retained.text),
        ...(isConflict && retained.baseMtimeMs !== undefined
          ? { mtimeMs: retained.baseMtimeMs }
          : {})
      }
      editorSaveState.value = 'error'
      editorSaveConflict.value = isConflict
      draftConflictDiskSnapshot.value = isConflict ? result : null
      showDraftConflictDiff.value = false
    } else {
      data.value = result
      if (result.kind === 'text') {
        markDiskSynced(loadedPath, result.text ?? '', result.mtimeMs)
      } else {
        clearEditorSaveTimers()
        editorSaveState.value = 'idle'
        editorSaveConflict.value = false
        draftConflictDiskSnapshot.value = null
        showDraftConflictDiff.value = false
      }
    }
    // Default to preview for HTML/SVG/Markdown/JSON unless an explicit source line was clicked.
    viewMode.value = props.line && props.line > 0 ? 'source' : 'preview'

    if (result.kind === 'pdf' && result.base64) {
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      pdfBlobUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    }

    if (result.kind === 'text' && props.line) {
      void scrollToTargetLine()
    }
  } catch (err) {
    if (generation !== loadGeneration) return
    data.value = null
    const msg = err instanceof Error ? err.message : String(err)
    if (/ENOENT/i.test(msg)) {
      error.value = t('home.preview.fileNotFound')
    } else if (/FORBIDDEN/i.test(msg)) {
      error.value = t('home.sidePanel.fileForbidden')
    } else if (/timeout/i.test(msg)) {
      error.value = t('home.preview.readTimeout')
    } else {
      error.value = msg || t('home.preview.readFailed')
    }
  } finally {
    if (generation === loadGeneration) {
      loading.value = false
    }
  }
}

watch(
  () => [props.filePath, props.conversationId, props.refreshToken] as const,
  () => {
    void loadFile()
  },
  { immediate: true }
)

watch(
  () => props.line,
  (line) => {
    if (line && line > 0 && data.value?.kind === 'text') {
      viewMode.value = 'source'
      void scrollToTargetLine()
    }
  }
)

watch(
  () =>
    [
      isHtml.value,
      viewMode.value,
      data.value?.text ?? '',
      resolvedPath.value,
      lintAntiSlop.value,
      isDevicePresetActive.value ? activeDeviceDimensions.value.width : 1024,
      isDevicePresetActive.value ? activeDeviceDimensions.value.height : 720
    ] as const,
  ([htmlMode, mode, source, path, antiSlop, width, height]) => {
    cancelPendingDomProbe()
    if (!htmlMode || mode !== 'preview' || !source.trim() || !isElectronRenderer()) {
      domLintIssues.value = []
      return
    }

    const generation = domProbeGeneration
    const nextSessionKey = `file-viewer:${path}`
    if (activeDomProbeSessionKey && activeDomProbeSessionKey !== nextSessionKey) {
      void releaseCaptureSession(activeDomProbeSessionKey)
    }
    activeDomProbeSessionKey = nextSessionKey

    domProbeTimer = setTimeout(() => {
      domProbeTimer = null
      if (generation !== domProbeGeneration) return
      void captureFrameAndProbe({
        srcdoc: source,
        width,
        height,
        format: 'none',
        pixelRatio: 1,
        domProbeScript: buildTdsDomProbeScript({ antiSlop }),
        sessionKey: nextSessionKey
      }).then((result) => {
        if (generation !== domProbeGeneration) return
        domLintIssues.value = result.ok ? result.domIssues : []
      })
    }, LIVE_DOM_PROBE_DEBOUNCE_MS)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  isUnmounted = true
  canvasOpToken += 1
  if (
    hasUnsavedLocalDraft(resolvedPath.value) &&
    !editorSaveConflict.value &&
    data.value?.kind === 'text' &&
    !isCanvasLocked.value
  ) {
    const expectedMtime =
      resolvedPath.value === lastPersistedPath && lastPersistedMtimeMs !== undefined
        ? lastPersistedMtimeMs
        : data.value.mtimeMs
    void persistMarkdownSnapshot(resolvedPath.value, data.value.text ?? '', expectedMtime)
  }
  clearEditorSaveTimers()
  loadGeneration += 1
  cancelPendingDomProbe()
  if (activeDomProbeSessionKey) {
    void releaseCaptureSession(activeDomProbeSessionKey)
    activeDomProbeSessionKey = ''
  }
  clearSweepTimer()
  themeObserver?.disconnect()
  themeObserver = null
  themeMediaQuery?.removeEventListener?.('change', syncBeamTheme)
  themeMediaQuery = null
  disposeReviewListener?.()
  disposeReviewListener = null
  revokePdfUrl()
  revokePreviewScriptBlobs()
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeyDown)
})

function setViewMode(mode: 'preview' | 'source'): void {
  if (isCanvasLocked.value) return
  viewMode.value = mode
}

function runMoreAction(action: () => void): void {
  moreMenuOpen.value = false
  action()
}

async function copyPath(): Promise<void> {
  const target = resolvedPath.value
  if (!target) return
  try {
    await navigator.clipboard.writeText(target)
    toast.success(t('home.copied'))
  } catch {
    // ignore
  }
}

async function copyContent(): Promise<void> {
  if (data.value?.kind !== 'text' || data.value.text === undefined) return
  try {
    await navigator.clipboard.writeText(data.value.text)
    toast.success(t('home.copied'))
  } catch {
    // ignore
  }
}

async function openWithSystem(): Promise<void> {
  const target = resolvedPath.value
  if (!target) return
  try {
    if (transport) {
      const result = await transport.send(AgentWorkspaceEvents.openFileExternal, {
        path: target,
        conversationId: props.conversationId ?? null
      })
      if (result?.revealed && !result.opened) {
        toast.info(t('home.sidePanel.revealedExecutable'))
      }
      return
    }
    const appSdk = resolveAppSdk()
    if (appSdk) {
      await appSdk.showInFolder(target, { reveal: true })
    }
  } catch {
    toast.error(t('home.preview.openFailed'))
  }
}

async function revealInFolder(): Promise<void> {
  const target = resolvedPath.value || props.filePath
  if (!target) return
  try {
    const appSdk = resolveAppSdk()
    if (appSdk) {
      await appSdk.showInFolder(target, { reveal: true })
      return
    }
  } catch {
    toast.error(t('home.preview.openFailed'))
  }
}

function openInBuiltInBrowser(): void {
  const target = resolvedPath.value
  if (!target) return
  emit('open-in-browser', {
    path: target,
    displayPath: props.displayPath || target,
    line: props.line
  })
}

function openEntry(entryPath: string): void {
  emit('navigate', { path: entryPath, displayPath: entryPath })
}

function handleBreadcrumbClick(segment: { path: string; isLast: boolean }): void {
  if (segment.isLast) {
    void copyPath()
    return
  }
  if (props.preferTreeForBreadcrumbs) {
    emit('reveal-dir', segment.path)
    return
  }
  openEntry(segment.path)
}

function adjustZoom(delta: number): void {
  imageZoom.value = Math.max(0.25, Math.min(4, Math.round((imageZoom.value + delta) * 100) / 100))
}
</script>

<template>
  <div
    class="WorkspaceFileViewer"
    :class="{
      'is-canvas-locked': isCanvasLocked,
      'is-canvas-applied': canvasPhase === 'applied'
    }"
    :data-canvas-phase="canvasPhase"
    :data-canvas-locked="isCanvasLocked ? 'true' : 'false'"
    data-testid="workspace-file-viewer"
  >
    <!-- Contextual top bar: shown only when back nav, HTML/SVG device preview, or image zoom is active -->
    <header v-if="showTopBar" class="WorkspaceFileViewer-Header" data-testid="file-viewer-header">
      <div class="WorkspaceFileViewer-HeaderLead">
        <button
          v-if="canGoBack"
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :title="t('browser.back')"
          :aria-label="t('browser.back')"
          @click="emit('back')"
        >
          <span class="i-ri-arrow-left-line" aria-hidden="true" />
        </button>

        <div
          v-if="showDeviceViewportControls"
          class="WorkspaceFileViewer-ViewportBar"
          data-testid="file-viewer-viewport-controls"
        >
          <TxPopover
            v-model="viewportMenuOpen"
            trigger="click"
            placement="bottom-start"
            :offset="6"
            :match-reference-width="false"
            :min-width="268"
            :panel-radius="12"
            :panel-padding="8"
            :panel-card="SHELL_MENU_CARD"
            panel-background="refraction"
          >
            <template #reference>
              <button
                type="button"
                class="WorkspaceFileViewer-ViewportTrigger"
                :class="{ 'is-active': isDevicePresetActive || viewportMenuOpen }"
                :aria-expanded="viewportMenuOpen"
                :title="t('home.sidePanel.deviceViewport')"
                :aria-label="t('home.sidePanel.deviceViewport')"
                data-testid="file-viewer-viewport-trigger"
              >
                <span class="WorkspaceFileViewer-ViewportIcon" aria-hidden="true">
                  <span :class="getDeviceCategoryIcon(activeDevicePreset.category)" />
                </span>
                <span class="WorkspaceFileViewer-ViewportLabel">
                  {{
                    isDevicePresetActive
                      ? activeDevicePreset.shortName || activeDevicePreset.name
                      : t('home.sidePanel.deviceResponsive')
                  }}
                </span>
                <span v-if="isDevicePresetActive" class="WorkspaceFileViewer-ViewportDim">
                  {{ activeDeviceDimensions.width }}×{{ activeDeviceDimensions.height }}
                </span>
                <span class="WorkspaceFileViewer-ViewportChevron" aria-hidden="true">
                  <span class="i-ri-arrow-down-s-line" />
                </span>
              </button>
            </template>

            <div class="WorkspaceFileViewer-ViewportPopover">
              <label class="WorkspaceFileViewer-ViewportSearch">
                <span class="WorkspaceFileViewer-ViewportSearchIcon" aria-hidden="true">
                  <span class="i-ri-search-line" />
                </span>
                <input
                  v-model="viewportQuery"
                  type="search"
                  class="WorkspaceFileViewer-ViewportSearchInput"
                  :placeholder="t('home.sidePanel.deviceSearchPlaceholder')"
                  :aria-label="t('home.sidePanel.deviceSearchPlaceholder')"
                  data-testid="file-viewer-viewport-search"
                />
              </label>

              <div class="WorkspaceFileViewer-ViewportCats" role="group">
                <button
                  v-for="cat in viewportFilterCategories"
                  :key="cat.id"
                  type="button"
                  class="WorkspaceFileViewer-ViewportCatBtn"
                  :class="{ 'is-active': viewportCategory === cat.id }"
                  :aria-pressed="viewportCategory === cat.id"
                  :data-testid="`file-viewer-viewport-cat-${cat.id}`"
                  @click="viewportCategory = cat.id"
                >
                  {{ cat.label }}
                </button>
              </div>

              <div
                class="WorkspaceFileViewer-ViewportList"
                role="listbox"
                :aria-label="t('home.sidePanel.deviceViewport')"
              >
                <button
                  v-for="preset in filteredViewportPresets"
                  :key="preset.id"
                  type="button"
                  role="option"
                  class="WorkspaceFileViewer-ViewportOption"
                  :class="{ 'is-active': preset.id === viewportPresetId }"
                  :aria-selected="preset.id === viewportPresetId"
                  :data-testid="`file-viewer-viewport-option-${preset.id}`"
                  @click="selectViewportPreset(preset)"
                >
                  <span class="WorkspaceFileViewer-ViewportOptionLead">
                    <span class="WorkspaceFileViewer-ViewportOptionIcon" aria-hidden="true">
                      <span :class="getDeviceCategoryIcon(preset.category)" />
                    </span>
                    <span class="WorkspaceFileViewer-ViewportOptionName">
                      {{ formatViewportPresetLabel(preset) }}
                    </span>
                  </span>
                  <span class="WorkspaceFileViewer-ViewportOptionMeta">
                    <span v-if="preset.width > 0" class="WorkspaceFileViewer-ViewportOptionDim">
                      {{ preset.width }}×{{ preset.height }}
                    </span>
                    <span
                      v-if="preset.id === viewportPresetId"
                      class="WorkspaceFileViewer-ViewportOptionCheck"
                      aria-hidden="true"
                    >
                      <span class="i-ri-check-line" />
                    </span>
                  </span>
                </button>

                <div
                  v-if="filteredViewportPresets.length === 0"
                  class="WorkspaceFileViewer-ViewportEmpty"
                >
                  {{ t('home.sidePanel.deviceEmpty') }}
                </div>
              </div>
            </div>
          </TxPopover>

          <button
            v-if="canFlipOrientation"
            type="button"
            class="WorkspaceFileViewer-ToolBtn"
            :class="{ 'is-active': viewportOrientation === 'landscape' }"
            :aria-pressed="viewportOrientation === 'landscape'"
            :title="t('home.sidePanel.deviceRotate')"
            :aria-label="t('home.sidePanel.deviceRotate')"
            data-testid="file-viewer-viewport-rotate"
            @click="toggleViewportOrientation"
          >
            <span class="i-ri-clockwise-line" aria-hidden="true" />
          </button>

          <button
            v-if="isDevicePresetActive"
            type="button"
            class="WorkspaceFileViewer-ToolBtn"
            :class="{ 'is-active': showDeviceShell }"
            :aria-pressed="showDeviceShell"
            :title="t('home.sidePanel.deviceToggleShell')"
            :aria-label="t('home.sidePanel.deviceToggleShell')"
            data-testid="file-viewer-viewport-shell"
            @click="showDeviceShell = !showDeviceShell"
          >
            <span class="i-ri-device-line" aria-hidden="true" />
          </button>
        </div>

        <div v-else-if="data?.kind === 'image'" class="WorkspaceFileViewer-ZoomInline">
          <button
            type="button"
            class="WorkspaceFileViewer-ToolBtn"
            :aria-label="t('home.attachViewer.zoomOut')"
            @click="adjustZoom(-0.25)"
          >
            <span class="i-ri-zoom-out-line" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="WorkspaceFileViewer-ZoomLabel"
            :title="t('home.attachViewer.reset')"
            @click="imageZoom = 1"
          >
            {{ Math.round(imageZoom * 100) }}%
          </button>
          <button
            type="button"
            class="WorkspaceFileViewer-ToolBtn"
            :aria-label="t('home.attachViewer.zoomIn')"
            @click="adjustZoom(0.25)"
          >
            <span class="i-ri-zoom-in-line" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div v-if="showDeviceViewportControls" class="WorkspaceFileViewer-Toolbar">
        <TdsLintPopover
          v-model:open="lintPopoverOpen"
          v-model:anti-slop="lintAntiSlop"
          :issues="mergedLintIssues"
          :content-digest="lintContentDigest"
          :frame-id="resolvedPath"
          :display-path="displayPathForAi"
          :ai-actions-enabled="aiActionsEnabled"
          :sending="sendingAiAction"
          placement="bottom-end"
          @send-to-ai="handleLintSendToAi"
          @select-issue="handleLintSelectIssue"
        />
      </div>
    </header>

    <!-- StageHost separates TxBorderBeam (z: 1..3 over stage z: 0) from floating glass dock (z: 12) -->
    <div class="WorkspaceFileViewer-StageHost">
      <TxBorderBeam
        class="WorkspaceFileViewer-StageBeam"
        :class="{
          'is-locked': isCanvasLocked,
          'is-light': beamTheme === 'light'
        }"
        size="pulse-inner"
        :active="isCanvasLocked"
        :theme="beamTheme"
        color-variant="colorful"
        :border-radius="0"
        :saturation="beamTheme === 'light' ? 1.65 : 1.35"
        :brightness="beamTheme === 'light' ? 0.88 : 1.05"
        :strength="1"
        data-testid="file-viewer-canvas-beam"
      >
        <div
          class="WorkspaceFileViewer-Stage"
          :class="{
            'is-canvas-locked': isCanvasLocked,
            'has-canvas-dock': showCanvasDock
          }"
          :aria-busy="isCanvasLocked ? 'true' : undefined"
          data-testid="file-viewer-stage"
        >
          <div class="WorkspaceFileViewer-Body" @scroll.passive="onBodyScroll">
            <div v-if="loading" class="WorkspaceFileViewer-Loading" aria-hidden="true">
              <TxSkeleton :rows="8" animated />
            </div>

            <div v-else-if="error" class="WorkspaceFileViewer-State" role="alert">
              <span
                class="i-ri-error-warning-line WorkspaceFileViewer-StateIcon is-danger"
                aria-hidden="true"
              />
              <p class="WorkspaceFileViewer-StateTitle">{{ error }}</p>
              <p class="WorkspaceFileViewer-StatePath">{{ resolvedPath }}</p>
              <div class="WorkspaceFileViewer-StateActions">
                <TxButton size="sm" variant="secondary" @click="loadFile()">
                  {{ t('home.workspace.retry') }}
                </TxButton>
                <TxButton size="sm" variant="secondary" @click="revealInFolder">
                  {{ t('home.fileLink.revealParentFolder') }}
                </TxButton>
              </div>
            </div>

            <template v-else-if="data">
              <!-- Inline Canvas Diff View (toggled from Canvas Review Bar) -->
              <div
                v-if="canvasShowDiff && canvasApplied"
                class="WorkspaceFileViewer-CanvasDiff"
                role="region"
                :aria-label="t('home.sidePanel.canvasShowDiff')"
                data-testid="file-viewer-canvas-diff"
              >
                <div
                  v-for="(diffLine, idx) in canvasApplied.diff.lines"
                  :key="idx"
                  class="WorkspaceFileViewer-CanvasDiffLine"
                  :class="`is-${diffLine.type}`"
                >
                  <span class="WorkspaceFileViewer-CanvasDiffNo" aria-hidden="true">
                    {{ diffLine.newLine ?? diffLine.oldLine ?? '' }}
                  </span>
                  <span class="WorkspaceFileViewer-CanvasDiffSign" aria-hidden="true">
                    {{ diffLine.type === 'add' ? '+' : diffLine.type === 'del' ? '−' : ' ' }}
                  </span>
                  <span class="WorkspaceFileViewer-CanvasDiffText">{{ diffLine.text || ' ' }}</span>
                </div>
              </div>

              <!-- Inline Draft Conflict Diff View (disk vs unsaved local draft) -->
              <div
                v-else-if="showDraftConflictDiff && draftConflictDiff"
                class="WorkspaceFileViewer-CanvasDiff"
                role="region"
                :aria-label="t('home.sidePanel.editorConflictDiff')"
                data-testid="file-viewer-conflict-diff"
              >
                <div
                  v-for="(diffLine, idx) in draftConflictDiff.lines"
                  :key="idx"
                  class="WorkspaceFileViewer-CanvasDiffLine"
                  :class="`is-${diffLine.type}`"
                >
                  <span class="WorkspaceFileViewer-CanvasDiffNo" aria-hidden="true">
                    {{ diffLine.newLine ?? diffLine.oldLine ?? '' }}
                  </span>
                  <span class="WorkspaceFileViewer-CanvasDiffSign" aria-hidden="true">
                    {{ diffLine.type === 'add' ? '+' : diffLine.type === 'del' ? '−' : ' ' }}
                  </span>
                  <span class="WorkspaceFileViewer-CanvasDiffText">{{ diffLine.text || ' ' }}</span>
                </div>
              </div>

              <!-- Directory browser -->
              <div v-else-if="data.kind === 'directory'" class="WorkspaceFileViewer-Dir">
                <button
                  v-if="parentDirectoryPath"
                  type="button"
                  class="WorkspaceFileViewer-DirRow is-parent"
                  @click="openEntry(parentDirectoryPath)"
                >
                  <span class="i-ri-arrow-up-line WorkspaceFileViewer-DirIcon" aria-hidden="true" />
                  <span class="WorkspaceFileViewer-DirName">..</span>
                </button>
                <button
                  v-for="entry in data.entries ?? []"
                  :key="entry.path"
                  type="button"
                  class="WorkspaceFileViewer-DirRow"
                  @click="openEntry(entry.path)"
                >
                  <span
                    :class="resolveFileIconClass(entry.name, entry.isDirectory)"
                    class="WorkspaceFileViewer-DirIcon"
                    aria-hidden="true"
                  />
                  <span class="WorkspaceFileViewer-DirName">{{ entry.name }}</span>
                  <span
                    v-if="!entry.isDirectory && entry.size !== undefined"
                    class="WorkspaceFileViewer-DirSize"
                  >
                    {{ formatCompactFileSize(entry.size) }}
                  </span>
                </button>
              </div>

              <!-- Live HTML / SVG preview -->
              <div
                v-else-if="(isHtml || isSvg) && viewMode === 'preview'"
                class="WorkspaceFileViewer-FrameWrap"
                :class="{ 'is-device-preview': isDevicePresetActive }"
                data-testid="file-viewer-preview-stage"
              >
                <TdsDeviceFrame
                  v-if="isDevicePresetActive"
                  :preset="activeDevicePreset"
                  :orientation="viewportOrientation"
                  :show-shell="showDeviceShell"
                  data-testid="file-viewer-device-frame"
                >
                  <iframe
                    class="WorkspaceFileViewer-Frame"
                    :sandbox="isHtml ? 'allow-scripts allow-forms allow-modals' : ''"
                    :title="fileName"
                    :srcdoc="sandboxedHtmlSrcdoc"
                  />
                </TdsDeviceFrame>
                <iframe
                  v-else
                  class="WorkspaceFileViewer-Frame"
                  :sandbox="isHtml ? 'allow-scripts allow-forms allow-modals' : ''"
                  :title="fileName"
                  :srcdoc="sandboxedHtmlSrcdoc"
                />
              </div>

              <!-- Editable WYSIWYG Markdown (click anywhere to edit, / for slash blocks, auto-saves to disk) -->
              <div
                v-else-if="isMarkdown && viewMode === 'preview'"
                ref="markdownContainerRef"
                class="WorkspaceFileViewer-Markdown"
                :class="{
                  'is-dark': beamTheme === 'dark',
                  'is-canvas-locked': isCanvasLocked,
                  'is-canvas-sweeping': canvasSweepActive
                }"
                data-testid="file-viewer-markdown"
              >
                <TxMarkdownEditor
                  ref="markdownEditorRef"
                  :key="resolvedPath"
                  class="WorkspaceFileViewer-MarkdownEditor"
                  :model-value="data.text ?? ''"
                  mode="wysiwyg"
                  :theme="beamTheme"
                  :toolbar="false"
                  :status-bar="false"
                  :bubble="false"
                  :slash="true"
                  :readonly="markdownEditorReadonly"
                  :min-height="240"
                  :placeholder="t('home.sidePanel.editorPlaceholder')"
                  :aria-label="fileName"
                  :labels="markdownEditorLabels"
                  data-testid="file-viewer-markdown-editor"
                  @update:model-value="handleMarkdownEditorInput"
                  @blur="handleMarkdownEditorBlur"
                />
                <!-- Underlayer: frozen OLD markdown snapshot staying calmly in place underneath while NEW covers it -->
                <div
                  v-show="canvasSweepActive"
                  ref="oldSnapshotHostRef"
                  class="WorkspaceFileViewer-CanvasOldLayer tx-markdown-editor"
                  :class="{ 'tx-markdown-editor--dark': beamTheme === 'dark' }"
                  aria-hidden="true"
                  inert
                  data-testid="file-viewer-canvas-old-layer"
                />
                <!-- Paper-matched gradient mist riding seamlessly along the active old->new frontier -->
                <div
                  v-if="canvasSweepActive"
                  :key="canvasSweepKey"
                  class="WorkspaceFileViewer-CanvasReplaceVeilHost"
                  aria-hidden="true"
                  data-testid="file-viewer-canvas-sweep"
                >
                  <div class="WorkspaceFileViewer-CanvasReplaceVeil" />
                </div>
              </div>

              <!-- Zoomable Image -->
              <div v-else-if="data.kind === 'image'" class="WorkspaceFileViewer-ImageWrap">
                <div class="WorkspaceFileViewer-ImageStage">
                  <img
                    :src="imageDataUrl"
                    :alt="fileName"
                    class="WorkspaceFileViewer-Image"
                    :style="{ transform: `scale(${imageZoom})` }"
                  />
                </div>
              </div>

              <!-- PDF viewer -->
              <div
                v-else-if="data.kind === 'pdf' && pdfBlobUrl"
                class="WorkspaceFileViewer-FrameWrap"
              >
                <iframe class="WorkspaceFileViewer-Frame" :src="pdfBlobUrl" :title="fileName" />
              </div>

              <!-- Binary fallback -->
              <div v-else-if="data.kind === 'binary'" class="WorkspaceFileViewer-State">
                <span class="i-ri-file-zip-line WorkspaceFileViewer-StateIcon" aria-hidden="true" />
                <p class="WorkspaceFileViewer-StateTitle">
                  {{ t('home.sidePanel.binaryUnsupported') }}
                </p>
                <p class="WorkspaceFileViewer-StatePath">
                  {{ data.mimeType }} · {{ formatCompactFileSize(data.size) }}
                </p>
                <div class="WorkspaceFileViewer-StateActions">
                  <TxButton size="sm" variant="secondary" @click="openWithSystem">
                    {{ t('home.fileLink.openWithSystem') }}
                  </TxButton>
                  <TxButton size="sm" variant="secondary" @click="revealInFolder">
                    {{ t('home.fileLink.revealInFinder') }}
                  </TxButton>
                </div>
              </div>

              <!-- Source / Code viewer with line numbers -->
              <div
                v-else
                ref="codeContainerRef"
                class="WorkspaceFileViewer-Code"
                :class="{ 'is-wrap': wrapLines }"
              >
                <div v-if="data.truncated" class="WorkspaceFileViewer-Truncated">
                  {{
                    t('home.sidePanel.fileTruncated', { size: formatCompactFileSize(data.size) })
                  }}
                </div>
                <div class="WorkspaceFileViewer-CodeLines" role="region" :aria-label="fileName">
                  <div
                    v-for="(lineText, idx) in codeLines"
                    :key="idx"
                    :data-line="idx + 1"
                    class="WorkspaceFileViewer-CodeLine"
                    :class="{
                      'is-highlighted': line === idx + 1,
                      'is-canvas-changed':
                        canvasPhase === 'applied' &&
                        Boolean(canvasApplied?.diff.changedNewLines.has(idx + 1)),
                      'is-canvas-entering':
                        canvasSweepActive &&
                        Boolean(canvasApplied?.diff.changedNewLines.has(idx + 1))
                    }"
                  >
                    <span class="WorkspaceFileViewer-LineNo" aria-hidden="true">{{ idx + 1 }}</span>
                    <span class="WorkspaceFileViewer-LineText">{{ lineText || ' ' }}</span>
                  </div>
                </div>
                <div
                  v-if="canvasSweepActive"
                  :key="canvasSweepKey"
                  class="WorkspaceFileViewer-CanvasWipe"
                  :class="`is-${beamTheme}`"
                  aria-hidden="true"
                  data-testid="file-viewer-canvas-sweep"
                >
                  <div class="WorkspaceFileViewer-CanvasWipeCurtain">
                    <div class="WorkspaceFileViewer-CanvasWipeVeil" />
                    <div class="WorkspaceFileViewer-CanvasWipeEdge" />
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Rising colorful dot + ASCII synthesis ripple field while AI is modifying -->
          <WorkspaceCanvasRippleOverlay :active="isCanvasLocked" :theme="beamTheme" />
        </div>
      </TxBorderBeam>

      <!-- Bottom-floating liquid glass status / suggestion composer / approval capsule -->
      <Transition name="canvas-dock">
        <div
          v-if="showCanvasDock"
          ref="canvasDockWrapRef"
          class="WorkspaceFileViewer-CanvasDockWrap"
          :class="{ 'is-compose': Boolean(canvasCompose) }"
          :role="canvasCompose ? 'dialog' : 'status'"
          :aria-live="canvasCompose ? undefined : 'polite'"
          :aria-label="canvasCompose ? t('home.sidePanel.canvasComposeSelectionScope') : undefined"
          data-testid="file-viewer-canvas-dock"
        >
          <TxTouchSurface
            class="WorkspaceFileViewer-CanvasDockSurface"
            :class="{
              'is-dark-surface': beamTheme === 'dark',
              'is-compose': Boolean(canvasCompose),
              'is-busy': isCanvasLocked,
              'is-applied': !isCanvasLocked && !canvasCompose && canvasPhase === 'applied'
            }"
            surface="glass"
            engine="lens"
            :width="canvasCompose ? '100%' : 'auto'"
            :height="canvasCompose ? 'auto' : 44"
            :border-radius="canvasCompose ? 20 : 22"
            :frost="15"
            :bezel="10"
            :thickness="18"
            :background-opacity="beamTheme === 'dark' ? 0.76 : 0.84"
            :rim-light="0.9"
            :lean="canvasCompose ? 0.012 : 0.028"
            :max-lean="canvasCompose ? 2 : 3"
            :hover-lift="canvasCompose ? 0.1 : 0.18"
            :press-grow="canvasCompose ? 0.005 : 0.012"
            :stretch="0.000025"
            :max-stretch="0.025"
            data-testid="file-viewer-canvas-glass"
          >
            <div
              v-if="canvasCompose"
              class="WorkspaceFileViewer-ComposeDock"
              data-testid="file-viewer-canvas-compose"
            >
              <div class="WorkspaceFileViewer-ComposeTop">
                <div class="WorkspaceFileViewer-ComposeScope">
                  <span
                    class="i-ri-sparkling-2-line WorkspaceFileViewer-DockSparkle"
                    aria-hidden="true"
                  />
                  <span>
                    {{
                      canvasCompose.scope === 'document'
                        ? t('home.sidePanel.canvasComposeDocumentScope')
                        : t('home.sidePanel.canvasComposeSelectionScope')
                    }}
                  </span>
                </div>
                <div class="WorkspaceFileViewer-ComposePresets">
                  <button
                    v-for="preset in canvasComposePresets"
                    :key="preset.id"
                    type="button"
                    class="WorkspaceFileViewer-ComposeChip"
                    :data-testid="`file-viewer-canvas-preset-${preset.id}`"
                    @click="submitCanvasCompose(preset.suggestion, preset.label)"
                  >
                    {{ preset.label }}
                  </button>
                </div>
                <button
                  type="button"
                  class="WorkspaceFileViewer-DockIconBtn"
                  :title="t('common.cancel')"
                  :aria-label="t('common.cancel')"
                  data-testid="file-viewer-canvas-compose-close"
                  @click="closeCanvasCompose"
                >
                  <span class="i-ri-close-line" aria-hidden="true" />
                </button>
              </div>

              <form class="WorkspaceFileViewer-ComposeForm" @submit.prevent="submitCanvasCompose()">
                <input
                  ref="canvasComposeInputRef"
                  v-model="canvasComposePrompt"
                  type="text"
                  class="WorkspaceFileViewer-ComposeInput"
                  :placeholder="t('home.sidePanel.canvasComposePlaceholder')"
                  :aria-label="t('home.sidePanel.canvasComposePlaceholder')"
                  data-testid="file-viewer-canvas-compose-input"
                  @keydown="onCanvasComposeKeydown"
                />
                <button
                  type="button"
                  class="WorkspaceFileViewer-ComposeSendBtn"
                  :title="t('home.sidePanel.canvasComposeSend')"
                  :aria-label="t('home.sidePanel.canvasComposeSend')"
                  data-testid="file-viewer-canvas-compose-send"
                  @click="submitCanvasCompose()"
                >
                  <span class="i-ri-arrow-up-line" aria-hidden="true" />
                </button>
              </form>
            </div>

            <div v-else class="WorkspaceFileViewer-CanvasDockInner">
              <template v-if="isCanvasLocked">
                <TxSpinner
                  class="WorkspaceFileViewer-DockSpinner"
                  :size="15"
                  :stroke-width="2"
                  :label="canvasStatusText"
                  data-testid="file-viewer-canvas-spinner"
                />
                <span class="WorkspaceFileViewer-DockStatusText">
                  {{ canvasStatusText }}
                </span>
                <template v-if="canvasPending">
                  <span class="WorkspaceFileViewer-DockDivider" aria-hidden="true" />
                  <button
                    type="button"
                    class="WorkspaceFileViewer-DockBtn"
                    data-testid="file-viewer-canvas-cancel"
                    @click="cancelCanvasPending"
                  >
                    {{ t('common.cancel') }}
                  </button>
                </template>
              </template>

              <template v-else-if="canvasApplied">
                <div class="WorkspaceFileViewer-DockSummary">
                  <span
                    class="i-ri-sparkling-2-line WorkspaceFileViewer-DockSparkle"
                    aria-hidden="true"
                  />
                  <span
                    v-if="canvasApplied.diff.additions > 0 || canvasApplied.diff.deletions > 0"
                    class="WorkspaceFileViewer-DockDelta"
                    data-testid="file-viewer-canvas-delta"
                  >
                    <span v-if="canvasApplied.diff.additions > 0" class="is-add">
                      +{{ canvasApplied.diff.additions }}
                    </span>
                    <span v-if="canvasApplied.diff.deletions > 0" class="is-del">
                      −{{ canvasApplied.diff.deletions }}
                    </span>
                  </span>
                  <span v-else class="WorkspaceFileViewer-DockStatusText">
                    {{ canvasAppliedTitle }}
                  </span>
                </div>

                <span class="WorkspaceFileViewer-DockDivider" aria-hidden="true" />

                <div class="WorkspaceFileViewer-DockActions">
                  <button
                    type="button"
                    class="WorkspaceFileViewer-DockBtn"
                    :class="{ 'is-active': canvasShowDiff }"
                    :aria-pressed="canvasShowDiff"
                    data-testid="file-viewer-canvas-diff-toggle"
                    @click="canvasShowDiff = !canvasShowDiff"
                  >
                    <span class="i-ri-git-commit-line" aria-hidden="true" />
                    <span>
                      {{
                        canvasShowDiff
                          ? t('home.sidePanel.canvasHideDiff')
                          : t('home.sidePanel.canvasShowDiff')
                      }}
                    </span>
                  </button>

                  <button
                    type="button"
                    class="WorkspaceFileViewer-DockBtn"
                    :disabled="canvasUndoing"
                    data-testid="file-viewer-canvas-undo"
                    @click="undoCanvasEdit"
                  >
                    <span class="i-ri-arrow-go-back-line" aria-hidden="true" />
                    <span>{{ t('home.sidePanel.canvasUndo') }}</span>
                  </button>

                  <button
                    v-if="canvasApplied.source === 'improve' && canvasApplied.selectedText"
                    type="button"
                    class="WorkspaceFileViewer-DockIconBtn"
                    :disabled="canvasUndoing"
                    :title="t('home.sidePanel.canvasRetry')"
                    :aria-label="t('home.sidePanel.canvasRetry')"
                    data-testid="file-viewer-canvas-retry"
                    @click="retryCanvasEdit"
                  >
                    <span class="i-ri-refresh-line" aria-hidden="true" />
                  </button>

                  <button
                    v-if="canvasConflictRefreshAvailable"
                    type="button"
                    class="WorkspaceFileViewer-DockBtn"
                    :disabled="canvasUndoing"
                    data-testid="file-viewer-canvas-conflict-refresh"
                    @click="refreshAfterCanvasConflict"
                  >
                    <span class="i-ri-refresh-line" aria-hidden="true" />
                    <span>{{ t('home.sidePanel.canvasRefresh') }}</span>
                  </button>

                  <button
                    type="button"
                    class="WorkspaceFileViewer-DockBtn is-primary"
                    :disabled="canvasUndoing"
                    data-testid="file-viewer-canvas-keep"
                    @click="keepCanvasEdit"
                  >
                    <span class="i-ri-check-line" aria-hidden="true" />
                    <span>{{ t('home.sidePanel.canvasAccept') }}</span>
                  </button>
                </div>
              </template>
            </div>
          </TxTouchSurface>
        </div>
      </Transition>
    </div>

    <!-- Disk Conflict Resolution Banner (explicit compare, reload, or overwrite) -->
    <section
      v-if="editorSaveConflict && !isCanvasLocked"
      class="WorkspaceFileViewer-ConflictBanner"
      role="alert"
      data-testid="file-viewer-conflict-banner"
    >
      <div class="WorkspaceFileViewer-ConflictLead">
        <span class="i-ri-error-warning-line WorkspaceFileViewer-ConflictIcon" aria-hidden="true" />
        <span class="WorkspaceFileViewer-ConflictText">
          {{ t('home.sidePanel.editorSaveConflict') }}
        </span>
      </div>
      <div class="WorkspaceFileViewer-ConflictActions">
        <button
          v-if="draftConflictDiskSnapshot"
          type="button"
          class="WorkspaceFileViewer-ConflictBtn"
          :class="{ 'is-active': showDraftConflictDiff }"
          :aria-pressed="showDraftConflictDiff"
          data-testid="file-viewer-conflict-diff-toggle"
          @click="showDraftConflictDiff = !showDraftConflictDiff"
        >
          {{ t('home.sidePanel.editorConflictDiff') }}
        </button>
        <button
          type="button"
          class="WorkspaceFileViewer-ConflictBtn"
          data-testid="file-viewer-conflict-reload"
          @click="reloadFromConflictingDisk"
        >
          {{ t('home.sidePanel.editorConflictReload') }}
        </button>
        <button
          type="button"
          class="WorkspaceFileViewer-ConflictBtn is-danger"
          data-testid="file-viewer-conflict-overwrite"
          @click="overwriteDiskWithLocalDraft"
        >
          {{ t('home.sidePanel.editorConflictOverwrite') }}
        </button>
      </div>
    </section>

    <!-- Inline Markdown Review Comment Composer (shown only when adding a comment) -->
    <section
      v-if="commentComposerOpen && !isCanvasLocked"
      class="WorkspaceFileViewer-CommentComposer"
      :aria-label="t('home.sidePanel.selectionComment')"
      data-testid="file-viewer-comment-composer"
    >
      <div class="WorkspaceFileViewer-CommentQuoteRow">
        <blockquote class="WorkspaceFileViewer-CommentQuote">{{ commentDraftQuote }}</blockquote>
        <button
          type="button"
          class="WorkspaceFileViewer-CommentClose"
          :aria-label="t('common.close')"
          @click="commentComposerOpen = false"
        >
          <span class="i-ri-close-line" aria-hidden="true" />
        </button>
      </div>
      <textarea
        ref="commentInputRef"
        v-model="commentDraftText"
        rows="2"
        class="WorkspaceFileViewer-CommentInput"
        :placeholder="t('home.sidePanel.commentInputPlaceholder')"
        data-testid="file-viewer-comment-input"
        @keydown="onCommentKeydown"
      />
      <div class="WorkspaceFileViewer-CommentComposerFooter">
        <span class="WorkspaceFileViewer-CommentHint">
          {{ t('home.sidePanel.commentSubmitShortcut') }}
        </span>
        <div class="WorkspaceFileViewer-CommentComposerBtns">
          <button
            type="button"
            class="WorkspaceFileViewer-CommentBtn"
            :disabled="!commentDraftText.trim()"
            data-testid="file-viewer-comment-save"
            @click="saveDraftComment"
          >
            {{ t('home.sidePanel.commentAddToQueue') }}
          </button>
          <button
            type="button"
            class="WorkspaceFileViewer-CommentBtn is-primary"
            :disabled="sendingAiAction || !commentDraftText.trim()"
            data-testid="file-viewer-comment-send-now"
            @click="sendDraftCommentNow"
          >
            {{ t('home.sidePanel.commentSendNow') }}
          </button>
        </div>
      </div>
    </section>

    <!-- Pending Markdown Review Comments Dock (shown only when comments exist) -->
    <section
      v-if="comments.length > 0"
      class="WorkspaceFileViewer-CommentsDock"
      :aria-label="t('home.sidePanel.commentsListLabel')"
      data-testid="file-viewer-comments-dock"
    >
      <div class="WorkspaceFileViewer-CommentsBar">
        <button
          type="button"
          class="WorkspaceFileViewer-CommentsToggle"
          :aria-expanded="commentsExpanded"
          data-testid="file-viewer-comments-toggle"
          @click="commentsExpanded = !commentsExpanded"
        >
          <span class="i-ri-chat-quote-line" aria-hidden="true" />
          <span>{{ t('home.sidePanel.commentsCount', { count: comments.length }) }}</span>
          <span
            :class="commentsExpanded ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-up-s-line'"
            aria-hidden="true"
          />
        </button>

        <div class="WorkspaceFileViewer-CommentsBarActions">
          <button
            type="button"
            class="WorkspaceFileViewer-CommentBtn is-primary"
            :disabled="sendingAiAction"
            data-testid="file-viewer-comments-send-all"
            @click="sendAllCommentsToAi"
          >
            <span class="i-ri-send-plane-2-line" aria-hidden="true" />
            <span>{{ t('home.sidePanel.sendCommentsToAi') }}</span>
          </button>
          <button
            type="button"
            class="WorkspaceFileViewer-CommentClose"
            :title="t('common.clear')"
            :aria-label="t('common.clear')"
            @click="clearAllComments"
          >
            <span class="i-ri-delete-bin-6-line" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div v-if="commentsExpanded" class="WorkspaceFileViewer-CommentsList">
        <article
          v-for="item in comments"
          :key="item.id"
          class="WorkspaceFileViewer-CommentItem"
          data-testid="file-viewer-comment-item"
        >
          <blockquote class="WorkspaceFileViewer-CommentItemQuote">{{ item.quote }}</blockquote>
          <p class="WorkspaceFileViewer-CommentItemText">{{ item.comment }}</p>
          <div class="WorkspaceFileViewer-CommentItemActions">
            <button
              type="button"
              class="WorkspaceFileViewer-CommentTinyBtn"
              :disabled="sendingAiAction"
              data-testid="file-viewer-comment-send-single"
              @click="sendSingleComment(item)"
            >
              {{ t('home.sidePanel.commentSendNow') }}
            </button>
            <button
              type="button"
              class="WorkspaceFileViewer-CommentTinyBtn is-danger"
              @click="removeComment(item.id)"
            >
              {{ t('common.delete') }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <!-- Bottom StatusBar: interactive breadcrumb path on left; type / size / lines on right -->
    <footer
      class="WorkspaceFileViewer-StatusBar"
      role="contentinfo"
      data-testid="file-viewer-statusbar"
    >
      <div class="WorkspaceFileViewer-StatusLeft">
        <nav
          v-if="breadcrumbs.length > 0"
          class="WorkspaceFileViewer-Breadcrumbs"
          :aria-label="t('home.sidePanel.filePathBreadcrumbs')"
          data-testid="file-viewer-breadcrumbs"
        >
          <template v-for="(seg, idx) in breadcrumbs" :key="`${seg.path}:${idx}`">
            <span
              v-if="idx > 0"
              class="i-ri-arrow-right-s-line WorkspaceFileViewer-CrumbSep"
              aria-hidden="true"
            />
            <button
              type="button"
              class="WorkspaceFileViewer-CrumbBtn"
              :class="{ 'is-last': seg.isLast }"
              :title="
                seg.isLast ? `${t('home.fileLink.clickToCopyPath')}: ${resolvedPath}` : seg.path
              "
              @click="handleBreadcrumbClick(seg)"
            >
              <span
                v-if="seg.isLast"
                :class="fileIcon"
                class="WorkspaceFileViewer-CrumbIcon"
                aria-hidden="true"
              />
              <span class="WorkspaceFileViewer-CrumbLabel">{{ seg.label }}</span>
            </button>
          </template>
        </nav>

        <button
          v-if="resolvedPath"
          type="button"
          class="WorkspaceFileViewer-StatusCopy"
          :title="`${t('home.fileLink.clickToCopyPath')}: ${resolvedPath}`"
          :aria-label="t('home.sidePanel.copyFullPath')"
          data-testid="file-viewer-copy-path"
          @click="copyPath"
        >
          <span class="i-ri-file-copy-line" aria-hidden="true" />
        </button>
      </div>

      <div class="WorkspaceFileViewer-StatusRight">
        <div class="WorkspaceFileViewer-StatusMeta" data-testid="file-viewer-status-meta">
          <button
            v-if="editorSaveState === 'error'"
            type="button"
            class="WorkspaceFileViewer-SaveBadge is-error"
            :title="t('home.sidePanel.editorSaveRetry')"
            data-testid="file-viewer-save-status"
            @click="saveMarkdownEdits({ force: true })"
          >
            {{ t('home.sidePanel.editorSaveFailed') }}
          </button>
          <span
            v-else-if="editorSaveState !== 'idle'"
            class="WorkspaceFileViewer-SaveBadge"
            :class="`is-${editorSaveState}`"
            data-testid="file-viewer-save-status"
          >
            <span
              v-if="editorSaveState === 'dirty'"
              class="WorkspaceFileViewer-SaveDot"
              aria-hidden="true"
            />
            <span>
              {{
                editorSaveState === 'saving'
                  ? t('home.sidePanel.editorSaving')
                  : editorSaveState === 'saved'
                    ? t('home.sidePanel.editorSaved')
                    : t('home.sidePanel.editorUnsaved')
              }}
            </span>
          </span>
          <span v-if="fileExt" class="WorkspaceFileViewer-StatusExt">{{
            fileExt.toUpperCase()
          }}</span>
          <span
            v-if="data && data.kind !== 'directory'"
            class="WorkspaceFileViewer-StatusItem"
            data-testid="file-viewer-status-size"
          >
            {{ formatCompactFileSize(data.size) }}
          </span>
          <span v-if="data?.kind === 'text'" class="WorkspaceFileViewer-StatusItem">
            {{ t('home.sidePanel.lineCount', { count: codeLines.length }) }}
          </span>
          <span v-else-if="data?.kind === 'directory'" class="WorkspaceFileViewer-StatusItem">
            {{ t('home.sidePanel.entryCount', { count: data.entries?.length ?? 0 }) }}
          </span>
        </div>

        <span class="WorkspaceFileViewer-StatusSep" aria-hidden="true" />

        <div class="WorkspaceFileViewer-StatusActions" data-testid="file-viewer-status-actions">
          <TxPopover
            v-if="markdownHeadings.length > 0"
            v-model="outlineOpen"
            trigger="click"
            placement="top-end"
            :offset="6"
            :match-reference-width="false"
            :min-width="220"
            :panel-radius="12"
            :panel-padding="6"
            :panel-card="SHELL_MENU_CARD"
            panel-background="refraction"
          >
            <template #reference>
              <button
                type="button"
                class="WorkspaceFileViewer-StatusToolBtn"
                :class="{ 'is-active': outlineOpen }"
                :aria-expanded="outlineOpen"
                :title="t('home.sidePanel.outline')"
                :aria-label="t('home.sidePanel.outline')"
                data-testid="file-viewer-outline-btn"
              >
                <span class="i-ri-list-unordered" aria-hidden="true" />
              </button>
            </template>

            <nav class="WorkspaceFileViewer-Outline" :aria-label="t('home.sidePanel.outline')">
              <div class="WorkspaceFileViewer-OutlineTitle">{{ t('home.sidePanel.outline') }}</div>
              <button
                v-for="heading in markdownHeadings"
                :key="heading.id"
                type="button"
                class="WorkspaceFileViewer-OutlineItem"
                :style="{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }"
                @click="scrollToMarkdownHeading(heading.index)"
              >
                {{ heading.text }}
              </button>
            </nav>
          </TxPopover>

          <button
            type="button"
            class="WorkspaceFileViewer-StatusToolBtn"
            :disabled="isCanvasLocked"
            :title="t('home.sidePanel.reload')"
            :aria-label="t('home.sidePanel.reload')"
            data-testid="file-viewer-refresh"
            @click="loadFile()"
          >
            <span class="i-ri-refresh-line" aria-hidden="true" />
          </button>

          <TxDropdownMenu
            v-model="moreMenuOpen"
            placement="top-end"
            :min-width="200"
            :panel-card="SHELL_MENU_CARD"
            panel-background="refraction"
          >
            <template #trigger>
              <button
                type="button"
                class="WorkspaceFileViewer-StatusToolBtn"
                :class="{ 'is-active': moreMenuOpen }"
                aria-haspopup="menu"
                :aria-expanded="moreMenuOpen"
                :title="t('home.moreActions')"
                :aria-label="t('home.moreActions')"
                data-testid="file-viewer-more"
              >
                <span class="i-ri-more-2-line" aria-hidden="true" />
              </button>
            </template>

            <template v-if="supportsPreviewToggle">
              <TxDropdownItem
                v-if="aiActionsEnabled && isMarkdown && viewMode === 'preview'"
                :disabled="isCanvasLocked || isTruncatedText"
                data-testid="file-viewer-improve-full"
                @select="runMoreAction(() => void openCanvasCompose({ scope: 'document' }))"
              >
                <span class="WorkspaceFileViewer-MenuItem">
                  <span class="i-ri-sparkling-line" aria-hidden="true" />
                  <span>{{ t('home.sidePanel.canvasImproveFullDoc') }}</span>
                </span>
              </TxDropdownItem>

              <TxDropdownItem
                check-type="radio"
                :checked="viewMode === 'preview'"
                :disabled="isCanvasLocked"
                data-testid="file-viewer-mode-preview"
                @select="runMoreAction(() => setViewMode('preview'))"
              >
                <span class="WorkspaceFileViewer-MenuItem">
                  <span class="i-ri-eye-line" aria-hidden="true" />
                  <span>{{ isJson ? t('home.sidePanel.formatted') : t('home.code.preview') }}</span>
                </span>
              </TxDropdownItem>

              <TxDropdownItem
                check-type="radio"
                :checked="viewMode === 'source'"
                :disabled="isCanvasLocked"
                data-testid="file-viewer-mode-source"
                @select="runMoreAction(() => setViewMode('source'))"
              >
                <span class="WorkspaceFileViewer-MenuItem">
                  <span class="i-ri-code-s-slash-line" aria-hidden="true" />
                  <span>{{ isJson ? t('home.sidePanel.raw') : t('home.code.source') }}</span>
                </span>
              </TxDropdownItem>

              <div class="WorkspaceFileViewer-MenuDivider" role="separator" />
            </template>

            <TxDropdownItem @select="runMoreAction(() => void copyPath())">
              <span class="WorkspaceFileViewer-MenuItem">
                <span class="i-ri-links-line" aria-hidden="true" />
                <span>{{ t('home.sidePanel.copyFullPath') }}</span>
              </span>
            </TxDropdownItem>

            <TxDropdownItem
              v-if="data?.kind === 'text'"
              @select="runMoreAction(() => void copyContent())"
            >
              <span class="WorkspaceFileViewer-MenuItem">
                <span class="i-ri-clipboard-line" aria-hidden="true" />
                <span>{{ t('home.sidePanel.copyContent') }}</span>
              </span>
            </TxDropdownItem>

            <TxDropdownItem
              v-if="data?.kind === 'text' && (!supportsPreviewToggle || viewMode === 'source')"
              @select="runMoreAction(() => (wrapLines = !wrapLines))"
            >
              <span class="WorkspaceFileViewer-MenuItem">
                <span class="i-ri-text-wrap" aria-hidden="true" />
                <span>{{ t('home.sidePanel.toggleWrap') }}</span>
              </span>
              <template v-if="wrapLines" #right>
                <span class="i-ri-check-line WorkspaceFileViewer-MenuCheck" aria-hidden="true" />
              </template>
            </TxDropdownItem>

            <div class="WorkspaceFileViewer-MenuDivider" role="separator" />

            <TxDropdownItem v-if="showOpenInBrowser" @select="runMoreAction(openInBuiltInBrowser)">
              <span class="WorkspaceFileViewer-MenuItem">
                <span class="i-ri-window-line" aria-hidden="true" />
                <span>{{ t('home.fileLink.openInBuiltInBrowser') }}</span>
              </span>
            </TxDropdownItem>

            <TxDropdownItem @select="runMoreAction(() => void openWithSystem())">
              <span class="WorkspaceFileViewer-MenuItem">
                <span class="i-ri-external-link-line" aria-hidden="true" />
                <span>{{ t('home.fileLink.openWithSystem') }}</span>
              </span>
            </TxDropdownItem>

            <TxDropdownItem @select="runMoreAction(() => void revealInFolder())">
              <span class="WorkspaceFileViewer-MenuItem">
                <span class="i-ri-folder-open-line" aria-hidden="true" />
                <span>{{ t('home.fileLink.revealInFinder') }}</span>
              </span>
            </TxDropdownItem>
          </TxDropdownMenu>
        </div>
      </div>
    </footer>

    <!-- Floating Markdown Selection AI Actions Pill -->
    <TxSelectionActions
      v-if="activeSelectionPayload"
      ref="selectionBarRef"
      v-model:prompt="selectionPrompt"
      :selection="activeSelectionPayload"
      :actions="mdSelectionActions"
      :placeholder="t('home.sidePanel.selectionPromptPlaceholder')"
      :aria-label="t('home.selectionActions')"
      :send-label="t('home.sidePanel.selectionSend')"
      @action="handleMdSelectionAction"
      @submit="handleMdSelectionSubmit"
    >
      <template #action-icon="{ action }">
        <span
          v-if="action.id === 'comment'"
          class="i-ri-chat-new-line WorkspaceFileViewer-SelIcon"
          aria-hidden="true"
        />
        <span
          v-else-if="action.id === 'explain'"
          class="i-ri-question-line WorkspaceFileViewer-SelIcon"
          aria-hidden="true"
        />
        <span
          v-else-if="action.id === 'improve'"
          class="i-ri-sparkling-line WorkspaceFileViewer-SelIcon"
          aria-hidden="true"
        />
        <span
          v-else-if="action.id === 'quote'"
          class="i-ri-double-quotes-l WorkspaceFileViewer-SelIcon"
          aria-hidden="true"
        />
        <span
          v-else-if="action.id === 'translate'"
          class="i-ri-translate-2 WorkspaceFileViewer-SelIcon"
          aria-hidden="true"
        />
        <span
          v-else-if="action.id === 'copy'"
          class="i-ri-file-copy-line WorkspaceFileViewer-SelIcon"
          aria-hidden="true"
        />
      </template>
    </TxSelectionActions>
    <!-- Kinetic Launch Flight Pill + Shockwave Ring (teleported to body) -->
    <WorkspaceCanvasLaunchFlight :flight="launchFlight" @complete="handleLaunchFlightComplete" />
  </div>
</template>

<style lang="scss" scoped>
.WorkspaceFileViewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-bg);
  color: var(--shell-text-primary);
}

.WorkspaceFileViewer-Header {
  position: relative;
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
  box-sizing: border-box;
}

/* ── Stage Perimeter BorderBeam + Floating Liquid Glass Approval Capsule ── */
.WorkspaceFileViewer-StageHost {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.WorkspaceFileViewer-StageBeam {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;

  // Boost light-theme pulse-inner contrast so the perimeter beam reads crisply on bright white paper.
  &.is-light {
    --beam-stroke-opacity: 2.8;
    --beam-inner-opacity: 1.9;
    --beam-bloom-opacity: 1.8;
  }

  &.is-locked {
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--shell-primary) 34%, transparent);
  }
}

.WorkspaceFileViewer-Stage {
  position: relative;
  z-index: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 0;

  &.is-canvas-locked {
    .WorkspaceFileViewer-Markdown,
    .WorkspaceFileViewer-Code,
    .WorkspaceFileViewer-FrameWrap {
      user-select: none;
      pointer-events: none;
    }

    .WorkspaceFileViewer-Markdown,
    .WorkspaceFileViewer-Code {
      opacity: 0.86;
    }
  }

  &.has-canvas-dock {
    .WorkspaceFileViewer-Markdown {
      padding-bottom: 112px;
    }

    .WorkspaceFileViewer-CodeLines,
    .WorkspaceFileViewer-CanvasDiff {
      padding-bottom: 92px;
    }
  }
}

.WorkspaceFileViewer-CanvasDockWrap {
  position: absolute;
  right: 16px;
  bottom: 16px;
  left: 16px;
  z-index: 12;
  display: flex;
  justify-content: center;
  pointer-events: none;

  &.is-compose {
    right: 18px;
    left: 18px;
  }
}

.WorkspaceFileViewer-CanvasDockSurface {
  --tx-surface-refraction-mask-rgb: 255 255 255;

  pointer-events: auto;
  max-width: 100%;

  &.is-compose {
    width: min(468px, 100%);
  }

  &.is-dark-surface {
    --tx-surface-refraction-mask-rgb: 24 27 34;
  }
}

.WorkspaceFileViewer-ComposeDock {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 10px 10px 10px 14px;
  box-sizing: border-box;
  color: var(--shell-text-primary);
}

.WorkspaceFileViewer-ComposeTop {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-ComposeScope {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: center;
  color: var(--shell-text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.WorkspaceFileViewer-ComposePresets {
  display: flex;
  flex: 1 1 auto;
  gap: 4px;
  align-items: center;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.WorkspaceFileViewer-ComposeChip {
  flex: none;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--shell-text-primary) 7%, transparent);
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--shell-primary) 16%, transparent);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileViewer-ComposeForm {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.WorkspaceFileViewer-ComposeInput {
  flex: 1 1 auto;
  min-width: 0;
  height: 32px;
  padding: 0 4px 0 0;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }

  &:focus,
  &:focus-visible {
    outline: none;
  }
}

.WorkspaceFileViewer-ComposeSendBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  font-size: 15px;
  cursor: pointer;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--shell-primary) 36%, transparent);

  &:hover {
    filter: brightness(1.08);
  }

  @media (prefers-reduced-motion: no-preference) {
    transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);

    &:active {
      transform: scale(0.9) translateY(-1px);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }
}

.WorkspaceFileViewer-CanvasDockInner {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  height: 100%;
  padding: 0 7px 0 14px;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-caption);
  white-space: nowrap;
  box-sizing: border-box;

  .WorkspaceFileViewer-CanvasDockSurface.is-busy & {
    padding: 0 14px;
  }
}

.WorkspaceFileViewer-DockSpinner {
  flex: none;
  color: var(--shell-primary);
}

.WorkspaceFileViewer-DockSummary {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-DockSparkle {
  flex: none;
  font-size: 14px;
  color: var(--shell-primary);
}

.WorkspaceFileViewer-DockStatusText {
  font-weight: 500;
  color: var(--shell-text-primary);
  letter-spacing: 0.01em;
}

.WorkspaceFileViewer-DockDelta {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;

  .is-add {
    color: var(--shell-success);
  }

  .is-del {
    color: var(--shell-danger);
  }
}

.WorkspaceFileViewer-DockDivider {
  flex: none;
  width: 1px;
  height: 14px;
  background: color-mix(in srgb, var(--shell-text-primary) 14%, transparent);
}

.WorkspaceFileViewer-DockActions {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.WorkspaceFileViewer-DockBtn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled),
  &.is-active {
    background: color-mix(in srgb, var(--shell-text-primary) 8%, transparent);
    color: var(--shell-text-primary);
  }

  &.is-primary {
    padding: 0 13px;
    background: var(--shell-primary);
    color: var(--shell-on-primary);
    font-weight: 600;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--shell-primary) 34%, transparent);

    &:hover:not(:disabled) {
      filter: brightness(1.06);
    }
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileViewer-DockIconBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 13.5px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--shell-text-primary) 8%, transparent);
    color: var(--shell-text-primary);
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .canvas-dock-enter-active,
  .canvas-dock-leave-active {
    transition:
      opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.canvas-dock-enter-from,
.canvas-dock-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}

.WorkspaceFileViewer-HeaderLead {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-Toolbar {
  display: flex;
  flex: none;
  gap: 2px;
  align-items: center;
}

.WorkspaceFileViewer-ZoomInline {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.WorkspaceFileViewer-ViewportBar {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 2px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-ViewportTrigger {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 5px;
  align-items: center;
  height: 26px;
  max-width: 210px;
  padding: 0 7px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;
  min-width: 0;

  &:hover:not(:disabled),
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileViewer-ViewportIcon,
.WorkspaceFileViewer-ViewportChevron,
.WorkspaceFileViewer-ViewportSearchIcon,
.WorkspaceFileViewer-ViewportOptionIcon,
.WorkspaceFileViewer-ViewportOptionCheck {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
}

.WorkspaceFileViewer-ViewportLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileViewer-ViewportDim {
  flex: none;
  color: var(--shell-text-muted);
  font-variant-numeric: tabular-nums;
}

.WorkspaceFileViewer-ViewportPopover {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 268px;
}

.WorkspaceFileViewer-ViewportSearch {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-muted);
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--shell-primary);
  }
}

.WorkspaceFileViewer-ViewportSearchInput {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }

  &:focus,
  &:focus-visible {
    outline: none;
  }
}

.WorkspaceFileViewer-ViewportCats {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.WorkspaceFileViewer-ViewportCatBtn {
  padding: 2px 7px;
  border: none;
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileViewer-ViewportList {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 256px;
  overflow-y: auto;
}

.WorkspaceFileViewer-ViewportOption {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: -1px;
  }
}

.WorkspaceFileViewer-ViewportOptionLead {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-ViewportOptionName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileViewer-ViewportOptionMeta {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.WorkspaceFileViewer-ViewportOptionDim {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.WorkspaceFileViewer-ViewportOptionCheck {
  color: var(--shell-primary);
}

.WorkspaceFileViewer-ViewportEmpty {
  padding: 14px 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  text-align: center;
}

.WorkspaceFileViewer-ToolBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled),
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileViewer-MenuItem {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.WorkspaceFileViewer-MenuCheck {
  color: var(--shell-primary);
  font-size: 14px;
}

.WorkspaceFileViewer-MenuDivider {
  height: 1px;
  margin: 4px 6px;
  background: var(--shell-border);
}

.WorkspaceFileViewer-Outline {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 280px;
  overflow-y: auto;
}

.WorkspaceFileViewer-OutlineTitle {
  padding: 4px 8px 6px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
}

.WorkspaceFileViewer-OutlineItem {
  display: block;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }
}

.WorkspaceFileViewer-Body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.WorkspaceFileViewer-Loading {
  padding: 16px;
}

.WorkspaceFileViewer-State {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  text-align: center;
}

.WorkspaceFileViewer-StateIcon {
  color: var(--shell-text-muted);
  font-size: 32px;

  &.is-danger {
    color: var(--shell-danger);
  }
}

.WorkspaceFileViewer-StateTitle {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: 500;
}

.WorkspaceFileViewer-StatePath {
  margin: 0;
  max-width: 100%;
  color: var(--shell-text-muted);
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: var(--shell-fs-caption);
  word-break: break-all;
}

.WorkspaceFileViewer-StateActions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 6px;
}

.WorkspaceFileViewer-FrameWrap {
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

.WorkspaceFileViewer-Frame {
  width: 100%;
  height: 100%;
  border: none;
  background: var(--tx-color-white, #fff);
}

.WorkspaceFileViewer-Markdown {
  position: relative;
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  padding: 16px 22px 28px;
  line-height: 1.65;

  // Seamless borderless paper integration for TxMarkdownEditor (zero card box / double scroll).
  :deep(.tx-markdown-editor) {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    overflow: visible;
    --tx-markdown-editor-bg: transparent;
    --tx-markdown-editor-border: var(--shell-border);
    --tx-markdown-editor-text: var(--shell-text-primary);
    --tx-markdown-editor-muted: var(--shell-text-secondary);
    --tx-markdown-editor-placeholder: var(--shell-text-muted);
    --tx-markdown-editor-accent: var(--shell-primary);
    --tx-markdown-editor-pad-x: 0px;
    --tx-markdown-editor-pad-y: 0px;

    &.is-focused {
      border-color: transparent;
      box-shadow: none;
    }

    .tx-markdown-editor__main {
      flex: 1 1 auto;
    }

    .tx-markdown-editor__pane {
      overflow: visible;
    }

    .tx-markdown-editor__surface,
    .tx-markdown-editor__surface:focus,
    .tx-markdown-editor__surface:focus-visible,
    .tx-markdown-editor__preview:focus,
    .tx-markdown-editor__preview:focus-visible {
      outline: none;
    }

    .markdown-body > :first-child {
      margin-top: 0;
    }
  }

  // Targeted blocks while typing an optimization suggestion in the bottom glass capsule.
  :deep(.markdown-body > .is-canvas-targeted) {
    position: relative;

    &::before {
      content: '';
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: -12px;
      width: 2px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--shell-primary) 72%, transparent);
      pointer-events: none;
    }
  }

  // Target blocks currently being revised by AI: restrained straight margin hairline (zero box clutter).
  :deep(.markdown-body > .is-canvas-pending) {
    position: relative;

    &::before {
      content: '';
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: -12px;
      width: 2px;
      border-radius: 999px;
      background: var(--shell-primary);
      pointer-events: none;
    }

    @media (prefers-reduced-motion: no-preference) {
      &::before {
        animation: canvas-rail-pulse 1.5s ease-in-out infinite;
      }
    }
  }

  // Newly applied blocks: restrained monochrome margin hairline once settled into review
  // (hidden while sweeping so the paper stays 100% pure, borderless, and seamless).
  :deep(.markdown-body > .is-canvas-changed) {
    position: relative;
    z-index: 0;

    &::before {
      content: '';
      position: absolute;
      top: 3px;
      bottom: 3px;
      left: -12px;
      width: 2px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--shell-text-primary) 26%, transparent);
      opacity: 1;
      transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
      pointer-events: none;
    }
  }

  &.is-canvas-sweeping {
    :deep(.markdown-body > .is-canvas-changed::before) {
      opacity: 0;
    }

    // NEW layer paints cleanly on top using the EXACT same paper color (--shell-bg),
    // gliding along a gentle 175deg reading diagonal over the quiet receding OLD layer.
    :deep(.WorkspaceFileViewer-MarkdownEditor.tx-markdown-editor) {
      position: relative;
      z-index: 2;
      background: var(--shell-bg);
      mask-image: linear-gradient(
        175deg,
        #000 0px,
        #000 max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) - 48px)),
        rgba(0, 0, 0, 0.82)
          max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) - 20px)),
        rgba(0, 0, 0, 0.16)
          max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) - 4px)),
        transparent max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) + 4px)),
        transparent 100%
      );
      -webkit-mask-image: linear-gradient(
        175deg,
        #000 0px,
        #000 max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) - 48px)),
        rgba(0, 0, 0, 0.82)
          max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) - 20px)),
        rgba(0, 0, 0, 0.16)
          max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) - 4px)),
        transparent max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) + 4px)),
        transparent 100%
      );
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    :deep(.WorkspaceFileViewer-RevealWord) {
      opacity: 0.18;
      filter: blur(3px);
      will-change: opacity, filter;

      &.is-revealed {
        animation: canvas-word-reveal-light 540ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }

      &.is-settled {
        opacity: 1;
        filter: none;
        text-shadow: none;
        animation: none;
        will-change: auto;
      }
    }

    &.is-dark :deep(.WorkspaceFileViewer-RevealWord.is-revealed) {
      animation: canvas-word-reveal-dark 560ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
  }
}

/* ── Seamless Same-Paper Diagonal Old->New Cover (Zero Boxes, Luminous Monochrome Ink) ── */
.WorkspaceFileViewer-CanvasOldLayer {
  position: absolute;
  top: 16px;
  left: 22px;
  width: calc(100% - 44px);
  z-index: 1;
  pointer-events: none;
  user-select: none;
  overflow: hidden;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  mask-image: linear-gradient(
    175deg,
    transparent 0px,
    transparent calc(var(--canvas-replace-y, 0px) - 2px),
    rgba(0, 0, 0, 0.42) calc(var(--canvas-replace-y, 0px) + 20px),
    #000 calc(var(--canvas-replace-y, 0px) + 48px),
    #000 100%
  );
  -webkit-mask-image: linear-gradient(
    175deg,
    transparent 0px,
    transparent calc(var(--canvas-replace-y, 0px) - 2px),
    rgba(0, 0, 0, 0.42) calc(var(--canvas-replace-y, 0px) + 20px),
    #000 calc(var(--canvas-replace-y, 0px) + 48px),
    #000 100%
  );

  // Calmly soften receding OLD blocks below the frontier so fresh 100% NEW ink
  // reads with immediate effortless visual hierarchy (unchanged header stays 100% static).
  @media (prefers-reduced-motion: no-preference) {
    :deep(.markdown-body > *:not(.is-canvas-old-static)) {
      animation: canvas-old-recede 320ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
  }
}

.WorkspaceFileViewer-CanvasReplaceVeilHost {
  position: absolute;
  top: var(--canvas-replace-old-top, 16px);
  right: 22px;
  bottom: 0;
  left: 22px;
  z-index: 3;
  overflow: hidden;
  pointer-events: none;
}

.WorkspaceFileViewer-CanvasReplaceVeil {
  position: absolute;
  inset: 0;
  opacity: var(--canvas-replace-veil-opacity, 0);
  will-change: opacity;
  background: linear-gradient(
    175deg,
    transparent 0px,
    transparent max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) - 32px)),
    color-mix(in srgb, var(--shell-bg) 72%, transparent)
      max(var(--canvas-replace-start, 0px), var(--canvas-replace-y, 0px)),
    transparent max(var(--canvas-replace-start, 0px), calc(var(--canvas-replace-y, 0px) + 32px)),
    transparent 100%
  );
}

/* ── Subtle Same-Paper Veil for Code Viewer Sweep ── */
.WorkspaceFileViewer-CanvasWipe {
  position: absolute;
  right: 0;
  left: 0;
  top: 0;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
  z-index: 4;
}

.WorkspaceFileViewer-CanvasWipeCurtain {
  position: absolute;
  right: 0;
  left: 0;
  top: 0;
  height: 112px;
  transform: translate3d(0, -112px, 0);
  will-change: transform, opacity;

  @media (prefers-reduced-motion: no-preference) {
    animation: canvas-wipe-sweep 2000ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
}

.WorkspaceFileViewer-CanvasWipeVeil {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    color-mix(in srgb, var(--shell-bg) 52%, transparent) 42%,
    color-mix(in srgb, var(--shell-bg) 72%, transparent) 60%,
    transparent 100%
  );
}

.WorkspaceFileViewer-CanvasWipeEdge {
  display: none;
}

/* ── Inline Canvas Diff View ── */
.WorkspaceFileViewer-CanvasDiff {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 10px 0 24px;
  font-family: var(--tx-font-family-mono, ui-monospace, Menlo, Monaco, Consolas, monospace);
  font-size: 12.5px;
  line-height: 1.6;
}

.WorkspaceFileViewer-CanvasDiffLine {
  display: flex;
  gap: 8px;
  padding: 0 14px 0 8px;

  &.is-add {
    background: var(--shell-success-soft);
  }

  &.is-del {
    background: var(--shell-danger-soft);
    opacity: 0.85;
  }
}

.WorkspaceFileViewer-CanvasDiffNo {
  flex: none;
  min-width: 32px;
  color: var(--shell-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  user-select: none;
  opacity: 0.65;
}

.WorkspaceFileViewer-CanvasDiffSign {
  flex: none;
  width: 1ch;
  color: var(--shell-text-muted);
  user-select: none;

  .WorkspaceFileViewer-CanvasDiffLine.is-add & {
    color: var(--shell-success);
  }

  .WorkspaceFileViewer-CanvasDiffLine.is-del & {
    color: var(--shell-danger);
  }
}

.WorkspaceFileViewer-CanvasDiffText {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.WorkspaceFileViewer-ImageWrap {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.WorkspaceFileViewer-ZoomLabel {
  min-width: 44px;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.WorkspaceFileViewer-ImageStage {
  display: grid;
  flex: 1 1 auto;
  place-items: center;
  overflow: auto;
  padding: 20px;
}

.WorkspaceFileViewer-Image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--shell-radius-sm);
  transform-origin: center center;
}

.WorkspaceFileViewer-Dir {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}

.WorkspaceFileViewer-DirRow {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-parent {
    color: var(--shell-text-secondary);
  }
}

.WorkspaceFileViewer-DirIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 15px;
}

.WorkspaceFileViewer-DirName {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.WorkspaceFileViewer-DirSize {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.WorkspaceFileViewer-Code {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  font-family: var(--tx-font-family-mono, ui-monospace, Menlo, Monaco, Consolas, monospace);
  font-size: 12.5px;
  line-height: 1.6;
}

.WorkspaceFileViewer-Truncated {
  flex: none;
  padding: 6px 12px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-warning-soft);
  color: var(--shell-warning);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
}

.WorkspaceFileViewer-CodeLines {
  padding: 10px 0 24px;
}

.WorkspaceFileViewer-CodeLine {
  display: flex;
  gap: 12px;
  padding: 0 14px 0 8px;

  &.is-highlighted {
    background: var(--shell-primary-soft);
  }

  &.is-canvas-changed {
    background: color-mix(in srgb, var(--shell-text-primary) 4%, transparent);
    box-shadow: inset 2px 0 0 color-mix(in srgb, var(--shell-text-primary) 28%, transparent);
  }

  @media (prefers-reduced-motion: no-preference) {
    &.is-canvas-entering {
      animation: canvas-block-reveal 620ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
  }
}

.WorkspaceFileViewer-LineNo {
  flex: none;
  min-width: 36px;
  color: var(--shell-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  user-select: none;
  opacity: 0.65;
}

.WorkspaceFileViewer-LineText {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre;

  .WorkspaceFileViewer-Code.is-wrap & {
    white-space: pre-wrap;
    word-break: break-word;
  }
}

/* ── Inline Markdown Comment Composer & Queue Dock ── */
.WorkspaceFileViewer-CommentComposer {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.WorkspaceFileViewer-CommentQuoteRow {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  justify-content: space-between;
}

.WorkspaceFileViewer-CommentQuote {
  flex: 1 1 auto;
  margin: 0;
  padding: 2px 0 2px 8px;
  border-left: 2px solid var(--shell-primary);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.WorkspaceFileViewer-CommentInput {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  line-height: 1.45;
  resize: none;
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: var(--shell-primary);
  }
}

.WorkspaceFileViewer-CommentComposerFooter {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.WorkspaceFileViewer-CommentHint {
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

.WorkspaceFileViewer-CommentComposerBtns {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.WorkspaceFileViewer-CommentBtn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--shell-text-primary) 12%, var(--shell-surface-2));
  }

  &.is-primary {
    background: var(--shell-primary);
    color: var(--shell-on-primary);

    &:hover:not(:disabled) {
      filter: brightness(1.06);
    }
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.WorkspaceFileViewer-CommentClose {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.WorkspaceFileViewer-CommentsDock {
  display: flex;
  flex: none;
  flex-direction: column;
  border-top: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.WorkspaceFileViewer-CommentsBar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 10px;
}

.WorkspaceFileViewer-CommentsToggle {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }
}

.WorkspaceFileViewer-CommentsBarActions {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.WorkspaceFileViewer-CommentsList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  padding: 4px 10px 10px;
  overflow-y: auto;
  border-top: 1px solid color-mix(in srgb, var(--shell-border) 65%, transparent);
}

.WorkspaceFileViewer-CommentItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 9px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.WorkspaceFileViewer-CommentItemQuote {
  margin: 0;
  padding-left: 7px;
  border-left: 2px solid var(--shell-primary);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.WorkspaceFileViewer-CommentItemText {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  line-height: 1.45;
  white-space: pre-wrap;
}

.WorkspaceFileViewer-CommentItemActions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.WorkspaceFileViewer-CommentTinyBtn {
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-danger:hover {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }
}

/* ── Bottom StatusBar (Breadcrumb path on left; meta + outline / reload / more menu on right) ── */
.WorkspaceFileViewer-StatusBar {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 6px 0 8px;
  border-top: 1px solid var(--shell-border);
  background: var(--shell-surface);
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  box-sizing: border-box;
  min-width: 0;
}

.WorkspaceFileViewer-StatusLeft {
  display: flex;
  flex: 1 1 auto;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-Breadcrumbs {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 1px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.WorkspaceFileViewer-CrumbSep {
  display: inline-flex;
  flex: none;
  font-size: 12px;
  color: var(--shell-text-muted);
  opacity: 0.7;
}

.WorkspaceFileViewer-CrumbBtn {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  padding: 1px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--shell-text-muted);
  font: inherit;
  font-size: var(--shell-fs-caption);
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-last {
    color: var(--shell-text-primary);
    font-weight: 500;
  }
}

.WorkspaceFileViewer-CrumbIcon {
  display: inline-flex;
  flex: none;
  font-size: 12px;
  color: var(--shell-primary);
}

.WorkspaceFileViewer-CrumbLabel {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.WorkspaceFileViewer-StatusCopy {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.75;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
    opacity: 1;
  }
}

.WorkspaceFileViewer-StatusRight {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.WorkspaceFileViewer-StatusMeta {
  display: inline-flex;
  flex: none;
  gap: 7px;
  align-items: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.WorkspaceFileViewer-ConflictBanner {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid var(--shell-border);
  background: var(--shell-danger-soft);
  color: var(--shell-text-primary);
  font-size: 11.5px;
}

.WorkspaceFileViewer-ConflictLead {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.WorkspaceFileViewer-ConflictIcon {
  flex: none;
  color: var(--shell-danger);
  font-size: 14px;
}

.WorkspaceFileViewer-ConflictText {
  line-height: 1.35;
}

.WorkspaceFileViewer-ConflictActions {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.WorkspaceFileViewer-ConflictBtn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--shell-border);
  border-radius: 6px;
  background: var(--shell-surface);
  color: var(--shell-text-primary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;

  &:hover,
  &.is-active {
    background: var(--shell-surface-2);
  }

  &.is-danger {
    border-color: transparent;
    background: var(--shell-danger);
    color: var(--shell-on-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileViewer-SaveBadge {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 0 5px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--shell-text-muted);
  font: inherit;
  font-size: 11px;
  line-height: 1.5;

  &.is-dirty {
    color: var(--shell-text-secondary);
  }

  &.is-saved {
    color: var(--shell-success);
  }

  &.is-error {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--shell-danger);
      outline-offset: 1px;
    }
  }
}

.WorkspaceFileViewer-SaveDot {
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: var(--shell-primary);
}

.WorkspaceFileViewer-StatusSep {
  flex: none;
  width: 1px;
  height: 12px;
  background: var(--shell-border);
}

.WorkspaceFileViewer-StatusActions {
  display: inline-flex;
  flex: none;
  gap: 1px;
  align-items: center;
}

.WorkspaceFileViewer-StatusToolBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled),
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.WorkspaceFileViewer-StatusExt {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
}

.WorkspaceFileViewer-StatusItem {
  color: var(--shell-text-muted);
}

.WorkspaceFileViewer-SelIcon {
  display: inline-flex;
  font-size: 14px;
}

@keyframes canvas-rail-pulse {
  0%,
  100% {
    opacity: 0.38;
  }

  50% {
    opacity: 0.95;
  }
}

@keyframes canvas-wipe-sweep {
  0% {
    opacity: 0;
    transform: translate3d(0, -132px, 0);
  }

  12% {
    opacity: 1;
  }

  84% {
    opacity: 0.92;
    transform: translate3d(0, calc(var(--canvas-sweep-travel, 240px) - 110px), 0);
  }

  100% {
    opacity: 0;
    transform: translate3d(0, calc(var(--canvas-sweep-travel, 240px) - 72px), 0);
  }
}

@keyframes canvas-old-recede {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0.42;
  }
}

@keyframes canvas-word-reveal-light {
  0% {
    opacity: 0.18;
    filter: blur(3.5px);
    text-shadow: 0 0 8px rgba(29, 29, 31, 0.14);
  }

  44% {
    opacity: 0.96;
    filter: blur(0.45px);
    text-shadow: 0 0 5px rgba(29, 29, 31, 0.07);
  }

  100% {
    opacity: 1;
    filter: blur(0);
    text-shadow: none;
  }
}

@keyframes canvas-word-reveal-dark {
  0% {
    opacity: 0.22;
    filter: blur(3.5px);
    color: #ffffff;
    text-shadow: 0 0 14px rgba(255, 255, 255, 0.55);
  }

  42% {
    opacity: 1;
    filter: blur(0.5px);
    color: #ffffff;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.28);
  }

  100% {
    opacity: 1;
    filter: blur(0);
    color: inherit;
    text-shadow: none;
  }
}

@keyframes canvas-block-reveal {
  0% {
    opacity: 0.3;
    transform: translateY(3px);
    filter: blur(1.5px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}
</style>
