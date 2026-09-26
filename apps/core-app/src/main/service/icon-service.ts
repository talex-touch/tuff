import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import type { FileIconOptions, NativeImage } from 'electron'
import { app } from 'electron'
import { writeDarwinAppIcon } from '@talex-touch/tuff-native'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { getElectronFileIcon } from '../utils/electron-file-icon'
import { createLogger } from '../utils/logger'
import { resolveVersionedAppIconCachePath } from '../modules/box-tool/addon/apps/app-icon-cache'
import { IconWorkerClient } from '../modules/box-tool/addon/files/workers/icon-worker-client'
import {
  assertFileIconPng,
  FILE_ICON_MAX_BYTES,
  FILE_ICON_MAX_DIMENSION,
  persistFileIconPngArtifact,
  readBoundedFileIconBytes
} from './file-icon-artifact'

const DARWIN_APP_ICON_TARGET_SIZE = 256
const WINDOWS_APP_ICON_TARGET_SIZE = 48
const DEFAULT_FILE_ICON_SIZE = 64
const MIN_FILE_ICON_SIZE = 16
const MAX_FILE_ICON_SIZE = FILE_ICON_MAX_DIMENSION
const MAX_FILE_ICON_INFLIGHT = 64
const MAX_FILE_ICON_CACHE_ENTRIES = 256
const FILE_ICON_CACHE_DIRECTORY_NAME = 'file-icons'
const FILE_ICON_FALLBACK_SUBDIR = ['cache', 'file-icons'] as const
const iconServiceLog = createLogger('IconService')

interface FileIconCacheEntry {
  path: string
  signature: string
}

function getValueFromPlist(content: string, key: string): string | null {
  const regex = new RegExp(`<key>${key}</key>\\s*<string>(.*?)</string>`)
  const match = content.match(regex)
  return match ? match[1] : null
}

function normalizeIconFileName(rawValue: string | null): string | null {
  const normalized = rawValue?.trim()
  if (!normalized || normalized === '(null)') return null
  return normalized.endsWith('.icns') ? normalized : `${normalized}.icns`
}

function normalizeFileIconSize(size?: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_FILE_ICON_SIZE
  const rounded = Math.round(size)
  if (rounded < MIN_FILE_ICON_SIZE) return MIN_FILE_ICON_SIZE
  if (rounded > MAX_FILE_ICON_SIZE) return MAX_FILE_ICON_SIZE
  return rounded
}

function toElectronFileIconSize(size: number): FileIconOptions['size'] {
  if (size <= 32) return 'small'
  if (size <= 128) return 'normal'
  return 'large'
}

function readElectronPath(name: 'cache' | 'userData'): string | null {
  try {
    return app.getPath(name as Parameters<typeof app.getPath>[0]) || null
  } catch {
    return null
  }
}

export class IconService {
  private readonly fileIconWorker = new IconWorkerClient()
  private readonly appIconExtractions = new Map<string, Promise<string | null>>()
  private readonly fileIconInflight = new Map<string, Promise<string | null>>()
  private readonly fileIconCache = new Map<string, FileIconCacheEntry>()
  private fileIconCacheHits = 0
  private fileIconDeferred = 0
  private fileIconGeneratedBytes = 0
  private darwinIconQueue: Promise<void> = Promise.resolve()

  getFileIconWorkerStatus() {
    return this.fileIconWorker.getStatus()
  }

  /**
   * The exact directory that owns generated file icons: Electron's cache root, or the userData-owned
   * fallback. Never the cache root itself, the home directory, the process cwd or a shared temp
   * directory — protocol registration must allow only this root, and there is no third location.
   */
  getFileIconCacheDirectory(): string {
    const cachePath = readElectronPath('cache')
    if (cachePath && path.isAbsolute(cachePath))
      return path.join(cachePath, FILE_ICON_CACHE_DIRECTORY_NAME)

    const userDataPath = readElectronPath('userData')
    if (userDataPath && path.isAbsolute(userDataPath))
      return path.join(userDataPath, ...FILE_ICON_FALLBACK_SUBDIR)

    throw new Error(
      'File icon cache directory is unavailable: Electron cache and userData paths both failed to resolve'
    )
  }

  /** Read-only counters for diagnostics; no icons are produced or retained by reading them. */
  getFileIconCacheStats() {
    return {
      inflight: this.fileIconInflight.size,
      cached: this.fileIconCache.size,
      cacheHits: this.fileIconCacheHits,
      deferred: this.fileIconDeferred,
      generatedBytesCumulative: this.fileIconGeneratedBytes
    }
  }

  /**
   * Resolves a bounded PNG cache path for a file's icon. Admission is reserved synchronously before
   * any asynchronous work — cache validation included: at most {@link MAX_FILE_ICON_INFLIGHT}
   * distinct requests run at once, every caller of the same key joins one registered flight, and
   * over-limit work yields null instead of queuing.
   */
  getFileIconPath(filePath: string, size?: number): Promise<string | null> {
    if (typeof filePath !== 'string' || filePath.length === 0) return Promise.resolve(null)

    const dimension = normalizeFileIconSize(size)
    const cacheKey = `${path.resolve(filePath)}\u0000${dimension}`

    const inflight = this.fileIconInflight.get(cacheKey)
    if (inflight) return inflight

    if (this.fileIconInflight.size >= MAX_FILE_ICON_INFLIGHT) {
      this.fileIconDeferred += 1
      return Promise.resolve(null)
    }

    const flight = Promise.withResolvers<string | null>()
    this.fileIconInflight.set(cacheKey, flight.promise)
    void this.produceFileIconPath(filePath, dimension, cacheKey).then(
      (iconPath) => {
        this.fileIconInflight.delete(cacheKey)
        flight.resolve(iconPath)
      },
      () => {
        this.fileIconInflight.delete(cacheKey)
        flight.resolve(null)
      }
    )

    return flight.promise
  }

  getSystemFileIcon(filePath: string, options?: FileIconOptions): Promise<NativeImage | null> {
    return getElectronFileIcon(filePath, options)
  }

  async getCachedAppIcon(appPath: string, bundleId: string): Promise<string | null> {
    if (process.platform !== 'darwin' && process.platform !== 'win32') return null

    const cachedIconPath = resolveVersionedAppIconCachePath(appPath, bundleId, process.platform)
    if (!cachedIconPath) return null
    try {
      await fs.access(cachedIconPath)
      return cachedIconPath
    } catch {
      return null
    }
  }

  ensureAppIcon(appPath: string, bundleId: string): Promise<string | null> {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      return Promise.resolve(null)
    }

    const cachePath = resolveVersionedAppIconCachePath(appPath, bundleId, process.platform)
    if (!cachePath) return Promise.resolve(null)
    const pending = this.appIconExtractions.get(cachePath)
    if (pending) return pending

    const renderTask =
      process.platform === 'darwin'
        ? this.renderDarwinAppIcon(appPath, cachePath)
        : this.renderWindowsAppIcon(appPath, cachePath)
    const task = renderTask
      .catch((error) => {
        iconServiceLog.warn('Failed to hydrate app icon', {
          error,
          meta: { pathLength: appPath.length }
        })
        return null
      })
      .finally(() => {
        this.appIconExtractions.delete(cachePath)
      })

    this.appIconExtractions.set(cachePath, task)
    return task
  }

  /**
   * Windows app icons are extracted by the worker straight into a bounded staging file inside the
   * app-icon cache, validated, and only then promoted to the versioned cache path.
   */
  private async renderWindowsAppIcon(
    appPath: string,
    cachedIconPath: string
  ): Promise<string | null> {
    try {
      await fs.access(cachedIconPath)
      return cachedIconPath
    } catch {
      // Cache miss; extract below.
    }

    await fs.mkdir(path.dirname(cachedIconPath), { recursive: true })
    const stagedPath = `${cachedIconPath}.${process.pid}.${randomUUID()}.tmp`

    try {
      const written =
        (await this.fileIconWorker.extractToFile(
          appPath,
          stagedPath,
          WINDOWS_APP_ICON_TARGET_SIZE
        )) ?? (await this.fileIconWorker.extractToFile(appPath, stagedPath, 32))
      if (!written || path.resolve(written) !== path.resolve(stagedPath)) return null

      const bytes = await readBoundedFileIconBytes(stagedPath)
      if (!bytes) return null
      assertFileIconPng(bytes)

      await fs.rename(stagedPath, cachedIconPath)
      return cachedIconPath
    } finally {
      await fs.rm(stagedPath, { force: true }).catch(() => undefined)
    }
  }

  private async renderDarwinAppIcon(
    appPath: string,
    cachedIconPath: string
  ): Promise<string | null> {
    try {
      await fs.access(cachedIconPath)
      return cachedIconPath
    } catch {
      // Cache miss; render below.
    }

    const sourceIconPath = await this.findDarwinAppIconSourcePath(appPath)
    if (sourceIconPath && (await this.renderIconWithSips(sourceIconPath, cachedIconPath))) {
      return cachedIconPath
    }

    if (await this.renderDarwinNativeIcon(appPath, cachedIconPath)) {
      return cachedIconPath
    }

    return null
  }

  private async findDarwinAppIconSourcePath(appPath: string): Promise<string | null> {
    const resourcesPath = path.join(appPath, 'Contents', 'Resources')
    const plistPath = path.join(appPath, 'Contents', 'Info.plist')
    const plistContent = await fs.readFile(plistPath, 'utf8').catch(() => '')
    const iconNames = [
      normalizeIconFileName(getValueFromPlist(plistContent, 'CFBundleIconFile')),
      normalizeIconFileName(getValueFromPlist(plistContent, 'CFBundleIconName'))
    ].filter((value): value is string => Boolean(value))

    for (const iconName of iconNames) {
      const iconPath = path.join(resourcesPath, iconName)
      try {
        await fs.access(iconPath)
        return iconPath
      } catch {
        // Continue to the directory fallback.
      }
    }

    try {
      const entries = await fs.readdir(resourcesPath)
      const fallbackIcon = entries.find((entry) => entry.toLowerCase().endsWith('.icns'))
      return fallbackIcon ? path.join(resourcesPath, fallbackIcon) : null
    } catch {
      return null
    }
  }

  private async renderIconWithSips(
    sourceIconPath: string,
    cachedIconPath: string
  ): Promise<boolean> {
    try {
      await fs.mkdir(path.dirname(cachedIconPath), { recursive: true })
      await execFileSafe('sips', [
        '-Z',
        String(DARWIN_APP_ICON_TARGET_SIZE),
        '-s',
        'format',
        'png',
        sourceIconPath,
        '--out',
        cachedIconPath
      ])
      await fs.access(cachedIconPath)
      return true
    } catch {
      return false
    }
  }

  private renderDarwinNativeIcon(appPath: string, cachedIconPath: string): Promise<boolean> {
    return this.runSerializedDarwinIconWrite(async () => {
      try {
        const result = await writeDarwinAppIcon({
          sourcePath: appPath,
          outputPath: cachedIconPath,
          size: DARWIN_APP_ICON_TARGET_SIZE
        })
        if (path.resolve(result.path) !== path.resolve(cachedIconPath)) {
          iconServiceLog.warn('Native app icon writer returned an unexpected cache path', {
            meta: { pathLength: appPath.length }
          })
          return false
        }

        await fs.access(cachedIconPath)
        return true
      } catch (error) {
        iconServiceLog.debug('Native app icon extraction failed', {
          meta: {
            pathLength: appPath.length,
            error: error instanceof Error ? error.message : String(error)
          }
        })
        return false
      }
    })
  }

  /** AppKit extraction is main-thread-only, so every native write runs one at a time. */
  private runSerializedDarwinIconWrite<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.darwinIconQueue.then(operation)
    this.darwinIconQueue = task.then(
      () => undefined,
      () => undefined
    )
    return task
  }

  /**
   * Runs inside a registered flight, so cache validation and provenance are covered by the same
   * admission slot and are never duplicated for a key.
   */
  private async produceFileIconPath(
    filePath: string,
    dimension: number,
    cacheKey: string
  ): Promise<string | null> {
    const cached = this.fileIconCache.get(cacheKey)
    if (cached && (await this.isFileIconCacheEntryValid(cacheKey, cached, filePath))) {
      this.fileIconCacheHits += 1
      return cached.path
    }

    const entry = await this.produceFileIconEntry(filePath, dimension)
    if (entry) this.rememberFileIconEntry(cacheKey, entry)
    return entry?.path ?? null
  }

  private async produceFileIconEntry(
    filePath: string,
    size: number
  ): Promise<FileIconCacheEntry | null> {
    const signature = await this.readFileIconSourceSignature(filePath)
    if (!signature) return null

    try {
      const iconPath = await this.produceFileIconFile(filePath, size)
      return iconPath ? { path: iconPath, signature } : null
    } catch (error) {
      iconServiceLog.debug('File icon production failed', {
        meta: {
          pathLength: filePath.length,
          error: error instanceof Error ? error.message : String(error)
        }
      })
      return null
    }
  }

  private async produceFileIconFile(filePath: string, size: number): Promise<string | null> {
    const cacheDirectory = this.getFileIconCacheDirectory()
    await fs.mkdir(cacheDirectory, { recursive: true })

    if (process.platform === 'darwin') {
      return this.produceStagedFileIcon(cacheDirectory, (stagedPath) =>
        this.writeDarwinFileIconStaged(filePath, stagedPath, size)
      )
    }
    if (process.platform === 'win32') {
      return this.produceStagedFileIcon(cacheDirectory, async (stagedPath) => {
        const written = await this.fileIconWorker.extractToFile(filePath, stagedPath, size)
        if (!written) return false
        return path.resolve(written) === path.resolve(stagedPath)
      })
    }

    return this.produceElectronFileIcon(filePath, size, cacheDirectory)
  }

  /**
   * Promotes a staging file written by native or worker extraction: the disk read is bounded before
   * allocation and the bytes are validated by {@link persistFileIconPngArtifact} before they are
   * published.
   */
  private async produceStagedFileIcon(
    cacheDirectory: string,
    writeStaged: (stagedPath: string) => Promise<boolean>
  ): Promise<string | null> {
    const stagedPath = path.join(cacheDirectory, `.tmp-${process.pid}-${randomUUID()}.png`)
    try {
      if (!(await writeStaged(stagedPath))) return null

      const bytes = await readBoundedFileIconBytes(stagedPath)
      if (!bytes) return null
      return await this.persistFileIconArtifact(bytes, cacheDirectory)
    } finally {
      await fs.rm(stagedPath, { force: true }).catch(() => undefined)
    }
  }

  private async persistFileIconArtifact(
    bytes: Uint8Array,
    cacheDirectory: string
  ): Promise<string> {
    const artifact = await persistFileIconPngArtifact(bytes, cacheDirectory)
    if (artifact.created) {
      this.fileIconGeneratedBytes += artifact.bytes
    }
    return artifact.path
  }

  private writeDarwinFileIconStaged(
    filePath: string,
    stagedPath: string,
    size: number
  ): Promise<boolean> {
    return this.runSerializedDarwinIconWrite(async () => {
      try {
        const result = await writeDarwinAppIcon({
          sourcePath: filePath,
          outputPath: stagedPath,
          size
        })
        if (path.resolve(result.path) !== path.resolve(stagedPath)) {
          iconServiceLog.warn('Native file icon writer returned an unexpected cache path', {
            meta: { pathLength: filePath.length }
          })
          return false
        }
        if (
          result.width <= 0 ||
          result.height <= 0 ||
          result.width > MAX_FILE_ICON_SIZE ||
          result.height > MAX_FILE_ICON_SIZE
        ) {
          return false
        }

        const stat = await fs.stat(stagedPath).catch(() => null)
        return Boolean(stat?.isFile() && stat.size > 0 && stat.size <= FILE_ICON_MAX_BYTES)
      } catch (error) {
        iconServiceLog.debug('Native file icon extraction failed', {
          meta: {
            pathLength: filePath.length,
            error: error instanceof Error ? error.message : String(error)
          }
        })
        return false
      }
    })
  }

  private async produceElectronFileIcon(
    filePath: string,
    size: number,
    cacheDirectory: string
  ): Promise<string | null> {
    const image = await getElectronFileIcon(filePath, {
      size: toElectronFileIconSize(size)
    }).catch(() => null)
    if (!image || image.isEmpty()) return null

    const bytes = image.toPNG()
    if (!bytes || bytes.byteLength === 0) return null
    return await this.persistFileIconArtifact(bytes, cacheDirectory)
  }

  private async readFileIconSourceSignature(filePath: string): Promise<string | null> {
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat) return null
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
  }

  private async isFileIconCacheEntryValid(
    cacheKey: string,
    entry: FileIconCacheEntry,
    filePath: string
  ): Promise<boolean> {
    const signature = await this.readFileIconSourceSignature(filePath)
    if (signature === entry.signature) {
      try {
        await fs.access(entry.path)
        return true
      } catch {
        // The generated file disappeared; re-extract it.
      }
    }

    this.fileIconCache.delete(cacheKey)
    return false
  }

  private rememberFileIconEntry(cacheKey: string, entry: FileIconCacheEntry): void {
    this.fileIconCache.delete(cacheKey)
    this.fileIconCache.set(cacheKey, entry)

    while (this.fileIconCache.size > MAX_FILE_ICON_CACHE_ENTRIES) {
      const oldestKey = this.fileIconCache.keys().next().value
      if (oldestKey === undefined) break
      this.fileIconCache.delete(oldestKey)
    }
  }
}

export const iconService = new IconService()
