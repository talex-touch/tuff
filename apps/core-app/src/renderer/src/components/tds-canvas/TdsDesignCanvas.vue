<script lang="ts" name="TdsDesignCanvas" setup>
import { TxPopover } from '@talex-touch/tuffex/popover'
import { hasDocument, hasWindow, useReducedMotion } from '@talex-touch/tuffex/utils'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import {
  getDeviceCategoryIcon,
  getDevicePresetById,
  isResponsivePreset,
  RESPONSIVE_PRESET_ID,
  searchDevicePresets,
  type DeviceOrientation,
  type DevicePreset
} from '../preview/tds-devices'
import TdsDeviceFrame from '../preview/TdsDeviceFrame.vue'
import {
  arrangeFramesGrid,
  buildSandboxedFrameSrcdoc,
  clampCanvasZoom,
  computeViewportFit,
  DEFAULT_SNAP_THRESHOLD_PX,
  formatNotesForAiPrompt,
  getFrameIframeSandbox,
  getFrameWorldRect,
  inverseLabelScale,
  panViewportBy,
  resolveFrameLogicalSize,
  resolveFrameOuterSize,
  scaleAbout,
  solveFrameSnap,
  stepViewportSpring,
  wheelDeltaToZoomFactor
} from './canvas-geometry'
import {
  commitSnapshot,
  createCanvasHistoryState,
  diffSnapshots,
  peekSnapshot,
  redoSnapshot,
  restoreSnapshot,
  undoSnapshot
} from './canvas-history'
import {
  DEFAULT_TDS_CANVAS_LABELS,
  type SnapGuide,
  type TdsCanvasAddFramePayload,
  type TdsCanvasAskFramePayload,
  type TdsCanvasFrame,
  type TdsCanvasHistoryEntry,
  type TdsCanvasHistoryState,
  type TdsCanvasLabels,
  type TdsCanvasLintCount,
  type TdsCanvasNote,
  type TdsCanvasSendNotesPayload,
  type TdsCanvasTool,
  type TdsCanvasViewport
} from './types'

const props = withDefaults(
  defineProps<{
    frames: TdsCanvasFrame[]
    notes?: TdsCanvasNote[]
    selectedFrameId?: string | null
    labels?: Partial<TdsCanvasLabels>
    aiActionsEnabled?: boolean
    lintCounts?: Record<string, TdsCanvasLintCount>
    initialHistory?: TdsCanvasHistoryState | null
  }>(),
  {
    notes: () => [],
    selectedFrameId: undefined,
    labels: undefined,
    aiActionsEnabled: false,
    lintCounts: () => ({}),
    initialHistory: null
  }
)

const emit = defineEmits<{
  (event: 'update:frames', frames: TdsCanvasFrame[]): void
  (event: 'update:notes', notes: TdsCanvasNote[]): void
  (event: 'update:history', state: TdsCanvasHistoryState): void
  (event: 'select-frame', frameId: string | null): void
  (event: 'add-frame', payload: TdsCanvasAddFramePayload): void
  (event: 'delete-frame', frameId: string): void
  (event: 'open-lint', frameId: string): void
  (event: 'send-notes-to-ai', payload: TdsCanvasSendNotesPayload): void
  (event: 'ask-frame-ai', payload: TdsCanvasAskFramePayload): void
}>()

const prefersReducedMotion = useReducedMotion()

const labels = computed<TdsCanvasLabels>(() => ({
  ...DEFAULT_TDS_CANVAS_LABELS,
  ...(props.labels ?? {})
}))

// ── Viewport Pan / Zoom Physics ───────────────────────────────────────────────────────
const viewportRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const containerHeight = ref(0)
const viewport = ref<TdsCanvasViewport>({ k: 1, tx: 48, ty: 56 })
const activeTool = ref<TdsCanvasTool>('select')
const spaceHeld = ref(false)
const isPanning = ref(false)
const isWheelInteracting = ref(false)
const statusAnnouncement = ref('')

let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let springRafId: number | null = null
let springVelocity: TdsCanvasViewport = { k: 0, tx: 0, ty: 0 }
let panDragOrigin: {
  pointerId: number
  clientX: number
  clientY: number
  tx: number
  ty: number
} | null = null

// ── Frame Selection & Drag Snapping ───────────────────────────────────────────────────
const internalSelectedId = ref<string | null>(props.selectedFrameId ?? props.frames[0]?.id ?? null)

watch(
  () => props.selectedFrameId,
  (next) => {
    if (next !== undefined) {
      internalSelectedId.value = next
    }
  }
)

watch(
  () => props.frames,
  (nextFrames) => {
    if (nextFrames.length === 0) {
      if (internalSelectedId.value !== null) {
        internalSelectedId.value = null
      }
      return
    }
    if (
      !internalSelectedId.value ||
      !nextFrames.some((frame) => frame.id === internalSelectedId.value)
    ) {
      internalSelectedId.value = nextFrames[0]!.id
    }
  }
)

const activeFrameId = computed(() =>
  props.selectedFrameId !== undefined ? props.selectedFrameId : internalSelectedId.value
)

function selectFrame(frameId: string | null): void {
  internalSelectedId.value = frameId
  emit('select-frame', frameId)
}

const draggingFrameId = ref<string | null>(null)
const dragPreviewPos = ref<{ id: string; x: number; y: number } | null>(null)
const activeSnapGuides = ref<SnapGuide[]>([])

let frameDragOrigin: {
  pointerId: number
  frameId: string
  startClientX: number
  startClientY: number
  originX: number
  originY: number
} | null = null

const isInteracting = computed(
  () => isPanning.value || isWheelInteracting.value || draggingFrameId.value !== null
)

const iframesBlocked = computed(
  () =>
    isInteracting.value ||
    spaceHeld.value ||
    activeTool.value === 'hand' ||
    activeTool.value === 'note'
)

const effectiveHandMode = computed(() => activeTool.value === 'hand' || spaceHeld.value)
const labelScale = computed(() => inverseLabelScale(viewport.value.k))
const zoomPercent = computed(() => Math.round(viewport.value.k * 100))

const worldStyle = computed(() => ({
  transform: `translate3d(${viewport.value.tx}px, ${viewport.value.ty}px, 0) scale(${viewport.value.k})`,
  '--tds-canvas-lscale': String(labelScale.value)
}))

// ── Popovers & Frame Controls ─────────────────────────────────────────────────────────
const addFrameMenuOpen = ref(false)
const addFrameQuery = ref('')
const deviceMenuOpen = ref(false)
const deviceQuery = ref('')
const askFrameMenuOpen = ref(false)
const askFramePrompt = ref('')
const askFrameInputRef = ref<HTMLTextAreaElement | null>(null)

const filteredAddPresets = computed(() => searchDevicePresets(addFrameQuery.value, 'all'))
const filteredDevicePresets = computed(() => searchDevicePresets(deviceQuery.value, 'all'))

watch(addFrameMenuOpen, (open) => {
  if (!open) addFrameQuery.value = ''
})

watch(deviceMenuOpen, (open) => {
  if (!open) deviceQuery.value = ''
})

watch(askFrameMenuOpen, async (open) => {
  if (open) {
    await nextTick()
    askFrameInputRef.value?.focus()
  } else {
    askFramePrompt.value = ''
  }
})

// ── Pin Notes (`C` tool) ──────────────────────────────────────────────────────────────
interface NoteDraft {
  frameId: string
  xRatio: number
  yRatio: number
  text: string
}

const noteDraft = ref<NoteDraft | null>(null)
const activeNoteId = ref<string | null>(null)
const noteInputEl = ref<HTMLTextAreaElement | null>(null)

function setNoteInputEl(el: unknown): void {
  noteInputEl.value = el instanceof HTMLTextAreaElement ? el : null
}

const pendingNotes = computed(() =>
  props.notes.filter((note) => !note.resolved && note.text.trim().length > 0)
)

const noteIndexById = computed(() => {
  const map = new Map<string, number>()
  props.notes.forEach((note, index) => {
    map.set(note.id, index + 1)
  })
  return map
})

const notesByFrameId = computed(() => {
  const grouped = new Map<string, TdsCanvasNote[]>()
  for (const note of props.notes) {
    const list = grouped.get(note.frameId)
    if (list) {
      list.push(note)
    } else {
      grouped.set(note.frameId, [note])
    }
  }
  return grouped
})

// ── Content-Addressed History & Before/After Compare ──────────────────────────────────
function cloneHistoryState(source: TdsCanvasHistoryState): TdsCanvasHistoryState {
  return {
    blobs: { ...source.blobs },
    entries: source.entries.map((entry) => ({
      ...entry,
      frameSnapshots: entry.frameSnapshots.map((snap) => ({ ...snap }))
    })),
    cursor: source.cursor
  }
}

const historyState = ref<TdsCanvasHistoryState>(
  props.initialHistory ? cloneHistoryState(props.initialHistory) : createCanvasHistoryState()
)
const historyOpen = ref(false)
const peekingSnapshotId = ref<string | null>(null)
const compareOpen = ref(false)
const compareSnapshotId = ref<string | null>(null)
const compareSplit = ref(50)

watch(
  () => props.initialHistory,
  (next) => {
    if (next) {
      historyState.value = cloneHistoryState(next)
    }
  }
)

function pushHistorySnapshot(
  label: string,
  frames: readonly TdsCanvasFrame[]
): TdsCanvasHistoryEntry {
  const committed = commitSnapshot(historyState.value, label, frames)
  historyState.value = committed.state
  emit('update:history', committed.state)
  return committed.entry
}

watch(
  () => props.frames,
  (nextFrames) => {
    if (nextFrames.length > 0 && historyState.value.entries.length === 0) {
      pushHistorySnapshot('Initial', nextFrames)
    }
  },
  { immediate: true }
)

const isPeeking = computed(() => peekingSnapshotId.value !== null)

const peekingEntry = computed(
  () => historyState.value.entries.find((entry) => entry.id === peekingSnapshotId.value) ?? null
)

const displayedFrames = computed<TdsCanvasFrame[]>(() => {
  if (peekingSnapshotId.value) {
    const peeked = peekSnapshot(historyState.value, peekingSnapshotId.value)
    if (peeked) return peeked
  }
  if (dragPreviewPos.value) {
    const { id, x, y } = dragPreviewPos.value
    return props.frames.map((frame) => (frame.id === id ? { ...frame, x, y } : frame))
  }
  return props.frames
})

const selectedFrame = computed<TdsCanvasFrame | null>(() => {
  if (!activeFrameId.value) return null
  return displayedFrames.value.find((frame) => frame.id === activeFrameId.value) ?? null
})

const selectedFramePreset = computed(() =>
  selectedFrame.value ? getDevicePresetById(selectedFrame.value.deviceId) : null
)

const canRotateSelectedFrame = computed(() =>
  Boolean(
    selectedFramePreset.value &&
    !isResponsivePreset(selectedFramePreset.value) &&
    selectedFramePreset.value.orientable
  )
)

const canToggleSelectedShell = computed(() =>
  Boolean(selectedFramePreset.value && !isResponsivePreset(selectedFramePreset.value))
)

const canUndo = computed(() => historyState.value.cursor > 0)
const canRedo = computed(
  () =>
    historyState.value.cursor >= 0 &&
    historyState.value.cursor < historyState.value.entries.length - 1
)

const historyEntriesReversed = computed(() => [...historyState.value.entries].reverse())

const compareTargetFrame = computed<TdsCanvasFrame | null>(() => {
  const targetId = activeFrameId.value ?? props.frames[0]?.id ?? null
  if (!targetId) return null
  return props.frames.find((frame) => frame.id === targetId) ?? null
})

const compareBeforeFrame = computed<TdsCanvasFrame | null>(() => {
  if (!compareSnapshotId.value || !compareTargetFrame.value) return null
  const snapFrames = peekSnapshot(historyState.value, compareSnapshotId.value)
  if (!snapFrames) return null
  return (
    snapFrames.find((frame) => frame.id === compareTargetFrame.value!.id) ?? snapFrames[0] ?? null
  )
})

const compareAfterStyle = computed(() => ({
  clipPath: `inset(0 0 0 ${compareSplit.value}%)`
}))

const compareDividerStyle = computed(() => ({
  left: `${compareSplit.value}%`
}))

const canOpenCompare = computed(() =>
  Boolean(compareTargetFrame.value && historyState.value.entries.length > 0)
)

// ── Viewport Spring Animation & Helpers ───────────────────────────────────────────────
function cancelViewportSpring(): void {
  if (springRafId !== null && hasWindow() && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(springRafId)
  }
  springRafId = null
  springVelocity = { k: 0, tx: 0, ty: 0 }
}

function animateViewportTo(target: TdsCanvasViewport): void {
  cancelViewportSpring()
  const shouldSnap =
    prefersReducedMotion.value ||
    !hasWindow() ||
    typeof requestAnimationFrame !== 'function' ||
    containerWidth.value <= 0 ||
    containerHeight.value <= 0

  if (shouldSnap) {
    viewport.value = { ...target }
    return
  }

  let lastTime = performance.now()
  const tick = (now: number): void => {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000))
    lastTime = now
    const stepped = stepViewportSpring(viewport.value, springVelocity, target, dt)
    viewport.value = stepped.view
    springVelocity = stepped.velocity
    if (stepped.settled) {
      springRafId = null
      return
    }
    springRafId = requestAnimationFrame(tick)
  }
  springRafId = requestAnimationFrame(tick)
}

function getEffectiveContainerSize(): { width: number; height: number } {
  if (containerWidth.value > 0 && containerHeight.value > 0) {
    return { width: containerWidth.value, height: containerHeight.value }
  }
  const el = viewportRef.value
  if (el) {
    const rect = el.getBoundingClientRect()
    const w = rect.width || el.clientWidth
    const h = rect.height || el.clientHeight
    if (w > 0 && h > 0) {
      return { width: w, height: h }
    }
  }
  return { width: 960, height: 640 }
}

function fitToScreen(): void {
  const size = getEffectiveContainerSize()
  const target = computeViewportFit(displayedFrames.value, size, 48)
  animateViewportTo(target)
  statusAnnouncement.value = `${labels.value.fitToScreen}: ${Math.round(target.k * 100)}%`
}

function zoomByFactor(factor: number): void {
  const size = getEffectiveContainerSize()
  const center = { x: size.width / 2, y: size.height / 2 }
  const nextK = clampCanvasZoom(viewport.value.k * factor)
  const target = scaleAbout(viewport.value, nextK, center)
  animateViewportTo(target)
  statusAnnouncement.value = `${Math.round(target.k * 100)}%`
}

function resetZoom(): void {
  const size = getEffectiveContainerSize()
  const center = { x: size.width / 2, y: size.height / 2 }
  const target = scaleAbout(viewport.value, 1, center)
  animateViewportTo(target)
  statusAnnouncement.value = '100%'
}

function handleAutoArrange(): void {
  if (isPeeking.value || props.frames.length === 0) return
  const arranged = arrangeFramesGrid(props.frames)
  emit('update:frames', arranged)
  pushHistorySnapshot('Auto-arrange', arranged)
  const size = getEffectiveContainerSize()
  animateViewportTo(computeViewportFit(arranged, size, 48))
}

// ── Wheel & Pointer Pan/Zoom Handlers ─────────────────────────────────────────────────
function scheduleWheelIdleClear(): void {
  if (wheelIdleTimer !== null) {
    clearTimeout(wheelIdleTimer)
  }
  wheelIdleTimer = setTimeout(() => {
    isWheelInteracting.value = false
    wheelIdleTimer = null
  }, 140)
}

function onViewportWheel(event: WheelEvent): void {
  cancelViewportSpring()
  isWheelInteracting.value = true
  scheduleWheelIdleClear()

  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1
  const dx = event.deltaX * unit
  const dy = event.deltaY * unit

  if (event.ctrlKey || event.metaKey) {
    const el = viewportRef.value
    const rect = el?.getBoundingClientRect()
    const hasRect = Boolean(rect && (rect.width > 0 || rect.height > 0))
    const anchor =
      hasRect && rect
        ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
        : { x: event.clientX, y: event.clientY }
    const nextK = clampCanvasZoom(viewport.value.k * wheelDeltaToZoomFactor(dy))
    viewport.value = scaleAbout(viewport.value, nextK, anchor)
  } else {
    viewport.value = panViewportBy(viewport.value, -dx, -dy)
  }
}

function onViewportPointerDown(event: PointerEvent): void {
  const isMiddleButton = event.button === 1
  const target = event.target as HTMLElement | null
  const clickedBackdrop = Boolean(
    target && (target === viewportRef.value || target.classList.contains('TdsDesignCanvas-World'))
  )
  const shouldPan =
    isMiddleButton || effectiveHandMode.value || (event.button === 0 && clickedBackdrop)

  if (!shouldPan) return

  if (clickedBackdrop && event.button === 0 && !effectiveHandMode.value) {
    activeNoteId.value = null
  }

  cancelViewportSpring()
  isPanning.value = true
  panDragOrigin = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    tx: viewport.value.tx,
    ty: viewport.value.ty
  }
  const el = viewportRef.value
  if (el && typeof el.setPointerCapture === 'function') {
    try {
      el.setPointerCapture(event.pointerId)
    } catch {
      // Ignore synthetic PointerEvents without active pointer id in test environments
    }
  }
}

function onViewportPointerMove(event: PointerEvent): void {
  if (panDragOrigin && event.pointerId === panDragOrigin.pointerId) {
    viewport.value = {
      k: viewport.value.k,
      tx: panDragOrigin.tx + (event.clientX - panDragOrigin.clientX),
      ty: panDragOrigin.ty + (event.clientY - panDragOrigin.clientY)
    }
    return
  }

  if (frameDragOrigin && event.pointerId === frameDragOrigin.pointerId) {
    const movingFrame = props.frames.find((frame) => frame.id === frameDragOrigin!.frameId)
    if (!movingFrame) return

    const dxWorld = (event.clientX - frameDragOrigin.startClientX) / viewport.value.k
    const dyWorld = (event.clientY - frameDragOrigin.startClientY) / viewport.value.k
    const rawX = frameDragOrigin.originX + dxWorld
    const rawY = frameDragOrigin.originY + dyWorld
    const size = resolveFrameOuterSize(movingFrame)

    const otherRects = props.frames
      .filter((frame) => frame.id !== movingFrame.id)
      .map((frame) => getFrameWorldRect(frame))

    const snap = solveFrameSnap(
      { x: rawX, y: rawY, width: size.width, height: size.height },
      otherRects,
      DEFAULT_SNAP_THRESHOLD_PX / viewport.value.k
    )

    dragPreviewPos.value = {
      id: movingFrame.id,
      x: Math.round(snap.x),
      y: Math.round(snap.y)
    }
    activeSnapGuides.value = snap.guides
  }
}

function finishPointerInteraction(event: PointerEvent): void {
  if (panDragOrigin && event.pointerId === panDragOrigin.pointerId) {
    isPanning.value = false
    panDragOrigin = null
  }

  if (frameDragOrigin && event.pointerId === frameDragOrigin.pointerId) {
    const preview = dragPreviewPos.value
    const dragId = frameDragOrigin.frameId
    const originX = frameDragOrigin.originX
    const originY = frameDragOrigin.originY

    frameDragOrigin = null
    draggingFrameId.value = null
    dragPreviewPos.value = null
    activeSnapGuides.value = []

    if (preview && preview.id === dragId && (preview.x !== originX || preview.y !== originY)) {
      const nextFrames = props.frames.map((frame) =>
        frame.id === dragId ? { ...frame, x: preview.x, y: preview.y } : frame
      )
      emit('update:frames', nextFrames)
    }
  }
}

function onFrameDragPointerDown(frame: TdsCanvasFrame, event: PointerEvent): void {
  if (event.button !== 0 || effectiveHandMode.value || isPeeking.value) return
  event.stopPropagation()
  selectFrame(frame.id)
  cancelViewportSpring()
  draggingFrameId.value = frame.id
  frameDragOrigin = {
    pointerId: event.pointerId,
    frameId: frame.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originX: frame.x,
    originY: frame.y
  }
  dragPreviewPos.value = { id: frame.id, x: frame.x, y: frame.y }
  activeSnapGuides.value = []

  const el = viewportRef.value
  if (el && typeof el.setPointerCapture === 'function') {
    try {
      el.setPointerCapture(event.pointerId)
    } catch {
      // Ignore synthetic pointer ids
    }
  }
}

// ── Frame Actions (Add, Switch Device, Rotate, Shell, Ask AI) ─────────────────────────
function handleAddFrame(preset: DevicePreset): void {
  addFrameMenuOpen.value = false
  const nextIndex = props.frames.length + 1
  const label = preset.id === RESPONSIVE_PRESET_ID ? labels.value.deviceResponsive : preset.name
  emit('add-frame', {
    deviceId: preset.id,
    kind: 'html',
    title: `${label} ${nextIndex}`
  })
}

function handleSwitchSelectedDevice(preset: DevicePreset): void {
  if (isPeeking.value || !selectedFrame.value) return
  deviceMenuOpen.value = false
  const targetId = selectedFrame.value.id
  const nextFrames = props.frames.map((frame) => {
    if (frame.id !== targetId) return frame
    return {
      ...frame,
      deviceId: preset.id,
      orientation: preset.orientable ? (frame.orientation ?? 'portrait') : 'portrait'
    }
  })
  emit('update:frames', nextFrames)
  pushHistorySnapshot(`Device: ${preset.name}`, nextFrames)
}

function handleToggleSelectedOrientation(): void {
  if (isPeeking.value || !selectedFrame.value || !canRotateSelectedFrame.value) return
  const targetId = selectedFrame.value.id
  const nextFrames: TdsCanvasFrame[] = props.frames.map((frame) => {
    if (frame.id !== targetId) return frame
    const nextOrientation: DeviceOrientation =
      frame.orientation === 'landscape' ? 'portrait' : 'landscape'
    return { ...frame, orientation: nextOrientation }
  })
  emit('update:frames', nextFrames)
}

function handleToggleSelectedShell(): void {
  if (isPeeking.value || !selectedFrame.value || !canToggleSelectedShell.value) return
  const targetId = selectedFrame.value.id
  const nextFrames = props.frames.map((frame) => {
    if (frame.id !== targetId) return frame
    return { ...frame, showShell: frame.showShell === false }
  })
  emit('update:frames', nextFrames)
}

function handleSubmitAskFrameAi(): void {
  if (!selectedFrame.value) return
  const prompt = askFramePrompt.value.trim()
  if (!prompt) return
  emit('ask-frame-ai', { frameId: selectedFrame.value.id, prompt })
  askFramePrompt.value = ''
  askFrameMenuOpen.value = false
}

// ── Pin Note Actions ──────────────────────────────────────────────────────────────────
async function onNoteSurfaceClick(frame: TdsCanvasFrame, event: MouseEvent): Promise<void> {
  if (isPeeking.value) return
  event.stopPropagation()
  selectFrame(frame.id)
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  let xRatio = 0.5
  let yRatio = 0.5
  if (rect && rect.width > 0 && rect.height > 0) {
    xRatio = Math.max(0.02, Math.min(0.98, (event.clientX - rect.left) / rect.width))
    yRatio = Math.max(0.02, Math.min(0.98, (event.clientY - rect.top) / rect.height))
  }
  activeNoteId.value = null
  noteDraft.value = {
    frameId: frame.id,
    xRatio: Math.round(xRatio * 1000) / 1000,
    yRatio: Math.round(yRatio * 1000) / 1000,
    text: ''
  }
  await nextTick()
  noteInputEl.value?.focus()
}

function saveNoteDraft(): void {
  const draft = noteDraft.value
  if (!draft) return
  const text = draft.text.trim()
  if (!text) return
  const newNote: TdsCanvasNote = {
    id: `note-${Date.now().toString(36)}-${(props.notes.length + 1).toString(36)}`,
    frameId: draft.frameId,
    xRatio: draft.xRatio,
    yRatio: draft.yRatio,
    text,
    resolved: false,
    createdAt: Date.now()
  }
  emit('update:notes', [...props.notes, newNote])
  noteDraft.value = null
  activeNoteId.value = newNote.id
}

function cancelNoteDraft(): void {
  noteDraft.value = null
}

function toggleNoteResolved(noteId: string): void {
  const next = props.notes.map((note) =>
    note.id === noteId ? { ...note, resolved: !note.resolved } : note
  )
  emit('update:notes', next)
}

function deleteNote(noteId: string): void {
  if (activeNoteId.value === noteId) {
    activeNoteId.value = null
  }
  emit(
    'update:notes',
    props.notes.filter((note) => note.id !== noteId)
  )
}

function handleSendPendingNotesToAi(): void {
  const payload = formatNotesForAiPrompt(props.notes, props.frames)
  if (payload.noteIds.length === 0) return
  emit('send-notes-to-ai', payload)
}

// ── History & Before/After Compare Actions ────────────────────────────────────────────
function handleSaveSnapshot(): void {
  if (isPeeking.value) return
  const nextNumber = historyState.value.entries.length + 1
  const entry = pushHistorySnapshot(
    `${labels.value.historySnapshotDefault} #${nextNumber}`,
    props.frames
  )
  statusAnnouncement.value = `${labels.value.historySaveSnapshot}: ${entry.label}`
}

function handleHistoryUndo(): void {
  const result = undoSnapshot(historyState.value)
  if (!result.frames) return
  peekingSnapshotId.value = null
  historyState.value = result.state
  emit('update:history', result.state)
  emit('update:frames', result.frames)
}

function handleHistoryRedo(): void {
  const result = redoSnapshot(historyState.value)
  if (!result.frames) return
  peekingSnapshotId.value = null
  historyState.value = result.state
  emit('update:history', result.state)
  emit('update:frames', result.frames)
}

function handleTogglePeek(snapshotId: string): void {
  peekingSnapshotId.value = peekingSnapshotId.value === snapshotId ? null : snapshotId
}

function handleRestoreSnapshot(snapshotId: string): void {
  const result = restoreSnapshot(historyState.value, snapshotId)
  if (!result) return
  peekingSnapshotId.value = null
  historyState.value = result.state
  emit('update:history', result.state)
  emit('update:frames', result.frames)
  statusAnnouncement.value = `${labels.value.historyRestore}: ${result.entry.label}`
}

function openCompareWithSnapshot(snapshotId?: string): void {
  if (!canOpenCompare.value) return
  const entries = historyState.value.entries
  const defaultId =
    snapshotId ?? (entries.length >= 2 ? entries[entries.length - 2]!.id : (entries[0]?.id ?? null))
  if (!defaultId) return
  peekingSnapshotId.value = null
  compareSnapshotId.value = defaultId
  compareSplit.value = 50
  compareOpen.value = true
}

function toggleCompareMode(): void {
  if (compareOpen.value) {
    compareOpen.value = false
    return
  }
  openCompareWithSnapshot()
}

function getEntryDiffSummary(entryIndexInEntries: number): string {
  if (entryIndexInEntries <= 0) return ''
  const prev = historyState.value.entries[entryIndexInEntries - 1]
  const curr = historyState.value.entries[entryIndexInEntries]
  if (!prev || !curr) return ''
  const diff = diffSnapshots(historyState.value, prev.id, curr.id)
  if (diff.changedCount === 0) return ''
  const parts: string[] = []
  if (diff.added.length > 0) parts.push(`+${diff.added.length}`)
  if (diff.modified.length > 0) parts.push(`~${diff.modified.length}`)
  if (diff.removed.length > 0) parts.push(`-${diff.removed.length}`)
  return parts.join(' ')
}

function getEntryTimelineIndex(entryId: string): number {
  return historyState.value.entries.findIndex((entry) => entry.id === entryId)
}

// ── Frame Display Helpers ─────────────────────────────────────────────────────────────
function getFramePreset(frame: TdsCanvasFrame): DevicePreset {
  return getDevicePresetById(frame.deviceId)
}

function getFrameOuterStyle(frame: TdsCanvasFrame): Record<string, string> {
  const size = resolveFrameOuterSize(frame)
  return {
    width: `${size.width}px`,
    height: `${size.height}px`
  }
}

function getFramePositionStyle(frame: TdsCanvasFrame): Record<string, string> {
  return {
    transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`
  }
}

function getFrameDimensionText(frame: TdsCanvasFrame): string {
  const logical = resolveFrameLogicalSize(frame)
  const preset = getFramePreset(frame)
  const name = isResponsivePreset(preset)
    ? labels.value.deviceResponsive
    : preset.shortName || preset.name
  return `${name} · ${logical.width}×${logical.height}`
}

function getFrameLint(frameId: string): TdsCanvasLintCount | null {
  return props.lintCounts?.[frameId] ?? null
}

function getGuideStyle(guide: SnapGuide): Record<string, string> {
  if (guide.axis === 'x') {
    return {
      left: `${guide.position}px`,
      top: `${guide.start}px`,
      height: `${Math.max(1, guide.end - guide.start)}px`
    }
  }
  return {
    left: `${guide.start}px`,
    top: `${guide.position}px`,
    width: `${Math.max(1, guide.end - guide.start)}px`
  }
}

function formatPresetOptionLabel(preset: DevicePreset): string {
  return preset.id === RESPONSIVE_PRESET_ID ? labels.value.deviceResponsive : preset.name
}

// ── Keyboard Shortcuts & Lifecycle ────────────────────────────────────────────────────
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function onKeyDown(event: KeyboardEvent): void {
  if (isEditableTarget(event.target)) return

  if (event.code === 'Space') {
    if (!spaceHeld.value) {
      spaceHeld.value = true
    }
    return
  }

  if (event.key === 'Escape') {
    if (noteDraft.value) {
      noteDraft.value = null
      return
    }
    if (compareOpen.value) {
      compareOpen.value = false
      return
    }
    if (peekingSnapshotId.value) {
      peekingSnapshotId.value = null
      return
    }
    activeNoteId.value = null
    activeTool.value = 'select'
    return
  }

  const key = event.key.toLowerCase()
  const mod = event.ctrlKey || event.metaKey

  if (!mod && !event.altKey) {
    if (key === 'v') {
      activeTool.value = 'select'
    } else if (key === 'h') {
      activeTool.value = 'hand'
    } else if (key === 'c') {
      activeTool.value = 'note'
    }
    return
  }

  if (mod && key === '0') {
    event.preventDefault()
    resetZoom()
  } else if (mod && (key === '=' || key === '+')) {
    event.preventDefault()
    zoomByFactor(1.25)
  } else if (mod && key === '-') {
    event.preventDefault()
    zoomByFactor(0.8)
  } else if (mod && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) {
      handleHistoryRedo()
    } else {
      handleHistoryUndo()
    }
  }
}

function onKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') {
    spaceHeld.value = false
  }
}

function measureViewport(): void {
  const el = viewportRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const w = rect.width || el.clientWidth
  const h = rect.height || el.clientHeight
  if (w > 0 && h > 0) {
    containerWidth.value = w
    containerHeight.value = h
  }
}

onMounted(() => {
  measureViewport()
  if (typeof ResizeObserver !== 'undefined' && viewportRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        containerWidth.value = width
        containerHeight.value = height
      }
    })
    resizeObserver.observe(viewportRef.value)
  }
  if (hasWindow()) {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  }
  if (props.frames.length > 0 && containerWidth.value > 0 && containerHeight.value > 0) {
    viewport.value = computeViewportFit(props.frames, {
      width: containerWidth.value,
      height: containerHeight.value
    })
  }
})

onBeforeUnmount(() => {
  cancelViewportSpring()
  if (wheelIdleTimer !== null) {
    clearTimeout(wheelIdleTimer)
    wheelIdleTimer = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  if (hasWindow()) {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }
  if (hasDocument()) {
    spaceHeld.value = false
  }
})
</script>

<template>
  <section
    class="TdsDesignCanvas"
    :class="{
      'is-interacting': isInteracting,
      'is-hand-mode': effectiveHandMode,
      'is-note-mode': activeTool === 'note'
    }"
    data-testid="tds-design-canvas"
  >
    <!-- Live status announcements for screen readers (clip pattern, never display:none) -->
    <div class="TdsDesignCanvas-SrOnly" role="status" aria-live="polite">
      {{ statusAnnouncement }}
    </div>

    <!-- Primary single-row toolbar separated by a 1px hairline border -->
    <header class="TdsDesignCanvas-Toolbar" data-testid="tds-canvas-toolbar">
      <div class="TdsDesignCanvas-Group" role="group">
        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :class="{ 'is-active': activeTool === 'select' && !spaceHeld }"
          :aria-pressed="activeTool === 'select' && !spaceHeld"
          :title="labels.selectTool"
          :aria-label="labels.selectTool"
          data-testid="tds-canvas-tool-select"
          @click="activeTool = 'select'"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-cursor-line" />
          </span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :class="{ 'is-active': effectiveHandMode }"
          :aria-pressed="effectiveHandMode"
          :title="labels.handTool"
          :aria-label="labels.handTool"
          data-testid="tds-canvas-tool-hand"
          @click="activeTool = 'hand'"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-hand" />
          </span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :class="{ 'is-active': activeTool === 'note' && !spaceHeld }"
          :aria-pressed="activeTool === 'note' && !spaceHeld"
          :title="labels.noteTool"
          :aria-label="labels.noteTool"
          data-testid="tds-canvas-tool-note"
          @click="activeTool = activeTool === 'note' ? 'select' : 'note'"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-chat-new-line" />
          </span>
        </button>
      </div>

      <span class="TdsDesignCanvas-Sep" aria-hidden="true" />

      <div class="TdsDesignCanvas-Group" role="group">
        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :title="labels.zoomOut"
          :aria-label="labels.zoomOut"
          data-testid="tds-canvas-zoom-out"
          @click="zoomByFactor(0.8)"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-subtract-line" />
          </span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-ZoomBtn"
          :title="labels.zoomReset"
          :aria-label="labels.zoomReset"
          data-testid="tds-canvas-zoom-readout"
          @click="resetZoom"
        >
          {{ zoomPercent }}%
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :title="labels.zoomIn"
          :aria-label="labels.zoomIn"
          data-testid="tds-canvas-zoom-in"
          @click="zoomByFactor(1.25)"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-add-line" />
          </span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :title="labels.fitToScreen"
          :aria-label="labels.fitToScreen"
          data-testid="tds-canvas-fit"
          @click="fitToScreen"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-fullscreen-exit-line" />
          </span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :disabled="frames.length === 0 || isPeeking"
          :title="labels.autoArrange"
          :aria-label="labels.autoArrange"
          data-testid="tds-canvas-arrange"
          @click="handleAutoArrange"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-layout-grid-line" />
          </span>
        </button>
      </div>

      <div class="TdsDesignCanvas-ToolbarEnd">
        <button
          v-if="aiActionsEnabled && pendingNotes.length > 0"
          type="button"
          class="TdsDesignCanvas-PillBtn is-primary"
          data-testid="tds-canvas-send-notes-ai"
          @click="handleSendPendingNotesToAi"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-sparkling-2-line" />
          </span>
          <span>{{ labels.sendNotesToAi }}</span>
          <span class="TdsDesignCanvas-Count">{{ pendingNotes.length }}</span>
        </button>

        <TxPopover
          v-model="addFrameMenuOpen"
          trigger="click"
          placement="bottom-end"
          :offset="6"
          :match-reference-width="false"
          :min-width="248"
          :panel-radius="12"
          :panel-padding="8"
          :panel-card="SHELL_MENU_CARD"
          panel-background="refraction"
        >
          <template #reference>
            <button
              type="button"
              class="TdsDesignCanvas-PillBtn"
              :class="{ 'is-active': addFrameMenuOpen }"
              :aria-expanded="addFrameMenuOpen"
              data-testid="tds-canvas-add-frame-trigger"
            >
              <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                <span class="i-ri-add-line" />
              </span>
              <span>{{ labels.addFrame }}</span>
            </button>
          </template>

          <div class="TdsDesignCanvas-PresetPopover">
            <label class="TdsDesignCanvas-SearchField">
              <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                <span class="i-ri-search-line" />
              </span>
              <input
                v-model="addFrameQuery"
                type="search"
                class="TdsDesignCanvas-SearchInput"
                :placeholder="labels.deviceSearchPlaceholder"
                :aria-label="labels.deviceSearchPlaceholder"
                data-testid="tds-canvas-add-frame-search"
              />
            </label>
            <div class="TdsDesignCanvas-PresetList">
              <button
                v-for="preset in filteredAddPresets"
                :key="preset.id"
                type="button"
                class="TdsDesignCanvas-PresetItem"
                :data-testid="`tds-canvas-add-preset-${preset.id}`"
                @click="handleAddFrame(preset)"
              >
                <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                  <span :class="getDeviceCategoryIcon(preset.category)" />
                </span>
                <span class="TdsDesignCanvas-PresetName">{{
                  formatPresetOptionLabel(preset)
                }}</span>
                <span v-if="preset.width > 0" class="TdsDesignCanvas-PresetDim">
                  {{ preset.width }}×{{ preset.height }}
                </span>
              </button>
            </div>
          </div>
        </TxPopover>

        <button
          type="button"
          class="TdsDesignCanvas-PillBtn"
          :class="{ 'is-active': historyOpen }"
          :aria-pressed="historyOpen"
          :title="labels.historyToggle"
          data-testid="tds-canvas-history-toggle"
          @click="historyOpen = !historyOpen"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-history-line" />
          </span>
          <span>{{ labels.historyToggle }}</span>
          <span v-if="historyState.entries.length > 0" class="TdsDesignCanvas-Count">
            {{ historyState.entries.length }}
          </span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-PillBtn"
          :class="{ 'is-active': compareOpen }"
          :aria-pressed="compareOpen"
          :disabled="!canOpenCompare"
          :title="labels.compareToggle"
          data-testid="tds-canvas-compare-toggle"
          @click="toggleCompareMode"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-split-cells-horizontal" />
          </span>
          <span>{{ labels.compareToggle }}</span>
        </button>
      </div>
    </header>

    <!-- Contextual inspector bar for the currently selected frame -->
    <div
      v-if="selectedFrame && !compareOpen"
      class="TdsDesignCanvas-Inspector"
      data-testid="tds-canvas-inspector"
    >
      <span class="TdsDesignCanvas-InspectorTitle">{{ selectedFrame.title }}</span>

      <TxPopover
        v-model="deviceMenuOpen"
        trigger="click"
        placement="bottom-start"
        :offset="6"
        :match-reference-width="false"
        :min-width="248"
        :panel-radius="12"
        :panel-padding="8"
        :panel-card="SHELL_MENU_CARD"
        panel-background="refraction"
      >
        <template #reference>
          <button
            type="button"
            class="TdsDesignCanvas-PillBtn"
            :class="{ 'is-active': deviceMenuOpen }"
            :disabled="isPeeking"
            :aria-expanded="deviceMenuOpen"
            :title="labels.deviceSwitcher"
            data-testid="tds-canvas-device-switcher"
          >
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span :class="getDeviceCategoryIcon(getFramePreset(selectedFrame).category)" />
            </span>
            <span>{{ getFrameDimensionText(selectedFrame) }}</span>
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span class="i-ri-arrow-down-s-line" />
            </span>
          </button>
        </template>

        <div class="TdsDesignCanvas-PresetPopover">
          <label class="TdsDesignCanvas-SearchField">
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span class="i-ri-search-line" />
            </span>
            <input
              v-model="deviceQuery"
              type="search"
              class="TdsDesignCanvas-SearchInput"
              :placeholder="labels.deviceSearchPlaceholder"
              :aria-label="labels.deviceSearchPlaceholder"
              data-testid="tds-canvas-device-search"
            />
          </label>
          <div class="TdsDesignCanvas-PresetList">
            <button
              v-for="preset in filteredDevicePresets"
              :key="preset.id"
              type="button"
              class="TdsDesignCanvas-PresetItem"
              :class="{ 'is-selected': selectedFrame.deviceId === preset.id }"
              :data-testid="`tds-canvas-device-option-${preset.id}`"
              @click="handleSwitchSelectedDevice(preset)"
            >
              <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                <span :class="getDeviceCategoryIcon(preset.category)" />
              </span>
              <span class="TdsDesignCanvas-PresetName">{{ formatPresetOptionLabel(preset) }}</span>
              <span v-if="preset.width > 0" class="TdsDesignCanvas-PresetDim">
                {{ preset.width }}×{{ preset.height }}
              </span>
            </button>
          </div>
        </div>
      </TxPopover>

      <button
        v-if="canRotateSelectedFrame"
        type="button"
        class="TdsDesignCanvas-IconBtn"
        :class="{ 'is-active': selectedFrame.orientation === 'landscape' }"
        :disabled="isPeeking"
        :title="labels.rotateOrientation"
        :aria-label="labels.rotateOrientation"
        data-testid="tds-canvas-frame-rotate"
        @click="handleToggleSelectedOrientation"
      >
        <span class="TdsDesignCanvas-Icon" aria-hidden="true">
          <span class="i-ri-clockwise-line" />
        </span>
      </button>

      <button
        v-if="canToggleSelectedShell"
        type="button"
        class="TdsDesignCanvas-IconBtn"
        :class="{ 'is-active': selectedFrame.showShell !== false }"
        :disabled="isPeeking"
        :title="labels.toggleShell"
        :aria-label="labels.toggleShell"
        data-testid="tds-canvas-frame-shell"
        @click="handleToggleSelectedShell"
      >
        <span class="TdsDesignCanvas-Icon" aria-hidden="true">
          <span class="i-ri-device-line" />
        </span>
      </button>

      <div class="TdsDesignCanvas-InspectorEnd">
        <TxPopover
          v-if="aiActionsEnabled"
          v-model="askFrameMenuOpen"
          trigger="click"
          placement="bottom-end"
          :offset="6"
          :match-reference-width="false"
          :min-width="268"
          :panel-radius="12"
          :panel-padding="10"
          :panel-card="SHELL_MENU_CARD"
          panel-background="refraction"
        >
          <template #reference>
            <button
              type="button"
              class="TdsDesignCanvas-PillBtn"
              :class="{ 'is-active': askFrameMenuOpen }"
              :disabled="isPeeking"
              data-testid="tds-canvas-ask-frame-trigger"
            >
              <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                <span class="i-ri-sparkling-2-line" />
              </span>
              <span>{{ labels.askFrameAi }}</span>
            </button>
          </template>

          <div class="TdsDesignCanvas-AskPopover">
            <textarea
              ref="askFrameInputRef"
              v-model="askFramePrompt"
              class="TdsDesignCanvas-Textarea"
              rows="3"
              :placeholder="labels.askFramePlaceholder"
              data-testid="tds-canvas-ask-frame-input"
            />
            <div class="TdsDesignCanvas-AskActions">
              <button
                type="button"
                class="TdsDesignCanvas-PillBtn is-primary"
                :disabled="!askFramePrompt.trim()"
                data-testid="tds-canvas-ask-frame-submit"
                @click="handleSubmitAskFrameAi"
              >
                <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                  <span class="i-ri-send-plane-2-line" />
                </span>
                <span>{{ labels.askFrameSend }}</span>
              </button>
            </div>
          </div>
        </TxPopover>
      </div>
    </div>

    <!-- Toggleable compact History Bar -->
    <div v-if="historyOpen" class="TdsDesignCanvas-HistoryBar" data-testid="tds-canvas-history-bar">
      <div class="TdsDesignCanvas-HistoryControls">
        <button
          type="button"
          class="TdsDesignCanvas-PillBtn"
          :disabled="isPeeking || frames.length === 0"
          data-testid="tds-canvas-history-save"
          @click="handleSaveSnapshot"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-save-line" />
          </span>
          <span>{{ labels.historySaveSnapshot }}</span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :disabled="!canUndo"
          :title="labels.historyUndo"
          :aria-label="labels.historyUndo"
          data-testid="tds-canvas-history-undo"
          @click="handleHistoryUndo"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-arrow-go-back-line" />
          </span>
        </button>

        <button
          type="button"
          class="TdsDesignCanvas-IconBtn"
          :disabled="!canRedo"
          :title="labels.historyRedo"
          :aria-label="labels.historyRedo"
          data-testid="tds-canvas-history-redo"
          @click="handleHistoryRedo"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-arrow-go-forward-line" />
          </span>
        </button>
      </div>

      <div v-if="historyEntriesReversed.length === 0" class="TdsDesignCanvas-HistoryEmpty">
        {{ labels.historyEmpty }}
      </div>

      <div v-else class="TdsDesignCanvas-HistoryList">
        <div
          v-for="entry in historyEntriesReversed"
          :key="entry.id"
          class="TdsDesignCanvas-HistoryItem"
          :class="{
            'is-current': getEntryTimelineIndex(entry.id) === historyState.cursor,
            'is-peeking': peekingSnapshotId === entry.id
          }"
          :data-testid="`tds-canvas-history-entry-${entry.id}`"
        >
          <span class="TdsDesignCanvas-HistoryLabel">{{ entry.label }}</span>
          <span
            v-if="getEntryDiffSummary(getEntryTimelineIndex(entry.id))"
            class="TdsDesignCanvas-HistoryDiff"
          >
            {{ getEntryDiffSummary(getEntryTimelineIndex(entry.id)) }}
          </span>
          <button
            type="button"
            class="TdsDesignCanvas-MiniBtn"
            :class="{ 'is-active': peekingSnapshotId === entry.id }"
            :data-testid="`tds-canvas-history-peek-${entry.id}`"
            @click="handleTogglePeek(entry.id)"
          >
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span class="i-ri-eye-line" />
            </span>
            <span>{{
              peekingSnapshotId === entry.id ? labels.historyExitPeek : labels.historyPeek
            }}</span>
          </button>
          <button
            type="button"
            class="TdsDesignCanvas-MiniBtn"
            :data-testid="`tds-canvas-history-restore-${entry.id}`"
            @click="handleRestoreSnapshot(entry.id)"
          >
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span class="i-ri-restart-line" />
            </span>
            <span>{{ labels.historyRestore }}</span>
          </button>
          <button
            type="button"
            class="TdsDesignCanvas-MiniBtn"
            :disabled="!canOpenCompare"
            :data-testid="`tds-canvas-history-compare-${entry.id}`"
            @click="openCompareWithSnapshot(entry.id)"
          >
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span class="i-ri-split-cells-horizontal" />
            </span>
            <span>{{ labels.compareToggle }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Non-destructive Peek Mode Banner -->
    <div
      v-if="peekingEntry"
      class="TdsDesignCanvas-PeekBanner"
      data-testid="tds-canvas-peek-banner"
    >
      <span class="TdsDesignCanvas-Icon" aria-hidden="true">
        <span class="i-ri-eye-line" />
      </span>
      <span>{{ labels.historyPeek }}: {{ peekingEntry.label }}</span>
      <button
        type="button"
        class="TdsDesignCanvas-MiniBtn"
        data-testid="tds-canvas-peek-restore"
        @click="handleRestoreSnapshot(peekingEntry.id)"
      >
        {{ labels.historyRestore }}
      </button>
      <button
        type="button"
        class="TdsDesignCanvas-MiniBtn"
        data-testid="tds-canvas-peek-exit"
        @click="peekingSnapshotId = null"
      >
        {{ labels.historyExitPeek }}
      </button>
    </div>

    <!-- Before / After Split-Slider Compare Overlay -->
    <div
      v-if="compareOpen"
      class="TdsDesignCanvas-CompareOverlay"
      data-testid="tds-canvas-compare-overlay"
    >
      <div class="TdsDesignCanvas-CompareHeader">
        <div class="TdsDesignCanvas-CompareMeta">
          <span class="TdsDesignCanvas-CompareTitle">
            {{ compareTargetFrame?.title ?? '' }}
          </span>
          <span class="TdsDesignCanvas-CompareLabel">{{ labels.compareSelectSnapshot }}:</span>
          <div class="TdsDesignCanvas-ComparePills">
            <button
              v-for="entry in historyEntriesReversed"
              :key="entry.id"
              type="button"
              class="TdsDesignCanvas-MiniBtn"
              :class="{ 'is-active': compareSnapshotId === entry.id }"
              :data-testid="`tds-canvas-compare-pick-${entry.id}`"
              @click="compareSnapshotId = entry.id"
            >
              {{ entry.label }}
            </button>
          </div>
        </div>

        <button
          type="button"
          class="TdsDesignCanvas-PillBtn"
          data-testid="tds-canvas-compare-exit"
          @click="compareOpen = false"
        >
          <span class="TdsDesignCanvas-Icon" aria-hidden="true">
            <span class="i-ri-close-line" />
          </span>
          <span>{{ labels.compareExit }}</span>
        </button>
      </div>

      <div v-if="compareTargetFrame && compareBeforeFrame" class="TdsDesignCanvas-CompareBody">
        <div class="TdsDesignCanvas-CompareStage">
          <div
            class="TdsDesignCanvas-CompareLayer TdsDesignCanvas-CompareLayer--before"
            data-testid="tds-canvas-compare-before"
          >
            <span class="TdsDesignCanvas-CompareBadge TdsDesignCanvas-CompareBadge--left">
              {{ labels.compareBefore }}
            </span>
            <TdsDeviceFrame
              :preset="getFramePreset(compareBeforeFrame)"
              :orientation="compareBeforeFrame.orientation ?? 'portrait'"
              :show-shell="compareBeforeFrame.showShell ?? true"
              :stage-padding="16"
              :show-meta="false"
            >
              <iframe
                class="TdsDesignCanvas-Iframe is-blocked"
                :sandbox="getFrameIframeSandbox(compareBeforeFrame.kind)"
                :title="`${compareBeforeFrame.title} (${labels.compareBefore})`"
                :srcdoc="
                  buildSandboxedFrameSrcdoc(compareBeforeFrame.source, compareBeforeFrame.kind)
                "
                data-testid="tds-canvas-compare-before-iframe"
              />
            </TdsDeviceFrame>
          </div>

          <div
            class="TdsDesignCanvas-CompareLayer TdsDesignCanvas-CompareLayer--after"
            :style="compareAfterStyle"
            data-testid="tds-canvas-compare-after"
          >
            <span class="TdsDesignCanvas-CompareBadge TdsDesignCanvas-CompareBadge--right">
              {{ labels.compareAfter }}
            </span>
            <TdsDeviceFrame
              :preset="getFramePreset(compareTargetFrame)"
              :orientation="compareTargetFrame.orientation ?? 'portrait'"
              :show-shell="compareTargetFrame.showShell ?? true"
              :stage-padding="16"
              :show-meta="false"
            >
              <iframe
                class="TdsDesignCanvas-Iframe is-blocked"
                :sandbox="getFrameIframeSandbox(compareTargetFrame.kind)"
                :title="`${compareTargetFrame.title} (${labels.compareAfter})`"
                :srcdoc="
                  buildSandboxedFrameSrcdoc(compareTargetFrame.source, compareTargetFrame.kind)
                "
                data-testid="tds-canvas-compare-after-iframe"
              />
            </TdsDeviceFrame>
          </div>

          <div
            class="TdsDesignCanvas-CompareDivider"
            :style="compareDividerStyle"
            aria-hidden="true"
          />
        </div>

        <div class="TdsDesignCanvas-CompareSliderRow">
          <span class="TdsDesignCanvas-CompareEndpoint">{{ labels.compareBefore }}</span>
          <input
            v-model.number="compareSplit"
            type="range"
            min="0"
            max="100"
            step="1"
            class="TdsDesignCanvas-CompareRange"
            :aria-label="labels.compareToggle"
            data-testid="tds-canvas-compare-slider"
          />
          <span class="TdsDesignCanvas-CompareEndpoint">{{ labels.compareAfter }}</span>
          <span class="TdsDesignCanvas-ComparePercent">{{ compareSplit }}%</span>
        </div>
      </div>

      <div v-else class="TdsDesignCanvas-CompareEmpty">
        {{ labels.compareNoEarlierSnapshot }}
      </div>
    </div>

    <!-- Main Infinite Pan/Zoom Stage -->
    <div
      v-else
      ref="viewportRef"
      class="TdsDesignCanvas-Stage"
      :class="{ 'is-interacting': isInteracting }"
      data-testid="tds-canvas-stage"
      @wheel.prevent="onViewportWheel"
      @pointerdown="onViewportPointerDown"
      @pointermove="onViewportPointerMove"
      @pointerup="finishPointerInteraction"
      @pointercancel="finishPointerInteraction"
    >
      <!-- Empty state when no frames exist yet -->
      <div
        v-if="displayedFrames.length === 0"
        class="TdsDesignCanvas-Empty"
        data-testid="tds-canvas-empty"
      >
        <span class="TdsDesignCanvas-EmptyIcon" aria-hidden="true">
          <span class="i-ri-artboard-2-line" />
        </span>
        <h3 class="TdsDesignCanvas-EmptyTitle">{{ labels.emptyTitle }}</h3>
        <p class="TdsDesignCanvas-EmptyDesc">{{ labels.emptyDescription }}</p>
        <div class="TdsDesignCanvas-EmptyActions">
          <button
            type="button"
            class="TdsDesignCanvas-PillBtn is-primary"
            data-testid="tds-canvas-empty-add-phone"
            @click="handleAddFrame(getDevicePresetById('iphone-17-pro'))"
          >
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span class="i-ri-add-line" />
            </span>
            <span>{{ labels.emptyAddPhone }}</span>
          </button>
          <button
            type="button"
            class="TdsDesignCanvas-PillBtn"
            data-testid="tds-canvas-empty-add-desktop"
            @click="handleAddFrame(getDevicePresetById('desktop-hd'))"
          >
            <span class="TdsDesignCanvas-Icon" aria-hidden="true">
              <span class="i-ri-add-line" />
            </span>
            <span>{{ labels.emptyAddDesktop }}</span>
          </button>
        </div>
      </div>

      <!-- Transformed World Container -->
      <div v-else class="TdsDesignCanvas-World" :style="worldStyle" data-testid="tds-canvas-world">
        <!-- Multi-Frame Artboards -->
        <article
          v-for="frame in displayedFrames"
          :key="frame.id"
          class="TdsDesignCanvas-Frame"
          :class="{
            'is-selected': activeFrameId === frame.id,
            'is-dragging': draggingFrameId === frame.id
          }"
          :style="getFramePositionStyle(frame)"
          :data-frame-id="frame.id"
          :data-testid="`tds-canvas-frame-${frame.id}`"
        >
          <!-- Inverse-scaled frame title bar -->
          <div class="TdsDesignCanvas-FrameHeader">
            <button
              type="button"
              class="TdsDesignCanvas-FrameDrag"
              :data-testid="`tds-canvas-frame-drag-${frame.id}`"
              @pointerdown="onFrameDragPointerDown(frame, $event)"
              @click="selectFrame(frame.id)"
            >
              <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                <span class="i-ri-drag-move-2-line" />
              </span>
              <span class="TdsDesignCanvas-FrameTitle">{{ frame.title }}</span>
            </button>

            <span class="TdsDesignCanvas-FrameDim">{{ getFrameDimensionText(frame) }}</span>

            <button
              v-if="getFrameLint(frame.id)"
              type="button"
              class="TdsDesignCanvas-LintBadge"
              :class="{
                'is-danger': (getFrameLint(frame.id)?.errors ?? 0) > 0,
                'is-warning':
                  (getFrameLint(frame.id)?.errors ?? 0) === 0 &&
                  (getFrameLint(frame.id)?.warnings ?? 0) > 0,
                'is-clean':
                  (getFrameLint(frame.id)?.errors ?? 0) === 0 &&
                  (getFrameLint(frame.id)?.warnings ?? 0) === 0
              }"
              :title="labels.lintBadgeTitle"
              :aria-label="labels.lintBadgeTitle"
              :data-testid="`tds-canvas-frame-lint-${frame.id}`"
              @click.stop="emit('open-lint', frame.id)"
            >
              <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                <span
                  :class="
                    (getFrameLint(frame.id)?.errors ?? 0) > 0
                      ? 'i-ri-error-warning-line'
                      : (getFrameLint(frame.id)?.warnings ?? 0) > 0
                        ? 'i-ri-alert-line'
                        : 'i-ri-checkbox-circle-line'
                  "
                />
              </span>
              <span
                v-if="
                  (getFrameLint(frame.id)?.errors ?? 0) + (getFrameLint(frame.id)?.warnings ?? 0) >
                  0
                "
              >
                {{
                  (getFrameLint(frame.id)?.errors ?? 0) + (getFrameLint(frame.id)?.warnings ?? 0)
                }}
              </span>
              <span v-else>{{ labels.lintClean }}</span>
            </button>

            <button
              v-if="!isPeeking"
              type="button"
              class="TdsDesignCanvas-FrameDelete"
              :title="labels.deleteFrame"
              :aria-label="labels.deleteFrame"
              :data-testid="`tds-canvas-frame-delete-${frame.id}`"
              @click.stop="emit('delete-frame', frame.id)"
            >
              <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                <span class="i-ri-delete-bin-line" />
              </span>
            </button>
          </div>

          <!-- Frame Surface wrapped in M1 TdsDeviceFrame -->
          <div
            class="TdsDesignCanvas-FrameBody"
            :style="getFrameOuterStyle(frame)"
            @pointerdown="selectFrame(frame.id)"
          >
            <TdsDeviceFrame
              :preset="getFramePreset(frame)"
              :orientation="frame.orientation ?? 'portrait'"
              :show-shell="frame.showShell ?? true"
              :stage-padding="0"
              :show-meta="false"
            >
              <iframe
                class="TdsDesignCanvas-Iframe"
                :class="{ 'is-blocked': iframesBlocked }"
                :sandbox="getFrameIframeSandbox(frame.kind)"
                :title="frame.title"
                :srcdoc="buildSandboxedFrameSrcdoc(frame.source, frame.kind)"
                :data-testid="`tds-canvas-frame-iframe-${frame.id}`"
              />
            </TdsDeviceFrame>

            <!-- Note drop capture surface active when Pin Note tool (`C`) is selected -->
            <button
              v-if="activeTool === 'note' && !isPeeking"
              type="button"
              class="TdsDesignCanvas-NoteSurface"
              :aria-label="labels.noteTool"
              :data-testid="`tds-canvas-note-surface-${frame.id}`"
              @click="onNoteSurfaceClick(frame, $event)"
            />

            <!-- Existing Figma-style numbered pin notes -->
            <div
              v-for="note in notesByFrameId.get(frame.id) ?? []"
              :key="note.id"
              class="TdsDesignCanvas-PinAnchor"
              :style="{
                left: `${note.xRatio * 100}%`,
                top: `${note.yRatio * 100}%`
              }"
            >
              <button
                type="button"
                class="TdsDesignCanvas-PinBtn"
                :class="{
                  'is-resolved': note.resolved,
                  'is-active': activeNoteId === note.id
                }"
                :aria-expanded="activeNoteId === note.id"
                :aria-label="`${labels.notesPanelTitle} #${noteIndexById.get(note.id) ?? 1}`"
                :data-testid="`tds-canvas-pin-${note.id}`"
                @click.stop="activeNoteId = activeNoteId === note.id ? null : note.id"
              >
                {{ noteIndexById.get(note.id) ?? 1 }}
              </button>

              <div
                v-if="activeNoteId === note.id"
                class="TdsDesignCanvas-PinCard"
                :data-testid="`tds-canvas-pin-card-${note.id}`"
                @pointerdown.stop
              >
                <p class="TdsDesignCanvas-PinText">{{ note.text }}</p>
                <div class="TdsDesignCanvas-PinActions">
                  <button
                    type="button"
                    class="TdsDesignCanvas-MiniBtn"
                    :data-testid="`tds-canvas-pin-resolve-${note.id}`"
                    @click.stop="toggleNoteResolved(note.id)"
                  >
                    <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                      <span class="i-ri-check-line" />
                    </span>
                    <span>{{ note.resolved ? labels.noteReopen : labels.noteResolve }}</span>
                  </button>
                  <button
                    type="button"
                    class="TdsDesignCanvas-MiniBtn is-danger"
                    :data-testid="`tds-canvas-pin-delete-${note.id}`"
                    @click.stop="deleteNote(note.id)"
                  >
                    <span class="TdsDesignCanvas-Icon" aria-hidden="true">
                      <span class="i-ri-delete-bin-line" />
                    </span>
                    <span>{{ labels.noteDelete }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Inline Pin Note Composer when placing a new note on this frame -->
            <div
              v-if="noteDraft && noteDraft.frameId === frame.id"
              class="TdsDesignCanvas-PinAnchor is-draft"
              :style="{
                left: `${noteDraft.xRatio * 100}%`,
                top: `${noteDraft.yRatio * 100}%`
              }"
              @pointerdown.stop
            >
              <span class="TdsDesignCanvas-PinBtn is-draft" aria-hidden="true">+</span>
              <div class="TdsDesignCanvas-PinCard" data-testid="tds-canvas-note-composer">
                <textarea
                  :ref="setNoteInputEl"
                  v-model="noteDraft.text"
                  class="TdsDesignCanvas-Textarea"
                  rows="2"
                  :placeholder="labels.notePlaceholder"
                  data-testid="tds-canvas-note-input"
                  @keydown.meta.enter.prevent="saveNoteDraft"
                  @keydown.ctrl.enter.prevent="saveNoteDraft"
                />
                <div class="TdsDesignCanvas-PinActions">
                  <button
                    type="button"
                    class="TdsDesignCanvas-MiniBtn"
                    data-testid="tds-canvas-note-cancel"
                    @click.stop="cancelNoteDraft"
                  >
                    {{ labels.noteCancel }}
                  </button>
                  <button
                    type="button"
                    class="TdsDesignCanvas-MiniBtn is-primary"
                    :disabled="!noteDraft.text.trim()"
                    data-testid="tds-canvas-note-save"
                    @click.stop="saveNoteDraft"
                  >
                    {{ labels.noteSave }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- Visual 6-Anchor Snap Guides -->
        <div
          v-for="(guide, idx) in activeSnapGuides"
          :key="`${guide.axis}-${guide.position}-${idx}`"
          class="TdsDesignCanvas-SnapGuide"
          :class="guide.axis === 'x' ? 'is-vertical' : 'is-horizontal'"
          :style="getGuideStyle(guide)"
          data-testid="tds-canvas-snap-guide"
          aria-hidden="true"
        />
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.TdsDesignCanvas {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--shell-surface);
  color: var(--shell-text-primary);
  font-family: var(--shell-font-sans);
  font-size: var(--shell-fs-body);
}

.TdsDesignCanvas-SrOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.TdsDesignCanvas-Icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

.TdsDesignCanvas-Toolbar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: center;
  min-height: 38px;
  padding: 5px var(--shell-space-3);
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-bg);
}

.TdsDesignCanvas-ToolbarEnd {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--shell-space-1);
  align-items: center;
  margin-left: auto;
}

.TdsDesignCanvas-Group {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.TdsDesignCanvas-Sep {
  width: 1px;
  height: 16px;
  background: var(--shell-border);
}

.TdsDesignCanvas-IconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.TdsDesignCanvas-ZoomBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }
}

.TdsDesignCanvas-PillBtn {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  height: 26px;
  padding: 0 9px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  line-height: 1;
  box-shadow: inset 0 0 0 1px var(--shell-border);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  &.is-primary {
    background: var(--shell-primary);
    color: var(--shell-on-primary);
    box-shadow: none;

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--shell-primary) 90%, var(--shell-text-primary));
      color: var(--shell-on-primary);
    }
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.TdsDesignCanvas-Count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--shell-radius-full);
  background: color-mix(in srgb, currentColor 16%, transparent);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.TdsDesignCanvas-Inspector {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: center;
  min-height: 34px;
  padding: 4px var(--shell-space-3);
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-surface);
}

.TdsDesignCanvas-InspectorTitle {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-semibold);
}

.TdsDesignCanvas-InspectorEnd {
  display: inline-flex;
  gap: var(--shell-space-1);
  align-items: center;
  margin-left: auto;
}

.TdsDesignCanvas-PresetPopover {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 248px;
}

.TdsDesignCanvas-SearchField {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-secondary);
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.TdsDesignCanvas-SearchInput {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.TdsDesignCanvas-PresetList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
}

.TdsDesignCanvas-PresetItem {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-selected {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }
}

.TdsDesignCanvas-PresetName {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TdsDesignCanvas-PresetDim {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.TdsDesignCanvas-AskPopover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 268px;
}

.TdsDesignCanvas-Textarea {
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-primary);
  font-family: var(--shell-font-sans);
  font-size: var(--shell-fs-sm);
  line-height: 1.45;
  box-shadow: inset 0 0 0 1px var(--shell-border);
  resize: vertical;
  box-sizing: border-box;

  &:focus {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--shell-primary);
  }

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.TdsDesignCanvas-AskActions {
  display: flex;
  justify-content: flex-end;
}

.TdsDesignCanvas-HistoryBar {
  display: flex;
  flex: none;
  gap: var(--shell-space-2);
  align-items: center;
  min-height: 36px;
  padding: 5px var(--shell-space-3);
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-bg);
  overflow-x: auto;
}

.TdsDesignCanvas-HistoryControls {
  display: inline-flex;
  flex: none;
  gap: var(--shell-space-1);
  align-items: center;
}

.TdsDesignCanvas-HistoryEmpty {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.TdsDesignCanvas-HistoryList {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.TdsDesignCanvas-HistoryItem {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
  padding: 3px 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &.is-current {
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
    background: var(--shell-primary-soft);
  }

  &.is-peeking {
    box-shadow: inset 0 0 0 1px var(--shell-warning-border);
    background: var(--shell-warning-soft);
  }
}

.TdsDesignCanvas-HistoryLabel {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  white-space: nowrap;
}

.TdsDesignCanvas-HistoryDiff {
  color: var(--shell-text-secondary);
  font-family: var(--shell-font-mono);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.TdsDesignCanvas-MiniBtn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  box-shadow: inset 0 0 0 1px var(--shell-border);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  &.is-primary {
    background: var(--shell-primary);
    color: var(--shell-on-primary);
    box-shadow: none;
  }

  &.is-danger {
    color: var(--shell-danger);

    &:hover:not(:disabled) {
      background: var(--shell-danger-soft);
      color: var(--shell-danger);
    }
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.TdsDesignCanvas-PeekBanner {
  display: flex;
  flex: none;
  gap: var(--shell-space-2);
  align-items: center;
  padding: 5px var(--shell-space-3);
  border-bottom: 1px solid var(--shell-warning-border);
  background: var(--shell-warning-soft);
  color: var(--shell-warning);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
}

.TdsDesignCanvas-Stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: var(--shell-surface);
  background-image: radial-gradient(circle, var(--shell-border) 1px, transparent 1px);
  background-size: 20px 20px;
  touch-action: none;
  user-select: none;

  .TdsDesignCanvas.is-hand-mode & {
    cursor: grab;
  }

  .TdsDesignCanvas.is-hand-mode &.is-interacting {
    cursor: grabbing;
  }

  .TdsDesignCanvas.is-note-mode & {
    cursor: crosshair;
  }
}

.TdsDesignCanvas-World {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.TdsDesignCanvas-Frame {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  will-change: transform;
}

.TdsDesignCanvas-FrameHeader {
  position: absolute;
  bottom: 100%;
  left: 0;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin-bottom: calc(8px * var(--tds-canvas-lscale, 1));
  transform: scale(var(--tds-canvas-lscale, 1));
  transform-origin: bottom left;
  white-space: nowrap;
}

.TdsDesignCanvas-FrameDrag {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-semibold);
  box-shadow: inset 0 0 0 1px var(--shell-border);
  cursor: grab;

  &:hover {
    background: var(--shell-surface-2);
  }

  .TdsDesignCanvas-Frame.is-selected & {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  .TdsDesignCanvas-Frame.is-dragging & {
    cursor: grabbing;
  }
}

.TdsDesignCanvas-FrameTitle {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.TdsDesignCanvas-FrameDim {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.TdsDesignCanvas-LintBadge {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border: 0;
  border-radius: var(--shell-radius-full);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &.is-danger {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
    box-shadow: inset 0 0 0 1px var(--shell-danger-border);
  }

  &.is-warning {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
    box-shadow: inset 0 0 0 1px var(--shell-warning-border);
  }

  &.is-clean {
    background: var(--shell-success-soft);
    color: var(--shell-success);
    box-shadow: inset 0 0 0 1px var(--shell-success-border);
  }
}

.TdsDesignCanvas-FrameDelete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  box-shadow: inset 0 0 0 1px var(--shell-border);
  cursor: pointer;

  &:hover {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }
}

.TdsDesignCanvas-FrameBody {
  position: relative;
  border-radius: var(--shell-radius-md);
  box-shadow: 0 0 0 calc(1px * var(--tds-canvas-lscale, 1)) var(--shell-border);

  .TdsDesignCanvas-Frame.is-selected & {
    box-shadow: 0 0 0 calc(2px * var(--tds-canvas-lscale, 1)) var(--shell-primary);
  }
}

.TdsDesignCanvas-Iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--shell-bg);

  &.is-blocked,
  .TdsDesignCanvas.is-interacting & {
    pointer-events: none;
  }
}

.TdsDesignCanvas-NoteSurface {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: crosshair;
}

.TdsDesignCanvas-PinAnchor {
  position: absolute;
  z-index: 6;
  transform: translate(-50%, -100%) scale(var(--tds-canvas-lscale, 1));
  transform-origin: bottom center;
}

.TdsDesignCanvas-PinBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-semibold);
  font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 2px var(--shell-bg);
  cursor: pointer;

  &.is-resolved {
    background: var(--shell-success-soft);
    color: var(--shell-success);
    box-shadow:
      inset 0 0 0 1px var(--shell-success-border),
      0 0 0 2px var(--shell-bg);
  }

  &.is-active {
    box-shadow:
      0 0 0 2px var(--shell-bg),
      0 0 0 4px var(--shell-primary-border);
  }
}

.TdsDesignCanvas-PinCard {
  position: absolute;
  top: 0;
  left: calc(100% + 8px);
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 224px;
  padding: 10px;
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  box-shadow:
    inset 0 0 0 1px var(--shell-border-strong),
    0 10px 28px -8px var(--shell-shadow);
  user-select: text;
}

.TdsDesignCanvas-PinText {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  line-height: 1.45;
  text-wrap: pretty;
  white-space: pre-wrap;
  word-break: break-word;
}

.TdsDesignCanvas-PinActions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.TdsDesignCanvas-SnapGuide {
  position: absolute;
  z-index: 10;
  background: var(--shell-primary);
  pointer-events: none;

  &.is-vertical {
    width: calc(1px * var(--tds-canvas-lscale, 1));
  }

  &.is-horizontal {
    height: calc(1px * var(--tds-canvas-lscale, 1));
  }
}

.TdsDesignCanvas-Empty {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: var(--shell-space-5);
  text-align: center;
  box-sizing: border-box;
}

.TdsDesignCanvas-EmptyIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  font-size: 20px;
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.TdsDesignCanvas-EmptyTitle {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  font-weight: var(--shell-font-weight-semibold);
  text-wrap: balance;
}

.TdsDesignCanvas-EmptyDesc {
  max-width: 340px;
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  text-wrap: pretty;
}

.TdsDesignCanvas-EmptyActions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  margin-top: var(--shell-space-1);
}

.TdsDesignCanvas-CompareOverlay {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--shell-surface);
}

.TdsDesignCanvas-CompareHeader {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: center;
  justify-content: space-between;
  padding: 6px var(--shell-space-3);
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-bg);
}

.TdsDesignCanvas-CompareMeta {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: center;
}

.TdsDesignCanvas-CompareTitle {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: var(--shell-font-weight-semibold);
}

.TdsDesignCanvas-CompareLabel {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.TdsDesignCanvas-ComparePills {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.TdsDesignCanvas-CompareBody {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--shell-space-2);
  min-width: 0;
  min-height: 0;
  padding: var(--shell-space-3);
  box-sizing: border-box;
}

.TdsDesignCanvas-CompareStage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 220px;
  overflow: hidden;
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.TdsDesignCanvas-CompareLayer {
  position: absolute;
  inset: 0;
  display: flex;
  width: 100%;
  height: 100%;
}

.TdsDesignCanvas-CompareBadge {
  position: absolute;
  top: 10px;
  z-index: 4;
  padding: 2px 8px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  box-shadow: inset 0 0 0 1px var(--shell-border);
  pointer-events: none;

  &--left {
    left: 10px;
  }

  &--right {
    right: 10px;
  }
}

.TdsDesignCanvas-CompareDivider {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  width: 2px;
  background: var(--shell-primary);
  transform: translateX(-1px);
  pointer-events: none;
}

.TdsDesignCanvas-CompareSliderRow {
  display: flex;
  flex: none;
  gap: var(--shell-space-2);
  align-items: center;
  padding: 6px var(--shell-space-3);
  border-radius: var(--shell-radius-md);
  background: var(--shell-bg);
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.TdsDesignCanvas-CompareEndpoint {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
}

.TdsDesignCanvas-CompareRange {
  flex: 1 1 auto;
  accent-color: var(--shell-primary);
  cursor: ew-resize;
}

.TdsDesignCanvas-ComparePercent {
  min-width: 38px;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.TdsDesignCanvas-CompareEmpty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

@media (prefers-reduced-motion: reduce) {
  .TdsDesignCanvas-World,
  .TdsDesignCanvas-Frame,
  .TdsDesignCanvas-CompareLayer {
    transition: none;
  }
}
</style>
