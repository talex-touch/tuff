<script lang="ts" name="WorkspaceFileViewer" setup>
import type { SelectionActionItem, SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import type { WorkspaceReadFileResult } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxMarkdownView } from '@talex-touch/tuffex/markdown-view'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { TxSelectionActions, useSelectionAnchor } from '@talex-touch/tuffex/selection-actions'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import { basenameOfPath } from '~/modules/browser-workspace/preview-url'
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
  type WorkspaceFileAiActionPayload
} from './workspace-file-tree'

const props = withDefaults(
  defineProps<{
    filePath: string
    displayPath?: string
    workspaceRoot?: string
    conversationId?: string | null
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

const { t } = useI18n()
const transport = isElectronRenderer() ? useTuffTransport() : null

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
 * prototypes (forms, inline scripts, dialogs) work cleanly.
 */
const sandboxedHtmlSrcdoc = computed(() => {
  const source = data.value?.text ?? ''
  if (!source) return ''
  const inner = isSvg.value
    ? `<!doctype html><meta charset="utf-8"><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff">${source}</body>`
    : source
  const csp =
    "default-src 'none'; frame-src about:; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
  const innerSandbox = isHtml.value ? 'allow-scripts allow-forms allow-modals' : ''
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}iframe{display:block;width:100%;height:100%;border:0}</style><iframe sandbox="${innerSandbox}" srcdoc="${escapeAttribute(inner)}"></iframe>`
})

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

// ── Markdown Selection Quick AI Actions & Comments ──────────────────────────────────
const markdownSelectionActive = computed(() =>
  Boolean(props.aiActionsEnabled && isMarkdown.value && viewMode.value === 'preview')
)

const { selection: mdSelection, clear: clearMdSelection } = useSelectionAnchor({
  root: markdownContainerRef,
  disabled: () => !markdownSelectionActive.value,
  ignore: () => {
    const node = extractDomNode(selectionBarRef.value)
    return node instanceof Element ? [node] : []
  },
  minLength: 2
})

const mdSelectionActions = computed<SelectionActionItem[]>(() => [
  { id: 'comment', label: t('home.sidePanel.selectionComment') },
  { id: 'explain', label: t('home.sidePanel.selectionExplain') },
  { id: 'improve', label: t('home.sidePanel.selectionImprove') },
  { id: 'quote', label: t('home.sidePanel.selectionQuote'), more: true },
  { id: 'translate', label: t('home.sidePanel.selectionTranslate'), more: true },
  { id: 'copy', label: t('home.copy'), more: true }
])

function dismissMdSelection(): void {
  clearMdSelection()
  selectionPrompt.value = ''
  window.getSelection()?.removeAllRanges()
}

watch(
  resolvedPath,
  (nextPath) => {
    comments.value = readSessionReviewComments(nextPath)
    commentComposerOpen.value = false
    commentDraftQuote.value = ''
    commentDraftText.value = ''
    commentsExpanded.value = false
    clearMdSelection()
    selectionPrompt.value = ''
  },
  { immediate: true }
)

watch(viewMode, () => {
  clearMdSelection()
  selectionPrompt.value = ''
  outlineOpen.value = false
})

async function dispatchAiAction(
  mode: 'send' | 'quote',
  selectedText: string,
  prompt: string
): Promise<boolean> {
  let settled: Promise<boolean> | null = null
  emit('ai-action', {
    mode,
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

  const instructionMap: Record<string, string> = {
    explain: t('home.sidePanel.selectionPromptExplain'),
    improve: t('home.sidePanel.selectionPromptImprove'),
    translate: t('home.sidePanel.selectionPromptTranslate')
  }
  const instruction = instructionMap[payload.id] ?? ''
  if (instruction) {
    const formatted = formatSingleSelectionPrompt({
      displayPath: displayPathForAi.value,
      selectedText,
      instruction
    })
    const accepted = await dispatchAiAction('send', selectedText, formatted)
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
  const formatted = formatSingleSelectionPrompt({
    displayPath: displayPathForAi.value,
    selectedText,
    instruction
  })
  const accepted = await dispatchAiAction('send', selectedText, formatted)
  if (accepted) dismissMdSelection()
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
  if (!mdSelection.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  const barNode = extractDomNode(selectionBarRef.value)
  if (barNode?.contains(target)) return
  dismissMdSelection()
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mdSelection.value) {
    dismissMdSelection()
  }
}

function onBodyScroll(): void {
  if (mdSelection.value) {
    selectionBarRef.value?.updatePosition?.()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeyDown)
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

async function loadFile(): Promise<void> {
  const target = props.filePath.trim()
  const generation = ++loadGeneration
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
    if (generation !== loadGeneration) return
    data.value = result
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

onBeforeUnmount(() => {
  loadGeneration += 1
  revokePdfUrl()
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeyDown)
})

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
  <div class="WorkspaceFileViewer" data-testid="workspace-file-viewer">
    <!-- Slim single-row action bar: view switch on left; ⋮ / ↻ / ≡ on right -->
    <header class="WorkspaceFileViewer-Header" data-testid="file-viewer-header">
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

        <div v-if="supportsPreviewToggle" class="WorkspaceFileViewer-Segment" role="group">
          <button
            type="button"
            class="WorkspaceFileViewer-SegBtn"
            :class="{ 'is-active': viewMode === 'preview' }"
            :aria-pressed="viewMode === 'preview'"
            data-testid="file-viewer-mode-preview"
            @click="viewMode = 'preview'"
          >
            {{ isJson ? t('home.sidePanel.formatted') : t('home.code.preview') }}
          </button>
          <button
            type="button"
            class="WorkspaceFileViewer-SegBtn"
            :class="{ 'is-active': viewMode === 'source' }"
            :aria-pressed="viewMode === 'source'"
            data-testid="file-viewer-mode-source"
            @click="viewMode = 'source'"
          >
            {{ isJson ? t('home.sidePanel.raw') : t('home.code.source') }}
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

      <div class="WorkspaceFileViewer-Toolbar">
        <TxDropdownMenu
          v-model="moreMenuOpen"
          placement="bottom-end"
          :min-width="200"
          :panel-card="SHELL_MENU_CARD"
          panel-background="refraction"
        >
          <template #trigger>
            <button
              type="button"
              class="WorkspaceFileViewer-ToolBtn"
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

        <button
          type="button"
          class="WorkspaceFileViewer-ToolBtn"
          :title="t('home.sidePanel.reload')"
          :aria-label="t('home.sidePanel.reload')"
          data-testid="file-viewer-refresh"
          @click="loadFile"
        >
          <span class="i-ri-refresh-line" aria-hidden="true" />
        </button>

        <TxPopover
          v-if="markdownHeadings.length > 0"
          v-model="outlineOpen"
          trigger="click"
          placement="bottom-end"
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
              class="WorkspaceFileViewer-ToolBtn"
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
      </div>
    </header>

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
          <TxButton size="sm" variant="secondary" @click="loadFile">
            {{ t('home.workspace.retry') }}
          </TxButton>
          <TxButton size="sm" variant="secondary" @click="revealInFolder">
            {{ t('home.fileLink.revealParentFolder') }}
          </TxButton>
        </div>
      </div>

      <template v-else-if="data">
        <!-- Directory browser -->
        <div v-if="data.kind === 'directory'" class="WorkspaceFileViewer-Dir">
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
        >
          <iframe
            class="WorkspaceFileViewer-Frame"
            :sandbox="isHtml ? 'allow-scripts allow-forms allow-modals' : ''"
            :title="fileName"
            :srcdoc="sandboxedHtmlSrcdoc"
          />
        </div>

        <!-- Rendered Markdown -->
        <div
          v-else-if="isMarkdown && viewMode === 'preview'"
          ref="markdownContainerRef"
          class="WorkspaceFileViewer-Markdown"
          data-testid="file-viewer-markdown"
        >
          <TxMarkdownView :content="data.text ?? ''" theme="auto" />
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
        <div v-else-if="data.kind === 'pdf' && pdfBlobUrl" class="WorkspaceFileViewer-FrameWrap">
          <iframe class="WorkspaceFileViewer-Frame" :src="pdfBlobUrl" :title="fileName" />
        </div>

        <!-- Binary fallback -->
        <div v-else-if="data.kind === 'binary'" class="WorkspaceFileViewer-State">
          <span class="i-ri-file-zip-line WorkspaceFileViewer-StateIcon" aria-hidden="true" />
          <p class="WorkspaceFileViewer-StateTitle">{{ t('home.sidePanel.binaryUnsupported') }}</p>
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
            {{ t('home.sidePanel.fileTruncated', { size: formatCompactFileSize(data.size) }) }}
          </div>
          <div class="WorkspaceFileViewer-CodeLines" role="region" :aria-label="fileName">
            <div
              v-for="(lineText, idx) in codeLines"
              :key="idx"
              :data-line="idx + 1"
              class="WorkspaceFileViewer-CodeLine"
              :class="{ 'is-highlighted': line === idx + 1 }"
            >
              <span class="WorkspaceFileViewer-LineNo" aria-hidden="true">{{ idx + 1 }}</span>
              <span class="WorkspaceFileViewer-LineText">{{ lineText || ' ' }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Inline Markdown Review Comment Composer (shown only when adding a comment) -->
    <section
      v-if="commentComposerOpen"
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

      <div class="WorkspaceFileViewer-StatusMeta" data-testid="file-viewer-status-meta">
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
    </footer>

    <!-- Floating Markdown Selection AI Actions Pill -->
    <TxSelectionActions
      v-if="markdownSelectionActive && mdSelection"
      ref="selectionBarRef"
      v-model:prompt="selectionPrompt"
      :selection="mdSelection"
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

.WorkspaceFileViewer-Segment {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
}

.WorkspaceFileViewer-SegBtn {
  padding: 3px 8px;
  border: none;
  border-radius: calc(var(--shell-radius-sm) - 2px);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  cursor: pointer;

  &.is-active {
    background: var(--shell-bg);
    color: var(--shell-text-primary);
    box-shadow: inset 0 0 0 1px var(--shell-border);
  }

  &:hover:not(.is-active) {
    color: var(--shell-text-primary);
  }
}

.WorkspaceFileViewer-ZoomInline {
  display: inline-flex;
  gap: 2px;
  align-items: center;
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

  &:hover,
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
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
  padding: 16px 20px 28px;
  line-height: 1.65;
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

/* ── Bottom StatusBar (Breadcrumb path + Type / Size / Lines) ── */
.WorkspaceFileViewer-StatusBar {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  height: 22px;
  padding: 0 8px;
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

.WorkspaceFileViewer-StatusMeta {
  display: inline-flex;
  flex: none;
  gap: 8px;
  align-items: center;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
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
</style>
