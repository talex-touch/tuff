import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'
import type { NativeImage } from 'electron'
import crypto from 'node:crypto'
import { clipboard } from 'electron'
import { createLogger } from '../../utils/logger'
import {
  createIneligibleClipboardFreshnessState,
  type ClipboardFreshnessState
} from './clipboard-freshness'

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

export function includesAnyClipboardFormat(formats: string[], candidates: Set<string>): boolean {
  return formats.some((format) => candidates.has(format))
}

interface ClipboardFreshnessItem {
  id?: number
}

export class ClipboardFreshnessStore {
  private readonly states = new Map<number, ClipboardFreshnessState>()

  public remember(item: ClipboardFreshnessItem, freshness: ClipboardFreshnessState): void {
    if (typeof item.id !== 'number') return
    this.states.set(item.id, freshness)
  }

  public resolve(item: ClipboardFreshnessItem): ClipboardFreshnessState {
    if (typeof item.id === 'number') {
      const state = this.states.get(item.id)
      if (state) return state
    }
    return createIneligibleClipboardFreshnessState('startup-bootstrap')
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
    this.lastFormats = [...this.lastFormats].sort()
    this.lastFormatsKey = this.lastFormats.join(',')
    const formatsKey = this.lastFormatsKey
    const textSignature = this.getTextQuickSignature(this.lastText)

    let filesSignature = '0:0'
    if (includesAnyClipboardFormat(this.lastFormats, FILE_URL_FORMATS)) {
      try {
        this.lastFiles = this.readClipboardFiles()
      } catch {
        this.lastFiles = []
      }
      filesSignature = this.getFilesQuickSignature(this.lastFiles)
    } else {
      this.lastFiles = []
    }

    if (includesAnyClipboardFormat(this.lastFormats, CLIPBOARD_IMAGE_FORMATS)) {
      try {
        const image = clipboard.readImage()
        this.lastImageHash = this.getImageQuickSignature(image.isEmpty() ? null : image)
      } catch {
        this.lastImageHash = ''
      }
    } else {
      this.lastImageHash = ''
    }

    this.lastChangeHash = `${formatsKey}|t:${textSignature}|f:${filesSignature}|i:${this.lastImageHash}`
  }

  private getImageHash(image: NativeImage): string {
    if (!image || image.isEmpty()) return ''

    const size = image.getSize()
    const tiny = image.resize({ width: 16, height: 16 })
    const fingerprint = tiny.toDataURL().substring(0, 200)
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

  public getImageQuickSignature(image: NativeImage | null | undefined): string {
    if (!image || image.isEmpty()) return ''
    return this.getImageHash(image)
  }

  public readClipboardFiles(): string[] {
    const formats = ['public.file-url', 'NSFilenamesPboardType', 'text/uri-list']
    let hasFileIDPlaceholder = false

    for (const format of formats) {
      try {
        const raw = clipboard.read(format).toString()
        if (!raw) continue

        clipboardCaptureLog.debug(`Raw clipboard data from ${format}`, {
          meta: { sample: raw.substring(0, 200) }
        })

        if (raw.includes('<?xml') && raw.includes('<plist') && raw.includes('<string>')) {
          clipboardCaptureLog.debug('Detected plist XML format, parsing')
          const stringMatches = raw.match(/<string>([^<]+)<\/string>/g)
          if (stringMatches && stringMatches.length > 0) {
            const paths = stringMatches
              .map((match) => {
                const path = match.replace(/<string>|<\/string>/g, '').trim()
                if ((path.startsWith('/') || path.includes(':\\')) && !path.includes('/id=')) {
                  clipboardCaptureLog.debug('Extracted file path from plist', { meta: { path } })
                  return path
                }
                return null
              })
              .filter((p): p is string => p !== null)

            if (paths.length > 0) {
              clipboardCaptureLog.info(`Read ${paths.length} file(s) from plist XML`)
              return paths
            }
          }
          clipboardCaptureLog.debug('No valid paths found in plist XML')
          continue
        }

        const paths = raw
          .split(/\r\n|\n|\r/)
          .filter(Boolean)
          .map((url) => {
            try {
              if (url.includes('file/id=') || url.includes('/.file/id=')) {
                clipboardCaptureLog.debug('Detected file ID placeholder', { meta: { url } })
                hasFileIDPlaceholder = true
                return ''
              }

              const parsedUrl = new URL(url)
              const pathname = decodeURI(parsedUrl.pathname)

              if (!pathname || pathname === '/' || pathname.includes('/id=')) {
                clipboardCaptureLog.debug('Invalid file path from URL', { meta: { url } })
                return ''
              }

              clipboardCaptureLog.debug('Extracted file path', { meta: { pathname } })
              return pathname
            } catch {
              const trimmed = url.trim()
              const looksLikePath = trimmed.startsWith('/') || trimmed.includes(':\\')
              const isNotID = !trimmed.includes('/id=')

              if (looksLikePath && isNotID) {
                clipboardCaptureLog.debug('Using direct path', { meta: { path: trimmed } })
                return trimmed
              }

              clipboardCaptureLog.debug('Rejected as not a valid path', {
                meta: { value: trimmed }
              })
              return ''
            }
          })
          .filter(Boolean)

        if (paths.length > 0) {
          clipboardCaptureLog.info(`Read ${paths.length} file(s) from format: ${format}`)
          return paths
        } else if (hasFileIDPlaceholder) {
          clipboardCaptureLog.debug(
            'File ID placeholders detected but no valid paths - files may still be preparing'
          )
        } else {
          clipboardCaptureLog.debug(`No valid paths extracted from ${format}`)
        }
      } catch (error) {
        clipboardCaptureLog.debug(`Failed to read format ${format}`, { error })
      }
    }

    if (hasFileIDPlaceholder) {
      clipboardCaptureLog.debug('Attempting to read file path from clipboard text as fallback')
      try {
        const text = clipboard.readText().trim()
        if (text && text.length > 0 && text.length < 10000) {
          if (text.startsWith('/') && !text.includes('<')) {
            clipboardCaptureLog.info('Found file path in fallback text')
            return [text]
          }

          if (text.includes('<plist') && text.includes('<string>')) {
            clipboardCaptureLog.debug('Detected plist XML in fallback text, parsing')
            const stringMatches = text.match(/<string>([^<]+)<\/string>/g)
            if (stringMatches && stringMatches.length > 0) {
              const paths = stringMatches
                .map((match) => {
                  const path = match.replace(/<string>|<\/string>/g, '').trim()
                  if (path.startsWith('/') || path.includes(':\\')) {
                    return path
                  }
                  return null
                })
                .filter((p): p is string => p !== null)

              if (paths.length > 0) {
                clipboardCaptureLog.info('Extracted file paths from fallback plist')
                return paths
              }
            }
          }
        }
      } catch (error) {
        clipboardCaptureLog.debug('Failed to read fallback text', { error })
      }
      clipboardCaptureLog.info('Files contain ID placeholders - skipping to avoid treating as text')
    }
    return []
  }

  public hasFileFormats(formats: string[]): boolean {
    return includesAnyClipboardFormat(formats, FILE_URL_FORMATS)
  }

  public didFilesChange(nextFiles: string[]): boolean {
    if (nextFiles.length === 0) return false
    if (
      nextFiles.length === this.lastFiles.length &&
      nextFiles.every((file, index) => file === this.lastFiles[index])
    ) {
      return false
    }
    this.lastFiles = [...nextFiles]
    return true
  }

  public getLastFilesSnapshot(): string[] {
    return [...this.lastFiles]
  }

  public didImageChange(image: NativeImage): boolean {
    if (image.isEmpty()) return false
    const hash = this.getImageHash(image)
    if (hash === this.lastImageHash) return false
    this.lastImageHash = hash
    return true
  }

  public primeImage(image: NativeImage | null): void {
    this.lastImageHash = image && !image.isEmpty() ? this.getImageHash(image) : ''
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
