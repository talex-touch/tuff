<script setup lang="ts">
import type { FileUploaderFile } from '../../../file-uploader/src/types'
import type { AvatarShape } from '../types'
import type { LoadedAvatarMedia } from './media-loader'
import type {
  AvatarCaptureMode,
  AvatarEditorEmits,
  AvatarEditorLabels,
  AvatarEditorProps,
  AvatarEditorTransform,
  AvatarOutputFormat,
} from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { TxFileUploader } from '../../../file-uploader'
import { TxModal } from '../../../modal'
import { TxTooltip } from '../../../tooltip'
import AvatarEditorIcon from './AvatarEditorIcon.vue'
import AvatarEditorPanel from './AvatarEditorPanel.vue'
import AvatarEditorTimeline from './AvatarEditorTimeline.vue'
import AvatarEditorToolbar from './AvatarEditorToolbar.vue'
import {
  clampNumber,
  clampTransform,
  computeContainZoom,
  computeCoverZoom,
  normalizeRotation,
} from './geometry'
import {
  detectSupportedAvatarFormats,
  exportAvatarMedia,
  formatMediaTime,
  selectOverlappingGifFrames,
  triggerAvatarDownload,
} from './media-codecs'
import { loadAvatarMedia, seekVideoElement } from './media-loader'
import { createStageMotion } from './stage-motion'
import { renderAvatarEditorStage, shapeToRadiusRatio } from './stage-render'
import {
  AVATAR_EDITOR_DEFAULT_ACCEPT,
  AVATAR_EDITOR_DEFAULT_LABELS,
  AVATAR_EDITOR_IMAGE_ACCEPT,
  AVATAR_FORMAT_META,
  AVATAR_OUTPUT_FORMATS,
  DEFAULT_AVATAR_TRANSFORM,
  DEFAULT_ICO_SIZES,
  DEFAULT_OUTPUT_SIZE_PRESETS,
} from './types'

defineOptions({ name: 'TxAvatarEditor' })

const DEFAULT_MODAL_WIDTH = 'min(94vw, 760px)'
const EMPTY_MODAL_WIDTH = 'min(92vw, 460px)'

const props = withDefaults(defineProps<AvatarEditorProps>(), {
  source: null,
  shape: 'circle',
  width: DEFAULT_MODAL_WIDTH,
  outputFormat: 'png',
  allowFormatConversion: true,
  outputSize: 512,
  outputSizePresets: () => [...DEFAULT_OUTPUT_SIZE_PRESETS],
  outputQuality: 0.92,
  minZoom: 0.4,
  maxZoom: 6,
  allowVideoCapture: true,
  allowGifAnimation: true,
  autoSelectAnimated: true,
  allowRemoteSource: false,
  maxGifDuration: 6,
  maxGifFrames: 60,
  icoSizes: () => [...DEFAULT_ICO_SIZES],
  allowDownload: true,
  allowAdjustments: true,
  surface: 'refraction',
})

const emit = defineEmits<AvatarEditorEmits>()

const STAGE_SIZE = 304
const PREVIEW_SIZES = [48, 28] as const
const GIF_SIZE_PRESETS = [128, 192, 256, 320] as const

const modalOpen = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v) {
      invalidatePendingLoad()
      cancelActiveExport()
      stopPlayback()
      stageMotion.stop()
    }
    emit('update:open', v)
    if (!v)
      emit('cancel')
  },
})

const labels = computed<AvatarEditorLabels>(() => ({
  ...AVATAR_EDITOR_DEFAULT_LABELS,
  ...props.labels,
}))

const resolvedAccept = computed(() => {
  if (props.accept)
    return props.accept
  return props.allowVideoCapture ? AVATAR_EDITOR_DEFAULT_ACCEPT : AVATAR_EDITOR_IMAGE_ACCEPT
})

const uploaderRef = ref<{ pick: () => void } | null>(null)
const uploadedFiles = ref<FileUploaderFile[]>([])
const stageCanvasRef = ref<HTMLCanvasElement | null>(null)
const previewCanvasLgRef = ref<HTMLCanvasElement | null>(null)
const previewCanvasSmRef = ref<HTMLCanvasElement | null>(null)

const media = shallowRef<LoadedAvatarMedia | null>(null)
const loading = ref(false)
const exporting = ref(false)
const exportProgress = ref(0)
const errorMessage = ref('')
const dragOver = ref(false)
const isInteracting = ref(false)
const stageHud = ref('')
const sessionKey = ref(0)

const activeShape = ref<AvatarShape>(props.shape)
const selectedFormat = ref<AvatarOutputFormat>(props.outputFormat)
const selectedSize = ref<number>(props.outputSize)
const selectedQuality = ref<number>(Math.round(clampNumber(props.outputQuality, 0.1, 1) * 100))
const captureMode = ref<AvatarCaptureMode>('frame')
const autoSelectedAnimated = ref(false)

// Media timeline state (video & animated images)
const isPlaying = ref(false)
const videoTime = ref(0)
const gifFrameIndex = ref(0)
const clipStart = ref(0)
const clipEnd = ref(2)
const clipFps = ref(10)
const clipSize = ref(256)

const supportedFormats = ref<Record<AvatarOutputFormat, boolean>>({
  png: true,
  jpeg: true,
  webp: true,
  avif: false,
  ico: true,
  svg: true,
  gif: true,
  bmp: true,
})

const transform = reactive<AvatarEditorTransform>({ ...DEFAULT_AVATAR_TRANSFORM })
const stageMotion = createStageMotion(shapeToRadiusRatio(props.shape))

let loadToken = 0
let exportToken = 0
let scrubToken = 0
let rafId: number | null = null
let gifTimerId: number | null = null
let hudTimerId: number | null = null
let exportAbort: AbortController | null = null

const resolvedModalWidth = computed(() =>
  !media.value && props.width === DEFAULT_MODAL_WIDTH ? EMPTY_MODAL_WIDTH : props.width,
)

function clearHudTimer(): void {
  if (hudTimerId !== null) {
    window.clearTimeout(hudTimerId)
    hudTimerId = null
  }
}

function flashStageHud(text: string): void {
  stageHud.value = text
  clearHudTimer()
  if (typeof window !== 'undefined') {
    hudTimerId = window.setTimeout(() => {
      stageHud.value = ''
      hudTimerId = null
    }, 680)
  }
}

function invalidatePendingLoad(): void {
  loadToken++
  loading.value = false
}

function cancelActiveExport(): void {
  exportToken++
  exportAbort?.abort()
  exportAbort = null
  exporting.value = false
  exportProgress.value = 0
}

// Pointer & multi-touch gesture tracking
const activePointers = new Map<number, { x: number, y: number }>()
let dragStartOffset = { x: 0, y: 0 }
let dragStartPoint = { x: 0, y: 0 }
let pinchStartDist = 0
let pinchStartZoom = 1

const availableFormats = computed<AvatarOutputFormat[]>(() => {
  const list = props.allowedOutputFormats?.length
    ? props.allowedOutputFormats.filter(f => AVATAR_OUTPUT_FORMATS.includes(f))
    : [...AVATAR_OUTPUT_FORMATS]
  if (!props.allowFormatConversion)
    return list.includes(props.outputFormat) ? [props.outputFormat] : [list[0] ?? 'png']
  return list.length ? list : ['png']
})

const activeFormatMeta = computed(() => AVATAR_FORMAT_META[selectedFormat.value])

const hasTimeline = computed(() => {
  const m = media.value
  if (!m)
    return false
  return m.kind === 'video' || (m.gifFrames?.length ?? 0) > 1
})

const canExportAnimatedGif = computed(() => {
  const m = media.value
  return Boolean(
    m
    && m.animated
    && props.allowGifAnimation
    && availableFormats.value.includes('gif')
    && supportedFormats.value.gif,
  )
})

const isAnimatedGifExport = computed(() =>
  captureMode.value === 'gif-clip' && canExportAnimatedGif.value,
)

const effectiveExportFormat = computed<AvatarOutputFormat | null>(() => {
  const candidate = isAnimatedGifExport.value ? 'gif' : selectedFormat.value
  if (availableFormats.value.includes(candidate) && supportedFormats.value[candidate])
    return candidate
  return null
})

const hasUsableFormat = computed(() => effectiveExportFormat.value !== null)

const displayErrorMessage = computed(() => {
  if (errorMessage.value)
    return errorMessage.value
  if (media.value && !hasUsableFormat.value)
    return labels.value.unsupportedFormat
  return ''
})

const truncationNotice = computed(() => {
  const m = media.value
  if (!m?.truncated)
    return ''
  const loaded = m.gifFrames?.length ?? m.maxFrameCount ?? 0
  const total = m.totalFrameCount
  if (total && total > loaded)
    return `${labels.value.gifTruncatedNotice} (${loaded}/${total})`
  return labels.value.gifTruncatedNotice
})

function normalizeSelectedFormat(preferred: AvatarOutputFormat = selectedFormat.value): void {
  const allowed = availableFormats.value
  const supported = supportedFormats.value
  if (allowed.includes(preferred) && supported[preferred]) {
    selectedFormat.value = preferred
  }
  else {
    const firstUsable = allowed.find(fmt => supported[fmt])
    selectedFormat.value = firstUsable ?? allowed[0] ?? preferred
  }
  if (selectedFormat.value !== 'gif' && captureMode.value === 'gif-clip')
    captureMode.value = 'frame'
  if (selectedFormat.value === 'ico' && selectedSize.value > 256)
    selectedSize.value = 256
}

const activeSizePresets = computed(() => {
  if (isAnimatedGifExport.value)
    return [...GIF_SIZE_PRESETS]
  if (selectedFormat.value === 'ico')
    return [64, 128, 256]
  return props.outputSizePresets?.length ? props.outputSizePresets : [...DEFAULT_OUTPUT_SIZE_PRESETS]
})

const activeExportSize = computed(() =>
  isAnimatedGifExport.value ? clipSize.value : selectedSize.value,
)

function setActiveExportSize(v: number): void {
  if (isAnimatedGifExport.value)
    clipSize.value = v
  else
    selectedSize.value = v
}

const clipEstimatedFrames = computed(() => {
  const m = media.value
  if (!m || !isAnimatedGifExport.value)
    return 0
  if (m.gifFrames?.length) {
    const startMs = Math.max(0, clipStart.value * 1000)
    const endMs = Math.max(startMs + 50, clipEnd.value * 1000)
    return selectOverlappingGifFrames(m.gifFrames, startMs, endMs, props.maxGifFrames).length
  }
  const span = Math.max(0.1, clipEnd.value - clipStart.value)
  return Math.min(props.maxGifFrames, Math.max(2, Math.round(span * clipFps.value)))
})

const formatCapabilityNote = computed(() => {
  const m = media.value
  if (isAnimatedGifExport.value)
    return `GIF · ${clipEstimatedFrames.value}f · ${clipSize.value}px`
  if (selectedFormat.value === 'ico') {
    const sizes = props.icoSizes.filter(s => s <= Math.min(256, selectedSize.value))
    const minS = sizes[0] ?? 16
    const maxS = sizes[sizes.length - 1] ?? Math.min(256, selectedSize.value)
    return `ICO · ${minS}–${maxS}px`
  }
  if (selectedFormat.value === 'svg' && m?.kind === 'svg' && m.svgText)
    return 'SVG · Vector'
  if (activeFormatMeta.value.lossy)
    return `${activeFormatMeta.value.label} · ${selectedQuality.value}% · ${selectedSize.value}px`
  return `${activeFormatMeta.value.label} · ${selectedSize.value}px`
})

const currentTimelineText = computed(() => {
  const m = media.value
  if (!m)
    return ''
  if (m.gifFrames?.length)
    return `${gifFrameIndex.value + 1} / ${m.gifFrames.length}`
  return `${formatMediaTime(videoTime.value)} / ${formatMediaTime(m.duration)}`
})

function stopPlayback(): void {
  isPlaying.value = false
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (gifTimerId !== null) {
    window.clearTimeout(gifTimerId)
    gifTimerId = null
  }
  media.value?.video?.pause()
}

function disposeMedia(): void {
  stopPlayback()
  stageMotion.stop()
  media.value?.dispose()
  media.value = null
}

function resetTransformState(): void {
  Object.assign(transform, DEFAULT_AVATAR_TRANSFORM)
}

function currentDrawable(): CanvasImageSource | null {
  const m = media.value
  if (!m)
    return null
  if (m.kind === 'video' && m.video)
    return m.video
  if (m.gifFrames?.length) {
    const idx = clampNumber(gifFrameIndex.value, 0, m.gifFrames.length - 1)
    return m.gifFrames[idx]?.canvas ?? null
  }
  return m.image ?? null
}

function paintStage(): void {
  const m = media.value
  const canvas = stageCanvasRef.value
  if (!m || !canvas)
    return
  const drawable = currentDrawable()
  if (!drawable)
    return

  const v = stageMotion.state
  renderAvatarEditorStage({
    stageCanvas: canvas,
    previewTargets: [
      [previewCanvasLgRef.value, PREVIEW_SIZES[0]],
      [previewCanvasSmRef.value, PREVIEW_SIZES[1]],
    ],
    stageSize: STAGE_SIZE,
    drawable,
    naturalWidth: m.naturalWidth,
    naturalHeight: m.naturalHeight,
    transform: {
      ...transform,
      zoom: v.zoom,
      offsetX: v.offsetX,
      offsetY: v.offsetY,
      rotation: v.rotation,
    },
    shape: activeShape.value,
    maskRadiusRatio: v.maskRadiusRatio,
    gridAlpha: v.gridAlpha,
    supportsAlpha: isAnimatedGifExport.value || activeFormatMeta.value.supportsAlpha,
    isInteracting: isInteracting.value,
  })
}

function snapAndDraw(): void {
  stageMotion.snap(transform, shapeToRadiusRatio(activeShape.value), isInteracting.value ? 1 : 0)
  paintStage()
}

function springAndDraw(): void {
  stageMotion.springTo(transform, shapeToRadiusRatio(activeShape.value), isInteracting.value ? 1 : 0, paintStage)
}

function clampCurrentTransform(): void {
  const m = media.value
  if (!m)
    return
  const clamped = clampTransform(
    transform,
    { width: m.naturalWidth, height: m.naturalHeight },
    props.minZoom,
    props.maxZoom,
  )
  Object.assign(transform, clamped)
}

function applyImmediateTransform(patch: Partial<AvatarEditorTransform>): void {
  Object.assign(transform, patch)
  clampCurrentTransform()
  snapAndDraw()
}

function applySpringTransform(patch: Partial<AvatarEditorTransform>): void {
  Object.assign(transform, patch)
  clampCurrentTransform()
  springAndDraw()
}

function selectShape(shape: AvatarShape): void {
  activeShape.value = shape
  springAndDraw()
}

async function loadSource(source: File | Blob | string): Promise<void> {
  const token = ++loadToken
  scrubToken++
  cancelActiveExport()
  stopPlayback()
  stageMotion.stop()
  loading.value = true
  errorMessage.value = ''

  try {
    const loaded = await loadAvatarMedia(source, {
      allowRemoteSource: props.allowRemoteSource,
    })
    if (token !== loadToken || !props.open) {
      loaded.dispose()
      return
    }
    if (loaded.kind === 'video' && !props.allowVideoCapture) {
      loaded.dispose()
      errorMessage.value = labels.value.videoUnsupportedError
      emit('error', new Error(labels.value.videoUnsupportedError))
      if (media.value)
        snapAndDraw()
      return
    }

    disposeMedia()
    media.value = loaded
    resetTransformState()
    videoTime.value = 0
    gifFrameIndex.value = 0

    const prefersAnimated = Boolean(
      props.autoSelectAnimated
      && loaded.animated
      && props.allowGifAnimation
      && availableFormats.value.includes('gif')
      && supportedFormats.value.gif
      && (props.allowFormatConversion || selectedFormat.value === 'gif'),
    )

    if (prefersAnimated) {
      captureMode.value = 'gif-clip'
      selectedFormat.value = 'gif'
      clipStart.value = 0
      const defaultSpan = loaded.kind === 'video'
        ? Math.min(3, props.maxGifDuration)
        : props.maxGifDuration
      clipEnd.value = Math.min(loaded.duration > 0 ? loaded.duration : 2, defaultSpan)
    }
    else {
      captureMode.value = 'frame'
      if (autoSelectedAnimated.value)
        normalizeSelectedFormat(props.outputFormat)
      clipStart.value = 0
      clipEnd.value = Math.min(
        loaded.duration > 0 ? loaded.duration : 2,
        props.maxGifDuration,
      )
    }
    autoSelectedAnimated.value = prefersAnimated

    if (loaded.corsTainted)
      errorMessage.value = labels.value.corsTaintedError

    emit('source-change', {
      kind: loaded.kind,
      file: loaded.file,
      width: loaded.naturalWidth,
      height: loaded.naturalHeight,
    })

    await nextTick()
    if (token !== loadToken)
      return
    snapAndDraw()

    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const canAutoPlay = (loaded.kind === 'video' && Boolean(loaded.video))
      || (loaded.gifFrames?.length ?? 0) > 1
    if (prefersAnimated && !prefersReducedMotion && canAutoPlay)
      togglePlayback()
  }
  catch (err) {
    if (token !== loadToken)
      return
    const error = err instanceof Error ? err : new Error(labels.value.loadFailedError)
    if (error.message.includes('allowRemoteSource') || error.message.includes('Unsupported media source URL'))
      errorMessage.value = labels.value.remoteSourceBlockedError
    else if (error.message.includes('Video'))
      errorMessage.value = labels.value.videoUnsupportedError
    else
      errorMessage.value = labels.value.loadFailedError
    emit('error', error)
    if (media.value)
      snapAndDraw()
  }
  finally {
    if (token === loadToken)
      loading.value = false
  }
}

function handleUploaderAdd(added: FileUploaderFile[]): void {
  const first = added[0]?.file
  uploadedFiles.value = []
  if (first)
    void loadSource(first)
}

function triggerReplaceFile(): void {
  uploaderRef.value?.pick()
}

function rotateBy(deltaDeg: number): void {
  transform.rotation = normalizeRotation(transform.rotation + deltaDeg)
  clampCurrentTransform()
  springAndDraw()
  flashStageHud(`${Math.round(transform.rotation)}°`)
}

function toggleFlipX(): void {
  transform.flipX = !transform.flipX
  paintStage()
}

function toggleFlipY(): void {
  transform.flipY = !transform.flipY
  paintStage()
}

function fitContain(): void {
  const m = media.value
  if (!m)
    return
  transform.zoom = clampNumber(
    computeContainZoom({ width: m.naturalWidth, height: m.naturalHeight }, transform.rotation),
    props.minZoom,
    props.maxZoom,
  )
  transform.offsetX = 0
  transform.offsetY = 0
  springAndDraw()
  flashStageHud(`${Math.round(transform.zoom * 100)}%`)
}

function fitCover(): void {
  const m = media.value
  if (!m)
    return
  transform.zoom = clampNumber(
    computeCoverZoom({ width: m.naturalWidth, height: m.naturalHeight }, transform.rotation),
    props.minZoom,
    props.maxZoom,
  )
  transform.offsetX = 0
  transform.offsetY = 0
  springAndDraw()
  flashStageHud(`${Math.round(transform.zoom * 100)}%`)
}

function resetAll(): void {
  resetTransformState()
  springAndDraw()
  flashStageHud('100%')
}

function selectCaptureMode(mode: AvatarCaptureMode): void {
  captureMode.value = mode
  if (mode === 'gif-clip' && availableFormats.value.includes('gif'))
    selectedFormat.value = 'gif'
  paintStage()
}

function selectFormat(format: AvatarOutputFormat): void {
  if (!availableFormats.value.includes(format) || !supportedFormats.value[format])
    return
  autoSelectedAnimated.value = false
  normalizeSelectedFormat(format)
  paintStage()
}

function scheduleGifNextFrame(): void {
  const m = media.value
  if (!isPlaying.value || !m || !m.gifFrames?.length)
    return
  const current = m.gifFrames[gifFrameIndex.value]
  const delay = Math.max(25, current?.delayMs ?? 100)
  gifTimerId = window.setTimeout(() => {
    if (!isPlaying.value || !media.value?.gifFrames?.length)
      return
    gifFrameIndex.value = (gifFrameIndex.value + 1) % media.value.gifFrames.length
    paintStage()
    scheduleGifNextFrame()
  }, delay)
}

function tickVideoFrame(): void {
  const m = media.value
  if (!isPlaying.value || !m || m.kind !== 'video' || !m.video)
    return
  videoTime.value = m.video.currentTime
  if (isAnimatedGifExport.value && m.video.currentTime >= clipEnd.value)
    m.video.currentTime = clipStart.value
  paintStage()
  rafId = requestAnimationFrame(tickVideoFrame)
}

function togglePlayback(): void {
  const m = media.value
  if (!m)
    return
  if (isPlaying.value) {
    stopPlayback()
    return
  }

  if (m.kind === 'video' && m.video) {
    isPlaying.value = true
    if (isAnimatedGifExport.value && (m.video.currentTime < clipStart.value || m.video.currentTime >= clipEnd.value))
      m.video.currentTime = clipStart.value
    m.video.play().catch(() => {
      isPlaying.value = false
    })
    rafId = requestAnimationFrame(tickVideoFrame)
  }
  else if (m.gifFrames && m.gifFrames.length > 1) {
    isPlaying.value = true
    scheduleGifNextFrame()
  }
}

async function scrubTo(value: number): Promise<void> {
  const m = media.value
  if (!m)
    return
  stopPlayback()
  if (m.gifFrames?.length) {
    gifFrameIndex.value = Math.round(clampNumber(value, 0, m.gifFrames.length - 1))
    paintStage()
    return
  }
  if (m.kind === 'video' && m.video) {
    const token = ++scrubToken
    const target = clampNumber(value, 0, m.duration)
    videoTime.value = target
    try {
      await seekVideoElement(m.video, target)
      if (token !== scrubToken || media.value !== m)
        return
      paintStage()
    }
    catch (err) {
      if (token !== scrubToken || media.value !== m)
        return
      videoTime.value = clampNumber(m.video.currentTime, 0, m.duration)
      const error = err instanceof Error ? err : new Error(labels.value.videoUnsupportedError)
      errorMessage.value = labels.value.videoUnsupportedError
      emit('error', error)
    }
  }
}

function stepFrame(delta: number): void {
  const m = media.value
  if (!m)
    return
  if (m.gifFrames?.length) {
    const total = m.gifFrames.length
    gifFrameIndex.value = (gifFrameIndex.value + delta + total) % total
    paintStage()
    return
  }
  if (m.kind === 'video')
    void scrubTo(videoTime.value + delta * (1 / 30))
}

function updateClipRange(which: 'start' | 'end', rawVal: number): void {
  const m = media.value
  const maxDur = m?.duration || 10
  const maxSpan = Math.max(0.5, props.maxGifDuration)
  const val = clampNumber(rawVal, 0, maxDur)

  if (which === 'start') {
    clipStart.value = Math.min(val, Math.max(0, maxDur - 0.1))
    if (clipEnd.value <= clipStart.value + 0.1)
      clipEnd.value = Math.min(maxDur, clipStart.value + 0.5)
    if (clipEnd.value - clipStart.value > maxSpan)
      clipEnd.value = Math.min(maxDur, clipStart.value + maxSpan)
    if (m?.kind === 'video')
      void scrubTo(clipStart.value)
  }
  else {
    clipEnd.value = Math.max(val, Math.min(maxDur, clipStart.value + 0.1))
    if (clipEnd.value - clipStart.value > maxSpan)
      clipStart.value = Math.max(0, clipEnd.value - maxSpan)
    if (m?.kind === 'video')
      void scrubTo(clipEnd.value)
  }
}

function onStagePointerDown(e: PointerEvent): void {
  if (!media.value)
    return
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture?.(e.pointerId)
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  isInteracting.value = true

  if (activePointers.size === 1) {
    dragStartPoint = { x: e.clientX, y: e.clientY }
    dragStartOffset = { x: transform.offsetX, y: transform.offsetY }
  }
  else if (activePointers.size === 2) {
    const [a, b] = Array.from(activePointers.values())
    pinchStartDist = Math.hypot(a!.x - b!.x, a!.y - b!.y) || 1
    pinchStartZoom = transform.zoom
  }
  springAndDraw()
}

function onStagePointerMove(e: PointerEvent): void {
  if (!activePointers.has(e.pointerId) || !media.value)
    return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (activePointers.size === 2) {
    const [a, b] = Array.from(activePointers.values())
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    if (pinchStartDist > 0) {
      transform.zoom = clampNumber(pinchStartZoom * (dist / pinchStartDist), props.minZoom, props.maxZoom)
      clampCurrentTransform()
      snapAndDraw()
      flashStageHud(`${Math.round(transform.zoom * 100)}%`)
    }
    return
  }

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const span = Math.max(1, rect.width || STAGE_SIZE)
  transform.offsetX = dragStartOffset.x + (e.clientX - dragStartPoint.x) / span
  transform.offsetY = dragStartOffset.y + (e.clientY - dragStartPoint.y) / span
  clampCurrentTransform()
  snapAndDraw()
}

function onStagePointerUp(e: PointerEvent): void {
  activePointers.delete(e.pointerId)
  if (activePointers.size === 1) {
    const [remaining] = Array.from(activePointers.values())
    dragStartPoint = { x: remaining!.x, y: remaining!.y }
    dragStartOffset = { x: transform.offsetX, y: transform.offsetY }
  }
  else if (activePointers.size === 0) {
    isInteracting.value = false
    springAndDraw()
  }
}

function onStageWheel(e: WheelEvent): void {
  if (!media.value)
    return
  e.preventDefault()
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const snap = { ...stageMotion.state }
  const prevZoom = snap.zoom
  const nextZoom = clampNumber(prevZoom * Math.exp(-e.deltaY * 0.0018), props.minZoom, props.maxZoom)
  transform.rotation = normalizeRotation(snap.rotation)
  if (rect.width > 0 && rect.height > 0 && nextZoom !== prevZoom) {
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    const scaleRatio = nextZoom / prevZoom
    transform.offsetX = px - (px - snap.offsetX) * scaleRatio
    transform.offsetY = py - (py - snap.offsetY) * scaleRatio
  }
  else {
    transform.offsetX = snap.offsetX
    transform.offsetY = snap.offsetY
  }
  transform.zoom = nextZoom
  clampCurrentTransform()
  snapAndDraw()
  flashStageHud(`${Math.round(transform.zoom * 100)}%`)
}

function onStageKeydown(e: KeyboardEvent): void {
  if (!media.value)
    return
  const step = e.shiftKey ? 0.01 : 0.04
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      transform.offsetX -= step
      break
    case 'ArrowRight':
      e.preventDefault()
      transform.offsetX += step
      break
    case 'ArrowUp':
      e.preventDefault()
      transform.offsetY -= step
      break
    case 'ArrowDown':
      e.preventDefault()
      transform.offsetY += step
      break
    case '+':
    case '=':
      e.preventDefault()
      transform.zoom = clampNumber(transform.zoom + 0.15, props.minZoom, props.maxZoom)
      flashStageHud(`${Math.round(transform.zoom * 100)}%`)
      break
    case '-':
    case '_':
      e.preventDefault()
      transform.zoom = clampNumber(transform.zoom - 0.15, props.minZoom, props.maxZoom)
      flashStageHud(`${Math.round(transform.zoom * 100)}%`)
      break
    case '[':
      e.preventDefault()
      rotateBy(-5)
      return
    case ']':
      e.preventDefault()
      rotateBy(5)
      return
    case '0':
      e.preventDefault()
      resetAll()
      return
    case ' ':
      if (hasTimeline.value) {
        e.preventDefault()
        togglePlayback()
      }
      return
    default:
      return
  }
  clampCurrentTransform()
  springAndDraw()
}

function onStageDoubleClick(): void {
  if (!media.value)
    return
  if (Math.abs(transform.zoom - 1) < 0.05 && Math.abs(transform.offsetX) < 0.02 && Math.abs(transform.offsetY) < 0.02)
    fitContain()
  else
    fitCover()
}

function onDropZoneOver(e: DragEvent): void {
  e.preventDefault()
  dragOver.value = true
}

function onDropZoneLeave(e: DragEvent): void {
  const related = e.relatedTarget as Node | null
  if (related && (e.currentTarget as HTMLElement).contains(related))
    return
  dragOver.value = false
}

function onDropZoneDrop(e: DragEvent): void {
  e.preventDefault()
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file)
    void loadSource(file)
}

function handleWindowPaste(e: ClipboardEvent): void {
  if (!props.open)
    return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
    return
  const items = Array.from(e.clipboardData?.items ?? [])
  const mediaItem = items.find(item => item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/')))
  const file = mediaItem?.getAsFile()
  if (file) {
    e.preventDefault()
    void loadSource(file)
  }
}

async function runExport(downloadOnly: boolean): Promise<void> {
  const m = media.value
  if (!m || exporting.value)
    return
  if (m.corsTainted) {
    errorMessage.value = labels.value.corsTaintedError
    return
  }

  normalizeSelectedFormat()
  const targetFormat = effectiveExportFormat.value
  if (!targetFormat) {
    const err = new Error(labels.value.unsupportedFormat)
    errorMessage.value = labels.value.unsupportedFormat
    emit('error', err)
    return
  }

  stopPlayback()
  const myExportToken = ++exportToken
  const myAbort = new AbortController()
  exportAbort = myAbort
  exporting.value = true
  exportProgress.value = 0
  errorMessage.value = ''

  const isExportActive = (): boolean =>
    myExportToken === exportToken
    && !myAbort.signal.aborted
    && props.open
    && media.value === m

  try {
    const result = await exportAvatarMedia(m, {
      format: targetFormat,
      outputSize: activeExportSize.value,
      quality: selectedQuality.value / 100,
      shape: activeShape.value,
      transform: { ...transform },
      captureMode: isAnimatedGifExport.value ? 'gif-clip' : 'frame',
      gifFrameIndex: gifFrameIndex.value,
      videoTimeSec: videoTime.value,
      gifClip: {
        startTime: clipStart.value,
        endTime: clipEnd.value,
        fps: clipFps.value,
        size: clipSize.value,
      },
      maxGifFrames: props.maxGifFrames,
      icoSizes: props.icoSizes,
      fileName: props.fileName,
      customConverter: props.customConverter,
      onProgress: (p) => {
        if (isExportActive())
          exportProgress.value = p
      },
      signal: myAbort.signal,
    })

    if (!isExportActive())
      return

    if (downloadOnly) {
      triggerAvatarDownload(result.blob, result.file.name)
      return
    }

    if (props.beforeConfirm) {
      const allowed = await props.beforeConfirm(result)
      if (!isExportActive() || allowed === false)
        return
    }

    if (!isExportActive())
      return

    emit('confirm', result)
    emit('update:open', false)
  }
  catch (err) {
    if (!isExportActive() || (err instanceof DOMException && err.name === 'AbortError'))
      return
    const error = err instanceof Error ? err : new Error('Export failed')
    errorMessage.value = error.message
    emit('error', error)
  }
  finally {
    if (myExportToken === exportToken) {
      exporting.value = false
      exportAbort = null
    }
  }
}

function handleCancel(): void {
  invalidatePendingLoad()
  cancelActiveExport()
  stopPlayback()
  stageMotion.stop()
  emit('update:open', false)
  emit('cancel')
}

watch(() => props.shape, (next) => {
  activeShape.value = next
  springAndDraw()
})

watch(() => props.outputFormat, (next) => {
  autoSelectedAnimated.value = false
  normalizeSelectedFormat(next)
  paintStage()
})

watch([() => props.allowedOutputFormats, () => props.allowFormatConversion], () => {
  normalizeSelectedFormat()
  paintStage()
}, { deep: true })

watch(() => props.outputSize, (next) => {
  selectedSize.value = next
})

watch(
  [() => props.open, () => props.source],
  ([isOpen, nextSource], [wasOpen, prevSource]) => {
    if (!isOpen) {
      invalidatePendingLoad()
      cancelActiveExport()
      stopPlayback()
      stageMotion.stop()
      clearHudTimer()
      stageHud.value = ''
      return
    }

    if (!wasOpen) {
      sessionKey.value++
      activeShape.value = props.shape
      selectedFormat.value = props.outputFormat
      selectedSize.value = props.outputSize
      selectedQuality.value = Math.round(clampNumber(props.outputQuality, 0.1, 1) * 100)
      autoSelectedAnimated.value = false
      errorMessage.value = ''
      normalizeSelectedFormat(props.outputFormat)

      void detectSupportedAvatarFormats().then((map) => {
        supportedFormats.value = map
        normalizeSelectedFormat()
      })
    }

    if (!wasOpen || nextSource !== prevSource) {
      if (nextSource) {
        void loadSource(nextSource)
      }
      else {
        invalidatePendingLoad()
        cancelActiveExport()
        disposeMedia()
        resetTransformState()
        errorMessage.value = ''
      }
    }
  },
  { immediate: true },
)

watch(
  () => [
    transform.flipX,
    transform.flipY,
    transform.brightness,
    transform.contrast,
    transform.saturation,
    transform.background,
    transform.maskClip,
  ],
  () => {
    if (media.value)
      paintStage()
  },
)

onMounted(() => {
  if (typeof window !== 'undefined')
    window.addEventListener('paste', handleWindowPaste)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined')
    window.removeEventListener('paste', handleWindowPaste)
  clearHudTimer()
  invalidatePendingLoad()
  cancelActiveExport()
  disposeMedia()
})

defineExpose({
  loadSource,
  pickFile: triggerReplaceFile,
  reset: resetAll,
})
</script>

<template>
  <TxModal
    v-model="modalOpen"
    :title="labels.title"
    :width="resolvedModalWidth"
    :close-label="labels.close"
    :surface="surface"
  >
    <div class="tx-avatar-editor">
      <!-- Visual-first upload state: crisp media icons + minimal TxFileUploader, zero text clutter -->
      <div v-show="!media" class="tx-avatar-editor__upload-pane">
        <div class="tx-avatar-editor__media-glyphs" aria-hidden="true">
          <span class="tx-avatar-editor__glyph-chip"><AvatarEditorIcon name="image" :size="15" /></span>
          <span class="tx-avatar-editor__glyph-chip"><AvatarEditorIcon name="film" :size="15" /></span>
          <span class="tx-avatar-editor__glyph-chip"><AvatarEditorIcon name="video" :size="15" /></span>
          <span class="tx-avatar-editor__glyph-chip"><AvatarEditorIcon name="sparkle" :size="15" /></span>
        </div>
        <TxFileUploader
          ref="uploaderRef"
          v-model="uploadedFiles"
          :multiple="false"
          :accept="resolvedAccept"
          :show-size="false"
          :allow-drop="true"
          :drop-text="labels.uploadDropText"
          :hint-text="labels.uploadHintText"
          :button-text="labels.uploadButtonText"
          @add="handleUploaderAdd"
        />
      </div>

      <div v-if="media" class="tx-avatar-editor__workspace">
        <div class="tx-avatar-editor__stage-col">
          <div
            class="tx-avatar-editor__stage-wrap"
            :class="{ 'is-drag-over': dragOver, 'is-grabbing': isInteracting }"
            tabindex="0"
            role="application"
            :aria-label="labels.title"
            @pointerdown="onStagePointerDown"
            @pointermove="onStagePointerMove"
            @pointerup="onStagePointerUp"
            @pointercancel="onStagePointerUp"
            @wheel="onStageWheel"
            @dblclick="onStageDoubleClick"
            @keydown="onStageKeydown"
            @dragover="onDropZoneOver"
            @dragleave="onDropZoneLeave"
            @drop="onDropZoneDrop"
          >
            <canvas
              ref="stageCanvasRef"
              class="tx-avatar-editor__canvas"
              :width="STAGE_SIZE"
              :height="STAGE_SIZE"
            />
            <div v-if="loading" class="tx-avatar-editor__overlay-msg" role="status" aria-live="polite">
              {{ labels.loading }}
            </div>
            <div class="tx-avatar-editor__hud" :class="{ 'is-visible': Boolean(stageHud) }" aria-hidden="true">
              {{ stageHud }}
            </div>
            <div class="tx-avatar-editor__source-badge">
              <span>{{ media.kind.toUpperCase() }}</span>
              <span>{{ media.naturalWidth }}×{{ media.naturalHeight }}</span>
            </div>
          </div>

          <AvatarEditorToolbar
            :labels="labels"
            :flip-x="transform.flipX"
            :flip-y="transform.flipY"
            :exporting="exporting"
            @rotate="rotateBy"
            @flip-x="toggleFlipX"
            @flip-y="toggleFlipY"
            @fit-contain="fitContain"
            @fit-cover="fitCover"
            @reset="resetAll"
            @replace="triggerReplaceFile"
          />

          <AvatarEditorTimeline
            v-if="hasTimeline"
            :labels="labels"
            :is-gif="Boolean(media.gifFrames?.length)"
            :gif-frame-count="media.gifFrames?.length ?? 0"
            :gif-frame-index="gifFrameIndex"
            :video-time="videoTime"
            :duration="media.duration"
            :is-playing="isPlaying"
            :capture-mode="captureMode"
            :can-export-animated-gif="canExportAnimatedGif"
            :is-animated-gif-export="isAnimatedGifExport"
            :clip-start="clipStart"
            :clip-end="clipEnd"
            :clip-fps="clipFps"
            :timeline-text="currentTimelineText"
            @select-mode="selectCaptureMode"
            @toggle-playback="togglePlayback"
            @step-frame="stepFrame"
            @scrub="scrubTo"
            @update-clip-range="updateClipRange"
            @update-clip-fps="clipFps = $event"
          />
        </div>

        <AvatarEditorPanel
          :labels="labels"
          :transform="transform"
          :active-shape="activeShape"
          :min-zoom="minZoom"
          :max-zoom="maxZoom"
          :allow-adjustments="allowAdjustments"
          :allow-format-conversion="allowFormatConversion"
          :available-formats="availableFormats"
          :supported-formats="supportedFormats"
          :selected-format="selectedFormat"
          :active-format-meta="activeFormatMeta"
          :active-size-presets="activeSizePresets"
          :active-export-size="activeExportSize"
          :selected-quality="selectedQuality"
          :is-animated-gif-export="isAnimatedGifExport"
          :format-capability-note="formatCapabilityNote"
          :session-key="sessionKey"
          @update:shape="selectShape"
          @update-transform="applyImmediateTransform"
          @spring-transform="applySpringTransform"
          @select-format="selectFormat"
          @update:export-size="setActiveExportSize"
          @update:quality="selectedQuality = $event"
          @set-preview-lg="previewCanvasLgRef = $event"
          @set-preview-sm="previewCanvasSmRef = $event"
        />
      </div>

      <div v-if="truncationNotice" class="tx-avatar-editor__notice" role="status">
        {{ truncationNotice }}
      </div>

      <div v-if="displayErrorMessage" class="tx-avatar-editor__error" role="alert">
        {{ displayErrorMessage }}
      </div>
    </div>

    <template #footer>
      <div class="tx-avatar-editor__footer">
        <div class="tx-avatar-editor__footer-left">
          <TxTooltip v-if="media && allowDownload" :content="labels.download">
            <button
              type="button"
              class="tx-avatar-editor__btn tx-avatar-editor__btn--icon"
              :aria-label="labels.download"
              :disabled="exporting || media.corsTainted || !hasUsableFormat"
              @click="runExport(true)"
            >
              <AvatarEditorIcon name="download" :size="15" />
            </button>
          </TxTooltip>
        </div>

        <div class="tx-avatar-editor__footer-right">
          <button
            type="button"
            class="tx-avatar-editor__btn tx-avatar-editor__btn--secondary"
            @click="handleCancel"
          >
            {{ labels.cancel }}
          </button>
          <button
            v-if="media"
            type="button"
            class="tx-avatar-editor__btn tx-avatar-editor__btn--primary"
            :disabled="loading || exporting || media.corsTainted || !hasUsableFormat"
            @click="runExport(false)"
          >
            <span
              v-if="exporting"
              class="tx-avatar-editor__btn-fill"
              :style="{ width: `${exportProgress}%` }"
              aria-hidden="true"
            />
            <span class="tx-avatar-editor__btn-text">
              {{ exporting ? `${exportProgress}%` : labels.apply }}
            </span>
          </button>
        </div>
      </div>
    </template>
  </TxModal>
</template>

<style lang="scss">
.tx-avatar-editor,
.tx-avatar-editor__footer {
  --a-p: var(--tx-color-primary, #409eff);
  --a-pb: var(--tx-color-primary-light-9, #ecf5ff);
  --a-pr: color-mix(in srgb, var(--a-p) 46%, transparent);
  --a-t: var(--tx-text-color-primary, #303133);
  --a-r: var(--tx-text-color-regular, #606266);
  --a-s: var(--tx-text-color-secondary, #6b7280);
  --a-f: var(--tx-fill-color-light, #f5f7fa);
  --a-h: var(--tx-fill-color, #ebedf0);
  --a-c: var(--tx-fill-color-lighter, #fafafa);
  --a-b: var(--tx-bg-color, #fff);
  --a-k: var(--tx-color-black, #000);
  --a-w: var(--tx-color-on-primary, #fff);
  --a-l: var(--tx-border-color-lighter, #e4e7ed);
  --a-ls: var(--tx-border-color-extra-light, #ebeef5);
  --a-bd: inset 0 0 0 1px var(--a-l);
  --a-bds: inset 0 0 0 1px var(--a-ls);
  --a-e: var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.tx-avatar-editor,
.tx-avatar-editor__upload-pane,
.tx-avatar-editor__stage-col,
.tx-avatar-editor__panel,
.tx-avatar-editor__preview-right,
.tx-avatar-editor__group,
.tx-avatar-editor__adjust-body,
.tx-avatar-editor__timeline,
.tx-avatar-editor__clip-grid {
  display: flex;
  flex-direction: column;
}

.tx-avatar-editor__toolbar,
.tx-avatar-editor__preview-row,
.tx-avatar-editor__disclosure,
.tx-avatar-editor__swatch-row,
.tx-avatar-editor__size-row,
.tx-avatar-editor__timeline-head,
.tx-avatar-editor__clip-meta,
.tx-avatar-editor__transport,
.tx-avatar-editor__footer,
.tx-avatar-editor__footer-left,
.tx-avatar-editor__footer-right,
.tx-ae-slider,
.tx-ae-slider__track-wrap {
  display: flex;
  align-items: center;
}

.tx-avatar-editor__preview-row,
.tx-avatar-editor__disclosure,
.tx-avatar-editor__swatch-row,
.tx-avatar-editor__timeline-head,
.tx-avatar-editor__clip-meta,
.tx-avatar-editor__footer {
  justify-content: space-between;
}

.tx-avatar-editor__glyph-chip,
.tx-avatar-editor__tool-btn,
.tx-avatar-editor__alpha-btn,
.tx-avatar-editor__mini-btn,
.tx-avatar-editor__row-icon,
.tx-avatar-editor__btn,
.tx-ae-slider__icon,
.tx-ae-glide__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tx-avatar-editor__preview-row,
.tx-avatar-editor__timeline {
  border-radius: 12px;
  background: var(--a-c);
  box-shadow: var(--a-bd);
}

.tx-avatar-editor__preview-sub,
.tx-avatar-editor__unit,
.tx-avatar-editor__timeline-readout,
.tx-avatar-editor__clip-span,
.tx-avatar-editor__fps-unit {
  font-size: 11px;
  color: var(--a-s);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tx-ae-slider__detent,
.tx-ae-slider__thumb,
.tx-avatar-editor__trim-handle,
.tx-avatar-editor__trim-handle::after {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
}

.tx-avatar-editor {
  gap: 12px;
  font-size: 13px;
  color: var(--a-t);
}

.tx-avatar-editor__workspace button,
.tx-avatar-editor__btn {
  appearance: none;
  border: none;
  font: inherit;
  transition: transform 140ms var(--a-e);

  &:active:not(:disabled):not(.tx-avatar-editor__trim-handle) {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--a-p);
    outline-offset: 1px;
  }
}

.tx-avatar-editor__tool-btn,
.tx-avatar-editor__alpha-btn,
.tx-avatar-editor__format-btn {
  border-radius: 8px;
  background: var(--a-f);
  color: var(--a-r);
  cursor: pointer;
  box-shadow: var(--a-bds);

  &:hover:not(:disabled) {
    background: var(--a-h);
    color: var(--a-t);
  }

  &.is-active {
    background: var(--a-pb);
    color: var(--a-p);
    box-shadow: inset 0 0 0 1px var(--a-pr);
  }
}

.tx-avatar-editor__tool-btn,
.tx-avatar-editor__alpha-btn {
  width: 30px;
  height: 30px;
  padding: 0;
}

.tx-avatar-editor__upload-pane {
  gap: 12px;
}

.tx-avatar-editor__media-glyphs {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.tx-avatar-editor__glyph-chip {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--a-s);
  background: var(--a-c);
  box-shadow: var(--a-bds);
}

.tx-avatar-editor__workspace {
  display: grid;
  grid-template-columns: minmax(260px, 304px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.tx-avatar-editor__stage-col {
  gap: 9px;
}

.tx-avatar-editor__stage-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 14px;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
  box-shadow: var(--a-bd);
  background: var(--a-f) conic-gradient(var(--a-h) 90deg, transparent 0 180deg, var(--a-h) 0 270deg, transparent 0) 0 0 / 16px 16px;

  &.is-grabbing {
    cursor: grabbing;
  }

  &.is-drag-over {
    box-shadow: inset 0 0 0 2px var(--a-p);
  }

  &:focus-visible {
    outline: 2px solid var(--a-p);
    outline-offset: 2px;
  }
}

.tx-avatar-editor__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.tx-avatar-editor__overlay-msg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  background: color-mix(in srgb, var(--a-b) 78%, transparent);
}

.tx-avatar-editor__hud,
.tx-avatar-editor__source-badge {
  position: absolute;
  border-radius: 999px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  color: var(--a-w);
  backdrop-filter: blur(6px);
}

.tx-avatar-editor__hud {
  top: 10px;
  left: 50%;
  padding: 3px 10px;
  font-size: 11px;
  background: color-mix(in srgb, var(--a-k) 58%, transparent);
  opacity: 0;
  transform: translate(-50%, -4px) scale(0.96);
  transition: opacity 160ms ease, transform 180ms var(--a-e);

  &.is-visible {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

.tx-avatar-editor__source-badge {
  left: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  font-size: 10px;
  background: color-mix(in srgb, var(--a-k) 44%, transparent);
  opacity: 0.78;
  transition: opacity 150ms ease;
}

.tx-avatar-editor__stage-wrap:hover .tx-avatar-editor__source-badge {
  opacity: 1;
}

.tx-avatar-editor__notice,
.tx-avatar-editor__error {
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
}

.tx-avatar-editor__notice {
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 55%, var(--a-t));
  background: var(--tx-color-warning-light-9, #fdf6ec);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-warning, #e6a23c) 32%, transparent);
}

.tx-avatar-editor__error {
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--a-t));
  background: var(--tx-color-danger-light-9, #fef0f0);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-danger, #f56c6c) 28%, transparent);
}

.tx-avatar-editor__footer {
  gap: 12px;
  width: 100%;
}

.tx-avatar-editor__footer-left,
.tx-avatar-editor__footer-right {
  gap: 8px;
}

.tx-avatar-editor__btn {
  position: relative;
  overflow: hidden;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.tx-avatar-editor__btn--icon {
  width: 32px;
  padding: 0;
  background: transparent;
  color: var(--a-r);
  box-shadow: var(--a-bd);

  &:hover:not(:disabled) {
    background: var(--a-f);
    color: var(--a-t);
  }
}

.tx-avatar-editor__btn--primary {
  min-width: 76px;
  background: var(--a-p);
  color: var(--a-w);

  &:hover:not(:disabled) {
    background: var(--tx-color-primary-light-3, #66b1ff);
  }
}

.tx-avatar-editor__btn-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--a-w) 22%, transparent);
  pointer-events: none;
}

.tx-avatar-editor__btn-text {
  position: relative;
  z-index: 1;
  font-variant-numeric: tabular-nums;
}

.tx-avatar-editor__btn--secondary {
  background: var(--a-f);
  color: var(--a-t);
  box-shadow: var(--a-bd);

  &:hover:not(:disabled) {
    background: var(--a-h);
  }
}

.tx-avatar-editor__svg {
  display: block;
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tx-avatar-editor *,
  .tx-avatar-editor__btn {
    transition: none;
  }
}

@media (max-width: 680px) {
  .tx-avatar-editor__workspace {
    grid-template-columns: 1fr;
  }

  .tx-avatar-editor__stage-wrap {
    max-width: 304px;
    margin: 0 auto;
  }

  .tx-avatar-editor__footer {
    flex-wrap: wrap;
  }
}
</style>
