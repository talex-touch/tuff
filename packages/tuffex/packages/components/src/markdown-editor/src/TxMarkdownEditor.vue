<script setup lang="ts">
import type { Component, CSSProperties } from 'vue'
import type { MarkdownEmoji, MarkdownEmojiIndex } from './emoji'
import type { MarkdownEdit, MarkdownFormatAction } from './markdown-format'
import type { RichChangeKind, RichCommand, RichSurfaceHost } from './rich-surface'
import type SourceRuntime from './TxMarkdownSourceRuntime.vue'
import type {
  MarkdownEditorEmits,
  MarkdownEditorHighlightColor,
  MarkdownEditorLabels,
  MarkdownEditorMode,
  MarkdownEditorProps,
  MarkdownEditorSelection,
  MarkdownEditorToolbarActionKey,
  MarkdownTextChange,
} from './types'
import type { MarkdownCommit } from './use-markdown-document'
import type { MarkdownBox } from './use-markdown-overlay'
import { hasDocument } from '@talex-touch/utils/env'
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { TxBaseAnchor } from '../../base-anchor'
import { composeMarkdownEmoji, loadMarkdownEmoji, markdownEmojiText, peekMarkdownEmoji, rememberMarkdownEmoji } from './emoji'
import { formatMarkdown, markdownLinkAt } from './markdown-format'
import { markdownHighlightAt } from './markdown-highlight'
import { MarkdownRenderer } from './markdown-render'
import { codeSpanAt, sourceFormats, wordAt } from './markdown-selection'
import { markdownStats } from './markdown-stats'
import MarkdownEditorBubble from './MarkdownEditorBubble.vue'
import MarkdownEditorComments from './MarkdownEditorComments.vue'
import MarkdownEditorEmojiSuggest from './MarkdownEditorEmojiSuggest.vue'
import MarkdownEditorMarks from './MarkdownEditorMarks.vue'
import MarkdownEditorPrompt from './MarkdownEditorPrompt.vue'
import MarkdownEditorSlashMenu from './MarkdownEditorSlashMenu.vue'
import MarkdownEditorStatus from './MarkdownEditorStatus.vue'
import MarkdownEditorToolbar from './MarkdownEditorToolbar.vue'
import { RichSurface } from './rich-surface'
import { applyMarkdownChanges, composeMarkdownChanges, diffMarkdown } from './text-changes'
import { MARKDOWN_EDITOR_DEFAULT_LABELS } from './types'
import { useMarkdownBubble } from './use-markdown-bubble'
import { useMarkdownCodeHighlight } from './use-markdown-code-highlight'
import { useMarkdownCollaboration } from './use-markdown-collaboration'
import { useMarkdownComments } from './use-markdown-comments'
import { useMarkdownDocument } from './use-markdown-document'
import { boxIn, useMarkdownOverlay, virtualReference } from './use-markdown-overlay'
import { useMarkdownSlash } from './use-markdown-slash'
import { useMarkdownSuggest } from './use-markdown-suggest'
import { useMarkdownTheme } from './use-markdown-theme'
import { useMarkdownUploads } from './use-markdown-uploads'

/**
 * One Markdown document, three views of it: the rich surface (WYSIWYG), the
 * source (CodeMirror, loaded on first use) and the preview. Every edit, from
 * any view, a command, undo, an upload or a peer, is a change to the source
 * committed through `useMarkdownDocument`; only the active view is kept in
 * step, and a view catches up when it becomes active again.
 */

defineOptions({
  name: 'TxMarkdownEditor',
})

const props = withDefaults(defineProps<MarkdownEditorProps>(), {
  modelValue: '',
  placeholder: '',
  mode: undefined,
  defaultMode: 'wysiwyg',
  disabled: false,
  readonly: false,
  sanitize: true,
  theme: 'auto',
  toolbar: true,
  toolbarActions: undefined,
  minHeight: 220,
  maxHeight: undefined,
  ariaLabel: 'Markdown editor',
  linkPrompt: undefined,
  math: true,
  emoji: true,
  emojiPacks: undefined,
  highlight: true,
  callouts: true,
  codeTheme: 'github',
  slash: true,
  bubble: true,
  ai: undefined,
  uploadImage: undefined,
  comments: undefined,
  commentsOpen: undefined,
  user: undefined,
  collaboration: undefined,
  statusBar: true,
  labels: undefined,
})

const emit = defineEmits<MarkdownEditorEmits>()

const ALL_ACTIONS: MarkdownEditorToolbarActionKey[] = [
  'heading',
  'bold',
  'italic',
  'strike',
  'code',
  'highlight',
  'quote',
  'bulletList',
  'orderedList',
  'taskList',
  'link',
  'image',
  'table',
  'codeBlock',
  'math',
  'divider',
  'emoji',
  'undo',
  'redo',
]

type PromptKind = 'link' | 'image' | 'math' | 'comment'

interface PromptState {
  id: number
  kind: PromptKind
  value: string
  removable: boolean
  display?: boolean
  /** The selection is a slash command's `/query`: replaced, not the image's text. */
  replace?: boolean
}

interface ViewHandle {
  doc: () => string
  apply: (changes: MarkdownTextChange[], doc: string, selection?: MarkdownEditorSelection | null) => void
  getSelection: () => MarkdownEditorSelection | null
  setSelection: (selection: MarkdownEditorSelection) => void
  focus: () => void
  hasFocus: () => boolean
  flush: () => void
}

const labels = computed<MarkdownEditorLabels>(() => ({ ...MARKDOWN_EDITOR_DEFAULT_LABELS, ...props.labels }))

const internalMode = ref<MarkdownEditorMode>(props.mode ?? props.defaultMode)
const currentMode = computed<MarkdownEditorMode>(() => props.mode ?? internalMode.value)

const resolvedTheme = useMarkdownTheme(() => props.theme)

const canEdit = computed(() => !props.disabled && !props.readonly)
/** Formatting applies: an editable mode of an editable editor. */
const formatting = computed(() => canEdit.value && currentMode.value !== 'preview')
const commentsEnabled = computed(() => props.comments !== undefined)
const canUpload = computed(() => typeof props.uploadImage === 'function')
const user = computed(() => props.user ?? { id: 'local', name: labels.value.you })

const actions = computed(() => (props.toolbarActions?.length ? props.toolbarActions : ALL_ACTIONS)
  .filter(action => (action !== 'emoji' || props.emoji) && (action !== 'math' || props.math) && (action !== 'highlight' || props.highlight)))

const layerClass = computed(() => ['tx-markdown-editor-layer', `tx-markdown-editor-layer--${resolvedTheme.value}`])

const mainStyle = computed<CSSProperties>(() => ({
  minHeight: normalizeSize(props.minHeight),
  maxHeight: normalizeSize(props.maxHeight),
}))

function normalizeSize(value?: string | number): string | undefined {
  if (typeof value === 'number')
    return `${value}px`
  return value
}

const root = ref<HTMLElement | null>(null)
const richRoot = ref<HTMLElement | null>(null)
const previewRoot = ref<HTMLElement | null>(null)
const richPage = ref<HTMLElement | null>(null)
const sourcePage = ref<HTMLElement | null>(null)
const previewPage = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const toolbarRef = ref<InstanceType<typeof MarkdownEditorToolbar> | null>(null)
const promptAnchor = ref<InstanceType<typeof TxBaseAnchor> | null>(null)
const suggestAnchor = ref<InstanceType<typeof TxBaseAnchor> | null>(null)
const slashMenu = ref<InstanceType<typeof MarkdownEditorSlashMenu> | null>(null)
const bubbleRef = ref<InstanceType<typeof MarkdownEditorBubble> | null>(null)
const sourceComponent = shallowRef<Component | null>(null)
const sourceView = ref<InstanceType<typeof SourceRuntime> | null>(null)

const isFocused = ref(false)
const composing = ref(false)
const narrow = ref(false)
const hasRange = ref(false)
const pressed = shallowRef<ReadonlySet<string>>(new Set())
const assetsVersion = ref(0)

/** The view that shows the document now; null while the mode changes. */
let active: MarkdownEditorMode | null = null
let rich: RichSurface | null = null
let preview: RichSurface | null = null
let sourceWanted = false
let sourceReady = false
let pendingFocus = false
let unmounted = false

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

const documentState = useMarkdownDocument(props.modelValue ?? '', {
  applied: onApplied,
  sync: (changes, commit) => {
    if (active && commit.origin !== active)
      viewHandle(active)?.apply(changes, documentState.doc(), commit.selection)
  },
  send: changes => collab.send(changes),
  threads: next => emit('update:comments', next),
})
const { text, threads, canUndo, canRedo } = documentState
const isEmpty = computed(() => !text.value.trim())

const collab = useMarkdownCollaboration({
  collaboration: () => props.collaboration,
  onRemote: changes => documentState.commit({ changes, history: 'rebase' }),
  presence: () => ({
    selection: isFocused.value && currentMode.value !== 'preview' ? currentSelection() : null,
    mode: currentMode.value,
  }),
})
const { peers } = collab

const uploads = useMarkdownUploads({
  upload: () => props.uploadImage,
  labels: () => labels.value,
  doc: () => documentState.doc(),
  insert: (markdown, from, to) => applyFormat({ type: 'insert', text: markdown, block: true }, { anchor: from, head: to }),
  replace: change => documentState.commit({ changes: [change], history: 'rebase', send: true }),
  roots: () => [richRoot.value, previewRoot.value],
  onError: (error, file) => emit('upload-error', error, file),
})
const uploadSummary = uploads.summary

const { style: codeStyle } = useMarkdownCodeHighlight({
  roots: () => [richRoot.value, previewRoot.value],
  theme: () => resolvedTheme.value,
  codeTheme: () => props.codeTheme,
})

const overlay = useMarkdownOverlay({
  surface: () => (active === 'wysiwyg' ? rich : active === 'preview' ? preview : null),
  page: () => (active === 'wysiwyg' ? richPage.value : active === 'preview' ? previewPage.value : null),
  source: () => (active === 'source' ? sourceView.value : null),
  comments: () => comments.marks(),
  peers: () => collab.marks.value,
  marks: () => (active === 'wysiwyg' ? bubble.marks() : []),
})
const { under, carets } = overlay

// The sidebar is the host's once bound with `v-model:comments-open`, as the mode is with `v-model:mode`.
const internalSidebarOpen = ref(false)
const sidebarOpen = computed({
  get: () => props.commentsOpen ?? internalSidebarOpen.value,
  set: (open: boolean) => {
    if (open === sidebarOpen.value)
      return
    if (props.commentsOpen === undefined)
      internalSidebarOpen.value = open
    emit('update:commentsOpen', open)
  },
})

const comments = useMarkdownComments({
  enabled: () => commentsEnabled.value,
  locked: () => props.disabled,
  user: () => user.value,
  threads,
  setThreads: documentState.setThreads,
  doc: documentState.doc,
  pending: () => (prompt.value?.kind === 'comment' ? promptRange : null),
  sidebarOpen,
  reveal,
  events: {
    create: comment => emit('comment-create', comment),
    reply: (comment, reply) => emit('comment-reply', comment, reply),
    resolve: comment => emit('comment-resolve', comment),
    delete: comment => emit('comment-delete', comment),
  },
})
const { activeThread, openCount } = comments

const {
  suggest,
  open: suggestOpen,
  reference: suggestReference,
  close: closeSuggest,
  update: updateSuggest,
  keydown: suggestKeydown,
  pick: pickSuggestion,
  hover: hoverSuggestion,
} = useMarkdownSuggest({
  surface: () => (props.emoji && active === 'wysiwyg' && canEdit.value ? rich : null),
  page: () => richPage.value,
  track: documentState.track,
  untrack: documentState.untrack,
  load: loadEmoji,
  packs: () => props.emojiPacks,
  reposition: () => suggestAnchor.value?.updatePosition?.(),
})

const {
  slash,
  reference: slashReference,
  close: closeSlash,
  update: updateSlash,
  keydown: slashKeydown,
  pick: pickSlash,
  hover: hoverSlash,
} = useMarkdownSlash({
  surface: () => (props.slash && active === 'wysiwyg' && canEdit.value ? rich : null),
  page: () => richPage.value,
  labels: () => labels.value,
  actions: () => actions.value,
  callouts: () => props.callouts,
  doc: documentState.doc,
  track: documentState.track,
  untrack: documentState.untrack,
  commit: commitEdit,
  ask: (id, range) => (id === 'image' ? pickImage(range) : editMath(true, range)),
  reposition: () => slashMenu.value?.updatePosition(),
})

const bubble = useMarkdownBubble({
  surface: () => (props.bubble && active === 'wysiwyg' && !props.disabled ? rich : null),
  page: () => richPage.value,
  busy: () => !!(prompt.value || slash.value || suggest.value),
  boxes: () => under.value,
  ai: () => (canEdit.value ? props.ai : undefined),
  doc: documentState.doc,
  track: documentState.track,
  untrack: documentState.untrack,
  commit: commitEdit,
  restore: focusView,
  repaint: () => overlay.schedule(),
  onError: error => emit('ai-error', error),
})

function closeMenus(): void {
  closeSuggest()
  closeSlash()
  bubble.dismiss()
}

const stats = shallowRef(markdownStats(props.statusBar ? documentState.doc() : ''))
let statsTimer: ReturnType<typeof setTimeout> | null = null

function scheduleStats(): void {
  if (!props.statusBar || statsTimer)
    return
  statsTimer = setTimeout(() => {
    statsTimer = null
    stats.value = markdownStats(documentState.doc())
  }, 150)
}

function onApplied(changes: MarkdownTextChange[], commit: MarkdownCommit): void {
  collab.mapPeers(changes)
  uploads.prune(documentState.doc())
  if (commit.emit !== false) {
    const value = documentState.doc()
    emit('update:modelValue', value)
    emit('change', value)
  }
  if (changes.some(change => change.insert.includes(':')))
    loadEmoji()
  scheduleStats()
  overlay.schedule()
}

/** An edit a view made itself, already showing in it. */
function reportEdit(
  origin: MarkdownEditorMode,
  changes: MarkdownTextChange[],
  before: MarkdownEditorSelection | null,
  after: MarkdownEditorSelection | null,
  kind: RichChangeKind,
): void {
  documentState.commit({
    changes,
    history: 'record',
    before,
    after,
    group: kind === 'input' ? 'input' : null,
    origin,
    send: true,
  })
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const emojiBase = shallowRef<MarkdownEmojiIndex | null>(peekMarkdownEmoji())
const emojiIndex = computed(() => (props.emoji && emojiBase.value ? composeMarkdownEmoji(emojiBase.value, props.emojiPacks) : null))

let renderer = createRenderer()

function createRenderer(): MarkdownRenderer {
  const next = new MarkdownRenderer({ math: props.math, emoji: props.emoji, highlight: props.highlight, callouts: props.callouts, sanitize: props.sanitize })
  next.setLabels(labels.value)
  next.setEmoji(emojiIndex.value?.byName ?? null)
  next.onAssetsReady = refreshAssets
  return next
}

function refreshAssets(): void {
  rich?.refreshAssets()
  preview?.refreshAssets()
  assetsVersion.value++
  overlay.schedule()
}

function surfaceHost(key: 'wysiwyg' | 'preview'): RichSurfaceHost {
  return {
    onChange: (changes, before, after, kind) => reportEdit(key, changes, before, after, kind),
    onCommand: command => runCommand(command),
    onSelectionChange: () => onSelection(key),
    onFiles: (files, at) => uploads.start(files, at),
    onAtom: (atom, from, to) => editFormula(atom, from, to),
    onKeydown: event => key === 'wysiwyg' && (suggestKeydown(event) || slashKeydown(event) || bubble.keydown(event)),
    onTyped: () => {
      if (key === 'wysiwyg') {
        updateSuggest(true)
        updateSlash(true)
      }
    },
  }
}

function createSurface(key: 'wysiwyg' | 'preview'): RichSurface | null {
  const element = key === 'wysiwyg' ? richRoot.value : previewRoot.value
  if (!element)
    return null
  const surface = new RichSurface(element, renderer, surfaceHost(key), {
    math: props.math,
    highlight: props.highlight,
    callouts: props.callouts,
    emoji: () => emojiIndex.value?.byName ?? null,
    decorateUpload: uploads.decorate,
  })
  surface.setEditable(key === 'wysiwyg' && canEdit.value, canEdit.value)
  surface.setDoc(documentState.doc())
  return surface
}

function ensureView(key: MarkdownEditorMode): void {
  if (key === 'wysiwyg')
    rich ??= createSurface('wysiwyg')
  else if (key === 'preview')
    preview ??= createSurface('preview')
  else if (!sourceWanted) {
    sourceWanted = true
    import('./TxMarkdownSourceRuntime.vue')
      .then((mod) => {
        if (!unmounted)
          sourceComponent.value = markRaw(mod.default)
      })
      .catch(() => {
        // The source stays as read-only text; the next activation retries.
        sourceWanted = false
      })
  }
}

function viewHandle(key: MarkdownEditorMode): ViewHandle | null {
  if (key === 'source') {
    const source = sourceReady ? sourceView.value : null
    return source && {
      doc: () => source.getDoc(),
      apply: (changes, doc, selection) => source.applyChanges(changes, doc, selection),
      getSelection: () => source.getSelection(),
      setSelection: selection => source.setSelection(selection),
      focus: () => source.focus(),
      hasFocus: () => source.hasFocus(),
      flush: () => {},
    }
  }
  const surface = key === 'wysiwyg' ? rich : preview
  return surface && {
    doc: () => surface.doc,
    apply: (changes, doc, selection) => surface.applyChanges(changes, doc, selection),
    getSelection: () => surface.getSelection(),
    setSelection: selection => surface.setSelection(selection),
    focus: () => surface.focus(),
    hasFocus: () => surface.hasFocus(),
    flush: () => surface.flush(),
  }
}

function flushActive(): void {
  if (active)
    viewHandle(active)?.flush()
}

function activate(key: MarkdownEditorMode, focus: boolean): void {
  if (unmounted || currentMode.value !== key)
    return
  ensureView(key)
  if (key === 'source' && !sourceReady) {
    pendingFocus = focus
    return
  }
  finishActivation(key, focus)
}

function finishActivation(key: MarkdownEditorMode, focus: boolean): void {
  const view = viewHandle(key)
  if (!view || currentMode.value !== key)
    return
  // Inactive views are not kept in step: bring this one up to date.
  const doc = documentState.doc()
  const change = diffMarkdown(view.doc(), doc)
  if (change)
    view.apply([change], doc)
  active = key
  if (focus)
    focusView(lastSelection())
  refreshPressed()
  overlay.schedule()
  collab.presenceChanged()
}

function onSourceReady(): void {
  sourceReady = true
  void nextTick(() => {
    if (currentMode.value === 'source' && active === null)
      finishActivation('source', pendingFocus)
    pendingFocus = false
  })
}

function setMode(next: MarkdownEditorMode): void {
  if (props.disabled || currentMode.value === next)
    return
  if (props.mode === undefined)
    internalMode.value = next
  emit('update:mode', next)
  emit('mode-change', next)
}

watch(currentMode, (next) => {
  const view = active ? viewHandle(active) : null
  const focused = !!view?.hasFocus()
  if (view) {
    view.flush()
    const selection = view.getSelection()
    if (selection)
      remember(selection)
  }
  documentState.seal()
  closePrompt(false)
  closeMenus()
  overlay.clear()
  active = null
  hasRange.value = false
  collab.presenceChanged()
  void nextTick(() => activate(next, focused))
})

watch(canEdit, (editable) => {
  rich?.setEditable(editable, editable)
  preview?.setEditable(false, editable)
  if (!editable) {
    closeMenus()
    if (prompt.value?.kind !== 'comment' || props.disabled)
      closePrompt(false)
  }
})

watch(() => [props.math, props.emoji, props.highlight, props.callouts, props.sanitize], () => {
  flushActive()
  const hadRich = !!rich
  const hadPreview = !!preview
  rich?.destroy()
  preview?.destroy()
  rich = preview = null
  if (richRoot.value)
    richRoot.value.innerHTML = ''
  if (previewRoot.value)
    previewRoot.value.innerHTML = ''
  renderer = createRenderer()
  if (hadRich)
    rich = createSurface('wysiwyg')
  if (hadPreview)
    preview = createSurface('preview')
  closeMenus()
  maybeLoadEmoji()
  overlay.schedule()
})

watch(emojiIndex, (index) => {
  renderer.setEmoji(index?.byName ?? null)
  refreshAssets()
})

watch(labels, (value) => {
  if (renderer.setLabels(value))
    refreshAssets()
})

watch(() => props.modelValue, (value) => {
  const next = value ?? ''
  if (next === documentState.doc())
    return
  flushActive()
  // The parent's value, not an edit: peers are not sent it.
  documentState.replace(next, { emit: false })
})

watch(() => props.comments, next => documentState.loadThreads(next ?? []), { immediate: true })

watch(() => props.statusBar, (shown) => {
  if (shown)
    stats.value = markdownStats(documentState.doc())
})

watch([threads, activeThread, () => collab.marks.value], () => overlay.schedule())

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** The last selection of any view, mapped through every change since. */
const last = documentState.track({ anchor: 0, head: 0 })
let hasLast = false

function remember(selection: MarkdownEditorSelection): void {
  last.anchor = selection.anchor
  last.head = selection.head
  hasLast = true
}

function lastSelection(): MarkdownEditorSelection | null {
  return hasLast ? { anchor: last.anchor, head: last.head } : null
}

function currentSelection(): MarkdownEditorSelection | null {
  return (active ? viewHandle(active)?.getSelection() : null) ?? lastSelection()
}

function selectionForEdit(): MarkdownEditorSelection {
  const end = documentState.doc().length
  return currentSelection() ?? { anchor: end, head: end }
}

function clampSelection(selection: MarkdownEditorSelection): MarkdownEditorSelection {
  const length = documentState.doc().length
  const clamp = (pos: number) => Math.max(0, Math.min(length, Math.round(pos) || 0))
  return { anchor: clamp(selection.anchor), head: clamp(selection.head) }
}

function onSelection(key: MarkdownEditorMode): void {
  if (key !== active)
    return
  const selection = viewHandle(key)?.getSelection() ?? null
  if (selection) {
    remember(selection)
    comments.followCaret(selection)
  }
  hasRange.value = !!selection && selection.anchor !== selection.head
  refreshPressed(selection)
  collab.presenceChanged()
  if (suggest.value)
    updateSuggest(false)
  if (slash.value)
    updateSlash(false)
  bubble.update()
  // Markdown revealed at the caret moves the text: highlights and carets follow it.
  if (under.value.length || carets.value.length)
    overlay.schedule()
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(item => b.has(item))
}

function refreshPressed(selection = currentSelection()): void {
  let next = new Set<string>()
  if (active === 'wysiwyg' && rich)
    next = rich.activeFormats()
  else if (active === 'source' && selection)
    next = sourceFormats(documentState.doc(), selection)
  if (!sameSet(next, pressed.value))
    pressed.value = next
}

function focusView(selection: MarkdownEditorSelection | null): void {
  const view = active ? viewHandle(active) : null
  if (!view)
    return
  if (!view.hasFocus())
    view.focus()
  if (selection) {
    view.setSelection(selection)
    remember(selection)
  }
}

function caret(pos: number): MarkdownEditorSelection {
  return { anchor: pos, head: pos }
}

function reveal(pos: number): void {
  if (active === 'source') {
    sourceView.value?.scrollToPos(pos)
    return
  }
  const surface = active === 'wysiwyg' ? rich : active === 'preview' ? preview : null
  surface?.view.sourceToDom(pos).item?.el.scrollIntoView?.({ block: 'nearest' })
}

function activePage(): HTMLElement | null {
  const mode = currentMode.value
  return mode === 'wysiwyg' ? richPage.value : mode === 'source' ? sourcePage.value : previewPage.value
}

function selectionRect(): { left: number, top: number, right: number, bottom: number } | null {
  if (active === 'source')
    return sourceView.value?.selectionRect() ?? null
  const surface = active === 'wysiwyg' ? rich : active === 'preview' ? preview : null
  return surface?.selectionRect() ?? null
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function applyFormat(action: MarkdownFormatAction, selection = selectionForEdit()): boolean {
  const doc = documentState.doc()
  // In the empty paragraph Enter made, its line first.
  const open = active === 'wysiwyg' ? rich?.openLine(selection) : null
  const changes = open?.changes ?? []
  const edit = formatMarkdown(applyMarkdownChanges(doc, changes), open ? caret(open.caret) : selection, action)
  if (edit)
    commitEdit(open ? { changes: composeMarkdownChanges(changes, edit.changes, doc.length), selection: edit.selection } : edit, selection)
  return !!edit
}

/** A local edit, one undo step; the caret goes to its selection. */
function commitEdit(edit: MarkdownEdit, before: MarkdownEditorSelection): void {
  documentState.commit({
    changes: edit.changes,
    history: 'record',
    before,
    after: edit.selection,
    send: true,
    selection: edit.selection,
  })
  focusView(edit.selection)
}

function runCommand(command: RichCommand): void {
  if (command === 'comment') {
    startComment()
    return
  }
  if (command.startsWith('heading')) {
    if (!formatting.value)
      return
    flushActive()
    applyFormat({ type: 'heading', level: Number(command.slice(7)) })
    return
  }
  runAction(command as MarkdownEditorToolbarActionKey)
}

function runAction(action: MarkdownEditorToolbarActionKey): void {
  if (action === 'undo' || action === 'redo') {
    if (!canEdit.value)
      return
    flushActive()
    const selection = action === 'undo' ? documentState.undo() : documentState.redo()
    if (selection !== false)
      focusView(selection)
    return
  }
  if (action === 'highlight') {
    runHighlight()
    return
  }
  if (!formatting.value || action === 'emoji')
    return
  flushActive()
  switch (action) {
    case 'link':
      void editLink()
      return
    case 'image':
      pickImage()
      return
    case 'math':
      editMath()
      return
    case 'table':
      applyFormat({ type: 'table', header: labels.value.tableColumn })
      return
    case 'heading':
    case 'codeBlock':
    case 'divider':
      applyFormat({ type: action })
      return
  }
  const selection = selectionForEdit()
  if (active === 'wysiwyg' && rich && selection.anchor === selection.head) {
    // A bare caret: bold and friends become the typing style, as in any word processor.
    if (action === 'bold' || action === 'italic' || action === 'strike') {
      focusView(null)
      rich.toggleTypingStyle(action)
      return
    }
    if (action === 'code') {
      const doc = documentState.doc()
      const span = codeSpanAt(doc, selection.head) ?? wordAt(doc, selection.head)
      if (span)
        applyFormat({ type: 'code' }, span)
      return
    }
  }
  applyFormat({ type: action }, selection)
}

async function editLink(): Promise<void> {
  const selection = selectionForEdit()
  const doc = documentState.doc()
  if (!props.linkPrompt) {
    const href = markdownLinkAt(doc, selection)
    openPrompt('link', selection, href ?? '', { removable: href !== null })
    return
  }
  const range = documentState.track(selection)
  let href: string
  try {
    href = (await props.linkPrompt(doc.slice(Math.min(selection.anchor, selection.head), Math.max(selection.anchor, selection.head)))).trim()
  }
  finally {
    documentState.untrack(range)
  }
  if (href && formatting.value)
    applyFormat({ type: 'link', href }, { anchor: range.anchor, head: range.head })
}

let pendingImage: MarkdownEditorSelection | null = null

/** The image button; `replace` is a slash command's `/query`, which the image takes the place of. */
function pickImage(replace?: MarkdownEditorSelection): void {
  const selection = replace ?? selectionForEdit()
  if (!props.uploadImage || !fileInput.value) {
    openPrompt('image', selection, '', { replace: !!replace })
    return
  }
  if (pendingImage)
    documentState.untrack(pendingImage)
  // Otherwise the image goes before the selected text.
  pendingImage = documentState.track(replace ?? caret(Math.min(selection.anchor, selection.head)))
  fileInput.value.click()
}

function onFilePicked(): void {
  const input = fileInput.value
  const files = Array.from(input?.files ?? [])
  if (input)
    input.value = ''
  const target = pendingImage
  pendingImage = null
  if (target)
    documentState.untrack(target)
  if (files.length && formatting.value)
    uploads.start(files, target?.anchor ?? documentState.doc().length, target?.head)
}

function editMath(display?: boolean, replace?: MarkdownEditorSelection): void {
  if (!props.math)
    return
  const selection = replace ?? selectionForEdit()
  if (active === 'source') {
    applyFormat({ type: 'math' }, selection)
    return
  }
  const from = Math.min(selection.anchor, selection.head)
  const to = Math.max(selection.anchor, selection.head)
  openPrompt('math', selection, replace ? '' : documentState.doc().slice(from, to), { display })
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

/** A formula on the rich surface was clicked. */
function editFormula(atom: HTMLElement, from: number, to: number): void {
  if (!formatting.value || active !== 'wysiwyg')
    return
  openPrompt('math', { anchor: from, head: to }, safeDecode(atom.dataset.txTex ?? ''), {
    display: atom.classList.contains('is-block'),
    rect: atom.getBoundingClientRect(),
  })
}

function insertEmoji(emoji: MarkdownEmoji): void {
  const text = markdownEmojiText(emoji)
  rememberMarkdownEmoji(text)
  if (formatting.value)
    applyFormat({ type: 'insert', text })
}

function onEmojiOpen(open: boolean): void {
  if (open)
    loadEmoji()
  else
    restoreFocus()
}

/** A toolbar menu closed without a pick: give the caret back, unless focus went somewhere else. */
function restoreFocus(): void {
  void nextTick(() => {
    const element = hasDocument() ? document.activeElement : null
    // Still in the closing menu, which takes its focus with it when it unmounts.
    if (!element || element === document.body || toolbarRef.value?.containsFloating(element))
      focusView(lastSelection())
  })
}

/** The colour the highlight button applies: the last one picked. */
const highlightColor = ref<MarkdownEditorHighlightColor>('yellow')

/**
 * The highlighter: a colour from the menu, `null` to remove, or nothing — the
 * button and Mod+Shift+H — to toggle the current colour.
 */
function runHighlight(color?: MarkdownEditorHighlightColor | null): void {
  if (!formatting.value || !props.highlight)
    return
  flushActive()
  if (color)
    highlightColor.value = color
  const doc = documentState.doc()
  let selection = selectionForEdit()
  // A bare caret on the rich surface marks its word: there is no empty highlight to type into.
  if (active === 'wysiwyg' && selection.anchor === selection.head && !markdownHighlightAt(doc, selection.head)) {
    const word = color === null ? null : wordAt(doc, selection.head)
    if (!word) {
      focusView(null)
      return
    }
    selection = word
  }
  applyFormat(color === undefined
    ? { type: 'highlight', color: highlightColor.value, toggle: true }
    : { type: 'highlight', color }, selection)
}

function onHighlightOpen(open: boolean): void {
  if (!open)
    restoreFocus()
}

// ---------------------------------------------------------------------------
// Prompt: link, image address, formula, new comment
// ---------------------------------------------------------------------------

const prompt = shallowRef<PromptState | null>(null)
const promptBox = shallowRef<MarkdownBox | null>(null)
let promptRange: MarkdownEditorSelection | null = null
let promptSerial = 0
const promptReference = virtualReference(activePage, () => promptBox.value)

const promptOpen = computed({
  get: () => prompt.value !== null,
  set: (open: boolean) => {
    if (!open)
      closePrompt(false)
  },
})

function openPrompt(
  kind: PromptKind,
  selection: MarkdownEditorSelection,
  value: string,
  options: { removable?: boolean, display?: boolean, replace?: boolean, rect?: DOMRect | null } = {},
): void {
  closeMenus()
  if (promptRange)
    documentState.untrack(promptRange)
  promptRange = documentState.track(selection)
  const page = activePage()
  const rect = options.rect ?? selectionRect()
  promptBox.value = page && rect ? boxIn(page, rect) : null
  prompt.value = { id: ++promptSerial, kind, value, removable: !!options.removable, display: options.display, replace: options.replace }
  overlay.schedule()
}

function closePrompt(refocus: boolean): void {
  if (!prompt.value)
    return
  prompt.value = null
  const range = promptRange
  promptRange = null
  if (range)
    documentState.untrack(range)
  overlay.schedule()
  if (refocus && range)
    focusView({ anchor: range.anchor, head: range.head })
}

function onPromptSubmit(value: string): void {
  const state = prompt.value
  const range = promptRange
  if (!state || !range)
    return
  const selection = { anchor: range.anchor, head: range.head }
  closePrompt(false)
  if (state.kind === 'comment') {
    const comment = comments.create(selection, value)
    if (comment)
      focusView(caret(comment.to))
    return
  }
  if (!formatting.value)
    return
  if (state.kind === 'link') {
    applyFormat({ type: 'link', href: value }, selection)
  }
  else if (state.kind === 'image') {
    const alt = state.replace ? '' : documentState.doc().slice(Math.min(selection.anchor, selection.head), Math.max(selection.anchor, selection.head))
    applyFormat({ type: 'image', src: value, alt }, selection)
  }
  else {
    applyFormat({ type: 'math', tex: value, display: state.display }, selection)
  }
}

function onPromptRemove(): void {
  const range = promptRange
  closePrompt(false)
  if (range && formatting.value)
    applyFormat({ type: 'link', href: '' }, { anchor: range.anchor, head: range.head })
}

function renderMath(tex: string): string | null {
  return renderer.typesetTex(tex, prompt.value?.display ?? false)
}

// ---------------------------------------------------------------------------
// Emoji
// ---------------------------------------------------------------------------

let emojiRequested = false

function loadEmoji(): void {
  if (emojiRequested || !props.emoji)
    return
  emojiRequested = true
  loadMarkdownEmoji()
    .then((index) => {
      emojiBase.value ??= index
      if (unmounted || !props.emoji)
        return
      if (rich?.hasFocus())
        updateSuggest(true)
    })
    .catch(() => {
      emojiRequested = false
    })
}

function maybeLoadEmoji(): void {
  if (/:[a-z0-9_+-]{1,40}:/.test(documentState.doc()))
    loadEmoji()
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const canComment = computed(() => commentsEnabled.value && !props.disabled && hasRange.value)

function startComment(): void {
  if (!commentsEnabled.value || props.disabled)
    return
  flushActive()
  const selection = currentSelection()
  if (selection && selection.anchor !== selection.head)
    openPrompt('comment', selection, '')
}

/** A click on commented text opens its thread. */
function onPaneClick(): void {
  if (!commentsEnabled.value)
    return
  const selection = currentSelection()
  if (selection && selection.anchor === selection.head)
    comments.openAt(selection)
}

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

function focusInside(): boolean {
  const element = hasDocument() ? document.activeElement : null
  if (!element || element === document.body)
    return false
  return !!root.value?.contains(element)
    || !!toolbarRef.value?.containsFloating(element)
    || !!promptAnchor.value?.containsFloating(element)
    || !!suggestAnchor.value?.containsFloating(element)
    || !!slashMenu.value?.containsFloating(element)
    || !!bubbleRef.value?.containsFloating(element)
}

function deferFocusCheck(): void {
  setTimeout(checkFocus)
}

function listenFocus(on: boolean): void {
  if (!hasDocument())
    return
  const method = on ? 'addEventListener' : 'removeEventListener'
  document[method]('focusin', checkFocus)
  document[method]('focusout', deferFocusCheck)
}

/** Focus anywhere in the editor, its toolbar's popovers included, counts as one focus. */
function checkFocus(): void {
  if (unmounted)
    return
  const inside = focusInside()
  if (inside === isFocused.value)
    return
  isFocused.value = inside
  listenFocus(inside)
  if (inside) {
    emit('focus')
  }
  else {
    closeMenus()
    documentState.seal()
    emit('blur')
  }
  collab.presenceChanged()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  activate(currentMode.value, false)
  collab.start(props.collaboration)
  maybeLoadEmoji()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    resizeObserver = new ResizeObserver(() => {
      const width = root.value?.getBoundingClientRect().width ?? 0
      if (width > 0)
        narrow.value = width < 640
      overlay.schedule()
    })
    for (const element of [root.value, richPage.value, previewPage.value]) {
      if (element)
        resizeObserver.observe(element)
    }
  }
})

onBeforeUnmount(() => {
  unmounted = true
  resizeObserver?.disconnect()
  resizeObserver = null
  listenFocus(false)
  if (statsTimer)
    clearTimeout(statsTimer)
  rich?.destroy()
  preview?.destroy()
  rich = preview = null
})

defineExpose({
  focus: () => focusView(lastSelection()),
  blur: () => {
    const element = hasDocument() ? document.activeElement : null
    if (element instanceof HTMLElement && focusInside())
      element.blur()
  },
  setMode,
  getMode: () => currentMode.value,
  /** Opens the comment sidebar; given an `id`, on that thread, as a click on it in the sidebar does. */
  openComments: (id?: string) => {
    if (!commentsEnabled.value)
      return
    sidebarOpen.value = true
    // Once the sidebar has mounted, so that it scrolls to the thread.
    if (id && threads.value.some(thread => thread.id === id))
      void nextTick(() => comments.activate(id))
  },
  getValue: () => documentState.doc(),
  /** Replaces the document as an edit: emitted, and sent to peers. */
  setValue: (value: string) => {
    flushActive()
    documentState.replace(value, { send: true })
  },
  getSelection: () => currentSelection(),
  setSelection: (selection: MarkdownEditorSelection) => focusView(clampSelection(selection)),
  /** Inserts Markdown over the selection, as a user edit. */
  insert: (markdown: string) => {
    if (!canEdit.value)
      return
    flushActive()
    applyFormat({ type: 'insert', text: markdown })
  },
})
</script>

<template>
  <div
    ref="root"
    class="tx-markdown-editor"
    :class="[
      `tx-markdown-editor--${resolvedTheme}`,
      {
        'is-focused': isFocused,
        'is-disabled': disabled,
        'is-readonly': readonly,
        'is-empty': isEmpty,
        'is-narrow': narrow,
      },
    ]"
    :style="codeStyle"
    :data-theme="resolvedTheme"
    @focusin="checkFocus"
  >
    <MarkdownEditorToolbar
      v-if="toolbar"
      ref="toolbarRef"
      :actions="actions"
      :labels="labels"
      :mode="currentMode"
      :theme="resolvedTheme"
      :disabled="disabled"
      :formatting="formatting"
      :can-undo="canEdit && canUndo"
      :can-redo="canEdit && canRedo"
      :pressed="pressed"
      :comments="commentsEnabled"
      :can-comment="canComment"
      :comment-count="openCount"
      :comments-open="sidebarOpen"
      :highlight-color="highlightColor"
      @action="runAction"
      @mode="setMode"
      @comment="startComment"
      @toggle-comments="sidebarOpen = !sidebarOpen"
      :emoji-packs="emojiPacks"
      @emoji="insertEmoji"
      @emoji-open="onEmojiOpen"
      @highlight="runHighlight"
      @highlight-open="onHighlightOpen"
    />

    <div class="tx-markdown-editor__main" :style="mainStyle">
      <div class="tx-markdown-editor__pane" @click="onPaneClick" @load.capture="overlay.schedule()">
        <div v-show="currentMode === 'wysiwyg'" ref="richPage" class="tx-markdown-editor__page">
          <div
            ref="richRoot"
            class="tx-markdown-editor__surface markdown-body"
            role="textbox"
            aria-multiline="true"
            :aria-label="ariaLabel"
            :aria-readonly="readonly || undefined"
            :aria-disabled="disabled || undefined"
            :tabindex="canEdit || disabled ? undefined : 0"
            spellcheck="true"
            @compositionstart="composing = true"
            @compositionend="composing = false"
          />
          <div v-if="placeholder && isEmpty && !composing" class="tx-markdown-editor__placeholder" aria-hidden="true">
            {{ placeholder }}
          </div>
          <MarkdownEditorMarks v-if="currentMode === 'wysiwyg'" :under="under" :carets="carets" />
        </div>

        <div v-show="currentMode === 'source'" ref="sourcePage" class="tx-markdown-editor__page is-source">
          <component
            :is="sourceComponent"
            v-if="sourceComponent"
            ref="sourceView"
            :doc="documentState.doc()"
            :editable="canEdit"
            :placeholder="placeholder"
            :aria-label="ariaLabel"
            :dark="resolvedTheme === 'dark'"
            :math="math"
            :highlight="highlight"
            :callouts="callouts"
            :emoji="emoji"
            :emoji-packs="emojiPacks"
            :files="uploads.start"
            @change="(changes: MarkdownTextChange[], before: MarkdownEditorSelection, after: MarkdownEditorSelection, kind: RichChangeKind) => reportEdit('source', changes, before, after, kind)"
            @selection="onSelection('source')"
            @command="runCommand"
            @ready="onSourceReady"
          />
          <pre v-else-if="currentMode === 'source'" class="tx-markdown-editor__source-fallback">{{ text }}</pre>
        </div>

        <div v-show="currentMode === 'preview'" ref="previewPage" class="tx-markdown-editor__page">
          <div
            ref="previewRoot"
            class="tx-markdown-editor__preview markdown-body"
            role="document"
            tabindex="0"
            :aria-label="ariaLabel"
          />
          <MarkdownEditorMarks v-if="currentMode === 'preview'" :under="under" :carets="carets" />
        </div>
      </div>

      <MarkdownEditorComments
        v-if="commentsEnabled && sidebarOpen"
        :comments="threads"
        :active-id="activeThread"
        :labels="labels"
        :interactive="!disabled"
        @activate="comments.activate"
        @reply="comments.reply"
        @resolve="comments.resolve"
        @delete="comments.remove"
        @close="sidebarOpen = false"
      />
    </div>

    <MarkdownEditorStatus
      v-if="statusBar"
      :labels="labels"
      :stats="stats"
      :upload="uploadSummary"
      :user="user"
      :peers="peers"
    />

    <input
      v-if="canUpload"
      ref="fileInput"
      class="tx-markdown-editor__file"
      type="file"
      accept="image/*"
      multiple
      tabindex="-1"
      aria-hidden="true"
      @change="onFilePicked"
    >

    <TxBaseAnchor
      ref="promptAnchor"
      v-model="promptOpen"
      :class="layerClass"
      :data-theme="resolvedTheme"
      :virtual-reference="promptReference"
      placement="bottom-start"
      :offset="8"
      :width="320"
      :max-width="320"
      :panel-padding="12"
    >
      <MarkdownEditorPrompt
        v-if="prompt"
        :key="prompt.id"
        :kind="prompt.kind"
        :labels="labels"
        :value="prompt.value"
        :removable="prompt.removable"
        :render-math="renderMath"
        :assets-version="assetsVersion"
        @submit="onPromptSubmit"
        @remove="onPromptRemove"
        @cancel="closePrompt(true)"
      />
    </TxBaseAnchor>

    <TxBaseAnchor
      ref="suggestAnchor"
      v-model="suggestOpen"
      :class="layerClass"
      :data-theme="resolvedTheme"
      :virtual-reference="suggestReference"
      placement="bottom-start"
      :offset="6"
      :min-width="220"
      :max-width="280"
      :panel-padding="4"
    >
      <MarkdownEditorEmojiSuggest
        v-if="suggest"
        :items="suggest.items"
        :active="suggest.active"
        :label="labels.emoji"
        @pick="pickSuggestion"
        @hover="hoverSuggestion"
      />
    </TxBaseAnchor>

    <MarkdownEditorBubble
      ref="bubbleRef"
      :controller="bubble"
      :labels="labels"
      :theme="resolvedTheme"
      :actions="formatting ? actions : []"
      :pressed="pressed"
      :comments="commentsEnabled && !disabled"
      :ai="!!ai && canEdit"
      :highlight-color="highlightColor"
      @action="runAction"
      @comment="startComment"
    />

    <MarkdownEditorSlashMenu
      ref="slashMenu"
      :state="slash"
      :label="labels.slashMenu"
      :reference="slashReference"
      :theme="resolvedTheme"
      @pick="pickSlash"
      @hover="hoverSlash"
      @close="closeSlash"
    />
  </div>
</template>

<style lang="scss">
$mono: var(--tx-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
$emoji: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
// TxCheckbox's tick as a mask: only its shape counts.
$checkbox-tick: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Cpolyline points='88,214 173,284 304,138' fill='none' stroke='black' stroke-width='24' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");

// The teleported layers (popovers) carry the same variables as the editor.
.tx-markdown-editor,
.tx-markdown-editor-layer {
  --tx-markdown-editor-border: var(--tx-border-color-light, #e4e7ed);
  --tx-markdown-editor-checkbox-border: var(--tx-border-color, #dcdfe6);
  --tx-markdown-editor-bg: var(--tx-bg-color, #ffffff);
  --tx-markdown-editor-bg-raised: var(--tx-bg-color-overlay, #ffffff);
  --tx-markdown-editor-toolbar-bg: var(--tx-fill-color-lighter, #fafafa);
  --tx-markdown-editor-field-bg: var(--tx-bg-color, #ffffff);
  --tx-markdown-editor-popover-bg: var(--tx-bg-color-overlay, #ffffff);
  --tx-markdown-editor-text: var(--tx-text-color-primary, #303133);
  --tx-markdown-editor-muted: var(--tx-text-color-regular, #606266);
  --tx-markdown-editor-placeholder: var(--tx-text-color-placeholder, #a8abb2);
  --tx-markdown-editor-accent: var(--tx-color-primary, #409eff);
  --tx-markdown-editor-danger: var(--tx-color-danger, #f56c6c);
  --tx-markdown-editor-selection: color-mix(in srgb, var(--tx-markdown-editor-accent) 24%, transparent);
  --tx-markdown-editor-marker: color-mix(in srgb, var(--tx-markdown-editor-text) 35%, transparent);
  --tx-markdown-editor-code: #c2185b;
  --tx-markdown-editor-math: #7c3aed;
  // Commented text is underlined, so it reads apart from a yellow highlight.
  --tx-markdown-editor-comment-bg: rgb(250 204 21 / 12%);
  --tx-markdown-editor-comment-bg-active: rgb(250 204 21 / 30%);
  --tx-markdown-editor-comment-ring: #eab308;
  // The highlighter's pens, mixed into the page at `highlight-alpha`.
  --tx-markdown-editor-highlight-yellow: #facc15;
  --tx-markdown-editor-highlight-green: #22c55e;
  --tx-markdown-editor-highlight-blue: #3b82f6;
  --tx-markdown-editor-highlight-pink: #ec4899;
  --tx-markdown-editor-highlight-purple: #8b5cf6;
  --tx-markdown-editor-highlight-alpha: 38%;
  // GitHub's alert colours.
  --tx-markdown-editor-callout-note: #0969da;
  --tx-markdown-editor-callout-tip: #1a7f37;
  --tx-markdown-editor-callout-important: #8250df;
  --tx-markdown-editor-callout-warning: #9a6700;
  --tx-markdown-editor-callout-caution: #d1242f;
  // The AI's colours: the stream's reveal palette.
  --tx-markdown-editor-ai-1: var(--tx-stream-reveal-1, oklch(70% 0.14 250));
  --tx-markdown-editor-ai-2: var(--tx-stream-reveal-2, oklch(58% 0.17 295));
  --tx-markdown-editor-ai-3: var(--tx-stream-reveal-3, oklch(62% 0.13 350));
  --tx-markdown-editor-pad-x: 20px;
  --tx-markdown-editor-pad-y: 16px;

  color: var(--tx-markdown-editor-text);
}

.tx-markdown-editor--dark,
.tx-markdown-editor-layer--dark {
  --tx-markdown-editor-border: var(--tx-border-color-light, #414243);
  --tx-markdown-editor-checkbox-border: var(--tx-border-color, #4c4d4f);
  --tx-markdown-editor-bg: var(--tx-bg-color, #141414);
  --tx-markdown-editor-bg-raised: var(--tx-bg-color-overlay, #1d1e1f);
  --tx-markdown-editor-toolbar-bg: var(--tx-fill-color-lighter, #1d1d1d);
  --tx-markdown-editor-field-bg: var(--tx-bg-color, #141414);
  --tx-markdown-editor-popover-bg: var(--tx-bg-color-overlay, #1d1e1f);
  --tx-markdown-editor-text: var(--tx-text-color-primary, #e5eaf3);
  --tx-markdown-editor-muted: var(--tx-text-color-regular, #cfd3dc);
  --tx-markdown-editor-placeholder: var(--tx-text-color-placeholder, #8d9095);
  --tx-markdown-editor-code: #f48fb1;
  --tx-markdown-editor-math: #c4b5fd;
  --tx-markdown-editor-comment-bg: rgb(250 204 21 / 10%);
  --tx-markdown-editor-comment-bg-active: rgb(250 204 21 / 24%);
  --tx-markdown-editor-comment-ring: #facc15;
  --tx-markdown-editor-highlight-alpha: 40%;
  --tx-markdown-editor-callout-note: #4493f8;
  --tx-markdown-editor-callout-tip: #3fb950;
  --tx-markdown-editor-callout-important: #ab7df8;
  --tx-markdown-editor-callout-warning: #d29922;
  --tx-markdown-editor-callout-caution: #f85149;
}

.tx-markdown-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--tx-markdown-editor-border);
  border-radius: 12px;
  background: var(--tx-markdown-editor-bg);
  font-size: 14px;
  overflow: hidden;

  &.is-focused {
    border-color: color-mix(in srgb, var(--tx-markdown-editor-accent) 70%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-markdown-editor-accent) 16%, transparent);
  }

  &.is-disabled {
    opacity: 0.62;
  }

  &.is-narrow {
    --tx-markdown-editor-pad-x: 14px;
  }
}

.tx-markdown-editor__main {
  display: flex;
  min-height: 0;
}

.tx-markdown-editor__pane {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  cursor: text;

  .is-disabled & {
    cursor: not-allowed;
  }
}

.tx-markdown-editor__page {
  position: relative;
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  min-width: 0;
}

.tx-markdown-editor__surface,
.tx-markdown-editor__preview {
  position: relative;
  z-index: 1;
  flex: 1 0 auto;
  min-width: 0;
  padding: var(--tx-markdown-editor-pad-y) var(--tx-markdown-editor-pad-x);
  outline: 0;
  overflow-wrap: break-word;

  ::selection {
    background: var(--tx-markdown-editor-selection);
  }
}

.tx-markdown-editor__preview {
  cursor: auto;
}

.tx-markdown-editor__underlay,
.tx-markdown-editor__overlay {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.tx-markdown-editor__underlay {
  z-index: 0;
}

.tx-markdown-editor__overlay {
  z-index: 2;
  overflow: visible;
}

.tx-markdown-editor__mark {
  position: absolute;
  border-radius: 2px;

  &.is-comment {
    background: var(--tx-markdown-editor-comment-bg);
    box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--tx-markdown-editor-comment-ring) 55%, transparent);
  }

  &.is-comment.is-active {
    background: var(--tx-markdown-editor-comment-bg-active);
    box-shadow: inset 0 -2px 0 var(--tx-markdown-editor-comment-ring);
  }

  &.is-selection {
    background: color-mix(in srgb, var(--tx-markdown-editor-peer) 22%, transparent);
  }

  // The text an AI rewrite is on, and the text one has just written.
  &.is-ai {
    background: color-mix(in srgb, var(--tx-markdown-editor-ai-2) 14%, transparent);
  }

  &.is-ai-done {
    background: linear-gradient(90deg, var(--tx-markdown-editor-ai-1), var(--tx-markdown-editor-ai-2), var(--tx-markdown-editor-ai-3));
    opacity: 0.24;
  }
}

.tx-markdown-editor__comment-mark {
  background: var(--tx-markdown-editor-comment-bg);
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--tx-markdown-editor-comment-ring) 55%, transparent);

  &.is-active {
    background: var(--tx-markdown-editor-comment-bg-active);
    box-shadow: inset 0 -2px 0 var(--tx-markdown-editor-comment-ring);
  }
}

.tx-markdown-editor__peer-selection {
  background: color-mix(in srgb, var(--tx-markdown-editor-peer) 22%, transparent);
}

.tx-markdown-editor__peer-caret {
  position: absolute;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--tx-markdown-editor-peer);

  &::after {
    content: attr(data-name);
    position: absolute;
    bottom: 100%;
    left: 0;
    padding: 0 5px;
    border-radius: 4px 4px 4px 0;
    background: var(--tx-markdown-editor-peer);
    color: var(--tx-color-white, #ffffff);
    font-family: var(--tx-font-family, sans-serif);
    font-size: 11px;
    font-style: normal;
    font-weight: var(--tx-font-weight-semibold, 600);
    line-height: 16px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
  }

  &.is-labelled::after {
    opacity: 1;
  }
}

// In the source mode the caret is a widget inside the line.
.cm-line .tx-markdown-editor__peer-caret {
  position: relative;
  display: inline-block;
  width: 2px;
  height: 1.3em;
  margin: 0 -1px;
  vertical-align: text-bottom;
}

.tx-markdown-editor__placeholder {
  position: absolute;
  top: var(--tx-markdown-editor-pad-y);
  right: var(--tx-markdown-editor-pad-x);
  left: var(--tx-markdown-editor-pad-x);
  z-index: 2;
  overflow: hidden;
  color: var(--tx-markdown-editor-placeholder);
  line-height: 1.7;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}

.tx-markdown-editor__source {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  min-width: 0;
}

.tx-markdown-editor__source-fallback {
  flex: 1 0 auto;
  margin: 0;
  padding: var(--tx-markdown-editor-pad-y) var(--tx-markdown-editor-pad-x);
  color: var(--tx-markdown-editor-text);
  font-family: $mono;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tx-markdown-editor__completion-glyph {
  font-family: $emoji;
  font-size: 16px;
  line-height: 1;

  img {
    width: 1.25em;
    height: 1.25em;
    vertical-align: -0.25em;
    object-fit: contain;
  }
}

.tx-markdown-editor__file {
  display: none;
}

.tx-markdown-editor.is-narrow {
  .tx-markdown-editor__main {
    flex-direction: column;
  }

  .tx-markdown-editor-comments {
    width: auto;
    max-height: 280px;
    border-top: 1px solid var(--tx-markdown-editor-border);
    border-left: 0;
  }
}

// Rendered Markdown: the rich surface and the preview.
.tx-markdown-editor .markdown-body {
  font-size: 14px;
  line-height: 1.7;

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 1.35em 0 0.55em;
    font-weight: var(--tx-font-weight-semibold, 600);
    line-height: 1.35;
  }

  h1 {
    font-size: 1.8em;
    padding-bottom: 0.3em;
    border-bottom: 1px solid var(--tx-markdown-editor-border);
  }

  h2 {
    font-size: 1.45em;
    padding-bottom: 0.25em;
    border-bottom: 1px solid var(--tx-markdown-editor-border);
  }

  h3 {
    font-size: 1.2em;
  }

  p,
  ul,
  ol,
  blockquote,
  pre,
  table {
    margin: 0 0 1em;
  }

  ul,
  ol {
    padding-left: 1.5em;
  }

  li + li {
    margin-top: 0.25em;
  }

  a {
    color: var(--tx-markdown-editor-accent);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  // `==text==`, and `<mark data-color>` for the other pens.
  mark {
    --tx-markdown-editor-pen: var(--tx-markdown-editor-highlight-yellow);

    padding: 0.1em 0;
    border-radius: 0.2em;
    background: color-mix(in srgb, var(--tx-markdown-editor-pen) var(--tx-markdown-editor-highlight-alpha), transparent);
    color: inherit;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  @each $color in green, blue, pink, purple {
    mark[data-color='#{$color}'] {
      --tx-markdown-editor-pen: var(--tx-markdown-editor-highlight-#{$color});
    }
  }

  code {
    padding: 0.15em 0.35em;
    border-radius: 4px;
    background: color-mix(in srgb, currentColor 9%, transparent);
    font-family: $mono;
    font-size: 0.9em;
  }

  // The code theme's colours when it has loaded; `currentColor` is the inherited colour.
  pre {
    position: relative;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--tx-markdown-editor-border);
    background: var(--tx-markdown-editor-code-bg, color-mix(in srgb, currentColor 5%, transparent));
    color: var(--tx-markdown-editor-code-fg, currentColor);
    overflow: auto;

    code {
      padding: 0;
      background: transparent;
    }
  }

  // The block's language, in its corner.
  pre[data-lang]::before {
    content: attr(data-lang);
    position: absolute;
    top: 6px;
    right: 8px;
    padding: 0 6px;
    border-radius: 4px;
    background: inherit;
    color: color-mix(in srgb, currentColor 55%, transparent);
    font-family: $mono;
    font-size: 11px;
    line-height: 18px;
    pointer-events: none;
    user-select: none;
  }

  blockquote {
    padding: 10px 14px;
    border-left: 4px solid color-mix(in srgb, var(--tx-markdown-editor-accent) 55%, transparent);
    border-radius: 0 8px 8px 0;
    background: color-mix(in srgb, var(--tx-markdown-editor-accent) 7%, transparent);
    color: var(--tx-markdown-editor-muted);

    > :last-child {
      margin-bottom: 0;
    }
  }

  // `> [!NOTE]` and the other alerts (markdown-callout.ts).
  .tx-markdown-editor__callout {
    --tx-markdown-editor-callout: var(--tx-markdown-editor-callout-note);

    border-left-color: var(--tx-markdown-editor-callout);
    background: color-mix(in srgb, var(--tx-markdown-editor-callout) 8%, transparent);
    color: var(--tx-markdown-editor-text);
  }

  @each $type in tip, important, warning, caution {
    .tx-markdown-editor__callout.is-#{$type} {
      --tx-markdown-editor-callout: var(--tx-markdown-editor-callout-#{$type});
    }
  }

  .tx-markdown-editor__callout-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
    color: var(--tx-markdown-editor-callout);
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  .tx-markdown-editor__callout-icon {
    flex: none;
    width: 16px;
    height: 16px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    overflow: auto;
  }

  th,
  td {
    padding: 8px 10px;
    border: 1px solid var(--tx-markdown-editor-border);
    text-align: left;
  }

  th {
    background: color-mix(in srgb, currentColor 6%, transparent);
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  hr {
    height: 1px;
    margin: 20px 0;
    border: 0;
    background: var(--tx-markdown-editor-border);
  }

  img {
    max-width: 100%;
    border-radius: 8px;
  }

  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }
}

.tx-markdown-editor__task {
  list-style: none;
}

// TxCheckbox's box and tick (checkbox/src/TxCheckbox.vue), drawn on the native
// input that the serializer and the source map read. Its 18px box and 6px radius
// beside 14px text, in em so they follow the text.
.tx-markdown-editor__checkbox {
  position: relative;
  box-sizing: border-box;
  width: 1.286em;
  height: 1.286em;
  margin: 0 0.3em 0 -1.5em;
  border: 1px solid var(--tx-markdown-editor-checkbox-border);
  border-radius: 0.429em;
  background-color: var(--tx-markdown-editor-bg);
  // Sized by the text around it, not the user agent's control font.
  font-size: inherit;
  vertical-align: -0.27em;
  appearance: none;
  cursor: pointer;

  // Revealed left to right, the way the stroke draws.
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-color: var(--tx-checkbox-checkmark-color, var(--tx-color-on-primary, #ffffff));
    clip-path: inset(0 100% 0 0);
    -webkit-mask: $checkbox-tick center / 100% 100% no-repeat;
    mask: $checkbox-tick center / 100% 100% no-repeat;
  }

  &:checked {
    border-color: var(--tx-markdown-editor-accent);
    background-color: var(--tx-markdown-editor-accent);

    &::after {
      clip-path: inset(0);
    }
  }

  &:not(:disabled):hover {
    border-color: var(--tx-markdown-editor-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-markdown-editor-accent) 12%, transparent);
  }

  &:not(:disabled):active {
    transform: scale(0.96);
  }

  &:disabled {
    cursor: default;
  }
}

.tx-markdown-editor__emoji {
  font-family: $emoji;
  font-style: normal;

  &.is-custom img {
    width: 1.25em;
    height: 1.25em;
    vertical-align: -0.25em;
    object-fit: contain;
    pointer-events: none;
  }
}

.tx-markdown-editor__math {
  color: var(--tx-markdown-editor-math);
  font-family: $mono;
  font-size: 0.92em;

  &[data-tx-typeset='1'] {
    color: inherit;
    font-family: inherit;
    font-size: inherit;
  }

  &.is-block {
    display: block;
    margin: 0 0 1em;
    padding: 4px 0;
    overflow-x: auto;
    overflow-y: hidden;
    text-align: center;
  }
}

.tx-markdown-editor__surface .tx-markdown-editor__math {
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--tx-markdown-editor-math) 9%, transparent);
  }
}

// The formatted text at the caret, shown as its Markdown (rich-reveal.ts).
.tx-markdown-editor__reveal {
  white-space: pre-wrap;

  .is-strong {
    font-weight: var(--tx-font-weight-bold, 700);
  }

  .is-em {
    font-style: italic;
  }

  .is-del {
    text-decoration: line-through;
  }

  .is-mark:not(.is-syntax) {
    --tx-markdown-editor-pen: var(--tx-markdown-editor-highlight-yellow);

    border-radius: 0.2em;
    background: color-mix(in srgb, var(--tx-markdown-editor-pen) var(--tx-markdown-editor-highlight-alpha), transparent);
  }

  @each $color in green, blue, pink, purple {
    .is-mark.is-color-#{$color} {
      --tx-markdown-editor-pen: var(--tx-markdown-editor-highlight-#{$color});
    }
  }

  .is-link {
    color: var(--tx-markdown-editor-accent);
  }

  .is-code {
    background: color-mix(in srgb, currentColor 9%, transparent);
    font-family: $mono;
    font-size: 0.9em;
  }

  .is-math,
  .is-emoji {
    color: var(--tx-markdown-editor-math);
    font-family: $mono;
    font-size: 0.92em;
  }

  .is-callout {
    color: var(--tx-markdown-editor-callout, inherit);
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  .is-syntax,
  .is-url {
    color: var(--tx-markdown-editor-marker);
    font-style: normal;
    font-weight: normal;
    text-decoration: none;
  }
}

.tx-markdown-editor__math-preview {
  position: absolute;
  z-index: 3;
  max-width: calc(100% - 2 * var(--tx-markdown-editor-pad-x));
  padding: 6px 10px;
  overflow-x: auto;
  border-radius: 8px;
  background: var(--tx-markdown-editor-popover-bg);
  box-shadow:
    0 0 0 1px var(--tx-markdown-editor-border),
    var(--tx-elevation-2, 1px 2px 8px rgba(0, 0, 0, 0.05));
  pointer-events: none;
}

.tx-markdown-editor__def {
  display: block;
  color: var(--tx-markdown-editor-muted);
  font-family: $mono;
  font-size: 0.85em;

  .tx-markdown-editor__preview & {
    display: none;
  }
}

.tx-markdown-editor__surface .tx-markdown-editor__html {
  border-radius: 4px;
  outline: 1px dashed var(--tx-markdown-editor-border);
  outline-offset: 2px;
}

.tx-markdown-editor__upload {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  width: min(320px, 100%);
  overflow: hidden;
  border-radius: 10px;
  background: var(--tx-markdown-editor-toolbar-bg);
  box-shadow: 0 0 0 1px var(--tx-markdown-editor-border);
  font-size: 12px;
  line-height: 1.5;
  vertical-align: top;

  // The percentage is drawn from the progress variable, so a tick repaints nothing but this.
  &::after {
    content: attr(data-label) ' ' counter(tx-upload) '%';
    padding: 0 10px 10px;
    color: var(--tx-markdown-editor-muted);
    counter-reset: tx-upload var(--tx-markdown-editor-upload-progress, 0);
  }

  &[data-status='error']::after {
    content: attr(data-label);
    color: var(--tx-markdown-editor-danger);
  }
}

.markdown-body .tx-markdown-editor__upload-preview {
  display: block;
  width: 100%;
  max-height: 220px;
  border-radius: 0;
  object-fit: cover;
}

.tx-markdown-editor__upload-name {
  padding: 8px 10px 0;
  overflow: hidden;
  font-weight: var(--tx-font-weight-medium, 500);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-markdown-editor__upload-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: calc(var(--tx-markdown-editor-upload-progress, 0) * 1%);
  height: 3px;
  background: var(--tx-markdown-editor-accent);

  [data-status='error'] > & {
    width: 100%;
    background: var(--tx-markdown-editor-danger);
  }
}

@media (prefers-reduced-motion: no-preference) {
  .tx-markdown-editor {
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .tx-markdown-editor__peer-caret::after {
    transition: opacity 0.3s ease;
  }

  .tx-markdown-editor__upload-bar {
    transition: width 0.25s ease;
  }

  .tx-markdown-editor__checkbox {
    transition:
      transform 0.12s ease,
      box-shadow 0.18s ease;

    // A toggle re-renders the whole list: only the box clicked (rich-behaviors.ts) animates.
    &.is-toggled:checked {
      animation: tx-markdown-editor-check 0.18s ease-out;

      &::after {
        animation: tx-markdown-editor-tick 0.32s ease-out;
      }
    }

    &.is-toggled:not(:checked) {
      animation: tx-markdown-editor-uncheck 0.18s ease;

      &::after {
        animation: tx-markdown-editor-untick 0.3s ease;
      }
    }
  }

  // While the answer is on its way, a sheen runs along the text (the panel's sweep).
  .tx-markdown-editor__mark.is-ai.is-active {
    background:
      linear-gradient(90deg, transparent 35%, color-mix(in srgb, var(--tx-markdown-editor-ai-1) 32%, transparent) 50%, transparent 65%) 100% 0 / 300% 100%,
      color-mix(in srgb, var(--tx-markdown-editor-ai-2) 14%, transparent);
    animation: tx-markdown-editor-ai-sweep 1.6s linear infinite;
  }

  // What the answer wrote lights up line by line, then fades.
  .tx-markdown-editor__mark.is-ai-done {
    --tx-markdown-editor-mark-delay: calc(var(--tx-markdown-editor-mark-order, 0) * 80ms);

    animation:
      tx-markdown-editor-ai-wipe 0.5s cubic-bezier(0.22, 0.61, 0.36, 1) var(--tx-markdown-editor-mark-delay) both,
      tx-markdown-editor-ai-fade 0.5s ease calc(var(--tx-markdown-editor-mark-delay) + 0.9s) forwards;
  }
}

@keyframes tx-markdown-editor-ai-wipe {
  from {
    clip-path: inset(0 100% 0 0);
  }
}

@keyframes tx-markdown-editor-ai-fade {
  to {
    opacity: 0;
  }
}

@keyframes tx-markdown-editor-check {
  0% {
    border-color: var(--tx-markdown-editor-checkbox-border);
    background-color: var(--tx-markdown-editor-bg);
    transform: scale(0.96);
  }

  60% {
    transform: scale(1.06);
  }
}

@keyframes tx-markdown-editor-tick {
  from {
    clip-path: inset(0 100% 0 0);
    opacity: 0.1;
  }
}

@keyframes tx-markdown-editor-uncheck {
  from {
    border-color: var(--tx-markdown-editor-accent);
    background-color: var(--tx-markdown-editor-accent);
  }
}

@keyframes tx-markdown-editor-untick {
  from {
    clip-path: inset(0);
  }
}
</style>
