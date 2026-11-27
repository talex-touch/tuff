import type { GifFrame } from './gif-codec'
import type { AvatarSourceKind } from './types'
import { decodeGif } from './gif-codec'
import { extractBestIcoEntry } from './ico-codec'

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

function sniffKindFromBytes(bytes: Uint8Array, fallback: AvatarSourceKind): AvatarSourceKind {
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
    if (ftyp === 'ftyp')
      return 'video'
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

async function decodeGifFramesInBrowser(bytes: Uint8Array, maxFrames = 180): Promise<{
  width: number
  height: number
  frames: LoadedGifFrame[]
  duration: number
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
        const count = Math.min(maxFrames, Math.max(1, track?.frameCount ?? 1))
        const frames: LoadedGifFrame[] = []
        let width = 0
        let height = 0
        let elapsedMs = 0

        for (let i = 0; i < count; i++) {
          const decoded = await decoder.decode({ frameIndex: i })
          const videoFrame = decoded.image
          width = width || videoFrame.displayWidth || videoFrame.codedWidth
          height = height || videoFrame.displayHeight || videoFrame.codedHeight
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(videoFrame, 0, 0, width, height)
          const rawUs = typeof videoFrame.duration === 'number' && videoFrame.duration > 0
            ? videoFrame.duration
            : 100_000
          const delayMs = Math.max(20, Math.round(rawUs / 1000))
          videoFrame.close()
          frames.push({
            canvas,
            delayMs,
            timestampSec: elapsedMs / 1000,
          })
          elapsedMs += delayMs
        }

        decoder.close?.()
        if (frames.length > 0 && width > 0 && height > 0) {
          return { width, height, frames, duration: elapsedMs / 1000 }
        }
      }
    }
    catch {
      decoder?.close?.()
      // Fall back to pure-TS GIF89a decoder.
    }
  }

  const parsed = decodeGif(bytes, maxFrames)
  return {
    width: parsed.width,
    height: parsed.height,
    frames: gifFramesToCanvases(parsed.frames),
    duration: parsed.totalDurationMs / 1000,
  }
}

export function seekVideoElement(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
  const target = Math.max(0, Math.min(duration > 0 ? Math.max(0, duration - 0.001) : 0, timeSec))

  if (Math.abs(video.currentTime - target) < 0.004 && video.readyState >= 2)
    return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled)
        return
      settled = true
      video.removeEventListener('seeked', done)
      video.removeEventListener('error', done)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(done, 1500)
    video.addEventListener('seeked', done, { once: true })
    video.addEventListener('error', done, { once: true })
    try {
      video.currentTime = target
    }
    catch {
      done()
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
export async function loadAvatarMedia(source: File | Blob | string): Promise<LoadedAvatarMedia> {
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
  const remoteUrl: string | null = typeof source === 'string' ? source : null

  // For local Blobs/Files, sniff header bytes so misnamed files (.png that is actually .ico/.gif/.svg) still work.
  if (blob) {
    try {
      const head = new Uint8Array(await readBlobArrayBuffer(blob.slice(0, 256)))
      kind = sniffKindFromBytes(head, kind)
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
      const isRemote = !blob && /^https?:\/\//i.test(url)
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
          const decoded = await decodeGifFramesInBrowser(bytes)
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
              corsTainted: false,
              dispose: disposeUrls,
            }
          }
        }
        catch {
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
