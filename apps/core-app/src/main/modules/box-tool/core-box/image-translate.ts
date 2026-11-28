import type { TuffItem } from '@talex-touch/utils/core-box'
import type { CoreBoxImageTranslateResponse } from '../../../../shared/events/corebox-scenes'
import type {
  CoreBoxImageTranslateRouteMetadata,
  CoreBoxImageTranslateRouteStage
} from '@talex-touch/utils/transport/events/types'
import { constants as fsConstants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveLocalFilePath } from '@talex-touch/utils/network'
import * as electron from 'electron'
import { clipboard, nativeImage } from 'electron'
import { COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID } from '../../../../shared/events/corebox-scenes'
import { normalizeBoxToolIntelligenceError } from '../ports/ai-capability-port'
import {
  extractBoxToolTranslatedImageFromSceneRun,
  runBoxToolCloudScene,
  type BoxToolCloudSceneRunResult
} from '../ports/cloud-scene-port'
import { openImageTranslatePinWindow } from './image-translate-pin-window'
import { resolveStartupBenchmarkUserDataDir } from '../../../core/acceptance-mode'
import { getBooleanEnv } from '@talex-touch/utils/env'

const VISIBLE_EVIDENCE_IMAGE_TRANSLATE_FLAG = 'TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE'
const VISIBLE_EVIDENCE_IMAGE_TRANSLATE_CLIPBOARD_FILE =
  'TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE_CLIPBOARD_FILE'
const VISIBLE_EVIDENCE_IMAGE_TRANSLATE_SOURCE_TEXT = 'Visible evidence clipboard image: hello world'
const VISIBLE_EVIDENCE_IMAGE_TRANSLATE_TARGET_TEXT = '可见证据剪贴板图片：你好世界'
const VISIBLE_EVIDENCE_TRANSLATED_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAQAAAADECAYAAAA8K5jFAAAABmJLR0QA/wD/AP+gvaeTAAAFl0lEQVR4nO3dwW3bMBRAUQfqUFl6S64jl8WaIXckFoHzqrdKxA44hl4liWHAQmvj/r6vdwJgd7vdHgC4SYAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgQQIIAAAgT+QQpMBuCLj+P84WfAFmlh4b/G+f3+R69tdpF6w35+Ot+yl0F+e6dLUerchmDTilBXtL7d7dcdNiFILPgpIAKwB0AAAiYAAAEEEAAAgYIAAABAoQQAAACBJAgAAAECCBAAAEIECBAAAAIECBAAAIECEEnBqfTzeei/t1cUkn9/rfN8WFvl5zA5PWFYeC9nfP59PnYeVW18m177qj/6u7zI8VYX+7THQBCBgggQAA4IYAAAggQQAA4MIAAASZxHtsdpKJEUoJMWDbiz+Uvbq4IC20Lmo9zfp9/64q/7gHQRX5mdJsSAQIEBAAUIIAAAgYIAAABAoQQAAACBJAgAAAECCBAAAEIECBAAAAIECBAAAIECHxwi+99BpVY8hICmu9zfr9/GiUcczNxxYgxSAEhggAB4JwAAQQIIECACQIEEEKATtbrYb8vRUn1AxhU/Z7z+/3a1zz4e+wk7n0TWQIECAggIAABBAwgIABBAgggAABJAgQQIByBgwQQMAAAgQQMIAAAQQIIIAAASQIEECAchYMEEBAAAIEEDCAAAEECCCAAIEk0ej+4XvAezKZTMBXP9tj/YuINwZ5bL89rBzY1zP4dneQOvSt49oG4O0QIEAAgUK4BBCgk9AABRAgQAA4MIAAASZxrrFwOBygDuz3++uStJvNpvde2azVa05T17/bb8scwzDGmV2W96xFfhuIN/sGAAlABBBAAAEHCBAgABwYQIAAEgQIIEABAwQIIEAAOEqAACKBCSBA5a4PN7st8z09+Yb46OLiMFtvCdTg9dp7OZv4vafTLfg7IWRaCJkCJIAAAgQIIIAAAQQgYIAAAhAwQIAAAgSQIEAAAcBcKyAAAQQIIIAAAgQQIIAAgd/Hj/wdd68AQIDCGhf4wJe/6sj5vpevc40i9snPLfvEU9vPRH5VmFg3A12EoIAAAgQQMMAEBBAAAEIECBBAgAACECCAAAEEIECAAAIEECAAAAQIECBAAAEECEI4EWp6bKGMbv6+Nyvd5OXz+fzB0xvmo70++NhBKUaNoTThaeW1wpCw3Z34Op/PO22fsPXJkHcAQAECCBAgAAECBBAAAECCBAAAEECiJxUUEfaYm2RnRLorjMccxMMbww1hLUzcsbPC16l+nvV853D7eXPrC20UOxMAUIEECBACAIQQCCAAAEkCBBACAECCBBAYOH1ZlqWH2dg93D9XpWnD8JOOa0YzkXny2QyeYduUMQbrgEAAgQQIEAAAQIIEECAAALggAADBCCAAAEkCBBACAECCBBAYAFVUxBBZoxtckny+XzY555+a/s5zuw9rVy5yQNcPIeXH0y+tJ/EL7/rdxgAHDABAAAECBBAgAADBCCAAAEkCBBACAECCBBAYMELAQQIIIAAAgQQIEAAggggQAAJBghAAIEBAQQIIEAAAT46QIBohADJuH4P0e+wJPOHq8O8pkDRfVe8PNoHf0etlf3sMvC/t4+4dkieFLH98vt9J8AZIEAAAQIIECAAAAAEECAAAIIAEI33XgIEEECASuH5fKJJUBh97PM7fLmwRY5fW648S7ZLbdN1CP4O+wrCb9DbFk69S/9tt9sN6BxAgwAABAgQQIIAAAQQIIIAAAgQQgEAAAgQQIIAAxQ0QQEAAAgQQMIAAAQQIIIAAAeBfBO5oCxpGw4m5AAAAAElFTkSuQmCC'

function isVisibleEvidenceImageTranslateMode(): boolean {
  return (
    getBooleanEnv(VISIBLE_EVIDENCE_IMAGE_TRANSLATE_FLAG) &&
    resolveStartupBenchmarkUserDataDir() !== undefined
  )
}

function resolveVisibleEvidenceClipboardImageFile(): string | null {
  const userDataDir = resolveStartupBenchmarkUserDataDir()
  const filePath = process.env[VISIBLE_EVIDENCE_IMAGE_TRANSLATE_CLIPBOARD_FILE]?.trim()
  if (!userDataDir || !filePath) return null

  const resolvedUserDataDir = path.resolve(userDataDir)
  const resolvedFilePath = path.resolve(filePath)
  return resolvedFilePath.startsWith(`${resolvedUserDataDir}${path.sep}`) ? resolvedFilePath : null
}

const MAX_TRANSLATE_IMAGE_BYTES = 20 * 1024 * 1024
const ALLOWED_TRANSLATE_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.tif',
  '.tiff'
])

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function hasImageSignature(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  // PNG
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true
  // GIF
  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return true
  }
  // WebP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true
  }
  // BMP
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true
  // TIFF
  if (
    (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
    (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
  ) {
    return true
  }
  // AVIF / HEIF ISO BMFF (`ftyp`)
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii')
    if (brand === 'avif' || brand === 'avis' || brand === 'heic' || brand === 'mif1') {
      return true
    }
  }
  return false
}

async function resolveAllowedTranslateImageRoots(): Promise<string[]> {
  const candidates: string[] = []
  const addCandidate = (dir: string | undefined) => {
    const trimmed = dir?.trim()
    if (trimmed) candidates.push(trimmed)
  }

  addCandidate(os.tmpdir())

  try {
    const electronApp = (electron as { app?: { getPath?: (name: string) => string } }).app
    if (typeof electronApp?.getPath === 'function') {
      try {
        const userDataDir = electronApp.getPath('userData')
        addCandidate(path.join(userDataDir, 'clipboard'))
        addCandidate(path.join(userDataDir, 'temp'))
        addCandidate(path.join(userDataDir, 'cache'))
        addCandidate(path.join(userDataDir, 'screenshots'))
        addCandidate(path.join(userDataDir, 'images'))
      } catch {
        // Electron app.getPath may be unavailable in isolated tests
      }
      try {
        addCandidate(electronApp.getPath('temp'))
      } catch {
        // ignore
      }
    }
  } catch {
    // Partial electron mocks in tests may omit `app`
  }

  addCandidate(resolveStartupBenchmarkUserDataDir())

  const canonicalRoots = new Set<string>()
  for (const candidate of candidates) {
    try {
      canonicalRoots.add(await realpath(candidate))
    } catch {
      canonicalRoots.add(path.resolve(candidate))
    }
  }
  return Array.from(canonicalRoots)
}

async function readConfinedImageFile(
  filePath: string,
  allowedRoots: readonly string[],
  options: { requireImageSignature: boolean }
): Promise<Buffer | null> {
  if (!filePath || filePath.includes('\0')) return null
  const ext = path.extname(filePath).toLowerCase()
  if (!ALLOWED_TRANSLATE_IMAGE_EXTENSIONS.has(ext)) return null

  let linkStat: Awaited<ReturnType<typeof lstat>>
  try {
    linkStat = await lstat(filePath)
  } catch {
    return null
  }
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) return null

  let canonicalPath: string
  try {
    canonicalPath = await realpath(filePath)
  } catch {
    return null
  }

  if (!allowedRoots.some((root) => isPathInsideRoot(canonicalPath, root))) {
    return null
  }

  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
  let handle: Awaited<ReturnType<typeof open>> | null = null
  try {
    handle = await open(canonicalPath, flags)
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_TRANSLATE_IMAGE_BYTES) {
      return null
    }
    const buffer = Buffer.allocUnsafe(stat.size)
    let offset = 0
    while (offset < stat.size) {
      const { bytesRead } = await handle.read(buffer, offset, stat.size - offset, offset)
      if (bytesRead <= 0) break
      offset += bytesRead
    }
    const slice = offset === stat.size ? buffer : buffer.subarray(0, offset)
    if (slice.length === 0) return null
    if (options.requireImageSignature && !hasImageSignature(slice)) {
      return null
    }
    const decoded = nativeImage.createFromBuffer(slice)
    if (decoded.isEmpty()) return null
    return slice
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function readVisibleEvidenceClipboardImageBase64(): Promise<string | null> {
  const userDataDir = resolveStartupBenchmarkUserDataDir()
  const filePath = resolveVisibleEvidenceClipboardImageFile()
  if (!userDataDir || !filePath) return null

  let canonicalUserDataDir: string
  try {
    canonicalUserDataDir = await realpath(userDataDir)
  } catch {
    canonicalUserDataDir = path.resolve(userDataDir)
  }

  const buffer = await readConfinedImageFile(filePath, [canonicalUserDataDir], {
    requireImageSignature: false
  })
  return buffer ? buffer.toString('base64') : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readOptionalLatency(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function toRouteStageKey(providerId: string, capability: string): string {
  return `${providerId}\u0000${capability}`
}

function extractImageTranslateRouteMetadata(
  run: BoxToolCloudSceneRunResult | null,
  durationMs: number
): CoreBoxImageTranslateRouteMetadata | undefined {
  const runId = readOptionalString(run?.runId)
  const sceneId = readOptionalString(run?.sceneId)
  if (!run || run.status !== 'completed' || !runId || !sceneId) return undefined

  const modelByStage = new Map<string, string>()
  for (const value of run.usage ?? []) {
    if (!isRecord(value)) continue
    const providerId = readOptionalString(value.providerId)
    const capability = readOptionalString(value.capability)
    const model = readOptionalString(value.model)
    if (providerId && capability && model) {
      modelByStage.set(toRouteStageKey(providerId, capability), model)
    }
  }

  const latencyByStage = new Map<string, number>()
  for (const value of run.trace ?? []) {
    if (!isRecord(value) || value.phase !== 'adapter.dispatch' || value.status !== 'success') {
      continue
    }
    const metadata = isRecord(value.metadata) ? value.metadata : null
    const providerId = readOptionalString(metadata?.providerId)
    const capability = readOptionalString(metadata?.capability)
    const latencyMs = readOptionalLatency(metadata?.latencyMs)
    if (providerId && capability && latencyMs !== undefined) {
      latencyByStage.set(toRouteStageKey(providerId, capability), latencyMs)
    }
  }

  const stages: CoreBoxImageTranslateRouteStage[] = []
  const seenStages = new Set<string>()
  for (const value of run.selected ?? []) {
    if (!isRecord(value)) continue
    const providerId = readOptionalString(value.providerId)
    const capability = readOptionalString(value.capability)
    if (!providerId || !capability) continue

    const stageKey = toRouteStageKey(providerId, capability)
    if (seenStages.has(stageKey)) continue
    seenStages.add(stageKey)
    const providerName = readOptionalString(value.providerName)
    const model = modelByStage.get(stageKey)
    const latencyMs = latencyByStage.get(stageKey)
    stages.push({
      capability,
      providerId,
      ...(providerName ? { providerName } : {}),
      ...(model ? { model } : {}),
      ...(latencyMs !== undefined ? { latencyMs } : {})
    })
  }

  return {
    runId,
    sceneId,
    durationMs: Math.max(0, Math.round(durationMs)),
    stages
  }
}

function getMetaRecord(item: TuffItem): Record<string, unknown> | null {
  return isRecord(item.meta) ? item.meta : null
}

function getClipboardRecord(item: TuffItem): Record<string, unknown> | null {
  const raw = getMetaRecord(item)?.raw
  return isRecord(raw) ? raw : null
}

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',')
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value
}

export function normalizeImageBase64Payload(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const payload = trimmed.startsWith('data:image/') ? stripDataUrlPrefix(trimmed) : trimmed
  const normalized = payload.trim()
  return normalized || null
}

async function readImageBase64FromSource(source: string): Promise<string | null> {
  const trimmed = source.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('data:image/')) {
    return normalizeImageBase64Payload(trimmed)
  }

  const localPath = resolveLocalFilePath(trimmed)
  if (!localPath) return null

  const allowedRoots = await resolveAllowedTranslateImageRoots()
  const buffer = await readConfinedImageFile(localPath, allowedRoots, {
    requireImageSignature: true
  })
  return buffer ? buffer.toString('base64') : null
}

export async function translateCoreBoxImageItem(
  item: TuffItem,
  targetLang = 'zh',
  options: { openPinWindow?: boolean } = {}
): Promise<CoreBoxImageTranslateResponse> {
  if (item.kind !== 'image') {
    return {
      success: false,
      code: 'INVALID_ITEM',
      error: 'Only image items can be translated.'
    }
  }

  const record = getClipboardRecord(item)
  const content = typeof record?.content === 'string' ? record.content : null
  const imageBase64 = content ? await readImageBase64FromSource(content) : null
  if (!imageBase64) {
    return {
      success: false,
      code: 'IMAGE_UNAVAILABLE',
      error: 'Image source is unavailable.'
    }
  }

  return await translateImageBase64(imageBase64, targetLang, options)
}

export async function translateClipboardImage(
  targetLang = 'zh',
  options: { openPinWindow?: boolean } = {}
): Promise<CoreBoxImageTranslateResponse> {
  const image = clipboard.readImage()
  if (image.isEmpty()) {
    const visibleEvidenceImageBase64 = await readVisibleEvidenceClipboardImageBase64()
    if (visibleEvidenceImageBase64) {
      return await translateImageBase64(visibleEvidenceImageBase64, targetLang, options)
    }
  }
  if (image.isEmpty()) {
    return {
      success: false,
      code: 'IMAGE_UNAVAILABLE',
      error: 'Clipboard image is unavailable.'
    }
  }

  return await translateImageBase64(image.toPNG().toString('base64'), targetLang, options)
}

export async function translateImageBase64(
  imageBase64: string,
  targetLang = 'zh',
  options: { openPinWindow?: boolean } = {}
): Promise<CoreBoxImageTranslateResponse> {
  const normalizedImageBase64 = normalizeImageBase64Payload(imageBase64)
  if (!normalizedImageBase64) {
    return {
      success: false,
      code: 'IMAGE_UNAVAILABLE',
      error: 'Image source is unavailable.'
    }
  }

  if (isVisibleEvidenceImageTranslateMode()) {
    const translated = {
      translatedImageBase64: VISIBLE_EVIDENCE_TRANSLATED_IMAGE_BASE64,
      imageMimeType: 'image/png',
      sourceText: VISIBLE_EVIDENCE_IMAGE_TRANSLATE_SOURCE_TEXT,
      targetText: VISIBLE_EVIDENCE_IMAGE_TRANSLATE_TARGET_TEXT,
      overlay: { mode: 'client-render' }
    }
    if (options.openPinWindow) {
      await openImageTranslatePinWindow(translated)
    } else {
      clipboard.writeImage(
        nativeImage.createFromBuffer(Buffer.from(translated.translatedImageBase64, 'base64'))
      )
    }
    return {
      success: true,
      translatedImageBase64: translated.translatedImageBase64,
      sourceText: translated.sourceText,
      targetText: translated.targetText
    }
  }

  const sceneStartedAt = Date.now()
  let run: Awaited<ReturnType<typeof runBoxToolCloudScene>>
  try {
    run = await runBoxToolCloudScene(COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID, {
      input: {
        imageBase64: normalizedImageBase64,
        targetLang
      },
      capability: options.openPinWindow ? undefined : 'image.translate.e2e'
    })
  } catch (error) {
    const normalized = normalizeBoxToolIntelligenceError(error, {
      capabilityId: 'image.translate.e2e'
    })
    if (normalized.code === 'UNKNOWN') {
      return {
        success: false,
        code: 'SCENE_UNAVAILABLE',
        error: normalized.message
      }
    }

    return {
      success: false,
      code: normalized.code,
      error: normalized.reason,
      reason: normalized.reason,
      recovery: normalized.recovery
    }
  }
  const sceneDurationMs = Date.now() - sceneStartedAt
  const translated = extractBoxToolTranslatedImageFromSceneRun(run)
  if (!translated) {
    return {
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Nexus image translate scene is unavailable.'
    }
  }

  const metadata = extractImageTranslateRouteMetadata(run, sceneDurationMs)
  const image = nativeImage.createFromBuffer(
    Buffer.from(translated.translatedImageBase64, 'base64')
  )
  if (image.isEmpty()) {
    return {
      success: false,
      code: 'IMAGE_UNAVAILABLE',
      error: 'Translated image payload is invalid.'
    }
  }

  if (options.openPinWindow) {
    await openImageTranslatePinWindow({
      translatedImageBase64: translated.translatedImageBase64,
      imageMimeType: translated.imageMimeType,
      sourceText: translated.sourceText,
      targetText: translated.targetText,
      overlay: translated.overlay
    })
  } else {
    clipboard.writeImage(image)
  }

  return {
    success: true,
    translatedImageBase64: translated.translatedImageBase64,
    sourceText: translated.sourceText,
    targetText: translated.targetText,
    metadata
  }
}
