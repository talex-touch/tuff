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
import AvatarEditorIcon from './AvatarEditorIcon.vue'
import AvatarEditorPanel from './AvatarEditorPanel.vue'
import AvatarEditorTimeline from './AvatarEditorTimeline.vue'
import {
  clampNumber,
  clampTransform,
  computeContainZoom,
  computeCoverZoom,
  normalizeRotation,
  traceMaskPath,
} from './geometry'
import {
  detectSupportedAvatarFormats,
  exportAvatarMedia,
  formatByteSize,
  formatMediaTime,
  renderDrawableToCanvas,
  selectOverlappingGifFrames,
  triggerAvatarDownload,
} from './media-codecs'
import { loadAvatarMedia, seekVideoElement } from './media-loader'
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

const props = withDefaults(defineProps<AvatarEditorProps>(), {
  source: null,
  shape: 'circle',
  width: 'min(94vw, 800px)',
  outputFormat: 'png',
  allowFormatConversion: true,
  outputSize: 512,
  outputSizePresets: () => [...DEFAULT_OUTPUT_SIZE_PRESETS],
  outputQuality: 0.92,
  minZoom: 0.4,
  maxZoom: 6,
  allowVideoCapture: true,
  allowGifAnimation: true,
  allowRemoteSource: false,
  maxGifDuration: 6,
  maxGifFrames: 60,
  icoSizes: () => [...DEFAULT_ICO_SIZES],
  allowDownload: true,
  allowAdjustments: true,
  surface: 'refraction',
})

const emit = defineEmits<AvatarEditorEmits>()

const STAGE_SIZE = 312
const PREVIEW_SIZES = [56, 32] as const
const GIF_SIZE_PRESETS = [128, 192, 256, 320] as const

const modalOpen = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v) {
      invalidatePendingLoad()
      cancelActiveExport()
      stopPlayback()
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

const activeShape = ref<AvatarShape>(props.shape)
const selectedFormat = ref<AvatarOutputFormat>(props.outputFormat)
const selectedSize = ref<number>(props.outputSize)
const selectedQuality = ref<number>(Math.round(clampNumber(props.outputQuality, 0.1, 1) * 100))
const captureMode = ref<AvatarCaptureMode>('frame')

// Media timeline state (video & animated GIF)
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

let loadToken = 0
let exportToken = 0
let scrubToken = 0
let rafId: number | null = null
let gifTimerId: number | null = null
let exportAbort: AbortController | null = null

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
  return m.kind === 'video' || (m.kind === 'gif' && (m.gifFrames?.length ?? 0) > 1)
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
  if (m.kind === 'gif' && m.gifFrames?.length) {
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
    return `GIF89a · ${clipEstimatedFrames.value}f · ${clipSize.value}px`
  if (selectedFormat.value === 'ico') {
    const sizes = props.icoSizes.filter(s => s <= Math.min(256, selectedSize.value))
    const minS = sizes[0] ?? 16
    const maxS = sizes[sizes.length - 1] ?? Math.min(256, selectedSize.value)
    return `Multi-size ${minS}–${maxS}px`
  }
  if (selectedFormat.value === 'svg' && m?.kind === 'svg' && m.svgText)
    return 'Vector SVG'
  if (activeFormatMeta.value.lossy)
    return `${selectedQuality.value}% · ${selectedSize.value}px`
  return `${activeFormatMeta.value.label} · ${selectedSize.value}px`
})

const currentTimelineText = computed(() => {
  const m = media.value
  if (!m)
    return ''
  if (m.kind === 'gif' && m.gifFrames?.length)
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
  if (m.kind === 'gif' && m.gifFrames?.length) {
    const idx = clampNumber(gifFrameIndex.value, 0, m.gifFrames.length - 1)
    return m.gifFrames[idx]?.canvas ?? null
  }
  return m.image ?? null
}

function drawStageAndPreviews(): void {
  const m = media.value
  const canvas = stageCanvasRef.value
  if (!m || !canvas)
    return
  const drawable = currentDrawable()
  if (!drawable)
    return

  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1
  const pixelSize = Math.round(STAGE_SIZE * dpr)
  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize
    canvas.height = pixelSize
  }

  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const supportsAlpha = isAnimatedGifExport.value || activeFormatMeta.value.supportsAlpha
  renderDrawableToCanvas(
    ctx,
    drawable,
    m.naturalWidth,
    m.naturalHeight,
    pixelSize,
    transform,
    activeShape.value,
    { supportsAlpha, applyMaskClip: false },
  )

  if (activeShape.value !== 'square') {
    ctx.save()
    ctx.fillStyle = 'rgba(10, 12, 18, 0.44)'
    ctx.beginPath()
    ctx.rect(0, 0, pixelSize, pixelSize)
    traceMaskPath(ctx, activeShape.value, 0, 0, pixelSize, false)
    ctx.fill('evenodd')
    ctx.restore()
  }

  ctx.save()
  if (isInteracting.value) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)'
    ctx.lineWidth = Math.max(1, dpr)
    const third = pixelSize / 3
    ctx.beginPath()
    ctx.moveTo(third, 0)
    ctx.lineTo(third, pixelSize)
    ctx.moveTo(third * 2, 0)
    ctx.lineTo(third * 2, pixelSize)
    ctx.moveTo(0, third)
    ctx.lineTo(pixelSize, third)
    ctx.moveTo(0, third * 2)
    ctx.lineTo(pixelSize, third * 2)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)'
  ctx.lineWidth = Math.max(1.5, 1.5 * dpr)
  traceMaskPath(ctx, activeShape.value, dpr, dpr, pixelSize - dpr * 2)
  ctx.stroke()
  ctx.restore()

  const previewTargets: [HTMLCanvasElement | null, number][] = [
    [previewCanvasLgRef.value, PREVIEW_SIZES[0]],
    [previewCanvasSmRef.value, PREVIEW_SIZES[1]],
  ]
  for (const [target, cssSize] of previewTargets) {
    if (!target)
      continue
    const pSize = Math.round(cssSize * dpr)
    if (target.width !== pSize || target.height !== pSize) {
      target.width = pSize
      target.height = pSize
    }
    const pCtx = target.getContext('2d')
    if (!pCtx)
      continue
    renderDrawableToCanvas(
      pCtx,
      drawable,
      m.naturalWidth,
      m.naturalHeight,
      pSize,
      transform,
      activeShape.value,
      { supportsAlpha, applyMaskClip: true },
    )
  }
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

async function loadSource(source: File | Blob | string): Promise<void> {
  const token = ++loadToken
  scrubToken++
  cancelActiveExport()
  stopPlayback()
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
      return
    }

    disposeMedia()
    media.value = loaded
    resetTransformState()
    videoTime.value = 0
    gifFrameIndex.value = 0
    captureMode.value = 'frame'
    clipStart.value = 0
    clipEnd.value = Math.min(
      loaded.duration > 0 ? loaded.duration : 2,
      props.maxGifDuration,
    )

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
    drawStageAndPreviews()
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
  drawStageAndPreviews()
}

function toggleFlipX(): void {
  transform.flipX = !transform.flipX
  drawStageAndPreviews()
}

function toggleFlipY(): void {
  transform.flipY = !transform.flipY
  drawStageAndPreviews()
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
  drawStageAndPreviews()
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
  drawStageAndPreviews()
}

function resetAll(): void {
  resetTransformState()
  drawStageAndPreviews()
}

function selectCaptureMode(mode: AvatarCaptureMode): void {
  captureMode.value = mode
  if (mode === 'gif-clip' && availableFormats.value.includes('gif'))
    selectedFormat.value = 'gif'
  drawStageAndPreviews()
}

function selectFormat(format: AvatarOutputFormat): void {
  if (!availableFormats.value.includes(format) || !supportedFormats.value[format])
    return
  normalizeSelectedFormat(format)
  drawStageAndPreviews()
}

function scheduleGifNextFrame(): void {
  const m = media.value
  if (!isPlaying.value || !m || m.kind !== 'gif' || !m.gifFrames?.length)
    return
  const current = m.gifFrames[gifFrameIndex.value]
  const delay = Math.max(25, current?.delayMs ?? 100)
  gifTimerId = window.setTimeout(() => {
    if (!isPlaying.value || !media.value?.gifFrames?.length)
      return
    gifFrameIndex.value = (gifFrameIndex.value + 1) % media.value.gifFrames.length
    drawStageAndPreviews()
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
  drawStageAndPreviews()
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
  else if (m.kind === 'gif' && m.gifFrames && m.gifFrames.length > 1) {
    isPlaying.value = true
    scheduleGifNextFrame()
  }
}

async function scrubTo(value: number): Promise<void> {
  const m = media.value
  if (!m)
    return
  stopPlayback()
  if (m.kind === 'gif' && m.gifFrames?.length) {
    gifFrameIndex.value = Math.round(clampNumber(value, 0, m.gifFrames.length - 1))
    drawStageAndPreviews()
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
      drawStageAndPreviews()
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
  if (m.kind === 'gif' && m.gifFrames?.length) {
    const total = m.gifFrames.length
    gifFrameIndex.value = (gifFrameIndex.value + delta + total) % total
    drawStageAndPreviews()
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
  drawStageAndPreviews()
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
      drawStageAndPreviews()
    }
    return
  }

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const span = Math.max(1, rect.width || STAGE_SIZE)
  transform.offsetX = dragStartOffset.x + (e.clientX - dragStartPoint.x) / span
  transform.offsetY = dragStartOffset.y + (e.clientY - dragStartPoint.y) / span
  clampCurrentTransform()
  drawStageAndPreviews()
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
    drawStageAndPreviews()
  }
}

function onStageWheel(e: WheelEvent): void {
  if (!media.value)
    return
  e.preventDefault()
  const factor = Math.exp(-e.deltaY * 0.0018)
  transform.zoom = clampNumber(transform.zoom * factor, props.minZoom, props.maxZoom)
  clampCurrentTransform()
  drawStageAndPreviews()
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
      break
    case '-':
    case '_':
      e.preventDefault()
      transform.zoom = clampNumber(transform.zoom - 0.15, props.minZoom, props.maxZoom)
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
  drawStageAndPreviews()
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
  emit('update:open', false)
  emit('cancel')
}

watch(() => props.shape, (next) => {
  activeShape.value = next
  drawStageAndPreviews()
})

watch(() => props.outputFormat, (next) => {
  normalizeSelectedFormat(next)
  drawStageAndPreviews()
})

watch([() => props.allowedOutputFormats, () => props.allowFormatConversion], () => {
  normalizeSelectedFormat()
  drawStageAndPreviews()
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
      return
    }

    if (!wasOpen) {
      activeShape.value = props.shape
      selectedFormat.value = props.outputFormat
      selectedSize.value = props.outputSize
      selectedQuality.value = Math.round(clampNumber(props.outputQuality, 0.1, 1) * 100)
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
    transform.zoom,
    transform.offsetX,
    transform.offsetY,
    transform.rotation,
    transform.flipX,
    transform.flipY,
    transform.brightness,
    transform.contrast,
    transform.saturation,
    transform.background,
    transform.maskClip,
    activeShape.value,
  ],
  () => {
    if (media.value)
      drawStageAndPreviews()
  },
)

onMounted(() => {
  if (typeof window !== 'undefined')
    window.addEventListener('paste', handleWindowPaste)
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined')
    window.removeEventListener('paste', handleWindowPaste)
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
    :width="width"
    :close-label="labels.close"
    :surface="surface"
  >
    <div class="tx-avatar-editor">
      <div v-show="!media" class="tx-avatar-editor__upload-pane">
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
        <p class="tx-avatar-editor__formats-hint">
          {{ labels.uploadFormatsHint }}
        </p>
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
            <div class="tx-avatar-editor__source-badge">
              <span>{{ media.kind.toUpperCase() }}</span>
              <span>{{ media.naturalWidth }}×{{ media.naturalHeight }}</span>
              <span v-if="media.file">{{ formatByteSize(media.file.size) }}</span>
            </div>
          </div>

          <div class="tx-avatar-editor__toolbar">
            <button type="button" class="tx-avatar-editor__tool-btn" :title="labels.rotateLeft" :aria-label="labels.rotateLeft" @click="rotateBy(-90)">
              <AvatarEditorIcon name="rotateLeft" />
            </button>
            <button type="button" class="tx-avatar-editor__tool-btn" :title="labels.rotateRight" :aria-label="labels.rotateRight" @click="rotateBy(90)">
              <AvatarEditorIcon name="rotateRight" />
            </button>
            <button type="button" class="tx-avatar-editor__tool-btn" :class="{ 'is-active': transform.flipX }" :aria-pressed="transform.flipX" :title="labels.flipHorizontal" :aria-label="labels.flipHorizontal" @click="toggleFlipX">
              <AvatarEditorIcon name="flipH" />
            </button>
            <button type="button" class="tx-avatar-editor__tool-btn" :class="{ 'is-active': transform.flipY }" :aria-pressed="transform.flipY" :title="labels.flipVertical" :aria-label="labels.flipVertical" @click="toggleFlipY">
              <AvatarEditorIcon name="flipV" />
            </button>
            <span class="tx-avatar-editor__tool-sep" aria-hidden="true" />
            <button type="button" class="tx-avatar-editor__tool-btn" :title="labels.fitContain" :aria-label="labels.fitContain" @click="fitContain">
              <AvatarEditorIcon name="fitContain" />
            </button>
            <button type="button" class="tx-avatar-editor__tool-btn" :title="labels.fitCover" :aria-label="labels.fitCover" @click="fitCover">
              <AvatarEditorIcon name="fitCover" />
            </button>
            <button type="button" class="tx-avatar-editor__tool-btn" :title="labels.reset" :aria-label="labels.reset" @click="resetAll">
              <AvatarEditorIcon name="reset" />
            </button>
            <button
              type="button"
              class="tx-avatar-editor__tool-btn tx-avatar-editor__tool-btn--label"
              :disabled="exporting"
              @click="triggerReplaceFile"
            >
              <AvatarEditorIcon name="upload" :size="14" />
              <span>{{ labels.replaceFile }}</span>
            </button>
          </div>

          <AvatarEditorTimeline
            v-if="hasTimeline"
            :labels="labels"
            :is-gif="media.kind === 'gif' && Boolean(media.gifFrames)"
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
          @update:shape="activeShape = $event"
          @update-transform="Object.assign(transform, $event)"
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
          <button
            v-if="media && allowDownload"
            type="button"
            class="tx-avatar-editor__btn tx-avatar-editor__btn--ghost"
            :disabled="exporting || media.corsTainted || !hasUsableFormat"
            @click="runExport(true)"
          >
            <AvatarEditorIcon name="download" :size="14" />
            <span>{{ labels.download }}</span>
          </button>
          <span v-if="exporting" class="tx-avatar-editor__progress" role="status" aria-live="polite">
            {{ labels.exporting }} {{ exportProgress }}%
          </span>
          <span v-else-if="!media" class="tx-avatar-editor__paste-hint">
            {{ labels.pasteHint }}
          </span>
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
            type="button"
            class="tx-avatar-editor__btn tx-avatar-editor__btn--primary"
            :disabled="!media || loading || exporting || media.corsTainted || !hasUsableFormat"
            @click="runExport(false)"
          >
            {{ exporting ? `${labels.exporting} ${exportProgress}%` : labels.apply }}
          </button>
        </div>
      </div>
    </template>
  </TxModal>
</template>

<style lang="scss">
.tx-avatar-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
  color: var(--tx-text-color-primary, #303133);
}

.tx-avatar-editor__upload-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tx-avatar-editor__formats-hint,
.tx-avatar-editor__paste-hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__workspace {
  display: grid;
  grid-template-columns: minmax(260px, 312px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.tx-avatar-editor__stage-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);
  background-color: var(--tx-fill-color-light, #f5f7fa);
  background-image:
    linear-gradient(45deg, var(--tx-fill-color, #ebedf0) 25%, transparent 25%),
    linear-gradient(-45deg, var(--tx-fill-color, #ebedf0) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--tx-fill-color, #ebedf0) 75%),
    linear-gradient(-45deg, transparent 75%, var(--tx-fill-color, #ebedf0) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;

  &.is-grabbing {
    cursor: grabbing;
  }

  &.is-drag-over {
    box-shadow: inset 0 0 0 2px var(--tx-color-primary, #409eff);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
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
  font-size: 13px;
  font-weight: 500;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 78%, transparent);
}

.tx-avatar-editor__source-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  color: var(--tx-text-color-primary, #303133);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #ffffff) 82%, transparent);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);
}

.tx-avatar-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
}

.tx-avatar-editor__tool-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  min-width: 28px;
  padding: 0 6px;
  border: none;
  border-radius: 8px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);

  &:hover {
    background: var(--tx-fill-color, #ebedf0);
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    color: var(--tx-color-primary, #409eff);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 42%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }
}

.tx-avatar-editor__tool-btn--label {
  margin-left: auto;
  padding: 0 8px;
  font-weight: 500;
}

.tx-avatar-editor__tool-sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--tx-border-color-lighter, #e4e7ed);
}

.tx-avatar-editor__section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__range {
  accent-color: var(--tx-color-primary, #409eff);
  cursor: pointer;
  height: 18px;
  margin: 0;
}

.tx-avatar-editor__range--grow {
  flex: 1;
  min-width: 0;
}

.tx-avatar-editor__readout {
  flex-shrink: 0;
  min-width: 44px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__segmented {
  display: inline-flex;
  padding: 2px;
  border-radius: 9px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);
}

.tx-avatar-editor__seg-btn {
  appearance: none;
  padding: 4px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-active {
    background: var(--tx-bg-color, #ffffff);
    color: var(--tx-text-color-primary, #303133);
    font-weight: 500;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--tx-color-black, #000000) 8%, transparent);
  }
}

.tx-avatar-editor__pill {
  appearance: none;
  padding: 4px 9px;
  border: none;
  border-radius: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  color: var(--tx-text-color-regular, #606266);
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-extra-light, #ebeef5);

  &:hover:not(:disabled) {
    background: var(--tx-fill-color, #ebedf0);
    color: var(--tx-text-color-primary, #303133);
  }

  &.is-active {
    background: var(--tx-color-primary-light-9, #ecf5ff);
    color: var(--tx-color-primary, #409eff);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 48%, transparent);
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 1px;
  }
}

.tx-avatar-editor__pills {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tx-avatar-editor__notice {
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 55%, var(--tx-text-color-primary, #303133));
  background: var(--tx-color-warning-light-9, #fdf6ec);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-warning, #e6a23c) 32%, transparent);
}

.tx-avatar-editor__error {
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
  background: var(--tx-color-danger-light-9, #fef0f0);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-danger, #f56c6c) 28%, transparent);
}

.tx-avatar-editor__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.tx-avatar-editor__footer-left,
.tx-avatar-editor__footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-avatar-editor__progress {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary, #6b7280);
}

.tx-avatar-editor__btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 9px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }
}

.tx-avatar-editor__btn--primary {
  background: var(--tx-color-primary, #409eff);
  color: var(--tx-color-on-primary, #ffffff);

  &:hover:not(:disabled) {
    background: var(--tx-color-primary-light-3, #66b1ff);
  }
}

.tx-avatar-editor__btn--secondary {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);

  &:hover:not(:disabled) {
    background: var(--tx-fill-color, #ebedf0);
  }
}

.tx-avatar-editor__btn--ghost {
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #e4e7ed);

  &:hover:not(:disabled) {
    background: var(--tx-fill-color-light, #f5f7fa);
    color: var(--tx-text-color-primary, #303133);
  }
}

.tx-avatar-editor__svg {
  display: block;
  flex-shrink: 0;
}

@media (max-width: 680px) {
  .tx-avatar-editor__workspace {
    grid-template-columns: 1fr;
  }

  .tx-avatar-editor__stage-wrap {
    max-width: 312px;
    margin: 0 auto;
  }

  .tx-avatar-editor__footer {
    flex-wrap: wrap;
  }
}
</style>
