import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'
import type { NativeImage } from 'electron'
import type { ClipboardReader } from './clipboard-reader'
import crypto from 'node:crypto'
import { clipboard } from 'electron'
import { createLogger } from '../../utils/logger'
import {
  createIneligibleClipboardFreshnessState,
  type ClipboardFreshnessState
} from './clipboard-freshness'
import { parsePngDimensions } from './clipboard-reader'

const clipboardCaptureLog = createLogger('Clipboard')

const FILE_URL_FORMATS = new Set([
  'public.file-url',
  'public.file-url-multiple',
  'text/uri-list',
  'text/x-moz-url',
  'NSFilenamesPboardType',
  'com.apple.pasteboard.promised-file-url'
])

export const CLIPBOARD_IMAGE_FORMATS = new Set([
  'public.tiff',
  'public.png',
  'public.jpeg',
  'public.heic',
  'image/png',
  'image/jpeg',
  'image/webp',
  'NSTIFFPboardType'
])

export const CLIPBOARD_TEXT_FORMATS = new Set([
  'public.utf8-plain-text',
  'public.utf16-plain-text',
  'text/plain',
  'text/html',
  'public.html',
  'NSStringPboardType'
])

export const CLIPBOARD_HTML_FORMATS = new Set(['text/html', 'public.html'])

const CLIPBOARD_FILE_READ_FORMATS = [
  'public.file-url',
  'NSFilenamesPboardType',
  'text/uri-list'
] as const

const PLIST_STRING_TAG_PATTERN = /<string>([^<]+)<\/string>/g
const LINE_SPLIT_PATTERN = /\r\n|\n|\r/
const isClipboardDebugVerbose =
  typeof process !== 'undefined' &&
  (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development')

export interface ClipboardFormatFlags {
  hasHtml: boolean
  hasImage: boolean
  hasFile: boolean
}

export function includesAnyClipboardFormat(
  formats: readonly string[],
  candidates: Set<string>
): boolean {
  for (let i = 0; i < formats.length; i += 1) {
    if (candidates.has(formats[i])) return true
  }
  return false
}

export function isClipboardImageFormat(format: string): boolean {
  if (CLIPBOARD_IMAGE_FORMATS.has(format)) return true
  if (format.length < 6) return false
  const firstChar = format.charCodeAt(0) | 32
  if (firstChar === 105 /* 'i' */) {
    return format.startsWith('image/') || format.toLowerCase().startsWith('image/')
  }
  if (firstChar === 112 /* 'p' */ && (format.length === 10 || format.length === 11)) {
    const lower = format.toLowerCase()
    return lower === 'public.png' || lower === 'public.tiff'
  }
  return false
}

export function hasClipboardImageFormat(formats: readonly string[]): boolean {
  for (let i = 0; i < formats.length; i += 1) {
    if (isClipboardImageFormat(formats[i])) return true
  }
  return false
}

export function hasClipboardFileFormat(formats: readonly string[]): boolean {
  return includesAnyClipboardFormat(formats, FILE_URL_FORMATS)
}

/**
 * Classifies HTML, image, and file-URL formats in a single linear pass over
 * `formats` without allocating intermediate closures or redundant Set lookups.
 */
export function detectClipboardFormatFlags(formats: readonly string[]): ClipboardFormatFlags {
  let hasHtml = false
  let hasImage = false
  let hasFile = false
  for (let i = 0; i < formats.length; i += 1) {
    const format = formats[i]
    if (!hasHtml && CLIPBOARD_HTML_FORMATS.has(format)) {
      hasHtml = true
    }
    if (!hasFile && FILE_URL_FORMATS.has(format)) {
      hasFile = true
    }
    if (!hasImage && isClipboardImageFormat(format)) {
      hasImage = true
    }
    if (hasHtml && hasImage && hasFile) {
      break
    }
  }
  return { hasHtml, hasImage, hasFile }
}

function extractPlistStringPaths(raw: string, requireNoIdSegment: boolean): string[] {
  const paths: string[] = []
  for (const match of raw.matchAll(PLIST_STRING_TAG_PATTERN)) {
    const candidate = match[1]?.trim()
    if (!candidate) continue
    if (
      (candidate.startsWith('/') || candidate.includes(':\\')) &&
      (!requireNoIdSegment || !candidate.includes('/id='))
    ) {
      paths.push(candidate)
    }
  }
  return paths
}

interface ClipboardFreshnessItem {
  id?: number
  type?: string
  content?: string
}

export class ClipboardFreshnessStore {
  private readonly states = new Map<
    number,
    { freshness: ClipboardFreshnessState; capturedFilesContent?: string }
  >()

  public remember(item: ClipboardFreshnessItem, freshness: ClipboardFreshnessState): void {
    if (typeof item.id !== 'number') return
    const captured =
      freshness.captureSource === 'native-watch' ||
      freshness.captureSource === 'background-poll' ||
      freshness.captureSource === 'visible-poll' ||
      freshness.captureSource === 'corebox-show-baseline'
    this.states.set(item.id, {
      freshness,
      capturedFilesContent:
        captured && item.type === 'files' && typeof item.content === 'string'
          ? item.content
          : undefined
    })
  }

  public resolve(item: ClipboardFreshnessItem): ClipboardFreshnessState {
    if (typeof item.id === 'number') {
      const state = this.states.get(item.id)
      if (state) return state.freshness
    }
    return createIneligibleClipboardFreshnessState('startup-bootstrap')
  }

  public getCapturedFilesContent(id: number): string | undefined {
    return this.states.get(id)?.capturedFilesContent
  }

  public delete(id: number): void {
    this.states.delete(id)
  }

  public clear(): void {
    this.states.clear()
  }
}

export class ClipboardHelper {
  private lastText = ''
  public lastFormats: string[] = []
  public lastFormatsKey = ''
  public lastChangeHash = ''
  private lastImageHash = ''
  private lastFiles: string[] = []
  private bootstrapped = false
  private bootstrapInFlight: Promise<void> | null = null

  public bootstrap(): void {
    if (this.bootstrapped) {
      return
    }
    this.bootstrapped = true
    try {
      this.lastText = clipboard.readText()
    } catch {
      this.lastText = ''
    }
    try {
      this.lastFormats = clipboard.availableFormats()
    } catch {
      this.lastFormats = []
    }
    this.lastFormats = Array.isArray(this.lastFormats) ? [...this.lastFormats].sort() : []
    this.lastFormatsKey = this.lastFormats.join(',')
    const formatsKey = this.lastFormatsKey
    const textSignature = this.getTextQuickSignature(this.lastText)
    const { hasFile, hasImage } = detectClipboardFormatFlags(this.lastFormats)

    let filesSignature = '0:0'
    if (hasFile) {
      try {
        this.lastFiles = this.readClipboardFiles()
      } catch {
        this.lastFiles = []
      }
      filesSignature = this.getFilesQuickSignature(this.lastFiles)
    } else {
      this.lastFiles = []
    }

    let imageQuickSignature = ''
    if (hasImage) {
      try {
        const image = clipboard.readImage()
        const resolvedImage = image.isEmpty() ? null : image
        imageQuickSignature = this.getImageQuickSignature(resolvedImage)
        this.lastImageHash = resolvedImage ? this.computeImageContentHash(resolvedImage) : ''
      } catch {
        imageQuickSignature = ''
        this.lastImageHash = ''
      }
    } else {
      this.lastImageHash = ''
    }

    this.lastChangeHash = `${formatsKey}|t:${textSignature}|f:${filesSignature}|i:${imageQuickSignature}`
  }

  public async bootstrapAsync(reader?: ClipboardReader): Promise<void> {
    if (this.bootstrapped) {
      return
    }
    if (!reader) {
      this.bootstrap()
      return
    }
    if (this.bootstrapInFlight) {
      await this.bootstrapInFlight
      return
    }

    this.bootstrapInFlight = (async () => {
      try {
        let formats: string[] = []
        try {
          formats = clipboard.availableFormats()
        } catch {
          formats = []
        }
        this.lastFormats = [...formats].sort()
        this.lastFormatsKey = this.lastFormats.join(',')
        const formatsKey = this.lastFormatsKey

        if (includesAnyClipboardFormat(this.lastFormats, CLIPBOARD_TEXT_FORMATS)) {
          try {
            this.lastText = await reader.readText()
          } catch {
            this.lastText = ''
          }
        } else {
          this.lastText = ''
        }
        const textSignature = this.getTextQuickSignature(this.lastText)

        let filesSignature = '0:0'
        if (includesAnyClipboardFormat(this.lastFormats, FILE_URL_FORMATS)) {
          try {
            this.lastFiles = await reader.readFiles()
          } catch {
            this.lastFiles = []
          }
          filesSignature = this.getFilesQuickSignature(this.lastFiles)
        } else {
          this.lastFiles = []
        }

        let imageQuickSignature = ''
        if (includesAnyClipboardFormat(this.lastFormats, CLIPBOARD_IMAGE_FORMATS)) {
          try {
            const read = reader.readImageWithEncoded
              ? await reader.readImageWithEncoded()
              : { image: await reader.readImage(), png: null }
            const resolvedImage = read?.image && !read.image.isEmpty() ? read.image : null
            const rawPng = read?.png ?? null
            imageQuickSignature = this.getImageQuickSignature(resolvedImage, rawPng)
            this.lastImageHash = resolvedImage
              ? this.computeImageContentHash(resolvedImage, rawPng)
              : ''
          } catch {
            imageQuickSignature = ''
            this.lastImageHash = ''
          }
        } else {
          this.lastImageHash = ''
        }

        this.lastChangeHash = `${formatsKey}|t:${textSignature}|f:${filesSignature}|i:${imageQuickSignature}`
        this.bootstrapped = true
      } finally {
        this.bootstrapInFlight = null
      }
    })()

    await this.bootstrapInFlight
  }

  public computeImageContentHash(image: NativeImage, rawPng?: Buffer | null): string {
    if (!image || image.isEmpty()) return ''
    if (rawPng && rawPng.length > 0) {
      const size = parsePngDimensions(rawPng) ?? image.getSize()
      return `${size.width}x${size.height}:${crypto.createHash('sha1').update(rawPng).digest('hex')}`
    }
    return this.getImageHash(image)
  }

  private getImageHash(image: NativeImage): string {
    if (!image || image.isEmpty()) return ''

    const size = image.getSize()
    const tiny = image.resize({ width: 16, height: 16 }) as unknown as {
      getBitmap?: () => Buffer
      toDataURL?: () => string
    }
    const fingerprint =
      typeof tiny?.getBitmap === 'function'
        ? tiny.getBitmap()
        : typeof tiny?.toDataURL === 'function'
          ? tiny.toDataURL().substring(0, 200)
          : ''
    return `${size.width}x${size.height}:${crypto.createHash('sha1').update(fingerprint).digest('hex')}`
  }

  public getTextQuickSignature(text: string): string {
    if (!text) return '0:0'
    const edgeLength = 160
    const head = text.slice(0, edgeLength)
    const tail = text.length > edgeLength ? text.slice(-edgeLength) : ''
    const digest = crypto.createHash('sha1').update(head).update('\0').update(tail).digest('hex')
    return `${text.length}:${digest}`
  }

  public getFilesQuickSignature(files: string[]): string {
    if (files.length === 0) return '0:0'
    const digest = crypto.createHash('sha1')
    for (const filePath of files) {
      digest.update(filePath)
      digest.update('\n')
    }
    return `${files.length}:${digest.digest('hex')}`
  }

  public getImageQuickSignature(
    image: NativeImage | null | undefined,
    rawPng?: Buffer | null
  ): string {
    if (!image || image.isEmpty()) return ''
    if (rawPng && rawPng.length > 0) {
      const size = parsePngDimensions(rawPng) ?? image.getSize()
      const edge = 256
      const hasher = crypto.createHash('sha1').update(rawPng.subarray(0, edge))
      if (rawPng.length > edge) {
        hasher.update(rawPng.subarray(-edge))
      }
      const digest = hasher.digest('hex')
      return `${size.width}x${size.height}:${rawPng.length}:${digest}`
    }
    return this.getImageHash(image)
  }

  public readClipboardFiles(): string[] {
    let hasFileIDPlaceholder = false

    for (const format of CLIPBOARD_FILE_READ_FORMATS) {
      try {
        const raw = clipboard.read(format).toString()
        if (!raw) continue

        if (isClipboardDebugVerbose) {
          clipboardCaptureLog.debug(`Raw clipboard data from ${format}`, {
            meta: { sample: raw.substring(0, 200) }
          })
        }

        if (raw.includes('<?xml') && raw.includes('<plist') && raw.includes('<string>')) {
          const paths = extractPlistStringPaths(raw, true)
          if (paths.length > 0) {
            if (isClipboardDebugVerbose) {
              clipboardCaptureLog.debug(`Read ${paths.length} file(s) from plist XML`)
            }
            return paths
          }
          continue
        }

        const lines = raw.split(LINE_SPLIT_PATTERN)
        const paths: string[] = []
        for (let i = 0; i < lines.length; i += 1) {
          const url = lines[i]
          if (!url) continue
          try {
            if (url.includes('file/id=') || url.includes('/.file/id=')) {
              hasFileIDPlaceholder = true
              continue
            }

            const parsedUrl = new URL(url)
            const pathname = decodeURI(parsedUrl.pathname)
            if (!pathname || pathname === '/' || pathname.includes('/id=')) {
              continue
            }
            paths.push(pathname)
          } catch {
            const trimmed = url.trim()
            if ((trimmed.startsWith('/') || trimmed.includes(':\\')) && !trimmed.includes('/id=')) {
              paths.push(trimmed)
            }
          }
        }

        if (paths.length > 0) {
          if (isClipboardDebugVerbose) {
            clipboardCaptureLog.debug(`Read ${paths.length} file(s) from format: ${format}`)
          }
          return paths
        }
        if (hasFileIDPlaceholder && isClipboardDebugVerbose) {
          clipboardCaptureLog.debug(
            'File ID placeholders detected but no valid paths - files may still be preparing'
          )
        }
      } catch (error) {
        if (isClipboardDebugVerbose) {
          clipboardCaptureLog.debug(`Failed to read format ${format}`, { error })
        }
      }
    }

    if (hasFileIDPlaceholder) {
      try {
        const text = clipboard.readText().trim()
        if (text && text.length > 0 && text.length < 10000) {
          if (text.startsWith('/') && !text.includes('<')) {
            return [text]
          }

          if (text.includes('<plist') && text.includes('<string>')) {
            const paths = extractPlistStringPaths(text, false)
            if (paths.length > 0) {
              return paths
            }
          }
        }
      } catch (error) {
        if (isClipboardDebugVerbose) {
          clipboardCaptureLog.debug('Failed to read fallback text', { error })
        }
      }
      if (isClipboardDebugVerbose) {
        clipboardCaptureLog.debug(
          'Files contain ID placeholders - skipping to avoid treating as text'
        )
      }
    }
    return []
  }

  public hasFileFormats(formats: string[]): boolean {
    return includesAnyClipboardFormat(formats, FILE_URL_FORMATS)
  }

  public didFilesChange(nextFiles: string[]): boolean {
    if (nextFiles.length === 0) return false
    if (nextFiles.length === this.lastFiles.length) {
      let allEqual = true
      for (let i = 0; i < nextFiles.length; i += 1) {
        if (nextFiles[i] !== this.lastFiles[i]) {
          allEqual = false
          break
        }
      }
      if (allEqual) {
        return false
      }
    }
    this.lastFiles = [...nextFiles]
    return true
  }

  public getLastFilesSnapshot(): string[] {
    return [...this.lastFiles]
  }

  public didImageChange(image: NativeImage, rawPng?: Buffer | null): boolean {
    if (image.isEmpty()) return false
    const hash = this.computeImageContentHash(image, rawPng)
    if (hash === this.lastImageHash) return false
    this.lastImageHash = hash
    return true
  }

  public primeImage(image: NativeImage | null, rawPng?: Buffer | null): void {
    this.lastImageHash =
      image && !image.isEmpty() ? this.computeImageContentHash(image, rawPng) : ''
  }

  public primeFiles(files: string[]): void {
    this.lastFiles = [...files]
  }

  public didTextChange(text: string): boolean {
    if (!text || text === this.lastText) return false
    this.lastText = text
    return true
  }

  public markText(text: string): void {
    this.lastText = text
  }

  public resolveCaptureSource(source?: ClipboardCaptureSource): ClipboardCaptureSource {
    return source ?? 'background-poll'
  }
}
