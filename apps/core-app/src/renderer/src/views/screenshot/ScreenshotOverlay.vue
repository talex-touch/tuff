<script setup lang="ts">
import type {
  ScreenshotGeometryPoint,
  ScreenshotGeometryRect,
  ScreenshotResizeHandle,
  ScreenshotSelectionAnchor
} from '@talex-touch/utils/renderer'
import {
  createScreenshotSelection,
  moveScreenshotSelection,
  nudgeScreenshotSelection,
  projectScreenshotSelection,
  resizeScreenshotSelection,
  setScreenshotSelectionSize,
  snapshotScreenshotSelection,
  screenshotGridCell
} from '@talex-touch/utils/renderer'
import type {
  ScreenshotOverlayCommand,
  ScreenshotOverlayOptions,
  ScreenshotOverlayState
} from '@talex-touch/utils/transport/events/screenshot-session'
import { ScreenshotSessionEvents } from '@talex-touch/utils/transport/events/screenshot-session'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { useI18n } from 'vue-i18n'
import {
  AnnotationDocument,
  renderDocumentToPng,
  drawAnnotationObject,
  drawSelectionBox,
  DEFAULT_ANNOTATION_STYLE,
  PRESET_COLORS,
  PRESET_STROKE_WIDTHS,
  type AnnotationTool,
  type AnnotationStyle,
  type AnnotationObject,
  type AnnotationPoint
} from './annotation'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { shortcutChordLabel } from '~/modules/shortcuts/shortcut-chord'

interface PointerInteraction {
  kind: 'create' | 'move' | 'resize'
  start: ScreenshotGeometryPoint
  original?: ScreenshotGeometryRect
  handle?: ScreenshotResizeHandle
  pointerId: number
}

interface AnnotationDragState {
  kind: 'create' | 'move'
  start: AnnotationPoint
  initialObject?: AnnotationObject
  currentObject?: AnnotationObject
}

const HANDLE_NAMES: ScreenshotResizeHandle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const TARGET_GRID_POINTS = ['nw', 'n', 'ne', 'w', 'center', 'e', 'sw', 's', 'se'] as const
const GRID_CELL_KEYS = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c']

// 9 Viewfinder Points for clean rule-of-thirds framing when screen opens
const VIEWFINDER_POINTS = [
  { id: 'p1', x: '16.6%', y: '16.6%' },
  { id: 'p2', x: '50%', y: '16.6%' },
  { id: 'p3', x: '83.4%', y: '16.6%' },
  { id: 'p4', x: '16.6%', y: '50%' },
  { id: 'p5', x: '50%', y: '50%' },
  { id: 'p6', x: '83.4%', y: '50%' },
  { id: 'p7', x: '16.6%', y: '83.4%' },
  { id: 'p8', x: '50%', y: '83.4%' },
  { id: 'p9', x: '83.4%', y: '83.4%' }
]

const transport = useTuffTransport()
const { t } = useI18n()
// The undo/redo handlers accept ⌘ or Ctrl; the tooltip names the platform's own.
const isMacPlatform = getCurrentRendererPlatformState().isMac
const undoShortcut = shortcutChordLabel({ code: 'KeyZ' }, isMacPlatform)
const redoShortcut = shortcutChordLabel({ code: 'KeyY' }, isMacPlatform)
const handleLabels = computed<Record<ScreenshotResizeHandle, string>>(() => ({
  n: t('screenshot.overlay.handle.n'),
  ne: t('screenshot.overlay.handle.ne'),
  e: t('screenshot.overlay.handle.e'),
  se: t('screenshot.overlay.handle.se'),
  s: t('screenshot.overlay.handle.s'),
  sw: t('screenshot.overlay.handle.sw'),
  w: t('screenshot.overlay.handle.w'),
  nw: t('screenshot.overlay.handle.nw')
}))

const state = ref<ScreenshotOverlayState | null>(null)
const selection = ref<ScreenshotGeometryRect | null>(null)
const interaction = ref<PointerInteraction | null>(null)
const busy = ref(false)
const errorCode = ref('')
const widthInput = ref('')
const heightInput = ref('')
const selectedAnchor = ref<ScreenshotSelectionAnchor>('center')
const pointerLocal = ref<ScreenshotGeometryPoint | null>(null)

// DOM Elements
const toolbarRef = ref<HTMLElement | null>(null)
const frozenImgRef = ref<HTMLImageElement | null>(null)
const loupeCanvasRef = ref<HTMLCanvasElement | null>(null)

// Pixel Loupe State
const loupeColorHex = ref('#007AFF')
const loupeColorRgb = ref('0, 122, 255')

// 9-grid keyboard navigation state
const gridNavActive = ref(false)
const gridStack = ref<ScreenshotGeometryRect[]>([])

// Inline Annotation Editing state
const isEditing = computed(() => state.value?.phase === 'editing')
const editState = computed(() => state.value?.edit ?? null)
const annotationDoc = shallowRef(new AnnotationDocument())
const activeTool = ref<AnnotationTool>('rectangle')
const currentStyle = ref<AnnotationStyle>({ ...DEFAULT_ANNOTATION_STYLE })
const styleCapsuleOpen = ref(false)
const baseImage = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const annotationDrag = ref<AnnotationDragState | null>(null)

let pointerSequence = 0
let disposeStateListener: (() => void) | null = null
let lastHitTestAt = 0
let suppressEscapeUntil = 0
let commitDebounceTimer: ReturnType<typeof setTimeout> | null = null

const displayBounds = computed<ScreenshotGeometryRect | null>(
  () => state.value?.display?.bounds ?? null
)
const selectionBounds = computed<ScreenshotGeometryRect | null>(
  () => state.value?.desktopBounds ?? displayBounds.value
)
const isFrozen = computed(() => state.value?.mode === 'frozen')
const isObjectMode = computed(() => state.value?.targetMode === 'object')

const localCandidate = computed<ScreenshotGeometryRect | null>(() => {
  const current = state.value?.candidate?.bounds
  const display = displayBounds.value
  if (!current || !display) return null
  return projectScreenshotSelection(current, display)
})

const localSelection = computed<ScreenshotGeometryRect | null>(() => {
  const current = selection.value
  const display = displayBounds.value
  if (!current || !display) return null
  return projectScreenshotSelection(current, display)
})

const candidateStyle = computed(() => {
  const candidate = localCandidate.value
  if (!candidate) return { display: 'none' }
  return {
    left: `${candidate.x}px`,
    top: `${candidate.y}px`,
    width: `${candidate.width}px`,
    height: `${candidate.height}px`
  }
})

const selectionStyle = computed(() => {
  const current = localSelection.value
  if (!current) return { display: 'none' }
  return {
    left: `${current.x}px`,
    top: `${current.y}px`,
    width: `${current.width}px`,
    height: `${current.height}px`
  }
})

const safeAreaInsets = computed(() => ({
  top: state.value?.safeAreaInsets?.top ?? 0,
  right: state.value?.safeAreaInsets?.right ?? 0,
  bottom: state.value?.safeAreaInsets?.bottom ?? 0,
  left: state.value?.safeAreaInsets?.left ?? 0
}))

const overlayStyle = computed<Record<string, string>>(() => ({
  '--screenshot-safe-top': `${safeAreaInsets.value.top}px`,
  '--screenshot-safe-right': `${safeAreaInsets.value.right}px`,
  '--screenshot-safe-bottom': `${safeAreaInsets.value.bottom}px`,
  '--screenshot-safe-left': `${safeAreaInsets.value.left}px`
}))

// Whether to show the Pixel Magnifier Loupe
const showLoupe = computed(() => {
  if (isEditing.value || gridNavActive.value || !pointerLocal.value) return false
  if (interaction.value?.kind === 'create') return true
  return !selection.value
})

// Dynamic Loupe positioning (flips when close to screen edges)
const loupeStyle = computed(() => {
  const pt = pointerLocal.value
  const display = displayBounds.value
  if (!pt || !display) return null

  const cardW = 138
  const cardH = 146
  const gap = 16

  let left = pt.x + gap
  let top = pt.y + gap

  if (left + cardW > display.width - 12) {
    left = pt.x - cardW - gap
  }
  if (top + cardH > display.height - 12) {
    top = pt.y - cardH - gap
  }

  return {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`
  }
})

// Smart Toolbar positioning: directly anchors to localSelection, flips above when near bottom
const toolbarStyle = computed(() => {
  const sel = localSelection.value
  const display = displayBounds.value
  if (!sel || !display) return { display: 'none' }

  const tbWidth = toolbarRef.value?.offsetWidth || (isEditing.value ? 540 : 420)
  const tbHeight = toolbarRef.value?.offsetHeight || 40
  const gap = 10

  const safe = safeAreaInsets.value
  const minX = safe.left + 8
  const maxX = display.width - safe.right - tbWidth - 8
  const minY = safe.top + 8
  const maxY = display.height - safe.bottom - tbHeight - 8

  // Right-align with the selection right edge
  let left = sel.x + sel.width - tbWidth
  // If selection is narrower than toolbar, center it
  if (sel.width < tbWidth) {
    left = sel.x + (sel.width - tbWidth) / 2
  }
  left = Math.max(minX, Math.min(left, maxX))

  // Default placement: below selection
  let top = sel.y + sel.height + gap
  // If not enough room below, flip above selection
  if (top > maxY) {
    const above = sel.y - tbHeight - gap
    if (above >= minY) {
      top = above
    } else {
      // If full screen, dock inside bottom
      top = Math.max(minY, Math.min(sel.y + sel.height - tbHeight - gap, maxY))
    }
  }

  return {
    position: 'absolute' as const,
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`
  }
})

const optionState = computed(() => state.value?.options)
const hasOutputTarget = computed(() => Boolean(selection.value || state.value?.candidate))

// Active 9-grid region being navigated
const currentGridRegion = computed<ScreenshotGeometryRect | null>(() => {
  if (!gridNavActive.value || !displayBounds.value) return null
  return gridStack.value[gridStack.value.length - 1] ?? displayBounds.value
})

const gridCells = computed(() => {
  const region = currentGridRegion.value
  if (!region) return []
  return Array.from({ length: 9 }, (_, index) => ({
    index,
    key: GRID_CELL_KEYS[index].toUpperCase(),
    rect: screenshotGridCell(region, index)!
  }))
})

function localToGlobal(event: PointerEvent): ScreenshotGeometryPoint | null {
  const display = displayBounds.value
  if (!display) return null
  if (Number.isFinite(event.screenX) && Number.isFinite(event.screenY)) {
    return { x: event.screenX, y: event.screenY }
  }
  return {
    x: display.x + event.clientX,
    y: display.y + event.clientY
  }
}

function updateInputs(rect: ScreenshotGeometryRect | null): void {
  widthInput.value = rect ? String(Math.round(rect.width)) : ''
  heightInput.value = rect ? String(Math.round(rect.height)) : ''
}

async function dispatchCommand(command: ScreenshotOverlayCommand): Promise<boolean> {
  const current = state.value
  if (!current) return false
  try {
    const response = await transport.send(ScreenshotSessionEvents.overlay.command, {
      sessionId: current.sessionId,
      command
    })
    return response.accepted
  } catch {
    errorCode.value = 'transport-failed'
    return false
  }
}

function updateLoupeCanvas(localX: number, localY: number): void {
  const canvas = loupeCanvasRef.value
  const img = frozenImgRef.value
  const display = displayBounds.value
  if (!canvas || !img || !display) return
  if (!img.complete || img.naturalWidth === 0) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const scaleX = img.naturalWidth / display.width
  const scaleY = img.naturalHeight / display.height

  const dipSampleW = 16
  const dipSampleH = 12
  const srcW = Math.round(dipSampleW * scaleX)
  const srcH = Math.round(dipSampleH * scaleY)
  const srcX = Math.round((localX - dipSampleW / 2) * scaleX)
  const srcY = Math.round((localY - dipSampleH / 2) * scaleY)

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)

  // Pixel grid overlay
  const cellW = canvas.width / dipSampleW
  const cellH = canvas.height / dipSampleH
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 0.5
  for (let x = 1; x < dipSampleW; x++) {
    ctx.beginPath()
    ctx.moveTo(x * cellW, 0)
    ctx.lineTo(x * cellW, canvas.height)
    ctx.stroke()
  }
  for (let y = 1; y < dipSampleH; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * cellH)
    ctx.lineTo(canvas.width, y * cellH)
    ctx.stroke()
  }

  // Center crosshair / pixel indicator
  const centerX = Math.floor(dipSampleW / 2) * cellW
  const centerY = Math.floor(dipSampleH / 2) * cellH
  ctx.strokeStyle = '#007AFF'
  ctx.lineWidth = 1.5
  ctx.strokeRect(centerX, centerY, cellW, cellH)

  try {
    const pixel = ctx.getImageData(centerX + cellW / 2, centerY + cellH / 2, 1, 1).data
    const r = pixel[0]
    const g = pixel[1]
    const b = pixel[2]
    loupeColorHex.value = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`
    loupeColorRgb.value = `${r}, ${g}, ${b}`
  } catch {
    // Graceful fallback if CORS tainted
  }
}

function startCreate(event: PointerEvent): void {
  if (busy.value || isEditing.value || gridNavActive.value || event.button !== 0) return
  const point = localToGlobal(event)
  if (!point) return
  interaction.value = {
    kind: 'create',
    start: point,
    pointerId: event.pointerId
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function startMove(event: PointerEvent): void {
  if (
    busy.value ||
    isEditing.value ||
    gridNavActive.value ||
    event.button !== 0 ||
    !localSelection.value
  )
    return
  const point = localToGlobal(event)
  if (!point || !selection.value) return
  interaction.value = {
    kind: 'move',
    start: point,
    original: { ...selection.value },
    pointerId: event.pointerId
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function startResize(handle: ScreenshotResizeHandle, event: PointerEvent): void {
  if (busy.value || isEditing.value || event.button !== 0 || !selection.value) return
  const point = localToGlobal(event)
  if (!point) return
  interaction.value = {
    kind: 'resize',
    handle,
    start: point,
    original: { ...selection.value },
    pointerId: event.pointerId
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function updatePointer(event: PointerEvent): void {
  pointerLocal.value = { x: event.clientX, y: event.clientY }
  updateLoupeCanvas(event.clientX, event.clientY)

  if (isEditing.value || gridNavActive.value) return
  const currentInteraction = interaction.value
  const bounds = selectionBounds.value
  const point = localToGlobal(event)
  if (!bounds || !point) return
  if (!currentInteraction) {
    if (selection.value) return
    if (performance.now() - lastHitTestAt >= 48) {
      lastHitTestAt = performance.now()
      void dispatchCommand({ type: 'pointer', point, sequence: ++pointerSequence })
    }
    return
  }

  if (currentInteraction.kind === 'create') {
    selection.value = createScreenshotSelection(currentInteraction.start, point, bounds, 4)
  } else if (currentInteraction.original) {
    const deltaX = point.x - currentInteraction.start.x
    const deltaY = point.y - currentInteraction.start.y
    selection.value =
      currentInteraction.kind === 'move'
        ? moveScreenshotSelection(currentInteraction.original, deltaX, deltaY, bounds)
        : resizeScreenshotSelection(
            currentInteraction.original,
            currentInteraction.handle ?? 'se',
            deltaX,
            deltaY,
            bounds,
            {
              aspectRatio: optionState.value?.aspectRatio
            }
          )
  }
  updateInputs(selection.value)
}

async function selectCandidate(): Promise<void> {
  const candidate = state.value?.candidate
  if (!candidate || busy.value) return
  const next = snapshotScreenshotSelection(candidate.bounds)
  selection.value = next
  updateInputs(next)
  await dispatchCommand({
    type: 'lock-candidate',
    sequence: pointerSequence
  })
}

async function cycleCandidateLevel(): Promise<void> {
  const candidate = state.value?.candidate
  if (!candidate || busy.value || candidate.levels <= 1) return
  const nextLevel = (candidate.level + 1) % candidate.levels
  await dispatchCommand({
    type: 'set-candidate-level',
    sequence: pointerSequence,
    level: nextLevel
  })
}

async function finishPointer(event: PointerEvent): Promise<void> {
  const currentInteraction = interaction.value
  if (!currentInteraction) {
    await selectCandidate()
    return
  }
  const point = localToGlobal(event)
  const candidateClick =
    currentInteraction.kind === 'create' &&
    point !== null &&
    Math.hypot(point.x - currentInteraction.start.x, point.y - currentInteraction.start.y) < 6 &&
    Boolean(state.value?.candidate)
  interaction.value = null
  if (candidateClick) {
    await selectCandidate()
    return
  }
  updatePointer(event)
  if (selection.value) {
    await dispatchCommand({
      type: 'set-selection',
      selection: snapshotScreenshotSelection(selection.value)
    })
  }
}

async function setTargetMode(targetMode: 'free-region' | 'object'): Promise<void> {
  if (state.value?.targetMode === targetMode) return
  const accepted = await dispatchCommand({ type: 'set-target-mode', targetMode })
  if (accepted && state.value) {
    state.value = {
      ...state.value,
      targetMode,
      candidate: undefined,
      selection: undefined
    }
  }
  selection.value = null
  updateInputs(null)
}

async function setOption(patch: Partial<ScreenshotOverlayOptions>): Promise<void> {
  await dispatchCommand({ type: 'set-options', options: patch })
}

function toggleCursor(): void {
  void setOption({ cursor: !optionState.value?.cursor })
}

async function applyManualSize(): Promise<void> {
  const bounds = selectionBounds.value
  const current = selection.value
  if (!bounds || !current) return
  const width = Number(widthInput.value)
  const height = Number(heightInput.value)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    updateInputs(current)
    return
  }
  const next = setScreenshotSelectionSize(current, width, height, bounds, {
    aspectRatio: optionState.value?.aspectRatio,
    anchor: selectedAnchor.value
  })
  selection.value = next
  updateInputs(next)
  await dispatchCommand({ type: 'set-selection', selection: snapshotScreenshotSelection(next) })
}

async function clearSelection(): Promise<void> {
  if (!selection.value) return
  selection.value = null
  updateInputs(null)
  await dispatchCommand({ type: 'clear-selection' })
}

// 9-Grid keyboard navigation handlers
function toggleGridNav(): void {
  if (selection.value || isEditing.value) return
  gridNavActive.value = !gridNavActive.value
  gridStack.value = []
}

function selectGridCell(index: number): void {
  const region = currentGridRegion.value
  if (!region) return
  const next = screenshotGridCell(region, index)
  if (!next) return
  gridStack.value.push(next)
}

function popGridNav(): void {
  if (gridStack.value.length > 0) {
    gridStack.value.pop()
  } else {
    gridNavActive.value = false
  }
}

// Inline Annotation Editing Handlers
async function startEdit(): Promise<void> {
  if (!selection.value || busy.value || isEditing.value) return
  busy.value = true
  const accepted = await dispatchCommand({ type: 'begin-edit' })
  busy.value = false
  if (accepted) {
    annotationDoc.value = new AnnotationDocument()
  }
}

async function endEdit(): Promise<void> {
  if (!isEditing.value || busy.value) return
  busy.value = true
  await dispatchCommand({ type: 'end-edit' })
  busy.value = false
  baseImage.value = null
}

function redrawCanvas(): void {
  const canvas = canvasRef.value
  const img = baseImage.value
  if (!canvas || !img) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  for (const obj of annotationDoc.value.objects) {
    drawAnnotationObject(ctx, obj)
  }

  if (annotationDrag.value?.currentObject) {
    drawAnnotationObject(ctx, annotationDrag.value.currentObject)
  }

  const selected = annotationDoc.value.selectedObject
  if (selected && activeTool.value === 'select') {
    const bounds = AnnotationDocument.getBounds(selected)
    drawSelectionBox(ctx, bounds)
  }
}

async function scheduleCommitEdit(): Promise<void> {
  if (commitDebounceTimer) clearTimeout(commitDebounceTimer)
  commitDebounceTimer = setTimeout(async () => {
    const edit = editState.value
    const img = baseImage.value
    if (!edit || !img || !isEditing.value) return
    try {
      const pngBytes = await renderDocumentToPng(img, edit.width, edit.height, annotationDoc.value)
      await dispatchCommand({
        type: 'commit-edit',
        editId: edit.editId,
        revision: annotationDoc.value.revision,
        png: pngBytes
      })
    } catch {
      // Ignored; next edit or output action will re-commit
    }
  }, 100)
}

function getCanvasPoint(event: PointerEvent): AnnotationPoint | null {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  }
}

function handleCanvasPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !isEditing.value) return
  const pt = getCanvasPoint(event)
  if (!pt) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)

  if (activeTool.value === 'select') {
    const hitIdx = annotationDoc.value.hitTest(pt)
    annotationDoc.value.selectedIndex = hitIdx
    if (hitIdx !== null) {
      const initialObj = annotationDoc.value.objects[hitIdx]
      annotationDrag.value = {
        kind: 'move',
        start: pt,
        initialObject: initialObj,
        currentObject: initialObj
      }
    }
    redrawCanvas()
    return
  }

  annotationDoc.value.selectedIndex = null
  const id = `anno_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const style = currentStyle.value
  let initialObj: AnnotationObject

  switch (activeTool.value) {
    case 'rectangle':
      initialObj = {
        id,
        kind: 'rectangle',
        x: pt.x,
        y: pt.y,
        width: 1,
        height: 1,
        color: style.color,
        strokeWidth: style.strokeWidth,
        filled: style.filled
      }
      break
    case 'ellipse':
      initialObj = {
        id,
        kind: 'ellipse',
        x: pt.x,
        y: pt.y,
        width: 1,
        height: 1,
        color: style.color,
        strokeWidth: style.strokeWidth,
        filled: style.filled
      }
      break
    case 'arrow':
      initialObj = {
        id,
        kind: 'arrow',
        start: pt,
        end: pt,
        color: style.color,
        strokeWidth: style.strokeWidth
      }
      break
    case 'line':
      initialObj = {
        id,
        kind: 'line',
        start: pt,
        end: pt,
        color: style.color,
        strokeWidth: style.strokeWidth
      }
      break
    case 'brush':
      initialObj = {
        id,
        kind: 'brush',
        points: [pt],
        color: style.color,
        strokeWidth: style.strokeWidth
      }
      break
    case 'text': {
      const defaultText = window.prompt(t('screenshot.editor.textPrompt'))
      if (defaultText && defaultText.trim()) {
        annotationDoc.value.add({
          id,
          kind: 'text',
          x: pt.x,
          y: pt.y,
          text: defaultText.trim(),
          color: style.color,
          strokeWidth: 1,
          fontSize: Math.max(14, style.strokeWidth * 6)
        })
        redrawCanvas()
        void scheduleCommitEdit()
      }
      return
    }
    case 'pixelate':
      initialObj = {
        id,
        kind: 'pixelate',
        x: pt.x,
        y: pt.y,
        width: 1,
        height: 1,
        color: '',
        strokeWidth: 0,
        blockSize: 8
      }
      break
    default:
      return
  }

  annotationDrag.value = {
    kind: 'create',
    start: pt,
    initialObject: initialObj,
    currentObject: initialObj
  }
  redrawCanvas()
}

function handleCanvasPointerMove(event: PointerEvent): void {
  if (!annotationDrag.value || !isEditing.value) return
  const pt = getCanvasPoint(event)
  if (!pt) return
  const drag = annotationDrag.value

  if (drag.kind === 'create' && drag.initialObject) {
    const init = drag.initialObject
    switch (init.kind) {
      case 'rectangle': {
        const x = Math.min(drag.start.x, pt.x)
        const y = Math.min(drag.start.y, pt.y)
        const width = Math.abs(pt.x - drag.start.x)
        const height = Math.abs(pt.y - drag.start.y)
        drag.currentObject = { ...init, x, y, width, height }
        break
      }
      case 'ellipse': {
        const x = Math.min(drag.start.x, pt.x)
        const y = Math.min(drag.start.y, pt.y)
        const width = Math.abs(pt.x - drag.start.x)
        const height = Math.abs(pt.y - drag.start.y)
        drag.currentObject = { ...init, x, y, width, height }
        break
      }
      case 'arrow':
      case 'line': {
        drag.currentObject = { ...init, end: pt }
        break
      }
      case 'brush': {
        const points = [...(init.points || []), pt]
        drag.currentObject = { ...init, points }
        drag.initialObject = { ...init, points }
        break
      }
      case 'pixelate': {
        const x = Math.min(drag.start.x, pt.x)
        const y = Math.min(drag.start.y, pt.y)
        const width = Math.abs(pt.x - drag.start.x)
        const height = Math.abs(pt.y - drag.start.y)
        drag.currentObject = { ...init, x, y, width, height }
        break
      }
    }
    redrawCanvas()
  } else if (drag.kind === 'move' && drag.initialObject) {
    const deltaX = pt.x - drag.start.x
    const deltaY = pt.y - drag.start.y
    const moved = AnnotationDocument.translate(drag.initialObject, deltaX, deltaY)
    drag.currentObject = moved
    if (annotationDoc.value.selectedIndex !== null) {
      annotationDoc.value.replace(annotationDoc.value.selectedIndex, moved)
    }
    redrawCanvas()
  }
}

function handleCanvasPointerUp(_event: PointerEvent): void {
  if (!annotationDrag.value) return
  const drag = annotationDrag.value
  annotationDrag.value = null

  if (drag.kind === 'create' && drag.currentObject) {
    annotationDoc.value.add(drag.currentObject)
  }
  redrawCanvas()
  void scheduleCommitEdit()
}

function undoAnnotation(): void {
  if (annotationDoc.value.undo()) {
    redrawCanvas()
    void scheduleCommitEdit()
  }
}

function redoAnnotation(): void {
  if (annotationDoc.value.redo()) {
    redrawCanvas()
    void scheduleCommitEdit()
  }
}

function deleteSelectedAnnotation(): void {
  if (annotationDoc.value.selectedIndex !== null) {
    annotationDoc.value.remove(annotationDoc.value.selectedIndex)
    annotationDoc.value.selectedIndex = null
    redrawCanvas()
    void scheduleCommitEdit()
  }
}

// Output command runner with edit revision pass-through
async function runOutput(action: 'copy' | 'save' | 'confirm'): Promise<void> {
  if (busy.value) return
  busy.value = true
  const revision = isEditing.value ? annotationDoc.value.revision : undefined

  // If in edit mode, ensure latest PNG is committed before output
  if (isEditing.value && editState.value && baseImage.value) {
    try {
      const pngBytes = await renderDocumentToPng(
        baseImage.value,
        editState.value.width,
        editState.value.height,
        annotationDoc.value
      )
      await dispatchCommand({
        type: 'commit-edit',
        editId: editState.value.editId,
        revision: annotationDoc.value.revision,
        png: pngBytes
      })
    } catch {
      // Continue to output
    }
  }

  const result = await dispatchCommand({ type: action, revision })
  busy.value = false
  if (!result) {
    errorCode.value = 'command-rejected'
  }
}

async function confirm(): Promise<void> {
  await runOutput('confirm')
}

async function cancel(): Promise<void> {
  if (busy.value) return
  busy.value = true
  const result = await dispatchCommand({ type: 'cancel' })
  busy.value = false
  if (!result) {
    errorCode.value = 'command-rejected'
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (Date.now() < suppressEscapeUntil && event.key === 'Escape') {
    event.preventDefault()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    if (gridNavActive.value) {
      gridNavActive.value = false
      gridStack.value = []
      return
    }
    if (isEditing.value) {
      void endEdit()
      return
    }
    if (selection.value) {
      void clearSelection()
      return
    }
    void cancel()
    return
  }

  // Space toggles free-region vs object mode when no selection
  if (event.key === ' ' && !selection.value && !isEditing.value && !gridNavActive.value) {
    event.preventDefault()
    void setTargetMode(isObjectMode.value ? 'free-region' : 'object')
    return
  }

  // In 9-grid navigation keys
  if (gridNavActive.value) {
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      popGridNav()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const reg = currentGridRegion.value
      if (reg) {
        selection.value = reg
        updateInputs(reg)
        gridNavActive.value = false
        gridStack.value = []
        void dispatchCommand({
          type: 'set-selection',
          selection: snapshotScreenshotSelection(reg),
          source: 'grid'
        })
      }
      return
    }
    const lowerKey = event.key.toLowerCase()
    const cellIdx = GRID_CELL_KEYS.indexOf(lowerKey)
    if (cellIdx !== -1) {
      event.preventDefault()
      void selectGridCell(cellIdx)
      return
    }
    const num = Number(event.key)
    if (num >= 1 && num <= 9) {
      event.preventDefault()
      void selectGridCell(num - 1)
      return
    }
    return
  }

  // In edit mode keys
  if (isEditing.value) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redoAnnotation()
      else undoAnnotation()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      redoAnnotation()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      deleteSelectedAnnotation()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      void confirm()
      return
    }
    return
  }

  // In selection/candidate mode keys
  if (event.key === 'Enter') {
    event.preventDefault()
    void confirm()
    return
  }

  // 'G' toggles 9-grid navigation
  if ((event.key === 'g' || event.key === 'G') && !selection.value) {
    event.preventDefault()
    toggleGridNav()
    return
  }

  // 'E' starts annotation edit when selection exists
  if ((event.key === 'e' || event.key === 'E') && selection.value) {
    event.preventDefault()
    void startEdit()
    return
  }

  // Tab cycles candidate hierarchy level
  if (event.key === 'Tab' && state.value?.candidate) {
    event.preventDefault()
    void cycleCandidateLevel()
    return
  }

  // Backspace clears selection
  if ((event.key === 'Backspace' || event.key === 'Delete') && selection.value) {
    event.preventDefault()
    void clearSelection()
    return
  }

  const directions = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down'
  } as const
  const direction = directions[event.key as keyof typeof directions]
  if (!direction || !selection.value || !selectionBounds.value) return
  event.preventDefault()
  const next = nudgeScreenshotSelection(
    selection.value,
    direction,
    event.shiftKey,
    selectionBounds.value,
    event.altKey ? 10 : 1,
    {
      aspectRatio: optionState.value?.aspectRatio,
      anchor: selectedAnchor.value
    }
  )
  selection.value = next
  updateInputs(next)
  void dispatchCommand({ type: 'set-selection', selection: snapshotScreenshotSelection(next) })
}

// Watch edit state to load base image
watch(
  () => state.value?.edit,
  (edit) => {
    if (edit && edit.sourceUrl) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        baseImage.value = img
        redrawCanvas()
      }
      img.src = edit.sourceUrl
    } else {
      baseImage.value = null
    }
  },
  { immediate: true }
)

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  disposeStateListener = transport.on(ScreenshotSessionEvents.overlay.state, (nextState) => {
    if (state.value && nextState.sessionId !== state.value.sessionId) return
    state.value = nextState
    if (!interaction.value) {
      selection.value = nextState.selection ?? null
      updateInputs(selection.value)
    }
  })

  try {
    const initial = await transport.send(ScreenshotSessionEvents.overlay.ready, undefined)
    state.value = initial
    selection.value = initial.selection ?? null
    updateInputs(selection.value)
  } catch {
    errorCode.value = 'overlay-unavailable'
  }
})

onBeforeUnmount(() => {
  disposeStateListener?.()
  disposeStateListener = null
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <main
    class="screenshot-overlay"
    :class="{ 'is-live': !isFrozen, 'is-busy': busy, 'is-editing': isEditing }"
    :style="overlayStyle"
    @pointerdown="startCreate"
    @pointermove="updatePointer"
    @pointerup="finishPointer"
    @contextmenu.prevent="cancel"
  >
    <!-- Frozen frame backdrop -->
    <img
      v-if="state?.display?.frozenTfileUrl && isFrozen && !isEditing"
      ref="frozenImgRef"
      class="frozen-frame"
      :src="state?.display?.frozenTfileUrl"
      alt=""
      draggable="false"
      crossorigin="anonymous"
    />

    <!-- Transparent feather-light mask -->
    <div v-if="!isEditing" class="desktop-mask" />

    <!-- 9-Point Viewfinder Grid (Active when no selection exists) -->
    <div
      v-if="!selection && !gridNavActive && !isEditing"
      class="viewfinder-grid"
      aria-hidden="true"
    >
      <div
        v-for="pt in VIEWFINDER_POINTS"
        :key="pt.id"
        class="viewfinder-point"
        :style="{ left: pt.x, top: pt.y }"
      >
        <span class="point-cross" />
      </div>
      <div class="viewfinder-hint">
        {{ t('screenshot.overlay.selectionHint') }}
      </div>
    </div>

    <!-- 9-Grid Keyboard Navigation Overlay -->
    <div v-if="gridNavActive && currentGridRegion" class="grid-nav-overlay">
      <div
        v-for="cell in gridCells"
        :key="cell.index"
        class="grid-nav-cell"
        :style="{
          left: `${cell.rect.x - (displayBounds?.x ?? 0)}px`,
          top: `${cell.rect.y - (displayBounds?.y ?? 0)}px`,
          width: `${cell.rect.width}px`,
          height: `${cell.rect.height}px`
        }"
        @click.stop="selectGridCell(cell.index)"
      >
        <span class="grid-cell-label">{{ cell.key }}</span>
      </div>
      <div class="grid-nav-hint">
        {{ t('screenshot.overlay.gridNavHint') }}
      </div>
    </div>

    <!-- Candidate hover highlight -->
    <section
      v-if="localCandidate && !selection && !gridNavActive && !isEditing"
      class="object-candidate"
      :style="candidateStyle"
      aria-hidden="true"
    >
      <span
        v-for="point in TARGET_GRID_POINTS"
        :key="point"
        class="target-grid-point"
        :class="`is-${point}`"
      />
      <div v-if="state?.candidate" class="candidate-tag">
        <span class="candidate-kind">{{
          state.candidate.kind === 'ui-element'
            ? t('screenshot.overlay.candidateUiElement')
            : t('screenshot.overlay.candidateWindow')
        }}</span>
        <span v-if="state.candidate.role" class="candidate-role">{{ state.candidate.role }}</span>
        <span v-if="state.candidate.levels > 1" class="candidate-level">
          {{
            t('screenshot.overlay.candidateLevel', {
              level: state.candidate.level + 1,
              levels: state.candidate.levels
            })
          }}
        </span>
      </div>
    </section>

    <!-- Normal Selection box -->
    <section
      v-if="localSelection && !isEditing"
      class="selection"
      :style="selectionStyle"
      :aria-label="t('screenshot.overlay.selectionRegion')"
      @pointerdown.stop="startMove"
    >
      <span
        v-for="point in TARGET_GRID_POINTS"
        :key="point"
        class="target-grid-point"
        :class="`is-${point}`"
      />
      <span class="selection-size">
        {{ Math.round(selection?.width ?? 0) }} × {{ Math.round(selection?.height ?? 0) }}
      </span>
      <button
        v-for="handle in HANDLE_NAMES"
        :key="handle"
        type="button"
        class="resize-handle"
        :class="`is-${handle}`"
        :aria-label="t('screenshot.overlay.resizeHandle', { handle: handleLabels[handle] })"
        @pointerdown.stop="startResize(handle, $event)"
      />
    </section>

    <!-- Inline Annotation Canvas -->
    <div
      v-if="isEditing && editState"
      class="annotation-canvas-container"
      :style="{
        left: `${editState.bounds.x - (displayBounds?.x ?? 0)}px`,
        top: `${editState.bounds.y - (displayBounds?.y ?? 0)}px`,
        width: `${editState.width}px`,
        height: `${editState.height}px`
      }"
    >
      <canvas
        ref="canvasRef"
        :width="editState.width"
        :height="editState.height"
        class="annotation-canvas"
        @pointerdown="handleCanvasPointerDown"
        @pointermove="handleCanvasPointerMove"
        @pointerup="handleCanvasPointerUp"
      />
    </div>

    <!-- Pixel Magnifier Loupe: 8x Pixel Inspection with Color chip & Coordinates -->
    <aside v-if="showLoupe && loupeStyle" class="loupe-card" :style="loupeStyle" aria-hidden="true">
      <div class="loupe-canvas-wrapper">
        <canvas ref="loupeCanvasRef" width="138" height="96" class="loupe-canvas" />
      </div>
      <div class="loupe-meta">
        <div class="loupe-row">
          <span class="loupe-color-chip" :style="{ backgroundColor: loupeColorHex }" />
          <span class="loupe-color-hex">{{ loupeColorHex }}</span>
          <span class="loupe-color-rgb">{{ loupeColorRgb }}</span>
        </div>
        <div class="loupe-row secondary">
          <span class="loupe-mode-tag">{{
            isObjectMode
              ? t('screenshot.overlay.loupeObjectMode')
              : t('screenshot.overlay.loupeRegionMode')
          }}</span>
          <span class="loupe-coord">
            <template v-if="interaction?.kind === 'create' && selection">
              {{ Math.round(selection.width) }} × {{ Math.round(selection.height) }}
            </template>
            <template v-else>
              {{ Math.round(pointerLocal?.x ?? 0) }}, {{ Math.round(pointerLocal?.y ?? 0) }}
            </template>
          </span>
        </div>
      </div>
    </aside>

    <!-- Main macOS-Style Floating Toolbar: ONLY renders on the screen containing localSelection -->
    <footer
      v-if="state && localSelection"
      ref="toolbarRef"
      class="toolbar"
      :style="toolbarStyle"
      @pointerdown.stop
    >
      <!-- Normal selection controls -->
      <template v-if="!isEditing">
        <!-- Mode Switch: Free region vs Object selection -->
        <div class="segmented-control" role="group">
          <button
            type="button"
            class="seg-button"
            :class="{ active: !isObjectMode }"
            :title="t('screenshot.overlay.freeRegion')"
            @click.stop="setTargetMode('free-region')"
          >
            <i class="i-ri-crop-line" />
          </button>
          <button
            type="button"
            class="seg-button"
            :class="{ active: isObjectMode }"
            :title="t('screenshot.overlay.objectSelection')"
            @click.stop="setTargetMode('object')"
          >
            <i class="i-ri-window-line" />
          </button>
        </div>

        <span class="separator" />

        <!-- Dimension inputs with 9-Anchor selector -->
        <div v-if="!isObjectMode" class="dimension-badge">
          <select
            v-model="selectedAnchor"
            class="anchor-select"
            :title="t('screenshot.overlay.anchor')"
            @change="applyManualSize"
          >
            <option value="nw">↖</option>
            <option value="n">↑</option>
            <option value="ne">↗</option>
            <option value="w">←</option>
            <option value="center">·</option>
            <option value="e">→</option>
            <option value="sw">↙</option>
            <option value="s">↓</option>
            <option value="se">↘</option>
          </select>
          <input
            v-model="widthInput"
            class="dim-input"
            inputmode="numeric"
            @change="applyManualSize"
          />
          <span class="dim-cross">×</span>
          <input
            v-model="heightInput"
            class="dim-input"
            inputmode="numeric"
            @change="applyManualSize"
          />
        </div>

        <!-- Aspect Ratio -->
        <select
          v-if="!isObjectMode"
          class="aspect-select"
          :value="optionState?.aspectRatio ?? ''"
          :aria-label="t('screenshot.overlay.aspectRatio')"
          @change="
            setOption({
              aspectRatio: Number(($event.target as HTMLSelectElement).value) || undefined
            })
          "
        >
          <option value="">{{ t('screenshot.overlay.freeRatio') }}</option>
          <option :value="1">1:1</option>
          <option :value="4 / 3">4:3</option>
          <option :value="16 / 9">16:9</option>
        </select>

        <span class="separator" />

        <!-- Options: Cursor, Border, Shadow -->
        <button
          type="button"
          class="icon-button"
          :class="{ active: optionState?.cursor }"
          :aria-pressed="optionState?.cursor"
          :title="t('screenshot.overlay.cursor')"
          @click="toggleCursor"
        >
          <i class="i-ri-cursor-line" />
        </button>

        <button
          type="button"
          class="icon-button"
          :class="{ active: optionState?.border }"
          :aria-pressed="optionState?.border"
          :title="t('screenshot.overlay.border')"
          @click="setOption({ border: !optionState?.border })"
        >
          <i class="i-ri-shape-line" />
        </button>

        <button
          type="button"
          class="icon-button"
          :class="{ active: optionState?.shadow }"
          :aria-pressed="optionState?.shadow"
          :title="t('screenshot.overlay.shadow')"
          @click="setOption({ shadow: !optionState?.shadow })"
        >
          <i class="i-ri-contrast-drop-2-line" />
        </button>

        <span class="separator" />

        <!-- Enter Annotation Edit Mode -->
        <button
          type="button"
          class="icon-button highlight-tool"
          :title="t('screenshot.editor.annotation')"
          @click="startEdit"
        >
          <i class="i-ri-pencil-line" />
        </button>
      </template>

      <!-- Annotation Editing Toolbar -->
      <template v-else>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'select' }"
          :title="t('screenshot.editor.toolSelect')"
          @click="activeTool = 'select'"
        >
          <i class="i-ri-cursor-line" />
        </button>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'rectangle' }"
          :title="t('screenshot.editor.toolRect')"
          @click="activeTool = 'rectangle'"
        >
          <i class="i-ri-checkbox-blank-line" />
        </button>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'ellipse' }"
          :title="t('screenshot.editor.toolEllipse')"
          @click="activeTool = 'ellipse'"
        >
          <i class="i-ri-checkbox-blank-circle-line" />
        </button>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'arrow' }"
          :title="t('screenshot.editor.toolArrow')"
          @click="activeTool = 'arrow'"
        >
          <i class="i-ri-arrow-right-up-line" />
        </button>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'line' }"
          :title="t('screenshot.editor.toolLine')"
          @click="activeTool = 'line'"
        >
          <i class="i-ri-subtract-line" />
        </button>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'brush' }"
          :title="t('screenshot.editor.toolPen')"
          @click="activeTool = 'brush'"
        >
          <i class="i-ri-brush-line" />
        </button>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'text' }"
          :title="t('screenshot.editor.toolText')"
          @click="activeTool = 'text'"
        >
          <i class="i-ri-text" />
        </button>
        <button
          type="button"
          class="icon-button"
          :class="{ active: activeTool === 'pixelate' }"
          :title="t('screenshot.editor.toolMosaic')"
          @click="activeTool = 'pixelate'"
        >
          <i class="i-ri-blur-off-line" />
        </button>

        <span class="separator" />

        <!-- Style capsule toggle -->
        <button
          type="button"
          class="icon-button style-toggle-btn"
          :class="{ active: styleCapsuleOpen }"
          :title="t('screenshot.editor.stylePanel')"
          @click="styleCapsuleOpen = !styleCapsuleOpen"
        >
          <span class="color-indicator" :style="{ backgroundColor: currentStyle.color }" />
        </button>

        <!-- Floating style capsule rendered above the toolbar pill -->
        <div v-if="styleCapsuleOpen" class="style-capsule" @pointerdown.stop>
          <div class="color-presets">
            <button
              v-for="color in PRESET_COLORS"
              :key="color"
              type="button"
              class="color-dot"
              :class="{ selected: currentStyle.color === color }"
              :style="{ backgroundColor: color }"
              @click="currentStyle.color = color"
            />
          </div>
          <div class="stroke-width-presets">
            <button
              v-for="w in PRESET_STROKE_WIDTHS"
              :key="w"
              type="button"
              class="stroke-btn"
              :class="{ selected: currentStyle.strokeWidth === w }"
              @click="currentStyle.strokeWidth = w"
            >
              <span class="stroke-sample" :style="{ height: `${w}px` }" />
            </button>
          </div>
          <button
            type="button"
            class="fill-toggle"
            :class="{ active: currentStyle.filled }"
            @click="currentStyle.filled = !currentStyle.filled"
          >
            {{
              currentStyle.filled
                ? t('screenshot.editor.styleFill')
                : t('screenshot.editor.styleStroke')
            }}
          </button>
        </div>

        <span class="separator" />

        <!-- History: Undo / Redo -->
        <button
          type="button"
          class="icon-button"
          :disabled="!annotationDoc.canUndo"
          :title="t('screenshot.editor.undo', { shortcut: undoShortcut })"
          @click="undoAnnotation"
        >
          <i class="i-ri-arrow-go-back-line" />
        </button>
        <button
          type="button"
          class="icon-button"
          :disabled="!annotationDoc.canRedo"
          :title="t('screenshot.editor.redo', { shortcut: redoShortcut })"
          @click="redoAnnotation"
        >
          <i class="i-ri-arrow-go-forward-line" />
        </button>

        <span class="separator" />

        <!-- Exit Edit Mode -->
        <button
          type="button"
          class="icon-button"
          :title="t('screenshot.editor.exitEdit')"
          @click="endEdit"
        >
          <i class="i-ri-close-circle-line" />
        </button>
      </template>

      <span class="separator" />

      <!-- Shared Output Buttons: Copy, Save, Cancel, Confirm -->
      <button
        type="button"
        class="icon-button"
        :disabled="!hasOutputTarget || busy"
        :title="t('screenshot.editor.copy')"
        @click="runOutput('copy')"
      >
        <i class="i-ri-file-copy-line" />
      </button>

      <button
        type="button"
        class="icon-button"
        :disabled="!hasOutputTarget || busy"
        :title="t('screenshot.editor.save')"
        @click="runOutput('save')"
      >
        <i class="i-ri-save-line" />
      </button>

      <button
        type="button"
        class="icon-button danger-btn"
        :title="t('screenshot.overlay.cancel')"
        @click="cancel"
      >
        <i class="i-ri-close-line" />
      </button>

      <button
        type="button"
        class="icon-button primary-confirm"
        :disabled="!hasOutputTarget || busy"
        :title="t('screenshot.editor.done')"
        @click="confirm"
      >
        <i class="i-ri-check-line" />
        <span>{{ t('screenshot.editor.done') }}</span>
      </button>
    </footer>

    <!-- Error Toast -->
    <output v-if="errorCode" class="error-status" aria-live="polite">
      {{ t(`screenshot.errors.${errorCode}`) }}
    </output>
  </main>
</template>

<style scoped>
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent !important;
  user-select: none;
  -webkit-user-select: none;
}

.screenshot-overlay {
  position: relative;
  width: 100vw;
  height: 100vh;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
}

.screenshot-overlay.is-editing {
  cursor: default;
}

/* Frozen frame: crisp desktop screenshot */
.frozen-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}

/* Feather-light ambient mask (not dark at all!) */
.desktop-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.04);
  pointer-events: none;
}

/* 9-Point Viewfinder Grid (Active when no selection exists) */
.viewfinder-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.viewfinder-point {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.point-cross {
  position: relative;
  width: 8px;
  height: 8px;
}

.point-cross::before,
.point-cross::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.4);
}

.point-cross::before {
  top: 3.5px;
  left: 0;
  width: 8px;
  height: 1px;
}

.point-cross::after {
  left: 3.5px;
  top: 0;
  width: 1px;
  height: 8px;
}

.viewfinder-hint {
  position: absolute;
  bottom: calc(var(--screenshot-safe-bottom, 0px) + 32px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  background: rgba(24, 25, 28, 0.82);
  backdrop-filter: blur(20px) saturate(190%);
  -webkit-backdrop-filter: blur(20px) saturate(190%);
  border: 0.5px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.82);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  letter-spacing: 0.2px;
}

/* 9-Grid Keyboard Navigation */
.grid-nav-overlay {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: auto;
}

.grid-nav-cell {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed rgba(0, 122, 255, 0.6);
  background: rgba(0, 122, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.1s ease;
}

.grid-nav-cell:hover {
  background: rgba(0, 122, 255, 0.15);
}

.grid-cell-label {
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0, 122, 255, 0.9);
  color: #ffffff;
  font-weight: 700;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.grid-nav-hint {
  position: absolute;
  bottom: calc(var(--screenshot-safe-bottom, 0px) + 32px);
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  border-radius: 20px;
  background: rgba(20, 20, 22, 0.88);
  backdrop-filter: blur(20px);
  color: #ffffff;
  font-size: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* Candidate hover highlight */
.object-candidate {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 1.5px solid #007aff;
  background: rgba(0, 122, 255, 0.08);
  pointer-events: none;
}

.candidate-tag {
  position: absolute;
  top: -24px;
  left: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #007aff;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

/* Selection Box */
.selection {
  position: absolute;
  z-index: 5;
  box-sizing: border-box;
  border: 1.5px solid #007aff;
  background: transparent;
  cursor: move;
}

/* Cinematic translucent dimming ONLY outside the selection */
.selection::after {
  content: '';
  position: absolute;
  inset: -1.5px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.26);
  pointer-events: none;
}

/* 9-Point Guide points on candidate and selection */
.target-grid-point {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0.85;
}

.target-grid-point.is-nw {
  left: 0;
  top: 0;
}
.target-grid-point.is-n {
  left: 50%;
  top: 0;
}
.target-grid-point.is-ne {
  left: 100%;
  top: 0;
}
.target-grid-point.is-w {
  left: 0;
  top: 50%;
}
.target-grid-point.is-center {
  left: 50%;
  top: 50%;
  background: #007aff;
  width: 6px;
  height: 6px;
}
.target-grid-point.is-e {
  left: 100%;
  top: 50%;
}
.target-grid-point.is-sw {
  left: 0;
  top: 100%;
}
.target-grid-point.is-s {
  left: 50%;
  top: 100%;
}
.target-grid-point.is-se {
  left: 100%;
  top: 100%;
}

.selection-size {
  position: absolute;
  top: -24px;
  left: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(20, 20, 22, 0.85);
  backdrop-filter: blur(12px);
  color: #ffffff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.resize-handle {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.35);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transform: translate(-50%, -50%);
  padding: 0;
  cursor: pointer;
  z-index: 6;
}

.resize-handle.is-nw {
  left: 0;
  top: 0;
  cursor: nwse-resize;
}
.resize-handle.is-n {
  left: 50%;
  top: 0;
  cursor: ns-resize;
}
.resize-handle.is-ne {
  left: 100%;
  top: 0;
  cursor: nesw-resize;
}
.resize-handle.is-w {
  left: 0;
  top: 50%;
  cursor: ew-resize;
}
.resize-handle.is-e {
  left: 100%;
  top: 50%;
  cursor: ew-resize;
}
.resize-handle.is-sw {
  left: 0;
  top: 100%;
  cursor: nesw-resize;
}
.resize-handle.is-s {
  left: 50%;
  top: 100%;
  cursor: ns-resize;
}
.resize-handle.is-se {
  left: 100%;
  top: 100%;
  cursor: nwse-resize;
}

/* Inline Annotation Canvas */
.annotation-canvas-container {
  position: absolute;
  z-index: 6;
  border: 1.5px solid #007aff;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.26);
  cursor: crosshair;
}

.annotation-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Pixel Magnifier Loupe */
.loupe-card {
  position: absolute;
  z-index: 90;
  width: 138px;
  box-sizing: border-box;
  background: rgba(26, 27, 30, 0.9);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 0.5px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

.loupe-canvas-wrapper {
  width: 138px;
  height: 96px;
  background: #000000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loupe-canvas {
  width: 138px;
  height: 96px;
  display: block;
  image-rendering: pixelated;
}

.loupe-meta {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.loupe-row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
}

.loupe-color-chip {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  border: 0.5px solid rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.loupe-color-hex {
  font-weight: 600;
}

.loupe-color-rgb {
  color: rgba(255, 255, 255, 0.5);
  font-size: 9px;
  margin-left: auto;
}

.loupe-row.secondary {
  color: rgba(255, 255, 255, 0.6);
  font-size: 9px;
}

.loupe-mode-tag {
  color: rgba(255, 255, 255, 0.5);
}

.loupe-coord {
  margin-left: auto;
  font-weight: 600;
  color: #38bdf8;
}

/* macOS Native Frosted Glass Toolbar */
.toolbar {
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  height: 38px;
  box-sizing: border-box;
  background: rgba(30, 31, 34, 0.88);
  backdrop-filter: blur(24px) saturate(190%);
  -webkit-backdrop-filter: blur(24px) saturate(190%);
  border: 0.5px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.4),
    0 2px 6px rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.9);
  user-select: none;
}

.toolbar .icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  transition: all 0.12s ease;
  font-size: 14px;
}

.toolbar .icon-button:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.toolbar .icon-button.active {
  background: #007aff;
  color: #ffffff;
}

.toolbar .icon-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.toolbar .separator {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.14);
  margin: 0 3px;
}

/* Segmented Control (Mode Switch) */
.segmented-control {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.seg-button {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.1s ease;
}

.seg-button.active {
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* Dimension Badge */
.dimension-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  font-variant-numeric: tabular-nums;
}

.anchor-select {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  outline: none;
}

.dim-input {
  width: 36px;
  background: transparent;
  border: none;
  color: #ffffff;
  font-family: inherit;
  font-size: inherit;
  text-align: center;
  outline: none;
  padding: 0;
}

.dim-input:focus {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

.dim-cross {
  color: rgba(255, 255, 255, 0.4);
}

.aspect-select {
  height: 26px;
  padding: 0 6px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  outline: none;
  cursor: pointer;
}

.aspect-select option {
  background: #232528;
  color: #ffffff;
}

.highlight-tool {
  background: rgba(0, 122, 255, 0.15) !important;
  color: #38bdf8 !important;
}

.highlight-tool:hover {
  background: rgba(0, 122, 255, 0.3) !important;
}

/* Primary Confirm Button: Signature macOS Blue Pill */
.primary-confirm {
  width: auto !important;
  padding: 0 10px !important;
  height: 28px !important;
  background: #007aff !important;
  color: #ffffff !important;
  font-weight: 500;
  font-size: 12px;
  gap: 4px;
  border-radius: 6px !important;
  box-shadow: 0 2px 6px rgba(0, 122, 255, 0.35);
}

.primary-confirm:hover {
  background: #0a84ff !important;
}

.danger-btn:hover {
  background: rgba(255, 69, 58, 0.2) !important;
  color: #ff453a !important;
}

/* Style Capsule Popover */
.style-toggle-btn {
  position: relative;
}

.color-indicator {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.style-capsule {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(30, 31, 34, 0.94);
  backdrop-filter: blur(24px) saturate(190%);
  -webkit-backdrop-filter: blur(24px) saturate(190%);
  border: 0.5px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
  z-index: 110;
}

.color-presets {
  display: flex;
  gap: 6px;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s ease;
}

.color-dot.selected {
  outline: 2px solid #ffffff;
  outline-offset: 1px;
}

.stroke-width-presets {
  display: flex;
  gap: 4px;
}

.stroke-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}

.stroke-btn.selected {
  background: rgba(0, 122, 255, 0.3);
  outline: 1px solid #007aff;
}

.stroke-sample {
  width: 14px;
  background: #ffffff;
  border-radius: 1px;
}

.fill-toggle {
  padding: 2px 8px;
  border-radius: 4px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  cursor: pointer;
}

.fill-toggle.active {
  background: #007aff;
  color: #ffffff;
}

/* Error Toast */
.error-status {
  position: absolute;
  bottom: calc(var(--screenshot-safe-bottom, 0px) + 68px);
  right: var(--screenshot-safe-right, 0px);
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.9);
  color: #ffffff;
  font-size: 12px;
}
</style>
