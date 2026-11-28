import type {
  NativeFileActionResult,
  NativeFilePathRequest,
  NativeFileResourceRequest,
  NativeFileStatResult,
  NativeFileTfileResult,
  NativeMediaKind,
  NativeMediaProbeResult,
  NativeResourceRef
} from '@talex-touch/utils/transport/events/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveLocalFilePath, toTfileUrl } from '@talex-touch/utils/network'
import { dialog, nativeImage, shell } from 'electron'
import {
  IMAGE_THUMBNAIL_EXTENSIONS,
  VIDEO_THUMBNAIL_EXTENSIONS,
  getThumbnailUnsupportedReason,
  isThumbnailCandidate
} from '../../shared/thumbnail-policy'
import { createLogger } from '../../utils/logger'
import { getNativeCapabilitiesPorts } from './native-capabilities-ports'

const nativeFileLog = createLogger('NativeFile')

type CodedError = Error & { code?: string }

const IMAGE_EXTENSIONS = new Set([...IMAGE_THUMBNAIL_EXTENSIONS, 'svg', 'ico'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'])
const VIDEO_EXTENSIONS = new Set([...VIDEO_THUMBNAIL_EXTENSIONS])

/**
 * Executable, script, installer, shortcut, and macOS bundle extensions that plugin callers
 * must never launch via `shell.openPath()`.
 */
const BLOCKED_PLUGIN_OPEN_EXTENSIONS = new Set([
  'action',
  'app',
  'appex',
  'appimage',
  'applescript',
  'application',
  'appref-ms',
  'appx',
  'appxbundle',
  'bash',
  'bat',
  'bin',
  'bundle',
  'chm',
  'cmd',
  'com',
  'command',
  'cpl',
  'csh',
  'desktop',
  'diagcab',
  'dll',
  'dmg',
  'dylib',
  'exe',
  'fileloc',
  'fish',
  'hta',
  'inetloc',
  'inf',
  'iso',
  'jar',
  'jnlp',
  'js',
  'jse',
  'ksh',
  'library-ms',
  'lnk',
  'mobileconfig',
  'mpkg',
  'msc',
  'msi',
  'msix',
  'msixbundle',
  'msp',
  'osa',
  'out',
  'pif',
  'pkg',
  'prefpane',
  'ps1',
  'psd1',
  'psm1',
  'py',
  'pyw',
  'reg',
  'run',
  'scf',
  'scpt',
  'scptd',
  'scr',
  'sct',
  'search-ms',
  'service',
  'settingcontent-ms',
  'sh',
  'so',
  'sparsebundle',
  'sparseimage',
  'terminal',
  'tool',
  'url',
  'vbe',
  'vbs',
  'webloc',
  'workflow',
  'wsc',
  'wsf',
  'wsh',
  'xbap',
  'xip',
  'zsh'
])

export interface NativeFileOpenCallerOptions {
  isPluginCaller?: boolean
  pluginName?: string
  confirmPluginOpen?: (targetPath: string, pluginName?: string) => Promise<boolean>
}

function getSecurityExtension(filePath: string): string {
  // Windows strips trailing dots and spaces when resolving filenames (e.g. "run.bat." -> "run.bat").
  const trimmed = filePath.replace(/[\\/]+$/, '').replace(/[. ]+$/, '')
  return path.extname(trimmed).replace(/^\./, '').toLowerCase()
}

async function resolveRealPathForPluginOpen(filePath: string): Promise<string> {
  if (typeof fs.realpath !== 'function') {
    throw createCodedError(
      'Unable to resolve canonical file path for plugin open',
      'ERR_NATIVE_FILE_OPEN_BLOCKED'
    )
  }
  try {
    return await fs.realpath(filePath)
  } catch (error) {
    const coded = createCodedError(
      'Unable to resolve canonical file path for plugin open',
      'ERR_NATIVE_FILE_OPEN_BLOCKED'
    )
    coded.cause = error
    throw coded
  }
}

function isBlockedPluginOpenTarget(
  requestedPath: string,
  resolvedPath: string,
  stats: Awaited<ReturnType<typeof fs.stat>>
): boolean {
  if (
    BLOCKED_PLUGIN_OPEN_EXTENSIONS.has(getSecurityExtension(requestedPath)) ||
    BLOCKED_PLUGIN_OPEN_EXTENSIONS.has(getSecurityExtension(resolvedPath))
  ) {
    return true
  }
  if (
    process.platform !== 'win32' &&
    stats.isFile() &&
    typeof stats.mode === 'number' &&
    (stats.mode & 0o111) !== 0
  ) {
    return true
  }
  return false
}

async function validatePluginOpenTarget(filePath: string): Promise<{ resolvedPath: string }> {
  const resolvedPath = await resolveRealPathForPluginOpen(filePath)
  const stats = await getFileStats(resolvedPath)
  if (isBlockedPluginOpenTarget(filePath, resolvedPath, stats)) {
    throw createCodedError(
      'Opening executable, script, or application package files is blocked for plugin callers',
      'ERR_NATIVE_FILE_OPEN_BLOCKED'
    )
  }
  return { resolvedPath }
}

async function confirmPluginFileOpen(targetPath: string, pluginName?: string): Promise<boolean> {
  if (!dialog || typeof dialog.showMessageBox !== 'function') {
    return false
  }
  const callerLabel = pluginName ? `Plugin "${pluginName}"` : 'A plugin'
  const result = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Open', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Confirm File Open',
    message: `${callerLabel} wants to open "${path.basename(targetPath)}".`,
    detail: targetPath
  })
  return result.response === 0
}

function createCodedError(message: string, code: string): CodedError {
  const error = new Error(message) as CodedError
  error.code = code
  return error
}

function normalizePathRequest(request: NativeFilePathRequest): string {
  const rawPath = typeof request?.path === 'string' ? request.path.trim() : ''
  if (!rawPath) {
    throw createCodedError('File path is required', 'ERR_NATIVE_FILE_PATH_REQUIRED')
  }
  return path.resolve(resolveLocalFilePath(rawPath) ?? rawPath)
}

function getExtension(filePath: string): string {
  return path.extname(filePath).replace(/^\./, '').toLowerCase()
}

function getMimeType(filePath: string): string {
  switch (getExtension(filePath)) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    case 'tif':
    case 'tiff':
      return 'image/tiff'
    case 'svg':
      return 'image/svg+xml'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'flac':
      return 'audio/flac'
    case 'aac':
      return 'audio/aac'
    case 'm4a':
      return 'audio/mp4'
    case 'ogg':
    case 'opus':
      return 'audio/ogg'
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'mkv':
      return 'video/x-matroska'
    case 'webm':
      return 'video/webm'
    case 'avi':
      return 'video/x-msvideo'
    case 'wmv':
      return 'video/x-ms-wmv'
    case 'flv':
      return 'video/x-flv'
    default:
      return 'application/octet-stream'
  }
}

function inferMediaKind(filePath: string): NativeMediaKind {
  const extension = getExtension(filePath)
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  return 'unknown'
}

function toIso(value: Date): string {
  return value.toISOString()
}

function toNumberSize(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value
}

async function getFileStats(filePath: string): Promise<Awaited<ReturnType<typeof fs.stat>>> {
  try {
    return await fs.stat(filePath)
  } catch (error) {
    const coded = createCodedError('File does not exist', 'ERR_NATIVE_FILE_NOT_FOUND')
    coded.cause = error
    throw coded
  }
}

async function readImageDimensions(filePath: string): Promise<{ width?: number; height?: number }> {
  try {
    const image = nativeImage.createFromPath(filePath)
    if (image.isEmpty()) return {}
    const size = image.getSize()
    return {
      width: size.width,
      height: size.height
    }
  } catch {
    return {}
  }
}

async function buildThumbnailRef(
  filePath: string,
  output: NativeFileResourceRequest['output']
): Promise<NativeResourceRef> {
  const stats = await getFileStats(filePath)
  if (!stats.isFile()) {
    throw createCodedError('Thumbnail target must be a file', 'ERR_NATIVE_FILE_NOT_FILE')
  }

  const extension = getExtension(filePath)
  const mimeType = getMimeType(filePath)
  const startedAt = performance.now()
  const sizeBytes = toNumberSize(stats.size)
  const canGenerate = isThumbnailCandidate(extension, sizeBytes)
  const unsupportedReason = getThumbnailUnsupportedReason(extension, sizeBytes)

  if (canGenerate) {
    try {
      const thumbnail = await getNativeCapabilitiesPorts().thumbnail.generate(filePath, {
        extension,
        sizeBytes
      })
      if (thumbnail.status === 'generated') {
        if (output === 'data-url') {
          const data = await fs.readFile(thumbnail.path)
          return {
            kind: 'data-url',
            url: `data:${thumbnail.mimeType};base64,${data.toString('base64')}`,
            mimeType: thumbnail.mimeType,
            sizeBytes: data.length,
            width: thumbnail.width,
            height: thumbnail.height,
            durationMs: thumbnail.durationMs
          }
        }

        return {
          kind: 'tfile',
          url: toTfileUrl(thumbnail.path),
          path: thumbnail.path,
          mimeType: thumbnail.mimeType,
          sizeBytes: thumbnail.sizeBytes,
          width: thumbnail.width,
          height: thumbnail.height,
          durationMs: thumbnail.durationMs
        }
      }

      nativeFileLog.debug('Native thumbnail unavailable', {
        meta: {
          platform: process.platform,
          extension,
          sizeBytes,
          status: thumbnail.status,
          reason: thumbnail.reason
        }
      })
      return {
        kind: 'tfile',
        url: toTfileUrl(filePath),
        path: filePath,
        mimeType,
        sizeBytes,
        durationMs: Math.round(performance.now() - startedAt),
        metadata: {
          degraded: true,
          reason: thumbnail.reason
        }
      }
    } catch (error) {
      nativeFileLog.warn('Native thumbnail generation failed', {
        meta: {
          platform: process.platform,
          extension,
          sizeBytes,
          errorCode: (error as CodedError | null)?.code ?? null
        }
      })
    }
  }

  return {
    kind: 'tfile',
    url: toTfileUrl(filePath),
    path: filePath,
    mimeType,
    sizeBytes,
    durationMs: Math.round(performance.now() - startedAt),
    metadata: {
      degraded: true,
      reason: canGenerate ? 'thumbnail-generation-failed' : unsupportedReason
    }
  }
}

export class NativeFileService {
  async stat(request: NativeFilePathRequest): Promise<NativeFileStatResult> {
    const filePath = normalizePathRequest(request)
    const stats = await getFileStats(filePath)
    const isFile = stats.isFile()
    return {
      path: filePath,
      name: path.basename(filePath),
      extension: getExtension(filePath),
      exists: true,
      isFile,
      isDirectory: stats.isDirectory(),
      sizeBytes: toNumberSize(stats.size),
      createdAt: toIso(stats.birthtime),
      modifiedAt: toIso(stats.mtime),
      mimeType: isFile ? getMimeType(filePath) : 'inode/directory',
      tfileUrl: toTfileUrl(filePath)
    }
  }

  async reveal(request: NativeFilePathRequest): Promise<NativeFileActionResult> {
    const filePath = normalizePathRequest(request)
    await getFileStats(filePath)
    shell.showItemInFolder(filePath)
    return { path: filePath, success: true }
  }

  async open(
    request: NativeFilePathRequest,
    callerOptions?: NativeFileOpenCallerOptions
  ): Promise<NativeFileActionResult> {
    const filePath = normalizePathRequest(request)
    await getFileStats(filePath)
    let targetPathToOpen = filePath
    if (callerOptions?.isPluginCaller) {
      const { resolvedPath: resolvedBefore } = await validatePluginOpenTarget(filePath)
      const confirmFn = callerOptions.confirmPluginOpen ?? confirmPluginFileOpen
      const approved = await confirmFn(resolvedBefore, callerOptions.pluginName)
      if (!approved) {
        throw createCodedError(
          'Opening file was declined by the user',
          'ERR_NATIVE_FILE_OPEN_DECLINED'
        )
      }
      const { resolvedPath: resolvedAfter } = await validatePluginOpenTarget(filePath)
      if (resolvedAfter !== resolvedBefore) {
        throw createCodedError(
          'File target changed during user confirmation',
          'ERR_NATIVE_FILE_OPEN_BLOCKED'
        )
      }
      targetPathToOpen = resolvedAfter
    }
    const message = await shell.openPath(targetPathToOpen)
    return {
      path: targetPathToOpen,
      success: !message,
      message: message || undefined
    }
  }

  async getIcon(request: NativeFileResourceRequest): Promise<NativeResourceRef> {
    const filePath = normalizePathRequest(request)
    const stats = await getFileStats(filePath)
    const startedAt = performance.now()
    const icon = await nativeImage.createThumbnailFromPath(filePath, { width: 64, height: 64 })
    if (icon.isEmpty()) {
      return {
        kind: 'path',
        path: filePath,
        url: pathToFileURL(filePath).toString(),
        sizeBytes: toNumberSize(stats.size),
        mimeType: stats.isDirectory() ? 'inode/directory' : getMimeType(filePath),
        durationMs: Math.round(performance.now() - startedAt),
        metadata: { degraded: true, reason: 'icon-unavailable' }
      }
    }

    const dataUrl = icon.toDataURL()
    return {
      kind: 'data-url',
      url: dataUrl,
      mimeType: 'image/png',
      sizeBytes: Buffer.byteLength(dataUrl),
      durationMs: Math.round(performance.now() - startedAt)
    }
  }

  async getThumbnail(request: NativeFileResourceRequest): Promise<NativeResourceRef> {
    const filePath = normalizePathRequest(request)
    return await buildThumbnailRef(filePath, request.output)
  }

  async toTfile(request: NativeFilePathRequest): Promise<NativeFileTfileResult> {
    const filePath = normalizePathRequest(request)
    const stats = await getFileStats(filePath)
    return {
      ref: {
        kind: 'tfile',
        url: toTfileUrl(filePath),
        path: filePath,
        mimeType: stats.isDirectory() ? 'inode/directory' : getMimeType(filePath),
        sizeBytes: toNumberSize(stats.size)
      }
    }
  }

  async probeMedia(request: NativeFilePathRequest): Promise<NativeMediaProbeResult> {
    const filePath = normalizePathRequest(request)
    const stats = await getFileStats(filePath)
    if (!stats.isFile()) {
      throw createCodedError('Media target must be a file', 'ERR_NATIVE_MEDIA_NOT_FILE')
    }

    const kind = inferMediaKind(filePath)
    const dimensions = kind === 'image' ? await readImageDimensions(filePath) : {}
    const mimeType = getMimeType(filePath)
    return {
      path: filePath,
      name: path.basename(filePath),
      extension: getExtension(filePath),
      kind,
      mimeType,
      sizeBytes: toNumberSize(stats.size),
      createdAt: toIso(stats.birthtime),
      modifiedAt: toIso(stats.mtime),
      ...dimensions,
      ref: {
        kind: 'tfile',
        url: toTfileUrl(filePath),
        path: filePath,
        mimeType,
        sizeBytes: toNumberSize(stats.size),
        width: dimensions.width,
        height: dimensions.height
      },
      metadata: {
        degraded: kind !== 'image' && kind !== 'video',
        reason: kind === 'image' || kind === 'video' ? undefined : 'v1-metadata-only'
      }
    }
  }

  async getMediaThumbnail(request: NativeFileResourceRequest): Promise<NativeResourceRef> {
    const filePath = normalizePathRequest(request)
    const kind = inferMediaKind(filePath)
    if (kind !== 'image' && kind !== 'video') {
      const stats = await getFileStats(filePath)
      return {
        kind: 'tfile',
        url: toTfileUrl(filePath),
        path: filePath,
        mimeType: getMimeType(filePath),
        sizeBytes: toNumberSize(stats.size),
        metadata: {
          degraded: true,
          reason: 'unsupported-thumbnail-type'
        }
      }
    }
    return await buildThumbnailRef(filePath, request.output)
  }
}

export const nativeFileService = new NativeFileService()
