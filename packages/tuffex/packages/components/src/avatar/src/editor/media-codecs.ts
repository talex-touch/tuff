import type { AvatarShape } from '../types'
import type { LoadedAvatarMedia } from './media-loader'
import type {
  AvatarCaptureMode,
  AvatarEditorCustomConverter,
  AvatarEditorTransform,
  AvatarEditResult,
  AvatarGifClipOptions,
  AvatarOutputFormat,
} from './types'
import { encodeBmp } from './bmp-encoder'
import { buildCanvasFilter, computeTransformMetrics, traceMaskPath } from './geometry'
import { encodeGif } from './gif-codec'
import { encodeIco, resolveIcoSizes } from './ico-codec'
import { readBlobArrayBuffer, seekVideoElement } from './media-loader'
import { buildRasterAvatarSvg, buildVectorAvatarSvg, parseAndSanitizeSvg } from './svg-codec'
import { AVATAR_FORMAT_META, AVATAR_OUTPUT_FORMATS, DEFAULT_ICO_SIZES } from './types'

export interface ExportAvatarMediaOptions {
  format: AvatarOutputFormat
  outputSize: number
  quality: number
  shape: AvatarShape
  transform: AvatarEditorTransform
  captureMode?: AvatarCaptureMode
  /** Active GIF frame index when source is GIF and captureMode is `'frame'`. */
  gifFrameIndex?: number
  /** Active video timestamp in seconds when source is video and captureMode is `'frame'`. */
  videoTimeSec?: number
  /** Clip range & FPS when captureMode is `'gif-clip'`. */
  gifClip?: AvatarGifClipOptions
  maxGifFrames?: number
  icoSizes?: readonly number[]
  fileName?: string
  customConverter?: AvatarEditorCustomConverter
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

const ACCEPTED_FORMAT_MIMES: Record<AvatarOutputFormat, readonly string[]> = {
  png: ['image/png'],
  jpeg: ['image/jpeg', 'image/jpg'],
  webp: ['image/webp'],
  avif: ['image/avif'],
  ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
  svg: ['image/svg+xml'],
  gif: ['image/gif'],
  bmp: ['image/bmp', 'image/x-ms-bmp'],
}

export function isBlobMimeMatchingFormat(blobType: string, format: AvatarOutputFormat): boolean {
  const baseMime = (blobType || '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (!baseMime)
    return false
  return ACCEPTED_FORMAT_MIMES[format].includes(baseMime)
}

export interface TimedGifSlice {
  index: number
  delayMs: number
}

/**
 * Selects GIF frames whose display intervals `[t, t + delay)` overlap `[startMs, endMs]`,
 * trims each frame's delay to the overlapping duration, and sums represented delays when
 * reducing frame count to `maxFrames`.
 */
export function selectOverlappingGifFrames(
  frames: readonly { timestampSec: number, delayMs: number }[],
  startMs: number,
  endMs: number,
  maxFrames: number,
): TimedGifSlice[] {
  if (!frames.length)
    return []

  const safeStart = Math.max(0, startMs)
  const safeEnd = Math.max(safeStart + 20, endMs)
  const overlapping: TimedGifSlice[] = []

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!
    const fStart = Math.max(0, f.timestampSec * 1000)
    const fEnd = fStart + Math.max(20, f.delayMs)
    const overlap = Math.min(fEnd, safeEnd) - Math.max(fStart, safeStart)
    if (overlap > 0) {
      overlapping.push({
        index: i,
        delayMs: Math.max(20, Math.round(overlap)),
      })
    }
  }

  if (!overlapping.length) {
    // Pick the nearest frame to safeStart so trimming past the end still produces a valid frame.
    let nearestIdx = 0
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!
      const fStart = f.timestampSec * 1000
      const fEnd = fStart + Math.max(20, f.delayMs)
      const dist = safeStart < fStart ? fStart - safeStart : safeStart > fEnd ? safeStart - fEnd : 0
      if (dist < bestDist) {
        bestDist = dist
        nearestIdx = i
      }
    }
    return [{ index: nearestIdx, delayMs: Math.max(20, Math.round(frames[nearestIdx]!.delayMs)) }]
  }

  const cap = Math.max(1, maxFrames)
  if (overlapping.length <= cap)
    return overlapping

  const reduced: TimedGifSlice[] = []
  for (let k = 0; k < cap; k++) {
    const bucketStart = Math.floor((k * overlapping.length) / cap)
    const bucketEnd = Math.floor(((k + 1) * overlapping.length) / cap)
    let summedDelay = 0
    for (let j = bucketStart; j < bucketEnd; j++)
      summedDelay += overlapping[j]!.delayMs
    reduced.push({
      index: overlapping[bucketStart]!.index,
      delayMs: Math.max(20, Math.round(summedDelay)),
    })
  }
  return reduced
}

/**
 * Computes sample timestamps and per-frame delays for a video GIF clip while preserving
 * the selected span duration even when `frameCount` is capped by `maxFrames`.
 */
export function computeVideoGifClipSchedule(
  startSec: number,
  endSec: number,
  fps: number,
  maxFrames: number,
): { timestamps: number[], delaysMs: number[] } {
  const safeSpan = Math.max(0.1, endSec - startSec)
  const safeFps = Math.max(4, Math.min(20, Math.round(fps || 10)))
  const rawCount = Math.max(2, Math.round(safeSpan * safeFps))
  const frameCount = Math.max(2, Math.min(Math.max(2, maxFrames), rawCount))
  const totalMs = Math.max(frameCount * 20, Math.round(safeSpan * 1000))

  const timestamps: number[] = []
  const delaysMs: number[] = []
  for (let i = 0; i < frameCount; i++) {
    const t = frameCount === 1 ? startSec : startSec + (safeSpan * i) / (frameCount - 1)
    const slotStart = Math.round((i * totalMs) / frameCount)
    const slotEnd = Math.round(((i + 1) * totalMs) / frameCount)
    timestamps.push(t)
    delaysMs.push(Math.max(20, slotEnd - slotStart))
  }
  return { timestamps, delaysMs }
}

let cachedFormatSupport: Record<AvatarOutputFormat, boolean> | null = null

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(blob => resolve(blob), mimeType, quality)
      return
    }
    try {
      const dataUrl = canvas.toDataURL(mimeType, quality)
      const [header, b64] = dataUrl.split(',')
      if (!header || !b64) {
        resolve(null)
        return
      }
      const actualMime = header.match(/data:([^;]+)/)?.[1] ?? mimeType
      const bin = atob(b64)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++)
        arr[i] = bin.charCodeAt(i)
      resolve(new Blob([arr], { type: actualMime }))
    }
    catch {
      resolve(null)
    }
  })
}

async function probeCanvasFormat(mimeType: string): Promise<boolean> {
  if (typeof document === 'undefined')
    return false
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 2, 2)
    const blob = await canvasToBlob(canvas, mimeType, 0.8)
    return Boolean(blob && blob.type.toLowerCase() === mimeType.toLowerCase())
  }
  catch {
    return false
  }
}

/**
 * Probes which output formats the current browser runtime can encode client-side.
 * `ico`, `svg`, `gif`, and `bmp` use built-in pure TypeScript encoders and are always available.
 */
export async function detectSupportedAvatarFormats(): Promise<Record<AvatarOutputFormat, boolean>> {
  if (cachedFormatSupport)
    return { ...cachedFormatSupport }

  const [webp, avif] = await Promise.all([
    probeCanvasFormat('image/webp'),
    probeCanvasFormat('image/avif'),
  ])

  const result: Record<AvatarOutputFormat, boolean> = {
    png: true,
    jpeg: true,
    webp,
    avif,
    ico: true,
    svg: true,
    gif: true,
    bmp: true,
  }
  cachedFormatSupport = result
  return { ...result }
}

export function resetSupportedAvatarFormatsCache(): void {
  cachedFormatSupport = null
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

export function buildOutputFileName(
  sourceName: string,
  format: AvatarOutputFormat,
  explicitBaseName?: string,
): string {
  const meta = AVATAR_FORMAT_META[format]
  const rawBase = (explicitBaseName || sourceName || 'avatar').trim()
  const stem = rawBase.replace(/\.[^.]+$/, '') || 'avatar'
  const cleanStem = stem.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 64) || 'avatar'
  return `${cleanStem}.${meta.extension}`
}

export function renderDrawableToCanvas(
  ctx: CanvasRenderingContext2D,
  drawable: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  outSize: number,
  transform: AvatarEditorTransform,
  shape: AvatarShape,
  options: { supportsAlpha: boolean, applyMaskClip?: boolean } = { supportsAlpha: true },
): void {
  const safeSize = Math.max(1, Math.round(outSize))
  ctx.save()
  ctx.clearRect(0, 0, safeSize, safeSize)

  const clipActive = options.applyMaskClip !== false && transform.maskClip && options.supportsAlpha && shape !== 'square'
  if (clipActive) {
    traceMaskPath(ctx, shape, 0, 0, safeSize)
    ctx.clip()
  }

  const wantsBackground = transform.background && transform.background !== 'transparent'
  if (wantsBackground) {
    ctx.fillStyle = transform.background
    ctx.fillRect(0, 0, safeSize, safeSize)
  }
  else if (!options.supportsAlpha) {
    // Non-alpha formats (JPEG / BMP) need a deterministic matte so transparent pixels never turn black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, safeSize, safeSize)
  }

  const metrics = computeTransformMetrics(
    { width: naturalWidth, height: naturalHeight },
    transform,
    safeSize,
  )

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const filter = buildCanvasFilter(transform)
  if ('filter' in ctx)
    ctx.filter = filter

  ctx.translate(metrics.centerX, metrics.centerY)
  if (metrics.radians !== 0)
    ctx.rotate(metrics.radians)
  ctx.scale(
    (transform.flipX ? -1 : 1) * metrics.drawScale,
    (transform.flipY ? -1 : 1) * metrics.drawScale,
  )
  ctx.drawImage(drawable, -naturalWidth / 2, -naturalHeight / 2, naturalWidth, naturalHeight)
  ctx.restore()
}

function resolveCurrentDrawable(
  media: LoadedAvatarMedia,
  gifFrameIndex = 0,
): CanvasImageSource {
  if (media.kind === 'video' && media.video)
    return media.video
  if (media.gifFrames?.length) {
    const idx = Math.max(0, Math.min(media.gifFrames.length - 1, gifFrameIndex))
    return media.gifFrames[idx]!.canvas
  }
  if (media.image)
    return media.image
  throw new Error('No drawable media source loaded')
}

function yieldToMainThread(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException('Export aborted', 'AbortError')
}

/**
 * Exports the loaded media with full transform, mask, frame/clip extraction,
 * and client-side format conversion into an `AvatarEditResult`.
 */
export async function exportAvatarMedia(
  media: LoadedAvatarMedia,
  options: ExportAvatarMediaOptions,
): Promise<AvatarEditResult> {
  checkAborted(options.signal)

  const format: AvatarOutputFormat = AVATAR_OUTPUT_FORMATS.includes(options.format)
    ? options.format
    : 'png'
  const meta = AVATAR_FORMAT_META[format]
  const outSize = Math.max(16, Math.min(2048, Math.round(options.outputSize || 512)))
  const quality = Math.max(0.1, Math.min(1, options.quality || 0.92))
  const captureMode = options.captureMode ?? 'frame'

  // Animated GIF clip extraction (from animated GIF or MP4/WebM/MOV video)
  if (format === 'gif' && captureMode === 'gif-clip' && media.animated) {
    const clip = options.gifClip ?? {
      startTime: 0,
      endTime: Math.min(media.duration || 2, 3),
      fps: 10,
      size: Math.min(outSize, 256),
    }
    const gifSize = Math.max(32, Math.min(512, Math.round(clip.size || Math.min(outSize, 256))))
    const maxFrames = Math.max(2, Math.min(120, options.maxGifFrames ?? 60))
    const canvas = document.createElement('canvas')
    canvas.width = gifSize
    canvas.height = gifSize
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx)
      throw new Error('Canvas 2D context unavailable')

    const frames: { rgba: Uint8ClampedArray, width: number, height: number, delayMs: number }[] = []

    if (media.gifFrames?.length) {
      const startMs = Math.max(0, clip.startTime * 1000)
      const endMs = Math.max(startMs + 50, clip.endTime * 1000)
      const slices = selectOverlappingGifFrames(media.gifFrames, startMs, endMs, maxFrames)

      for (let idx = 0; idx < slices.length; idx++) {
        checkAborted(options.signal)
        const slice = slices[idx]!
        const f = media.gifFrames[slice.index]!
        renderDrawableToCanvas(
          ctx,
          f.canvas,
          media.naturalWidth,
          media.naturalHeight,
          gifSize,
          options.transform,
          options.shape,
          { supportsAlpha: true },
        )
        const imgData = ctx.getImageData(0, 0, gifSize, gifSize)
        frames.push({
          rgba: new Uint8ClampedArray(imgData.data),
          width: gifSize,
          height: gifSize,
          delayMs: slice.delayMs,
        })
        options.onProgress?.(Math.round(((idx + 1) / slices.length) * 75))
        if (idx % 4 === 3)
          await yieldToMainThread()
      }
    }
    else if (media.kind === 'video' && media.video) {
      const video = media.video
      const wasPaused = video.paused
      const previousTime = video.currentTime
      video.pause()

      const start = Math.max(0, Math.min(media.duration, clip.startTime))
      const end = Math.max(start + 0.1, Math.min(media.duration || start + 1, clip.endTime))
      const { timestamps, delaysMs } = computeVideoGifClipSchedule(start, end, clip.fps, maxFrames)
      const frameCount = timestamps.length

      try {
        for (let i = 0; i < frameCount; i++) {
          checkAborted(options.signal)
          await seekVideoElement(video, timestamps[i]!)
          renderDrawableToCanvas(
            ctx,
            video,
            media.naturalWidth,
            media.naturalHeight,
            gifSize,
            options.transform,
            options.shape,
            { supportsAlpha: true },
          )
          const imgData = ctx.getImageData(0, 0, gifSize, gifSize)
          frames.push({
            rgba: new Uint8ClampedArray(imgData.data),
            width: gifSize,
            height: gifSize,
            delayMs: delaysMs[i]!,
          })
          options.onProgress?.(Math.round(((i + 1) / frameCount) * 75))
          await yieldToMainThread()
        }
      }
      finally {
        await seekVideoElement(video, previousTime).catch(() => {})
        if (!wasPaused)
          video.play().catch(() => {})
      }
    }

    checkAborted(options.signal)
    const gifBytes = encodeGif(frames, { width: gifSize, height: gifSize, loop: 0 })
    options.onProgress?.(100)
    const blob = new Blob([gifBytes], { type: meta.mimeType })
    const fileName = buildOutputFileName(media.sourceName, 'gif', options.fileName)
    const file = new File([blob], fileName, { type: meta.mimeType })
    const dataUrl = await blobToDataUrl(blob)

    return {
      file,
      blob,
      url: dataUrl,
      dataUrl,
      format: 'gif',
      mimeType: meta.mimeType,
      width: gifSize,
      height: gifSize,
      size: blob.size,
      animated: frames.length > 1,
      frameCount: frames.length,
      frameTime: clip.startTime,
      sourceKind: media.kind,
      originalFile: media.file,
      shape: options.shape,
      transform: { ...options.transform },
    }
  }

  // Still-frame / single-image export
  if (media.kind === 'video' && media.video && typeof options.videoTimeSec === 'number')
    await seekVideoElement(media.video, options.videoTimeSec)

  const drawable = resolveCurrentDrawable(media, options.gifFrameIndex ?? 0)
  const canvas = document.createElement('canvas')
  canvas.width = outSize
  canvas.height = outSize
  const ctx = canvas.getContext('2d', { willReadFrequently: format === 'gif' || format === 'bmp' })
  if (!ctx)
    throw new Error('Canvas 2D context unavailable')

  // Pure SVG -> SVG vector preservation path (does not require rasterizing!)
  if (format === 'svg' && media.kind === 'svg' && media.svgText) {
    const parsed = parseAndSanitizeSvg(media.svgText)
    if (parsed && parsed.preservesRootStyling !== false) {
      const svgMarkup = buildVectorAvatarSvg(parsed, options.transform, options.shape, outSize)
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
      const fileName = buildOutputFileName(media.sourceName, 'svg', options.fileName)
      const file = new File([blob], fileName, { type: meta.mimeType })
      const dataUrl = await blobToDataUrl(blob)
      options.onProgress?.(100)
      return {
        file,
        blob,
        url: dataUrl,
        dataUrl,
        format: 'svg',
        mimeType: meta.mimeType,
        width: outSize,
        height: outSize,
        size: blob.size,
        animated: false,
        sourceKind: media.kind,
        originalFile: media.file,
        shape: options.shape,
        transform: { ...options.transform },
      }
    }
  }

  renderDrawableToCanvas(
    ctx,
    drawable,
    media.naturalWidth,
    media.naturalHeight,
    outSize,
    options.transform,
    options.shape,
    { supportsAlpha: meta.supportsAlpha },
  )

  options.onProgress?.(40)
  checkAborted(options.signal)

  let blob: Blob | null = null
  let finalWidth = outSize
  let finalHeight = outSize

  if (options.customConverter) {
    const custom = await options.customConverter({
      canvas,
      format,
      quality,
      size: outSize,
      shape: options.shape,
      transform: { ...options.transform },
      sourceKind: media.kind,
      originalFile: media.file,
      svgSource: media.svgText,
    })
    if (custom) {
      if (!isBlobMimeMatchingFormat(custom.type, format)) {
        throw new Error(
          `Custom converter returned "${custom.type || 'unknown'}" instead of expected "${meta.mimeType}"`,
        )
      }
      blob = custom
    }
  }

  if (!blob) {
    if (format === 'ico') {
      const icoSizes = resolveIcoSizes(outSize, options.icoSizes ?? DEFAULT_ICO_SIZES)
      const entries: { width: number, height: number, pngBytes: Uint8Array }[] = []
      for (const dim of icoSizes) {
        const c = document.createElement('canvas')
        c.width = dim
        c.height = dim
        const cCtx = c.getContext('2d')
        if (!cCtx)
          continue
        renderDrawableToCanvas(
          cCtx,
          drawable,
          media.naturalWidth,
          media.naturalHeight,
          dim,
          options.transform,
          options.shape,
          { supportsAlpha: true },
        )
        const pngBlob = await canvasToBlob(c, 'image/png')
        if (pngBlob) {
          entries.push({
            width: dim,
            height: dim,
            pngBytes: new Uint8Array(await readBlobArrayBuffer(pngBlob)),
          })
        }
      }
      blob = encodeIco(entries)
      const maxDim = icoSizes[icoSizes.length - 1] ?? Math.min(outSize, 256)
      finalWidth = maxDim
      finalHeight = maxDim
    }
    else if (format === 'svg') {
      const pngBlob = await canvasToBlob(canvas, 'image/png')
      if (!pngBlob)
        throw new Error('Failed to rasterize SVG frame')
      const pngDataUrl = await blobToDataUrl(pngBlob)
      const svgMarkup = buildRasterAvatarSvg(
        pngDataUrl,
        options.shape,
        options.transform.maskClip,
        outSize,
        options.transform.background,
      )
      blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    }
    else if (format === 'bmp') {
      const imgData = ctx.getImageData(0, 0, outSize, outSize)
      blob = encodeBmp(imgData.data, outSize, outSize, { alpha: false })
    }
    else if (format === 'gif') {
      const imgData = ctx.getImageData(0, 0, outSize, outSize)
      const gifBytes = encodeGif(
        [{ rgba: new Uint8ClampedArray(imgData.data), width: outSize, height: outSize, delayMs: 100 }],
        { width: outSize, height: outSize, loop: 0 },
      )
      blob = new Blob([gifBytes], { type: 'image/gif' })
    }
    else {
      blob = await canvasToBlob(canvas, meta.mimeType, meta.lossy ? quality : undefined)
      if (!blob || (format !== 'png' && blob.type.toLowerCase() !== meta.mimeType.toLowerCase())) {
        // Graceful fallback if the browser silently returned image/png for unsupported avif/webp
        throw new Error(`Browser does not support encoding ${meta.label}`)
      }
    }
  }

  options.onProgress?.(90)
  const fileName = buildOutputFileName(media.sourceName, format, options.fileName)
  const file = new File([blob], fileName, { type: meta.mimeType })
  const dataUrl = await blobToDataUrl(blob)
  options.onProgress?.(100)

  const frameTime = media.kind === 'video'
    ? (options.videoTimeSec ?? media.video?.currentTime ?? 0)
    : (media.gifFrames?.length ? media.gifFrames[options.gifFrameIndex ?? 0]?.timestampSec : undefined)

  return {
    file,
    blob,
    url: dataUrl,
    dataUrl,
    format,
    mimeType: meta.mimeType,
    width: finalWidth,
    height: finalHeight,
    size: blob.size,
    animated: false,
    frameCount: 1,
    frameTime,
    sourceKind: media.kind,
    originalFile: media.file,
    shape: options.shape,
    transform: { ...options.transform },
  }
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0)
    return '0 B'
  if (bytes < 1024)
    return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024)
    return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    return '00:00.0'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const tenths = Math.floor((seconds % 1) * 10)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`
}

export function triggerAvatarDownload(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined')
    return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
