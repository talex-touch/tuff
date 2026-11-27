import type { GifFrame } from './gif-codec'
import type { AvatarSourceKind } from './types'
import { decodeGif, DEFAULT_MAX_GIF_DECODED_BYTES, MAX_GIF_DIMENSION } from './gif-codec'
import { extractBestIcoEntry } from './ico-codec'

export interface LoadAvatarMediaOptions {
  /** Allow loading remote http(s) URL strings directly into `<img>` / `<video>`. @default false */
  allowRemoteSource?: boolean
  /** Maximum frames decoded from animated GIF inputs. @default 180 */
  maxGifFrames?: number
  /** Cumulative RGBA byte budget across retained GIF frames. @default 134217728 (128 MiB) */
  maxGifDecodedBytes?: number
}

export interface LoadedGifFrame {
  canvas: HTMLCanvasElement
  delayMs: number
  timestampSec: number
}

export interface LoadedAvatarMedia {
  kind: AvatarSourceKind
  naturalWidth: number
  naturalHeight: number
  file: File | null
  sourceName: string
  /** Underlying image element for static images, SVG, and ICO. */
  image?: HTMLImageElement
  /** Sanitized / raw SVG string for pure vector export. */
  svgText?: string
  /** Decoded frames for GIF sources (allows scrubbing + animated GIF trimming). */
  gifFrames?: LoadedGifFrame[]
  /** Video element for MP4/WebM/MOV/OGG sources. */
  video?: HTMLVideoElement
  /** Total duration in seconds for video and animated GIF sources. */
  duration: number
  /** True when the media has multiple playable frames. */
  animated: boolean
  /** True when a GIF exceeded the decoded frame cap and was truncated to the leading frames. */
  truncated?: boolean
  /** Total source frame count when a GIF was truncated (or all frames when known). */
  totalFrameCount?: number
  /** Frame cap applied when decoding a GIF source. */
  maxFrameCount?: number
  /** True when a remote URL fell back to non-CORS loading and cannot be read back from canvas. */
  corsTainted: boolean
  /** Revokes any object URLs and detaches video elements owned by this loaded source. */
  dispose: () => void
}

const VIDEO_EXT_RE = /\.(?:mp4|webm|mov|m4v|ogv|ogg)(?:[?#]|$)/i
const GIF_EXT_RE = /\.gif(?:[?#]|$)/i
const SVG_EXT_RE = /\.svg(?:[?#]|$)/i
const ICO_EXT_RE = /\.(?:ico|cur)(?:[?#]|$)/i
const LOCAL_MEDIA_URL_RE = /^(?:blob|data|tfile|file):/i
const REMOTE_HTTP_URL_RE = /^https?:\/\//i
const RELATIVE_PATH_URL_RE = /^\/(?!\/)/

const IMAGE_FTYP_BRANDS = new Set([
  'avif',
  'avis',
  'mif1',
  'msf1',
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
])

const VIDEO_FTYP_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'm4v ',
  'qt  ',
  'avc1',
  'mp71',
  'dash',
  '3gp4',
  '3gp5',
  '3gp6',
  '3g2a',
  'f4v ',
  'mmp4',
])

export const DEFAULT_MAX_GIF_LOAD_FRAMES = 180

export function isLocalAvatarSourceUrl(url: string): boolean {
  return LOCAL_MEDIA_URL_RE.test(url.trim())
}

function validateAvatarSourceUrl(rawUrl: string, allowRemoteSource: boolean): { url: string, isRemote: boolean } {
  const url = rawUrl.trim()
  if (!url)
    throw new Error('Empty media source URL')
  if (LOCAL_MEDIA_URL_RE.test(url))
    return { url, isRemote: false }
  const isHttp = REMOTE_HTTP_URL_RE.test(url)
  const isRelative = RELATIVE_PATH_URL_RE.test(url)
  if (isHttp || isRelative) {
    if (!allowRemoteSource)
      throw new Error('Remote URL sources are disabled unless allowRemoteSource is enabled')
    return { url, isRemote: isHttp }
  }
  throw new Error('Unsupported media source URL scheme')
}

export function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function')
    return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob buffer'))
    reader.readAsArrayBuffer(blob)
  })
}

export function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function')
    return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob text'))
    reader.readAsText(blob)
  })
}

export function detectAvatarSourceKind(source: File | Blob | string): AvatarSourceKind {
  if (typeof source === 'string') {
    const lower = source.trim().toLowerCase()
    if (lower.startsWith('data:video/') || VIDEO_EXT_RE.test(lower))
      return 'video'
    if (lower.startsWith('data:image/gif') || GIF_EXT_RE.test(lower))
      return 'gif'
    if (lower.startsWith('data:image/svg+xml') || SVG_EXT_RE.test(lower))
      return 'svg'
    if (lower.startsWith('data:image/x-icon') || lower.startsWith('data:image/vnd.microsoft.icon') || ICO_EXT_RE.test(lower))
      return 'ico'
    return 'image'
  }

  const mime = (source.type || '').toLowerCase()
  const name = source instanceof File ? source.name.toLowerCase() : ''

  if (mime.startsWith('video/') || VIDEO_EXT_RE.test(name))
    return 'video'
  if (mime === 'image/gif' || GIF_EXT_RE.test(name))
    return 'gif'
  if (mime === 'image/svg+xml' || SVG_EXT_RE.test(name))
    return 'svg'
  if (mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon' || ICO_EXT_RE.test(name))
    return 'ico'
  return 'image'
}

export function sniffAvatarKindFromBytes(bytes: Uint8Array, fallback: AvatarSourceKind): AvatarSourceKind {
  if (bytes.length >= 6) {
    const head6 = String.fromCharCode(...bytes.subarray(0, 6))
    if (head6 === 'GIF87a' || head6 === 'GIF89a')
      return 'gif'
  }
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) {
    return 'ico'
  }
  if (bytes.length >= 12) {
    const ftyp = String.fromCharCode(...bytes.subarray(4, 8))
    if (ftyp === 'ftyp') {
      const majorBrand = String.fromCharCode(...bytes.subarray(8, 12)).toLowerCase()
      if (IMAGE_FTYP_BRANDS.has(majorBrand))
        return 'image'
      if (VIDEO_FTYP_BRANDS.has(majorBrand))
        return 'video'

      const rawBoxSize = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0
      const boxEnd = rawBoxSize >= 16 ? Math.min(bytes.length, rawBoxSize) : bytes.length
      let sawVideoBrand = false
      for (let off = 16; off + 4 <= boxEnd; off += 4) {
        const brand = String.fromCharCode(...bytes.subarray(off, off + 4)).toLowerCase()
        if (IMAGE_FTYP_BRANDS.has(brand))
          return 'image'
        if (VIDEO_FTYP_BRANDS.has(brand))
          sawVideoBrand = true
      }
      if (sawVideoBrand)
        return 'video'
      return fallback
    }
    // EBML header for WebM/MKV
    if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3)
      return 'video'
  }
  if (bytes.length >= 4) {
    const sample = new TextDecoder().decode(bytes.subarray(0, Math.min(256, bytes.length))).trimStart()
    if (sample.startsWith('<svg') || (sample.startsWith('<?xml') && sample.includes('<svg')))
      return 'svg'
  }
  return fallback
}

function loadImageElement(url: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin)
      img.crossOrigin = crossOrigin
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = url
  })
}

async function loadImageWithCorsFallback(
  url: string,
  isRemote: boolean,
): Promise<{ image: HTMLImageElement, corsTainted: boolean }> {
  if (!isRemote) {
    const image = await loadImageElement(url)
    return { image, corsTainted: false }
  }
  try {
    const image = await loadImageElement(url, 'anonymous')
    return { image, corsTainted: false }
  }
  catch {
    const image = await loadImageElement(url)
    return { image, corsTainted: true }
  }
}

function gifFramesToCanvases(frames: readonly GifFrame[]): LoadedGifFrame[] {
  const result: LoadedGifFrame[] = []
  let elapsedMs = 0
  for (const frame of frames) {
    const canvas = document.createElement('canvas')
    canvas.width = frame.width
    canvas.height = frame.height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const imageData = new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height)
      ctx.putImageData(imageData, 0, 0)
    }
    result.push({
      canvas,
      delayMs: frame.delayMs,
      timestampSec: elapsedMs / 1000,
    })
    elapsedMs += frame.delayMs
  }
  return result
}

class GifPixelBudgetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GifPixelBudgetError'
  }
}

async function decodeGifFramesInBrowser(
  bytes: Uint8Array,
  maxFrames = DEFAULT_MAX_GIF_LOAD_FRAMES,
  maxDecodedBytes = DEFAULT_MAX_GIF_DECODED_BYTES,
): Promise<{
  width: number
  height: number
  frames: LoadedGifFrame[]
  duration: number
  truncated: boolean
  totalFrameCount: number
  maxFrameCount: number
}> {
  const ImageDecoderCtor = (globalThis as Record<string, any>).ImageDecoder
  if (typeof ImageDecoderCtor === 'function') {
    let decoder: any = null
    try {
      const supported = await ImageDecoderCtor.isTypeSupported?.('image/gif')
      if (supported) {
        decoder = new ImageDecoderCtor({
          data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          type: 'image/gif',
        })
        await decoder.tracks.ready
        const track = decoder.tracks.selectedTrack
        const totalFrameCount = Math.max(1, track?.frameCount ?? 1)
        const count = Math.min(maxFrames, totalFrameCount)
        const truncated = totalFrameCount > maxFrames
        const frames: LoadedGifFrame[] = []
        let targetWidth = 0
        let targetHeight = 0
        let cumulativeBytes = 0
        let elapsedMs = 0

        for (let i = 0; i < count; i++) {
          const decoded = await decoder.decode({ frameIndex: i })
          const videoFrame = decoded.image
          try {
            const rawWidth = videoFrame.displayWidth || videoFrame.codedWidth
            const rawHeight = videoFrame.displayHeight || videoFrame.codedHeight
            if (targetWidth === 0 || targetHeight === 0) {
              if (
                rawWidth <= 0
                || rawHeight <= 0
                || rawWidth > MAX_GIF_DIMENSION
                || rawHeight > MAX_GIF_DIMENSION
              ) {
                throw new GifPixelBudgetError(`GIF dimensions (${rawWidth}x${rawHeight}) exceed editor limit`)
              }
              const projectedBytes = rawWidth * rawHeight * 4 * count
              if (projectedBytes > maxDecodedBytes) {
                const scale = Math.sqrt(maxDecodedBytes / projectedBytes)
                targetWidth = Math.floor(rawWidth * scale)
                targetHeight = Math.floor(rawHeight * scale)
                if (
                  targetWidth < 16
                  || targetHeight < 16
                  || targetWidth * targetHeight * 4 * count > maxDecodedBytes
                ) {
                  throw new GifPixelBudgetError('GIF exceeds maximum decoded pixel budget')
                }
              }
              else {
                targetWidth = rawWidth
                targetHeight = rawHeight
              }
            }

            const frameBytes = targetWidth * targetHeight * 4
            if (cumulativeBytes + frameBytes > maxDecodedBytes)
              throw new GifPixelBudgetError('GIF exceeds maximum decoded pixel budget')

            const canvas = document.createElement('canvas')
            canvas.width = targetWidth
            canvas.height = targetHeight
            const ctx = canvas.getContext('2d')
            ctx?.drawImage(videoFrame, 0, 0, targetWidth, targetHeight)
            const rawUs = typeof videoFrame.duration === 'number' && videoFrame.duration > 0
              ? videoFrame.duration
              : 100_000
            const delayMs = Math.max(20, Math.round(rawUs / 1000))
            frames.push({
              canvas,
              delayMs,
              timestampSec: elapsedMs / 1000,
            })
            cumulativeBytes += frameBytes
            elapsedMs += delayMs
          }
          finally {
            videoFrame.close()
          }
        }

        if (frames.length > 0 && targetWidth > 0 && targetHeight > 0) {
          return {
            width: targetWidth,
            height: targetHeight,
            frames,
            duration: elapsedMs / 1000,
            truncated,
            totalFrameCount,
            maxFrameCount: maxFrames,
          }
        }
      }
    }
    catch (err) {
      if (err instanceof GifPixelBudgetError)
        throw err
      // Fall back to pure-TS GIF89a decoder.
    }
    finally {
      decoder?.close?.()
    }
  }

  const parsed = decodeGif(bytes, { maxFrames, maxDecodedBytes })
  return {
    width: parsed.width,
    height: parsed.height,
    frames: gifFramesToCanvases(parsed.frames),
    duration: parsed.totalDurationMs / 1000,
    truncated: Boolean(parsed.truncated),
    totalFrameCount: parsed.totalFrameCount ?? parsed.frames.length,
    maxFrameCount: maxFrames,
  }
}

export function seekVideoElement(video: HTMLVideoElement, timeSec: number): Promise<void> {
  if (video.error)
    return Promise.reject(new Error('Video element is in an error state'))

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  const target = Math.max(0, Math.min(duration > 0 ? Math.max(0, duration - 0.001) : 0, timeSec))

  if (Math.abs(video.currentTime - target) < 0.004 && video.readyState >= 2 && !video.seeking)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    let settled = false
    let seekCompleted = false

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadeddata', onFrameReady)
      video.removeEventListener('canplay', onFrameReady)
      video.removeEventListener('error', onFail)
      video.removeEventListener('abort', onFail)
      window.clearTimeout(timer)
    }

    const succeed = () => {
      if (settled)
        return
      settled = true
      cleanup()
      resolve()
    }

    const fail = (message: string) => {
      if (settled)
        return
      settled = true
      cleanup()
      reject(new Error(message))
    }

    const onFrameReady = () => {
      if (seekCompleted && video.readyState >= 2 && !video.seeking)
        succeed()
    }

    const onSeeked = () => {
      seekCompleted = true
      if (video.readyState >= 2 && !video.seeking)
        succeed()
    }

    const onFail = () => fail('Video seek failed')

    const timer = window.setTimeout(() => fail('Video seek timed out'), 1500)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadeddata', onFrameReady)
    video.addEventListener('canplay', onFrameReady)
    video.addEventListener('error', onFail, { once: true })
    video.addEventListener('abort', onFail, { once: true })
    try {
      video.currentTime = target
    }
    catch (err) {
      fail(err instanceof Error ? err.message : 'Video seek failed')
    }
  })
}

function loadVideoElement(url: string, isRemote: boolean): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.loop = true
    if (isRemote)
      video.crossOrigin = 'anonymous'

    let settled = false
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('error', onError)
      window.clearTimeout(timer)
    }

    const onReady = () => {
      if (settled)
        return
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        settled = true
        cleanup()
        resolve(video)
      }
    }

    const onMeta = () => {
      if (video.readyState >= 2)
        onReady()
    }

    const onError = () => {
      if (settled)
        return
      settled = true
      cleanup()
      reject(new Error('Video load failed'))
    }

    const timer = window.setTimeout(() => {
      if (settled)
        return
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        onReady()
      }
      else {
        settled = true
        cleanup()
        reject(new Error('Video metadata timed out'))
      }
    }, 10_000)

    video.addEventListener('loadeddata', onReady)
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('error', onError)
    video.src = url
    video.load()
  })
}

function decodeDataUrlText(dataUrl: string): string | null {
  const match = /^data:image\/svg\+xml([^,]*),(.*)$/i.exec(dataUrl)
  if (!match)
    return null
  const meta = match[1] ?? ''
  const payload = match[2] ?? ''
  try {
    if (/;base64/i.test(meta))
      return atob(payload)
    return decodeURIComponent(payload)
  }
  catch {
    return null
  }
}

function baseNameOf(source: File | Blob | string): string {
  if (source instanceof File && source.name)
    return source.name
  if (typeof source === 'string' && !source.startsWith('data:') && !source.startsWith('blob:')) {
    const clean = source.split(/[?#]/)[0] ?? ''
    const last = clean.split('/').pop()
    if (last)
      return last
  }
  return 'avatar'
}

/**
 * Loads any supported avatar media source (`File`, `Blob`, data URL, or remote URL)
 * into a unified editing handle covering raster images, SVGs, multi-res ICOs,
 * multi-frame GIFs, and playable HTML5 videos (MP4/WebM/MOV/OGG).
 */
export async function loadAvatarMedia(
  source: File | Blob | string,
  options: LoadAvatarMediaOptions = {},
): Promise<LoadedAvatarMedia> {
  const allowRemoteSource = options.allowRemoteSource === true
  const maxGifFrames = options.maxGifFrames ?? DEFAULT_MAX_GIF_LOAD_FRAMES
  const maxGifDecodedBytes = options.maxGifDecodedBytes ?? DEFAULT_MAX_GIF_DECODED_BYTES

  const ownedUrls: string[] = []
  const disposeUrls = () => {
    for (const url of ownedUrls)
      URL.revokeObjectURL(url)
    ownedUrls.length = 0
  }

  const file = source instanceof File ? source : null
  const sourceName = baseNameOf(source)
  let kind = detectAvatarSourceKind(source)

  const blob: Blob | null = source instanceof Blob ? source : null
  let remoteUrl: string | null = null
  let isRemoteHttpUrl = false
  if (typeof source === 'string') {
    const validated = validateAvatarSourceUrl(source, allowRemoteSource)
    remoteUrl = validated.url
    isRemoteHttpUrl = validated.isRemote
  }

  // For local Blobs/Files, sniff header bytes so misnamed files (.png that is actually .ico/.gif/.svg) still work.
  if (blob) {
    try {
      const head = new Uint8Array(await readBlobArrayBuffer(blob.slice(0, 256)))
      kind = sniffAvatarKindFromBytes(head, kind)
    }
    catch {
      // Keep extension/MIME-derived kind.
    }
  }

  try {
    // 1. Video (MP4 / WebM / MOV / OGG)
    if (kind === 'video') {
      const url = blob ? URL.createObjectURL(blob) : remoteUrl!
      if (blob)
        ownedUrls.push(url)
      const isRemote = !blob && isRemoteHttpUrl
      const video = await loadVideoElement(url, isRemote)
      await seekVideoElement(video, 0)
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0

      return {
        kind: 'video',
        naturalWidth: video.videoWidth || 512,
        naturalHeight: video.videoHeight || 512,
        file,
        sourceName,
        video,
        duration,
        animated: duration > 0,
        corsTainted: false,
        dispose: () => {
          video.pause()
          video.removeAttribute('src')
          video.load()
          disposeUrls()
        },
      }
    }

    // 2. GIF (decode frames for frame-accurate scrubbing and animated GIF trimming)
    if (kind === 'gif') {
      let bytes: Uint8Array | null = null
      if (blob) {
        bytes = new Uint8Array(await readBlobArrayBuffer(blob))
      }
      else if (remoteUrl && LOCAL_MEDIA_URL_RE.test(remoteUrl)) {
        try {
          // eslint-disable-next-line no-restricted-syntax -- reads a local blob:/data:/file: URL already on this machine; no network request.
          const response = await fetch(remoteUrl)
          if (response.ok)
            bytes = new Uint8Array(await response.arrayBuffer())
        }
        catch {
          // Unreadable local GIF URL: fall through to static image preview.
        }
      }

      if (bytes && bytes.length >= 13) {
        try {
          const decoded = await decodeGifFramesInBrowser(bytes, maxGifFrames, maxGifDecodedBytes)
          if (decoded.frames.length > 0) {
            return {
              kind: 'gif',
              naturalWidth: decoded.width,
              naturalHeight: decoded.height,
              file,
              sourceName,
              gifFrames: decoded.frames,
              duration: decoded.duration,
              animated: decoded.frames.length > 1,
              truncated: decoded.truncated,
              totalFrameCount: decoded.totalFrameCount,
              maxFrameCount: decoded.maxFrameCount,
              corsTainted: false,
              dispose: disposeUrls,
            }
          }
        }
        catch (err) {
          if (err instanceof GifPixelBudgetError || (err instanceof Error && err.message.includes('pixel budget')))
            throw err
          // Fall back to browser <img> decode if GIF frame parsing fails.
        }
      }
    }

    // 3. ICO (extract highest-resolution PNG entry so 256px icons aren't downscaled to 16px)
    if (kind === 'ico' && blob) {
      try {
        const buffer = await readBlobArrayBuffer(blob)
        const extracted = extractBestIcoEntry(buffer)
        if (extracted) {
          const url = URL.createObjectURL(extracted.blob)
          ownedUrls.push(url)
          const image = await loadImageElement(url)
          return {
            kind: 'ico',
            naturalWidth: image.naturalWidth || extracted.width || 256,
            naturalHeight: image.naturalHeight || extracted.height || 256,
            file,
            sourceName,
            image,
            duration: 0,
            animated: false,
            corsTainted: false,
            dispose: disposeUrls,
          }
        }
      }
      catch {
        // Fall through to standard <img> decode.
      }
    }

    // 4. SVG (capture raw text for crisp vector export + load raster preview)
    if (kind === 'svg') {
      let svgText: string | undefined
      if (blob) {
        svgText = await readBlobText(blob)
      }
      else if (remoteUrl?.startsWith('data:image/svg+xml')) {
        svgText = decodeDataUrlText(remoteUrl) ?? undefined
      }
      else if (remoteUrl && LOCAL_MEDIA_URL_RE.test(remoteUrl)) {
        try {
          // eslint-disable-next-line no-restricted-syntax -- reads a local blob:/data:/file: URL already on this machine; no network request.
          const response = await fetch(remoteUrl)
          if (response.ok)
            svgText = await response.text()
        }
        catch {
          // Unreadable local SVG URL: fall back to <img> preview.
        }
      }

      let previewUrl = remoteUrl ?? ''
      if (svgText) {
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
        previewUrl = URL.createObjectURL(svgBlob)
        ownedUrls.push(previewUrl)
      }
      else if (blob) {
        previewUrl = URL.createObjectURL(blob)
        ownedUrls.push(previewUrl)
      }

      const isRemote = !blob && !svgText && /^https?:\/\//i.test(previewUrl)
      const { image, corsTainted } = await loadImageWithCorsFallback(previewUrl, isRemote)
      return {
        kind: 'svg',
        naturalWidth: image.naturalWidth || 512,
        naturalHeight: image.naturalHeight || 512,
        file,
        sourceName,
        image,
        svgText,
        duration: 0,
        animated: false,
        corsTainted,
        dispose: disposeUrls,
      }
    }

    // 5. Standard raster image (PNG / JPEG / WebP / AVIF / BMP / fallback)
    const url = blob ? URL.createObjectURL(blob) : remoteUrl!
    if (blob)
      ownedUrls.push(url)
    const isRemote = !blob && /^https?:\/\//i.test(url)
    const { image, corsTainted } = await loadImageWithCorsFallback(url, isRemote)

    return {
      kind,
      naturalWidth: image.naturalWidth || 512,
      naturalHeight: image.naturalHeight || 512,
      file,
      sourceName,
      image,
      duration: 0,
      animated: false,
      corsTainted,
      dispose: disposeUrls,
    }
  }
  catch (error) {
    disposeUrls()
    throw error instanceof Error ? error : new Error(String(error))
  }
}
