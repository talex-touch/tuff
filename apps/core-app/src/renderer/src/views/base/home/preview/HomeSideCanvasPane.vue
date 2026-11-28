<script lang="ts">
import type {
  TdsCanvasFrame as ModuleCanvasFrame,
  TdsCanvasHistoryState as ModuleCanvasHistoryState,
  TdsCanvasNote as ModuleCanvasNote
} from '~/components/tds-canvas/types'

interface InMemoryCanvasSession {
  version: 1
  frames: ModuleCanvasFrame[]
  notes: ModuleCanvasNote[]
  selectedFrameId: string | null
  history: ModuleCanvasHistoryState
  deletedAutoFrameIds: string[]
  antiSlop: boolean
  canvasThemePackId?: string | null
}

const MAX_IN_MEMORY_CANVAS_SESSIONS = 32
/**
 * Process-local in-memory session cache per conversation.
 * Assistant HTML/SVG frame bodies, snapshot history blobs, and pin notes MUST NEVER
 * be persisted to browser `sessionStorage` / `localStorage`.
 */
const inMemoryCanvasSessions = new Map<string, InMemoryCanvasSession>()

function cloneInMemoryCanvasSession(session: InMemoryCanvasSession): InMemoryCanvasSession {
  return {
    version: 1,
    frames: session.frames.map((frame) => ({ ...frame })),
    notes: session.notes.map((note) => ({ ...note })),
    selectedFrameId: session.selectedFrameId,
    history: {
      blobs: { ...session.history.blobs },
      entries: session.history.entries.map((entry) => ({
        ...entry,
        frameSnapshots: entry.frameSnapshots.map((snapshot) => ({ ...snapshot }))
      })),
      cursor: session.history.cursor
    },
    deletedAutoFrameIds: [...session.deletedAutoFrameIds],
    antiSlop: session.antiSlop,
    canvasThemePackId: session.canvasThemePackId ?? null
  }
}

export function __resetHomeSideCanvasSessionsForTesting(): void {
  inMemoryCanvasSessions.clear()
}
</script>

<script lang="ts" name="HomeSideCanvasPane" setup>
import type { DeviceCategory, DevicePreset } from '~/components/preview/tds-devices'
import type { WorkspaceFileAiActionPayload } from '~/components/preview/workspace-file-tree'
import type {
  TdsCanvasAddFramePayload,
  TdsCanvasAskFramePayload,
  TdsCanvasFrame,
  TdsCanvasFrameKind,
  TdsCanvasHistoryState,
  TdsCanvasLabels,
  TdsCanvasLintCount,
  TdsCanvasNote,
  TdsCanvasPattern,
  TdsCanvasSendNotesPayload
} from '~/components/tds-canvas/types'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { TdsLintIssue, TdsLintReport } from '~/modules/tds-lint'
import type { TdsThemePack } from '~/modules/tds-theme'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  getDeviceCategoryIcon,
  getDevicePresetById,
  isResponsivePreset,
  resolveDeviceDimensions,
  searchDevicePresets
} from '~/components/preview/tds-devices'
import TdsLintPopover from '~/components/preview/TdsLintPopover.vue'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import {
  arrangeFramesGrid,
  DEFAULT_GRID_GAP_X,
  formatNotesForAiPrompt,
  resolveFrameLogicalSize,
  resolveFrameOuterSize,
  sanitizeEmbeddedStyleCss
} from '~/components/tds-canvas/canvas-geometry'
import { createCanvasHistoryState } from '~/components/tds-canvas/canvas-history'
import TdsDesignCanvas from '~/components/tds-canvas/TdsDesignCanvas.vue'
import { buildPreviewIndex } from '~/modules/conversation/preview-index'
import { buildTdsDomProbeScript, runStaticTdsLint, summarizeLintIssues } from '~/modules/tds-lint'
import {
  buildCaptureCacheKey,
  captureFrameAndProbe,
  mergeLintIssues,
  releaseCaptureSession
} from '~/modules/tds-lint/live-capture-client'
import { exportThemePackAsCss, TDS_DEFAULT_THEME_PACK, useTdsThemePack } from '~/modules/tds-theme'

const props = withDefaults(
  defineProps<{
    messages: ConversationMessage[]
    conversationId: string | null
    workspaceRoot?: string
    active?: boolean
    aiActionsEnabled?: boolean
  }>(),
  {
    workspaceRoot: '',
    active: true,
    aiActionsEnabled: true
  }
)

const emit = defineEmits<{
  (event: 'ai-action', payload: WorkspaceFileAiActionPayload): void
}>()

const { t } = useI18n()

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/
const QUICK_PRESET_IDS = ['iphone-17-pro', 'ipad-pro-11', 'desktop-hd'] as const

interface ExtractedFenceFrame {
  id: string
  title: string
  kind: TdsCanvasFrameKind
  source: string
  deviceId: string
  showShell: boolean
  width?: number
  height?: number
  sourceRef: string
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readTitleFromMarkup(source: string): string {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)
  if (titleMatch?.[1]) {
    const cleaned = titleMatch[1].replace(/\s+/g, ' ').trim()
    if (cleaned) return cleaned
  }
  const ariaMatch = /<svg\b[^>]*\baria-label\s*=\s*(['"])([^'"]+)\1/i.exec(source)
  if (ariaMatch?.[2]?.trim()) {
    return ariaMatch[2].trim()
  }
  return ''
}

function inferDevicePresetForHtml(
  title: string,
  source: string
): {
  deviceId: string
  showShell: boolean
} {
  const sample = `${title}\n${source.slice(0, 1200)}`
  if (/\b(?:iphone|mobile|ios|android|phone|375px|390px|393px|402px|412px)\b/i.test(sample)) {
    return { deviceId: 'iphone-17-pro', showShell: true }
  }
  if (/\b(?:ipad|tablet|834px|768px)\b/i.test(sample)) {
    return { deviceId: 'ipad-pro-11', showShell: true }
  }
  return { deviceId: 'desktop-hd', showShell: true }
}

function normalizeFenceKind(language: string): TdsCanvasFrameKind | null {
  const lower = language.trim().toLowerCase()
  if (lower === 'html' || lower === 'htm') return 'html'
  if (lower === 'svg') return 'svg'
  return null
}

function extractClosedFencesFromText(
  text: string,
  messageId: string,
  counter: { next: number },
  kindCounters: { html: number; svg: number },
  artifactNamesById: ReadonlyMap<string, string>,
  into: ExtractedFenceFrame[]
): void {
  let open: { marker: string; language: string; lines: string[] } | null = null
  for (const line of text.split('\n')) {
    if (!open) {
      const start = FENCE_OPEN.exec(line)
      if (start) {
        open = { marker: start[1]!, language: (start[2] ?? '').toLowerCase(), lines: [] }
      }
      continue
    }
    const trimmed = line.trim()
    const closes = trimmed.startsWith(open.marker) && /^[`~]+\s*$/.test(trimmed)
    if (!closes) {
      open.lines.push(line)
      continue
    }
    const ordinal = counter.next++
    const kind = normalizeFenceKind(open.language)
    const source = open.lines.join('\n')
    if (kind && source.trim()) {
      const id = `${messageId}:fence:${ordinal}`
      const indexedTitle = artifactNamesById.get(id) ?? ''
      const extractedTitle = indexedTitle || readTitleFromMarkup(source)
      let title = extractedTitle
      if (!title) {
        if (kind === 'html') {
          kindCounters.html += 1
          title = t('home.sidePanel.canvasHtmlFrameFallback', { index: kindCounters.html })
        } else {
          kindCounters.svg += 1
          title = t('home.sidePanel.canvasSvgFrameFallback', { index: kindCounters.svg })
        }
      }

      if (kind === 'svg') {
        into.push({
          id,
          title,
          kind: 'svg',
          source,
          deviceId: 'responsive',
          showShell: false,
          width: 520,
          height: 400,
          sourceRef: `message:${messageId}`
        })
      } else {
        const inferred = inferDevicePresetForHtml(title, source)
        into.push({
          id,
          title,
          kind: 'html',
          source,
          deviceId: inferred.deviceId,
          showShell: inferred.showShell,
          sourceRef: `message:${messageId}`
        })
      }
    }
    open = null
  }
}

function collectConversationFrames(messages: ConversationMessage[]): ExtractedFenceFrame[] {
  const previewIndex = buildPreviewIndex(messages)
  const artifactNamesById = new Map<string, string>()
  for (const artifact of previewIndex.artifacts) {
    if ((artifact.kind === 'page' || artifact.kind === 'image') && artifact.name) {
      artifactNamesById.set(artifact.id, artifact.name)
    }
  }

  const collected: ExtractedFenceFrame[] = []
  const kindCounters = { html: 0, svg: 0 }

  for (const message of messages) {
    if (message.role !== 'assistant' || message.status === 'streaming') continue
    const counter = { next: 0 }
    const textParts = message.parts?.filter((part) => part.type === 'text') ?? []
    if (textParts.length > 0) {
      for (const part of textParts) {
        if (part.type === 'text') {
          extractClosedFencesFromText(
            part.text,
            message.id,
            counter,
            kindCounters,
            artifactNamesById,
            collected
          )
        }
      }
    } else if (message.content) {
      extractClosedFencesFromText(
        message.content,
        message.id,
        counter,
        kindCounters,
        artifactNamesById,
        collected
      )
    }
  }

  return collected
}

function buildStarterFrameSource(
  title: string,
  kind: TdsCanvasFrameKind,
  preset: DevicePreset
): string {
  const safeTitle = escapeHtmlText(title)
  if (kind === 'svg') {
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" width="360" height="240">',
      `  <title>${safeTitle}</title>`,
      '  <rect x="8" y="8" width="344" height="224" rx="12" fill="var(--shell-surface, #f7f7f8)" stroke="var(--shell-border, #e5e7eb)" stroke-width="1" />',
      `  <text x="28" y="48" fill="var(--shell-text-primary, #111827)" font-family="system-ui, sans-serif" font-size="16" font-weight="600">${safeTitle}</text>`,
      '</svg>'
    ].join('\n')
  }

  const dims = isResponsivePreset(preset)
    ? t('home.sidePanel.deviceResponsive')
    : `${preset.name} · ${preset.width}×${preset.height}`
  const safeDims = escapeHtmlText(dims)

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${safeTitle}</title>`,
    '  <style>',
    '    :root {',
    '      --shell-bg: #ffffff;',
    '      --shell-surface: #f7f7f8;',
    '      --shell-border: #e5e7eb;',
    '      --shell-text-primary: #111827;',
    '      --shell-text-secondary: #6b7280;',
    '      --shell-radius-md: 12px;',
    '      --shell-font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;',
    '    }',
    '    html, body {',
    '      margin: 0;',
    '      width: 100%;',
    '      height: 100%;',
    '      background: var(--shell-bg);',
    '      color: var(--shell-text-primary);',
    '      font-family: var(--shell-font-sans);',
    '    }',
    '    main {',
    '      box-sizing: border-box;',
    '      display: flex;',
    '      flex-direction: column;',
    '      gap: 12px;',
    '      height: 100%;',
    '      padding: 20px;',
    '    }',
    '    section {',
    '      padding: 16px;',
    '      border: 1px solid var(--shell-border);',
    '      border-radius: var(--shell-radius-md);',
    '      background: var(--shell-surface);',
    '    }',
    '    h1 {',
    '      margin: 0 0 6px;',
    '      font-size: 16px;',
    '      font-weight: 600;',
    '    }',
    '    p {',
    '      margin: 0;',
    '      color: var(--shell-text-secondary);',
    '      font-size: 13px;',
    '      line-height: 1.5;',
    '    }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <section>',
    `      <h1>${safeTitle}</h1>`,
    `      <p>${safeDims}</p>`,
    '    </section>',
    '  </main>',
    '</body>',
    '</html>'
  ].join('\n')
}

function getSessionMapKey(conversationId: string | null): string {
  return conversationId?.trim() || 'default'
}

function readCanvasSession(conversationId: string | null): InMemoryCanvasSession | null {
  const key = getSessionMapKey(conversationId)
  const stored = inMemoryCanvasSessions.get(key)
  if (!stored) return null
  // Refresh LRU recency
  inMemoryCanvasSessions.delete(key)
  inMemoryCanvasSessions.set(key, stored)
  return cloneInMemoryCanvasSession(stored)
}

function writeCanvasSession(conversationId: string | null, session: InMemoryCanvasSession): void {
  const key = getSessionMapKey(conversationId)
  inMemoryCanvasSessions.delete(key)
  inMemoryCanvasSessions.set(key, cloneInMemoryCanvasSession(session))
  while (inMemoryCanvasSessions.size > MAX_IN_MEMORY_CANVAS_SESSIONS) {
    const oldestKey = inMemoryCanvasSessions.keys().next().value
    if (oldestKey === undefined) break
    inMemoryCanvasSessions.delete(oldestKey)
  }
}

const {
  activePackId: appActiveThemePackId,
  activePack: appActiveThemePack,
  allPacks: themePacks,
  selectPack: selectAppThemePack
} = useTdsThemePack()

const frames = ref<TdsCanvasFrame[]>([])
const notes = ref<TdsCanvasNote[]>([])
const selectedFrameId = ref<string | null>(null)
const historyState = ref<TdsCanvasHistoryState>(createCanvasHistoryState())
const deletedAutoFrameIds = ref<string[]>([])
const antiSlopEnabled = ref(true)
const canvasThemePackId = ref<string | null>(null)
const lintOpen = ref(false)
const addMenuOpen = ref(false)
const themeMenuOpen = ref(false)
const presetQuery = ref('')
const presetCategory = ref<DeviceCategory | 'all'>('all')
const sendingAiAction = ref(false)
const frameBitmaps = ref<Record<string, string>>({})
const domIssuesByFrameId = ref<Record<string, TdsLintIssue[]>>({})

const CANVAS_CAPTURE_DEBOUNCE_MS = 240
const capturedFrameSignatures = new Map<string, string>()
let captureTimer: ReturnType<typeof setTimeout> | null = null
let captureGeneration = 0
let activeCaptureSessionKey = ''

let manualFrameSeq = 0
let isHydrating = false

const canvasSessionKey = computed(() => props.conversationId?.trim() || 'default')

function cancelPendingCanvasCapture(): void {
  captureGeneration += 1
  if (captureTimer !== null) {
    clearTimeout(captureTimer)
    captureTimer = null
  }
}

function buildCaptureDocumentForFrame(frame: TdsCanvasFrame, themeCss: string): string {
  if (!frame.source) return ''
  const safeCss = themeCss ? sanitizeEmbeddedStyleCss(themeCss) : ''
  const styleBlock = safeCss ? `<style data-tds-theme-pack>${safeCss}</style>` : ''
  if (frame.kind === 'svg') {
    return `<!doctype html><meta charset="utf-8">${styleBlock}<body style="margin:0;width:100%;height:100%;display:grid;place-items:center;background:#ffffff">${frame.source}</body>`
  }
  if (!styleBlock) return frame.source
  if (/<\/head>/i.test(frame.source)) {
    return frame.source.replace(/<\/head>/i, (match) => `${styleBlock}${match}`)
  }
  if (/<head\b[^>]*>/i.test(frame.source)) {
    return frame.source.replace(/<head\b[^>]*>/i, (match) => `${match}${styleBlock}`)
  }
  if (/<!doctype[^>]*>/i.test(frame.source)) {
    return frame.source.replace(/<!doctype[^>]*>/i, (match) => `${match}${styleBlock}`)
  }
  return `${styleBlock}${frame.source}`
}

function computeNextFramePosition(existing: readonly TdsCanvasFrame[]): { x: number; y: number } {
  if (existing.length === 0) return { x: 0, y: 0 }
  let maxRight = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  for (const frame of existing) {
    const size = resolveFrameOuterSize(frame)
    maxRight = Math.max(maxRight, frame.x + size.width)
    minY = Math.min(minY, frame.y)
  }
  return {
    x: Math.round(maxRight + DEFAULT_GRID_GAP_X),
    y: Math.round(Number.isFinite(minY) ? minY : 0)
  }
}

function reconcileConversationFrames(
  messages: ConversationMessage[],
  options: { includePreviouslyDeleted?: boolean } = {}
): number {
  const extracted = collectConversationFrames(messages)
  if (options.includePreviouslyDeleted) {
    deletedAutoFrameIds.value = []
  }
  const deletedSet = new Set(deletedAutoFrameIds.value)
  const existingById = new Map(frames.value.map((frame) => [frame.id, frame]))

  let changed = false
  let addedCount = 0
  const updatedExisting = frames.value.map((frame) => ({ ...frame }))
  const newlyAdded: TdsCanvasFrame[] = []

  for (const item of extracted) {
    if (deletedSet.has(item.id)) continue
    const existing = existingById.get(item.id)
    if (existing) {
      if (existing.source !== item.source || existing.title !== item.title) {
        const idx = updatedExisting.findIndex((f) => f.id === item.id)
        if (idx >= 0) {
          updatedExisting[idx] = {
            ...updatedExisting[idx]!,
            source: item.source,
            title: item.title
          }
          changed = true
        }
      }
      continue
    }

    newlyAdded.push({
      id: item.id,
      title: item.title,
      kind: item.kind,
      source: item.source,
      deviceId: item.deviceId,
      showShell: item.showShell,
      ...(item.width !== undefined ? { width: item.width } : {}),
      ...(item.height !== undefined ? { height: item.height } : {}),
      sourceRef: item.sourceRef,
      x: 0,
      y: 0
    })
    addedCount += 1
    changed = true
  }

  if (!changed) return 0

  if (updatedExisting.length === 0) {
    frames.value = arrangeFramesGrid(newlyAdded)
  } else if (newlyAdded.length > 0) {
    const combined = [...updatedExisting]
    for (const candidate of newlyAdded) {
      const pos = computeNextFramePosition(combined)
      combined.push({ ...candidate, x: pos.x, y: pos.y })
    }
    frames.value = combined
  } else {
    frames.value = updatedExisting
  }

  if (!selectedFrameId.value && frames.value.length > 0) {
    selectedFrameId.value = frames.value[0]!.id
  }

  return addedCount
}

function persistCurrentSession(): void {
  if (isHydrating) return
  writeCanvasSession(props.conversationId, {
    version: 1,
    frames: frames.value,
    notes: notes.value,
    selectedFrameId: selectedFrameId.value,
    history: historyState.value,
    deletedAutoFrameIds: deletedAutoFrameIds.value,
    antiSlop: antiSlopEnabled.value,
    canvasThemePackId: canvasThemePackId.value
  })
}

function hydrateSessionForConversation(convId: string | null): void {
  cancelPendingCanvasCapture()
  const nextSessionKey = `canvas:${convId?.trim() || 'default'}`
  if (activeCaptureSessionKey && activeCaptureSessionKey !== nextSessionKey) {
    void releaseCaptureSession(activeCaptureSessionKey)
  }
  activeCaptureSessionKey = nextSessionKey
  frameBitmaps.value = {}
  domIssuesByFrameId.value = {}
  capturedFrameSignatures.clear()

  isHydrating = true
  try {
    const stored = readCanvasSession(convId)
    if (stored) {
      frames.value = stored.frames
      notes.value = stored.notes
      selectedFrameId.value = stored.selectedFrameId
      historyState.value = stored.history
      deletedAutoFrameIds.value = stored.deletedAutoFrameIds
      antiSlopEnabled.value = stored.antiSlop
      canvasThemePackId.value = stored.canvasThemePackId ?? null
    } else {
      frames.value = []
      notes.value = []
      selectedFrameId.value = null
      historyState.value = createCanvasHistoryState()
      deletedAutoFrameIds.value = []
      antiSlopEnabled.value = true
      canvasThemePackId.value = null
    }
    lintOpen.value = false
    themeMenuOpen.value = false
    reconcileConversationFrames(props.messages)
  } finally {
    isHydrating = false
  }
  persistCurrentSession()
}

watch(
  () => props.conversationId,
  (nextConvId) => {
    hydrateSessionForConversation(nextConvId)
  },
  { immediate: true }
)

watch(
  () => props.messages,
  (nextMessages) => {
    const added = reconcileConversationFrames(nextMessages)
    if (added > 0) {
      persistCurrentSession()
    }
  },
  { deep: true }
)

watch(
  [
    frames,
    notes,
    selectedFrameId,
    historyState,
    deletedAutoFrameIds,
    antiSlopEnabled,
    canvasThemePackId
  ],
  () => {
    persistCurrentSession()
  },
  { deep: true }
)

watch(addMenuOpen, (open) => {
  if (!open) {
    presetQuery.value = ''
    presetCategory.value = 'all'
  }
})

const lintReportsByFrameId = computed<Record<string, TdsLintReport>>(() => {
  const reports: Record<string, TdsLintReport> = {}
  for (const frame of frames.value) {
    const staticIssues = runStaticTdsLint(frame.source, {
      sourceKind: frame.kind,
      fixedFrame: frame.kind !== 'svg',
      antiSlop: antiSlopEnabled.value
    })
    const domIssues = domIssuesByFrameId.value[frame.id] ?? []
    const issues = mergeLintIssues(staticIssues, domIssues)
    reports[frame.id] = {
      issues,
      counts: summarizeLintIssues(issues)
    }
  }
  return reports
})

const lintCounts = computed<Record<string, TdsCanvasLintCount>>(() => {
  const counts: Record<string, TdsCanvasLintCount> = {}
  for (const [frameId, report] of Object.entries(lintReportsByFrameId.value)) {
    counts[frameId] = {
      errors: report.counts.errors,
      warnings: report.counts.warnings
    }
  }
  return counts
})

const inspectedFrame = computed<TdsCanvasFrame | null>(() => {
  if (selectedFrameId.value) {
    const found = frames.value.find((frame) => frame.id === selectedFrameId.value)
    if (found) return found
  }
  return frames.value[0] ?? null
})

const inspectedLintIssues = computed<TdsLintIssue[]>(() => {
  const target = inspectedFrame.value
  if (!target) return []
  return lintReportsByFrameId.value[target.id]?.issues ?? []
})

const pendingNotes = computed(() =>
  notes.value.filter((note) => !note.resolved && note.text.trim().length > 0)
)

const presetCategories = computed<Array<{ id: DeviceCategory | 'all'; label: string }>>(() => [
  { id: 'all', label: t('home.sidePanel.deviceCategoryAll') },
  { id: 'phone', label: t('home.sidePanel.deviceCategoryPhone') },
  { id: 'tablet', label: t('home.sidePanel.deviceCategoryTablet') },
  { id: 'desktop', label: t('home.sidePanel.deviceCategoryDesktop') },
  { id: 'watch', label: t('home.sidePanel.deviceCategoryWatch') },
  { id: 'paper', label: t('home.sidePanel.deviceCategoryPaper') }
])

const filteredPresets = computed(() => searchDevicePresets(presetQuery.value, presetCategory.value))

const selectedCanvasPack = computed<TdsThemePack>(() => {
  if (canvasThemePackId.value) {
    const matched = themePacks.value.find((pack) => pack.meta.id === canvasThemePackId.value)
    if (matched) return matched
  }
  return appActiveThemePack.value ?? TDS_DEFAULT_THEME_PACK
})

const canvasThemeCss = computed<string>(() => exportThemePackAsCss(selectedCanvasPack.value))

const selectedCanvasPackAccentColor = computed<string>(
  () =>
    selectedCanvasPack.value.tokens.light.primary ??
    selectedCanvasPack.value.tokens.dark.primary ??
    TDS_DEFAULT_THEME_PACK.tokens.light.primary!
)

const canvasPattern = computed<TdsCanvasPattern>(
  () => selectedCanvasPack.value.surface?.canvasPattern ?? 'dots'
)

function scheduleCanvasFrameCaptures(): void {
  cancelPendingCanvasCapture()

  const validIds = new Set(frames.value.map((frame) => frame.id))
  let prunedBitmaps = false
  const nextBitmaps: Record<string, string> = {}
  for (const [id, bitmap] of Object.entries(frameBitmaps.value)) {
    if (validIds.has(id)) {
      nextBitmaps[id] = bitmap
    } else {
      prunedBitmaps = true
    }
  }
  if (prunedBitmaps) {
    frameBitmaps.value = nextBitmaps
  }

  let prunedDom = false
  const nextDomIssues: Record<string, TdsLintIssue[]> = {}
  for (const [id, list] of Object.entries(domIssuesByFrameId.value)) {
    if (validIds.has(id)) {
      nextDomIssues[id] = list
    } else {
      prunedDom = true
    }
  }
  if (prunedDom) {
    domIssuesByFrameId.value = nextDomIssues
  }
  for (const key of Array.from(capturedFrameSignatures.keys())) {
    if (!validIds.has(key)) {
      capturedFrameSignatures.delete(key)
    }
  }

  if (!props.active || frames.value.length === 0 || !isElectronRenderer()) {
    return
  }

  const generation = captureGeneration
  const sessionKey = `canvas:${canvasSessionKey.value}`
  activeCaptureSessionKey = sessionKey

  // Prioritize the currently selected frame so its bitmap and DOM probe land first.
  const orderedFrames = [...frames.value].sort((a, b) => {
    if (a.id === selectedFrameId.value) return -1
    if (b.id === selectedFrameId.value) return 1
    return 0
  })

  const themeCssSnapshot = canvasThemeCss.value
  const antiSlopSnapshot = antiSlopEnabled.value
  const probeScript = buildTdsDomProbeScript({ antiSlop: antiSlopSnapshot })

  captureTimer = setTimeout(() => {
    captureTimer = null
    if (generation !== captureGeneration) return

    for (const frame of orderedFrames) {
      const srcdoc = buildCaptureDocumentForFrame(frame, themeCssSnapshot)
      if (!srcdoc.trim()) continue
      const logical = resolveFrameLogicalSize(frame)
      const domProbeScript = frame.kind === 'html' ? probeScript : undefined
      const signature = buildCaptureCacheKey({
        srcdoc,
        width: logical.width,
        height: logical.height,
        format: 'jpeg',
        pixelRatio: 1,
        domProbeScript
      })
      if (capturedFrameSignatures.get(frame.id) === signature) {
        continue
      }

      void captureFrameAndProbe({
        srcdoc,
        width: logical.width,
        height: logical.height,
        format: 'jpeg',
        quality: 85,
        pixelRatio: 1,
        domProbeScript,
        sessionKey
      }).then((result) => {
        if (generation !== captureGeneration || !result.ok) return
        if (result.bitmapDataUrl) {
          frameBitmaps.value = {
            ...frameBitmaps.value,
            [frame.id]: result.bitmapDataUrl
          }
        }
        if (result.probeError) {
          return
        }
        capturedFrameSignatures.set(frame.id, signature)
        domIssuesByFrameId.value = {
          ...domIssuesByFrameId.value,
          [frame.id]: result.domIssues
        }
      })
    }
  }, CANVAS_CAPTURE_DEBOUNCE_MS)
}

watch(
  [
    () =>
      frames.value.map(
        (f) =>
          `${f.id}:${f.kind}:${f.deviceId}:${f.orientation ?? ''}:${f.width ?? ''}:${f.height ?? ''}:${f.source.length}:${f.source}`
      ),
    canvasThemeCss,
    antiSlopEnabled,
    () => props.active
  ],
  () => {
    scheduleCanvasFrameCaptures()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  cancelPendingCanvasCapture()
  if (activeCaptureSessionKey) {
    void releaseCaptureSession(activeCaptureSessionKey)
    activeCaptureSessionKey = ''
  }
})

const isCanvasPackDifferentFromApp = computed(
  () => selectedCanvasPack.value.meta.id !== appActiveThemePackId.value
)

function resolvePackDisplayName(pack: TdsThemePack): string {
  switch (pack.meta.id) {
    case 'tds-apple-neutral':
      return t('themeStyle.tdsPack.pack.appleNeutralName')
    case 'tds-obsidian-cobalt':
      return t('themeStyle.tdsPack.pack.obsidianCobaltName')
    case 'tds-paper-ink':
      return t('themeStyle.tdsPack.pack.paperInkName')
    case 'tds-graphite-emerald':
      return t('themeStyle.tdsPack.pack.graphiteEmeraldName')
    default:
      return pack.meta.name
  }
}

function resolvePatternLabel(pattern: TdsCanvasPattern | undefined): string {
  switch (pattern) {
    case 'none':
      return t('themeStyle.tdsPack.patternNone')
    case 'grid':
      return t('themeStyle.tdsPack.patternGrid')
    case 'paper-grain':
      return t('themeStyle.tdsPack.patternPaperGrain')
    case 'dots':
    default:
      return t('themeStyle.tdsPack.patternDots')
  }
}

function getPackSwatchColors(pack: TdsThemePack): [string, string, string] {
  return [
    pack.tokens.light.bg ?? TDS_DEFAULT_THEME_PACK.tokens.light.bg!,
    pack.tokens.dark.bg ?? TDS_DEFAULT_THEME_PACK.tokens.dark.bg!,
    pack.tokens.light.primary ??
      pack.tokens.dark.primary ??
      TDS_DEFAULT_THEME_PACK.tokens.light.primary!
  ]
}

function handleSelectCanvasPack(pack: TdsThemePack): void {
  canvasThemePackId.value = pack.meta.id
}

function handleFollowAppThemePack(): void {
  canvasThemePackId.value = null
}

function handleApplyPackToApp(pack: TdsThemePack): void {
  const applied = selectAppThemePack(pack.meta.id)
  if (applied) {
    canvasThemePackId.value = pack.meta.id
    toast.success(
      t('home.sidePanel.canvasThemeAppliedToApp', {
        name: resolvePackDisplayName(pack)
      })
    )
  }
}

const canvasLabels = computed<Partial<TdsCanvasLabels>>(() => ({
  selectTool: t('home.sidePanel.canvasSelectTool'),
  handTool: t('home.sidePanel.canvasHandTool'),
  noteTool: t('home.sidePanel.canvasNoteTool'),
  fitToScreen: t('home.sidePanel.canvasFitToScreen'),
  zoomIn: t('home.sidePanel.canvasZoomIn'),
  zoomOut: t('home.sidePanel.canvasZoomOut'),
  zoomReset: t('home.sidePanel.canvasZoomReset'),
  autoArrange: t('home.sidePanel.canvasAutoArrange'),
  addFrame: t('home.sidePanel.canvasAddFrame'),
  deleteFrame: t('home.sidePanel.canvasDeleteFrame'),
  deviceSwitcher: t('home.sidePanel.canvasDeviceSwitcher'),
  deviceSearchPlaceholder: t('home.sidePanel.canvasPresetSearch'),
  deviceResponsive: t('home.sidePanel.deviceResponsive'),
  rotateOrientation: t('home.sidePanel.canvasRotateOrientation'),
  toggleShell: t('home.sidePanel.canvasToggleShell'),
  lintBadgeTitle: t('home.sidePanel.canvasLintBadgeTitle'),
  lintClean: t('home.sidePanel.canvasLintClean'),
  notesPanelTitle: t('home.sidePanel.canvasNotesPanelTitle'),
  notePlaceholder: t('home.sidePanel.canvasNotePlaceholder'),
  noteSave: t('home.sidePanel.canvasNoteSave'),
  noteCancel: t('home.sidePanel.canvasNoteCancel'),
  noteResolve: t('home.sidePanel.canvasNoteResolve'),
  noteReopen: t('home.sidePanel.canvasNoteReopen'),
  noteDelete: t('home.sidePanel.canvasNoteDelete'),
  sendNotesToAi: t('home.sidePanel.canvasSendNotesToAi'),
  askFrameAi: t('home.sidePanel.canvasAskFrameAi'),
  askFramePlaceholder: t('home.sidePanel.canvasAskFramePlaceholder'),
  askFrameSend: t('home.sidePanel.canvasAskFrameSend'),
  historyToggle: t('home.sidePanel.canvasHistoryToggle'),
  historyEmpty: t('home.sidePanel.canvasHistoryEmpty'),
  historySaveSnapshot: t('home.sidePanel.canvasHistorySaveSnapshot'),
  historySnapshotDefault: t('home.sidePanel.canvasHistorySnapshotDefault'),
  historyUndo: t('home.sidePanel.canvasHistoryUndo'),
  historyRedo: t('home.sidePanel.canvasHistoryRedo'),
  historyPeek: t('home.sidePanel.canvasHistoryPeek'),
  historyExitPeek: t('home.sidePanel.canvasHistoryExitPeek'),
  historyRestore: t('home.sidePanel.canvasHistoryRestore'),
  compareToggle: t('home.sidePanel.canvasCompareToggle'),
  compareExit: t('home.sidePanel.canvasCompareExit'),
  compareBefore: t('home.sidePanel.canvasCompareBefore'),
  compareAfter: t('home.sidePanel.canvasCompareAfter'),
  compareSelectSnapshot: t('home.sidePanel.canvasCompareSelectSnapshot'),
  compareNoEarlierSnapshot: t('home.sidePanel.canvasCompareNoEarlierSnapshot'),
  emptyTitle: t('home.sidePanel.canvasEmptyTitle'),
  emptyDescription: t('home.sidePanel.canvasEmptyDescription'),
  emptyAddPhone: t('home.sidePanel.canvasEmptyAddPhone'),
  emptyAddDesktop: t('home.sidePanel.canvasEmptyAddDesktop'),
  moreActions: t('home.sidePanel.moreActions'),
  mockupExport: t('home.sidePanel.canvasMockupExport'),
  mockupDialogTitle: t('home.sidePanel.canvasMockupDialogTitle'),
  mockupClose: t('home.sidePanel.canvasMockupClose'),
  mockupFramesSection: t('home.sidePanel.canvasMockupFramesSection'),
  mockupSelectAll: t('home.sidePanel.canvasMockupSelectAll'),
  mockupSelectNone: t('home.sidePanel.canvasMockupSelectNone'),
  mockupBackdropSection: t('home.sidePanel.canvasMockupBackdropSection'),
  mockupBackdropObsidian: t('home.sidePanel.canvasMockupBackdropObsidian'),
  mockupBackdropStudio: t('home.sidePanel.canvasMockupBackdropStudio'),
  mockupBackdropSlate: t('home.sidePanel.canvasMockupBackdropSlate'),
  mockupBackdropTransparent: t('home.sidePanel.canvasMockupBackdropTransparent'),
  mockupLayoutSection: t('home.sidePanel.canvasMockupLayoutSection'),
  mockupPerPage: t('home.sidePanel.canvasMockupPerPage'),
  mockupScale: t('home.sidePanel.canvasMockupScale'),
  mockupBezelWidth: t('home.sidePanel.canvasMockupBezelWidth'),
  mockupCornerRadius: t('home.sidePanel.canvasMockupCornerRadius'),
  mockupShadow: t('home.sidePanel.canvasMockupShadow'),
  mockupBrand: t('home.sidePanel.canvasMockupBrand'),
  mockupShowTitles: t('home.sidePanel.canvasMockupShowTitles'),
  mockupPage: t('home.sidePanel.canvasMockupPage'),
  mockupPrevPage: t('home.sidePanel.canvasMockupPrevPage'),
  mockupNextPage: t('home.sidePanel.canvasMockupNextPage'),
  mockupEmptySelection: t('home.sidePanel.canvasMockupEmptySelection'),
  mockupExportSvg: t('home.sidePanel.canvasMockupExportSvg'),
  mockupExportPng: t('home.sidePanel.canvasMockupExportPng'),
  mockupExportPrintHtml: t('home.sidePanel.canvasMockupExportPrintHtml'),
  mockupExporting: t('home.sidePanel.canvasMockupExporting'),
  mockupExportFailed: t('home.sidePanel.canvasMockupExportFailed'),
  mockupExportPngFailed: t('home.sidePanel.canvasMockupExportPngFailed')
}))

function formatPresetOptionLabel(preset: DevicePreset): string {
  return isResponsivePreset(preset) ? t('home.sidePanel.deviceResponsive') : preset.name
}

function formatPresetOptionDims(preset: DevicePreset): string {
  if (isResponsivePreset(preset)) return '1024×720'
  const dims = resolveDeviceDimensions(preset, 'portrait')
  return `${dims.width}×${dims.height}`
}

function addBlankFrame(payload: TdsCanvasAddFramePayload): void {
  const preset = getDevicePresetById(payload.deviceId)
  const kind: TdsCanvasFrameKind = payload.kind === 'svg' ? 'svg' : 'html'
  manualFrameSeq += 1
  const id = `canvas-frame-${Date.now().toString(36)}-${manualFrameSeq}`
  const deviceLabel = formatPresetOptionLabel(preset)
  const title =
    payload.title.trim() || t('home.sidePanel.canvasBlankStarterTitle', { device: deviceLabel })
  const pos = computeNextFramePosition(frames.value)
  const nextFrame: TdsCanvasFrame = {
    id,
    title,
    kind,
    source: buildStarterFrameSource(title, kind, preset),
    deviceId: preset.id,
    showShell: !isResponsivePreset(preset),
    x: pos.x,
    y: pos.y,
    ...(isResponsivePreset(preset) ? { width: 1024, height: 720 } : {})
  }
  frames.value = [...frames.value, nextFrame]
  selectedFrameId.value = nextFrame.id
  addMenuOpen.value = false
}

function addPresetFrame(preset: DevicePreset): void {
  addBlankFrame({
    deviceId: preset.id,
    kind: 'html',
    title: t('home.sidePanel.canvasBlankStarterTitle', {
      device: formatPresetOptionLabel(preset)
    })
  })
}

function handleDeleteFrame(frameId: string): void {
  const target = frames.value.find((frame) => frame.id === frameId)
  if (target && target.sourceRef?.startsWith('message:')) {
    if (!deletedAutoFrameIds.value.includes(frameId)) {
      deletedAutoFrameIds.value = [...deletedAutoFrameIds.value, frameId]
    }
  }
  frames.value = frames.value.filter((frame) => frame.id !== frameId)
  notes.value = notes.value.filter((note) => note.frameId !== frameId)
  if (selectedFrameId.value === frameId) {
    selectedFrameId.value = frames.value[0]?.id ?? null
  }
}

function handleUpdateFrames(nextFrames: TdsCanvasFrame[]): void {
  frames.value = nextFrames
  if (selectedFrameId.value && !nextFrames.some((frame) => frame.id === selectedFrameId.value)) {
    selectedFrameId.value = nextFrames[0]?.id ?? null
  }
}

function handleUpdateNotes(nextNotes: TdsCanvasNote[]): void {
  notes.value = nextNotes
}

function handleUpdateHistory(nextHistory: TdsCanvasHistoryState): void {
  historyState.value = nextHistory
}

function handleSelectFrame(frameId: string | null): void {
  selectedFrameId.value = frameId
}

function handleOpenLint(frameId: string): void {
  selectedFrameId.value = frameId
  lintOpen.value = true
}

function handleSyncFromChat(): void {
  const extracted = collectConversationFrames(props.messages)
  if (extracted.length === 0) {
    toast.info(t('home.sidePanel.canvasSyncNone'))
    return
  }
  const added = reconcileConversationFrames(props.messages, { includePreviouslyDeleted: true })
  toast.success(t('home.sidePanel.canvasSyncDone', { count: added || extracted.length }))
}

async function dispatchAiAction(payload: {
  filePath: string
  displayPath: string
  selectedText: string
  prompt: string
}): Promise<boolean> {
  if (!props.aiActionsEnabled || sendingAiAction.value) return false
  const cleanPrompt = payload.prompt.trim()
  if (!cleanPrompt) return false
  sendingAiAction.value = true
  let settled: Promise<boolean> | null = null
  try {
    emit('ai-action', {
      mode: 'send',
      filePath: payload.filePath,
      displayPath: payload.displayPath,
      selectedText: payload.selectedText,
      prompt: cleanPrompt,
      settle: (result) => {
        settled = Promise.resolve(result)
      }
    })
    const accepted = settled ? await settled : true
    if (accepted) {
      toast.success(t('home.sidePanel.canvasSentToAi'))
    }
    return accepted
  } catch {
    return false
  } finally {
    sendingAiAction.value = false
  }
}

async function handleSendLintToAi(payload: {
  prompt: string
  issues: TdsLintIssue[]
}): Promise<void> {
  const frame = inspectedFrame.value
  const displayPath = frame?.title || t('home.sidePanel.canvas')
  const filePath = frame?.sourceRef || (frame ? `canvas://${frame.id}` : 'canvas://design')
  const selectedText = payload.issues
    .map((issue) => `[${issue.severity}] ${issue.ruleId}: ${issue.message}`)
    .join('\n')
  const accepted = await dispatchAiAction({
    filePath,
    displayPath,
    selectedText,
    prompt: payload.prompt
  })
  if (accepted) {
    lintOpen.value = false
  }
}

async function handleSendNotesToAi(payload: TdsCanvasSendNotesPayload): Promise<void> {
  if (!payload.prompt.trim()) return
  const sentIds = new Set(payload.noteIds)
  const noteTexts = notes.value
    .filter((note) => sentIds.has(note.id))
    .map((note) => note.text.trim())
    .filter(Boolean)
    .join('\n')

  const accepted = await dispatchAiAction({
    filePath: `canvas://${canvasSessionKey.value}`,
    displayPath: t('home.sidePanel.canvas'),
    selectedText: noteTexts || payload.prompt,
    prompt: payload.prompt
  })
  if (accepted && sentIds.size > 0) {
    notes.value = notes.value.map((note) =>
      sentIds.has(note.id) ? { ...note, resolved: true } : note
    )
  }
}

async function handleSendPendingNotesBar(): Promise<void> {
  const formatted = formatNotesForAiPrompt(notes.value, frames.value)
  if (!formatted.prompt) return
  await handleSendNotesToAi(formatted)
}

async function handleAskFrameAi(payload: TdsCanvasAskFramePayload): Promise<void> {
  const frame = frames.value.find((item) => item.id === payload.frameId)
  const instruction = payload.prompt.trim()
  if (!instruction) return
  const title = frame?.title || payload.frameId
  const formattedPrompt = frame ? `[${title} (${frame.deviceId})]\n${instruction}` : instruction
  await dispatchAiAction({
    filePath: frame?.sourceRef || `canvas://${payload.frameId}`,
    displayPath: title,
    selectedText: instruction,
    prompt: formattedPrompt
  })
}
</script>

<template>
  <section
    class="HomeSideCanvasPane"
    :aria-label="t('home.sidePanel.canvas')"
    data-testid="home-side-canvas-pane"
  >
    <div class="HomeSideCanvasPane-Stage">
      <TdsDesignCanvas
        :key="canvasSessionKey"
        :frames="frames"
        :notes="notes"
        :selected-frame-id="selectedFrameId"
        :labels="canvasLabels"
        :ai-actions-enabled="aiActionsEnabled"
        :lint-counts="lintCounts"
        :initial-history="historyState"
        :theme-css="canvasThemeCss"
        :canvas-pattern="canvasPattern"
        :frame-bitmaps="frameBitmaps"
        @update:frames="handleUpdateFrames"
        @update:notes="handleUpdateNotes"
        @update:history="handleUpdateHistory"
        @select-frame="handleSelectFrame"
        @add-frame="addBlankFrame"
        @delete-frame="handleDeleteFrame"
        @open-lint="handleOpenLint"
        @send-notes-to-ai="handleSendNotesToAi"
        @ask-frame-ai="handleAskFrameAi"
      >
        <template #status-left>
          <TxPopover
            v-model="themeMenuOpen"
            trigger="click"
            placement="top-start"
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
                class="HomeSideCanvasPane-StatusBtn HomeSideCanvasPane-ThemeTrigger"
                :aria-expanded="themeMenuOpen"
                :aria-label="t('home.sidePanel.canvasThemeTitle')"
                :title="t('home.sidePanel.canvasThemeTitle')"
                data-testid="canvas-theme-pack-trigger"
              >
                <span
                  class="HomeSideCanvasPane-ThemeTriggerDot"
                  :style="{ backgroundColor: selectedCanvasPackAccentColor }"
                  aria-hidden="true"
                />
                <span class="i-ri-palette-line" aria-hidden="true" />
                <span class="HomeSideCanvasPane-ThemeTriggerLabel">
                  {{ resolvePackDisplayName(selectedCanvasPack) }}
                </span>
              </button>
            </template>

            <div class="HomeSideCanvasPane-ThemeMenu" data-testid="canvas-theme-pack-popover">
              <div class="HomeSideCanvasPane-ThemeHeader">
                <div class="HomeSideCanvasPane-ThemeHeaderRow">
                  <span class="HomeSideCanvasPane-ThemeTitle">
                    {{ t('home.sidePanel.canvasThemeTitle') }}
                  </span>
                  <span class="HomeSideCanvasPane-ThemeScopeTag">
                    {{
                      canvasThemePackId
                        ? t('home.sidePanel.canvasThemePreviewing')
                        : t('home.sidePanel.canvasThemeFollowApp')
                    }}
                  </span>
                </div>
                <p class="HomeSideCanvasPane-ThemeHint">
                  {{ t('home.sidePanel.canvasThemeHint') }}
                </p>
              </div>

              <div
                class="HomeSideCanvasPane-ThemeList"
                role="listbox"
                :aria-label="t('home.sidePanel.canvasThemeLabel')"
              >
                <button
                  v-for="pack in themePacks"
                  :key="pack.meta.id"
                  type="button"
                  role="option"
                  class="HomeSideCanvasPane-ThemeOption"
                  :class="{ 'is-selected': selectedCanvasPack.meta.id === pack.meta.id }"
                  :aria-selected="selectedCanvasPack.meta.id === pack.meta.id"
                  :data-testid="`canvas-theme-pack-option-${pack.meta.id}`"
                  @click="handleSelectCanvasPack(pack)"
                >
                  <span class="HomeSideCanvasPane-ThemeSwatches" aria-hidden="true">
                    <span
                      v-for="(color, idx) in getPackSwatchColors(pack)"
                      :key="idx"
                      class="HomeSideCanvasPane-ThemeSwatchDot"
                      :style="{ backgroundColor: color }"
                    />
                  </span>
                  <span class="HomeSideCanvasPane-ThemeMeta">
                    <span class="HomeSideCanvasPane-ThemeNameRow">
                      <span class="HomeSideCanvasPane-ThemeName">
                        {{ resolvePackDisplayName(pack) }}
                      </span>
                      <span
                        v-if="appActiveThemePackId === pack.meta.id"
                        class="HomeSideCanvasPane-ThemeAppTag"
                      >
                        {{ t('home.sidePanel.canvasThemeAppActive') }}
                      </span>
                    </span>
                    <span class="HomeSideCanvasPane-ThemePattern">
                      {{ resolvePatternLabel(pack.surface?.canvasPattern) }}
                    </span>
                  </span>
                  <span
                    v-if="selectedCanvasPack.meta.id === pack.meta.id"
                    class="i-ri-check-line HomeSideCanvasPane-ThemeCheck"
                    aria-hidden="true"
                  />
                </button>
              </div>

              <div class="HomeSideCanvasPane-ThemeFooter">
                <button
                  v-if="canvasThemePackId !== null"
                  type="button"
                  class="HomeSideCanvasPane-ThemeFooterGhost"
                  data-testid="canvas-theme-follow-app"
                  @click="handleFollowAppThemePack"
                >
                  {{ t('home.sidePanel.canvasThemeFollowApp') }}
                </button>
                <button
                  type="button"
                  class="HomeSideCanvasPane-ActionBtn HomeSideCanvasPane-ThemeApplyBtn"
                  :disabled="!isCanvasPackDifferentFromApp"
                  data-testid="canvas-theme-apply-to-app"
                  @click="handleApplyPackToApp(selectedCanvasPack)"
                >
                  <span class="i-ri-window-line" aria-hidden="true" />
                  <span>{{ t('home.sidePanel.canvasThemeApplyToApp') }}</span>
                </button>
              </div>
            </div>
          </TxPopover>

          <TdsLintPopover
            v-if="inspectedFrame"
            v-model:open="lintOpen"
            v-model:anti-slop="antiSlopEnabled"
            :issues="inspectedLintIssues"
            :display-path="inspectedFrame.title"
            :ai-actions-enabled="aiActionsEnabled"
            :sending="sendingAiAction"
            placement="top-start"
            @send-to-ai="handleSendLintToAi"
          />

          <span
            v-if="inspectedFrame"
            class="HomeSideCanvasPane-ActiveTitle"
            :title="inspectedFrame.title"
            data-testid="canvas-active-frame-title"
          >
            {{ inspectedFrame.title }}
          </span>
        </template>

        <template #status-pending-notes>
          <button
            v-if="aiActionsEnabled && pendingNotes.length > 0"
            type="button"
            class="HomeSideCanvasPane-StatusBtn HomeSideCanvasPane-StatusBtn--primary"
            :disabled="sendingAiAction"
            data-testid="canvas-send-notes-bar"
            @click="handleSendPendingNotesBar"
          >
            <span class="i-ri-sparkling-line" aria-hidden="true" />
            <span>{{ t('home.sidePanel.canvasSendNotesToAi') }}</span>
            <span class="HomeSideCanvasPane-Badge">{{ pendingNotes.length }}</span>
          </button>
        </template>

        <template #status-add>
          <TxPopover
            v-model="addMenuOpen"
            trigger="click"
            placement="top-end"
            :offset="6"
            :match-reference-width="false"
            :min-width="264"
            :panel-radius="12"
            :panel-padding="8"
            :panel-card="SHELL_MENU_CARD"
            panel-background="refraction"
          >
            <template #reference>
              <button
                type="button"
                class="HomeSideCanvasPane-StatusBtn"
                :class="{ 'is-active': addMenuOpen }"
                :aria-expanded="addMenuOpen"
                data-testid="canvas-add-frame-trigger"
              >
                <span class="i-ri-add-line" aria-hidden="true" />
                <span>{{ t('home.sidePanel.canvasAddFrame') }}</span>
              </button>
            </template>

            <div class="HomeSideCanvasPane-PresetMenu" data-testid="canvas-preset-popover">
              <label class="HomeSideCanvasPane-PresetSearch">
                <span class="i-ri-search-line HomeSideCanvasPane-SearchIcon" aria-hidden="true" />
                <input
                  v-model="presetQuery"
                  type="text"
                  class="HomeSideCanvasPane-SearchInput"
                  :placeholder="t('home.sidePanel.canvasPresetSearch')"
                  :aria-label="t('home.sidePanel.canvasPresetSearch')"
                  data-testid="canvas-preset-search"
                />
              </label>

              <div class="HomeSideCanvasPane-PresetCats" role="tablist">
                <button
                  v-for="cat in presetCategories"
                  :key="cat.id"
                  type="button"
                  role="tab"
                  class="HomeSideCanvasPane-CatChip"
                  :class="{ 'is-active': presetCategory === cat.id }"
                  :aria-selected="presetCategory === cat.id"
                  @click="presetCategory = cat.id"
                >
                  {{ cat.label }}
                </button>
              </div>

              <div class="HomeSideCanvasPane-PresetList">
                <button
                  v-for="preset in filteredPresets"
                  :key="preset.id"
                  type="button"
                  class="HomeSideCanvasPane-PresetOption"
                  :class="{
                    'is-featured': (QUICK_PRESET_IDS as readonly string[]).includes(preset.id)
                  }"
                  :data-testid="`canvas-preset-option-${preset.id}`"
                  @click="addPresetFrame(preset)"
                >
                  <span
                    :class="getDeviceCategoryIcon(preset.category)"
                    class="HomeSideCanvasPane-PresetIcon"
                    aria-hidden="true"
                  />
                  <span class="HomeSideCanvasPane-PresetName">
                    {{ formatPresetOptionLabel(preset) }}
                  </span>
                  <span class="HomeSideCanvasPane-PresetDims">
                    {{ formatPresetOptionDims(preset) }}
                  </span>
                </button>

                <p v-if="filteredPresets.length === 0" class="HomeSideCanvasPane-PresetEmpty">
                  {{ t('home.sidePanel.canvasPresetEmpty') }}
                </p>
              </div>
            </div>
          </TxPopover>
        </template>

        <template #status-more-items="{ close }">
          <button
            type="button"
            role="menuitem"
            class="HomeSideCanvasPane-MoreItem"
            data-testid="canvas-sync-messages"
            @click="
              handleSyncFromChat();
              close()
            "
          >
            <span class="i-ri-refresh-line" aria-hidden="true" />
            <span>{{ t('home.sidePanel.canvasSyncMessages') }}</span>
          </button>
        </template>
      </TdsDesignCanvas>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.HomeSideCanvasPane {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--shell-bg);
  color: var(--shell-text-primary);
}

.HomeSideCanvasPane-StatusBtn {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  line-height: 1;
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
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }

  &--primary {
    background: var(--shell-primary);
    color: var(--shell-on-primary);

    &:hover:not(:disabled) {
      background: var(--shell-primary);
      color: var(--shell-on-primary);
      filter: brightness(1.06);
    }
  }
}

.HomeSideCanvasPane-MoreItem {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: -1px;
  }
}

.HomeSideCanvasPane-ActionBtn {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }

  &--primary {
    background: var(--shell-primary);
    color: var(--shell-on-primary);
    box-shadow: none;

    &:hover:not(:disabled) {
      background: var(--shell-primary);
      color: var(--shell-on-primary);
      filter: brightness(1.06);
    }
  }
}

.HomeSideCanvasPane-Badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: var(--shell-radius-full);
  background: color-mix(in srgb, var(--shell-on-primary) 22%, transparent);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.HomeSideCanvasPane-IconBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }
}

.HomeSideCanvasPane-ActiveTitle {
  overflow: hidden;
  max-width: 160px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideCanvasPane-Stage {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.HomeSideCanvasPane-PresetMenu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 264px;
  color: var(--shell-text-primary);
}

.HomeSideCanvasPane-PresetSearch {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 30px;
  padding: 0 10px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-bg);
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--shell-primary);
  }
}

.HomeSideCanvasPane-SearchIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 14px;
}

.HomeSideCanvasPane-SearchInput {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSideCanvasPane-PresetCats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.HomeSideCanvasPane-CatChip {
  padding: 2px 7px;
  border: none;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover {
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }
}

.HomeSideCanvasPane-PresetList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 224px;
  overflow-y: auto;
}

.HomeSideCanvasPane-PresetOption {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
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

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: -1px;
  }
}

.HomeSideCanvasPane-PresetIcon {
  flex: none;
  color: var(--shell-text-secondary);
  font-size: 14px;
}

.HomeSideCanvasPane-PresetName {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideCanvasPane-PresetDims {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.HomeSideCanvasPane-PresetEmpty {
  margin: 0;
  padding: 10px 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  text-align: center;
}

.HomeSideCanvasPane-ThemeTrigger {
  max-width: 148px;
}

.HomeSideCanvasPane-ThemeTriggerDot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--shell-radius-full);
  box-shadow: inset 0 0 0 1px var(--shell-border-strong);
}

.HomeSideCanvasPane-ThemeTriggerLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideCanvasPane-ThemeMenu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 268px;
  color: var(--shell-text-primary);
}

.HomeSideCanvasPane-ThemeHeader {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 4px 0;
}

.HomeSideCanvasPane-ThemeHeaderRow {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
}

.HomeSideCanvasPane-ThemeTitle {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-semibold);
}

.HomeSideCanvasPane-ThemeScopeTag {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  color: var(--shell-text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.HomeSideCanvasPane-ThemeHint {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.4;
}

.HomeSideCanvasPane-ThemeList {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 220px;
  overflow-y: auto;
}

.HomeSideCanvasPane-ThemeOption {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
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

  &.is-selected {
    background: var(--shell-primary-soft);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: -1px;
  }
}

.HomeSideCanvasPane-ThemeSwatches {
  display: inline-flex;
  flex: none;
  gap: 3px;
  align-items: center;
}

.HomeSideCanvasPane-ThemeSwatchDot {
  width: 10px;
  height: 10px;
  border-radius: var(--shell-radius-full);
  box-shadow: inset 0 0 0 1px var(--shell-border-strong);
}

.HomeSideCanvasPane-ThemeMeta {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.HomeSideCanvasPane-ThemeNameRow {
  display: flex;
  gap: 5px;
  align-items: center;
  min-width: 0;
}

.HomeSideCanvasPane-ThemeName {
  overflow: hidden;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSideCanvasPane-ThemeAppTag {
  flex: none;
  padding: 0 5px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  color: var(--shell-text-regular);
  font-size: 11px;
  line-height: 1.45;
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.HomeSideCanvasPane-ThemePattern {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.3;
}

.HomeSideCanvasPane-ThemeCheck {
  flex: none;
  color: var(--shell-primary);
  font-size: 14px;
}

.HomeSideCanvasPane-ThemeFooter {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid var(--shell-border);
}

.HomeSideCanvasPane-ThemeFooterGhost {
  margin-right: auto;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }
}

.HomeSideCanvasPane-ThemeApplyBtn {
  flex: none;
}
</style>
