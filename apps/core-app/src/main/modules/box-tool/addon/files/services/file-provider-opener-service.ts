import type { OpenerInfo } from '@talex-touch/utils'
import type { DbUtils } from '../../../../../db/utils'
import { fileExtensions, files as filesSchema } from '../../../../../db/schema'
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { and, eq } from 'drizzle-orm'
import plist from 'plist'

const execFileAsync = promisify(execFile)

export interface ResolvedOpener {
  bundleId: string
  name: string
  logo: string
  path?: string
  lastResolvedAt: string
}

type LaunchServicesRoleKey = 'LSHandlerRoleAll' | 'LSHandlerRoleViewer' | 'LSHandlerRoleEditor'

type LaunchServicesHandler = {
  LSHandlerContentTag?: string
  LSHandlerContentTagClass?: string
  LSHandlerContentType?: string
  LSHandlerRoleAll?: string
  LSHandlerRoleViewer?: string
  LSHandlerRoleEditor?: string
  LSHandlerPreferredVersions?: Partial<Record<LaunchServicesRoleKey, string>>
}

export interface FileProviderOpenerServiceDeps {
  emptyLogo: string
  enableFileIconExtraction: boolean
  getDbUtils: () => DbUtils | null
  withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  getStoredOpeners: () => Record<string, OpenerInfo>
  saveStoredOpeners: (next: Record<string, OpenerInfo>) => void
  extractFileIconQueued: (filePath: string) => Promise<Buffer | null>
  isValidBase64DataUrl: (value: string) => boolean
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  logError: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

const LAUNCH_SERVICES_PLIST_PATH = path.join(
  os.homedir(),
  'Library',
  'Preferences',
  'com.apple.LaunchServices',
  'com.apple.launchservices.secure.plist'
)

export class FileProviderOpenerService {
  private readonly emptyLogo: string
  private readonly enableFileIconExtraction: boolean
  private readonly getDbUtils: FileProviderOpenerServiceDeps['getDbUtils']
  private readonly withDbWrite: FileProviderOpenerServiceDeps['withDbWrite']
  private readonly getStoredOpeners: FileProviderOpenerServiceDeps['getStoredOpeners']
  private readonly saveStoredOpeners: FileProviderOpenerServiceDeps['saveStoredOpeners']
  private readonly extractFileIconQueued: FileProviderOpenerServiceDeps['extractFileIconQueued']
  private readonly isValidBase64DataUrl: FileProviderOpenerServiceDeps['isValidBase64DataUrl']
  private readonly logWarn: FileProviderOpenerServiceDeps['logWarn']
  private readonly logError: FileProviderOpenerServiceDeps['logError']

  private launchServicesLoadPromise: Promise<LaunchServicesHandler[]> | null = null
  private launchServicesHandlers: LaunchServicesHandler[] | null = null
  private launchServicesMTime?: number
  private readonly openerNegativeCache = new Map<string, number>()
  private readonly openerResolveConcurrency = 2
  private openerResolveInFlight = 0
  private openerResolveWaiters: Array<() => void> = []
  private readonly openerCache = new Map<string, ResolvedOpener>()
  private readonly openerPromises = new Map<string, Promise<ResolvedOpener | null>>()
  private readonly openerIconJobs = new Map<string, Promise<void>>()
  private readonly utiCache = new Map<string, string | null>()
  private readonly bundleIdCache = new Map<string, string | null>()

  constructor(deps: FileProviderOpenerServiceDeps) {
    this.emptyLogo = deps.emptyLogo
    this.enableFileIconExtraction = deps.enableFileIconExtraction
    this.getDbUtils = deps.getDbUtils
    this.withDbWrite = deps.withDbWrite
    this.getStoredOpeners = deps.getStoredOpeners
    this.saveStoredOpeners = deps.saveStoredOpeners
    this.extractFileIconQueued = deps.extractFileIconQueued
    this.isValidBase64DataUrl = deps.isValidBase64DataUrl
    this.logWarn = deps.logWarn
    this.logError = deps.logError
  }

  async withOpenerResolveSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.openerResolveInFlight >= this.openerResolveConcurrency) {
      await new Promise<void>((resolve) => {
        this.openerResolveWaiters.push(resolve)
      })
    }

    this.openerResolveInFlight += 1
    try {
      return await task()
    } finally {
      this.openerResolveInFlight -= 1
      const next = this.openerResolveWaiters.shift()
      if (next) {
        next()
      }
    }
  }

  isNegativeCached(extension: string): boolean {
    const expiresAt = this.openerNegativeCache.get(extension)
    if (!expiresAt) {
      return false
    }
    if (expiresAt <= Date.now()) {
      this.openerNegativeCache.delete(extension)
      return false
    }
    return true
  }

  markNegativeCache(extension: string): void {
    const ttlMs = 10 * 60 * 1000
    this.openerNegativeCache.set(extension, Date.now() + ttlMs)
  }

  async getOpenerForExtension(rawExtension: string): Promise<ResolvedOpener | null> {
    const normalized = normalizeOpenerExtension(rawExtension)
    if (!normalized) {
      return null
    }

    if (this.openerCache.has(normalized)) {
      return this.openerCache.get(normalized)!
    }

    const stored = this.getOpenerFromStorageByExtension(normalized)
    if (stored) {
      const opener: ResolvedOpener = {
        bundleId: stored.bundleId,
        name: stored.name,
        logo: this.resolveOpenerLogo(stored.logo),
        path: stored.path,
        lastResolvedAt: stored.lastResolvedAt ?? new Date().toISOString()
      }
      this.openerCache.set(normalized, opener)
      return opener
    }

    if (this.isNegativeCached(normalized)) {
      return null
    }

    let pending = this.openerPromises.get(normalized)
    if (!pending) {
      pending = this.withOpenerResolveSlot(async () => {
        try {
          const result = await this.resolveOpener(normalized)
          if (!result) {
            this.markNegativeCache(normalized)
          }
          return result
        } catch (error) {
          this.markNegativeCache(normalized)
          throw error
        }
      })
      this.openerPromises.set(normalized, pending)
    }

    let result: ResolvedOpener | null = null
    try {
      result = await pending
    } finally {
      this.openerPromises.delete(normalized)
    }

    if (result) {
      this.openerCache.set(normalized, result)
    }

    return result
  }

  async resolveOpener(extension: string): Promise<ResolvedOpener | null> {
    if (process.platform !== 'darwin') {
      return null
    }

    const sanitized = sanitizeOpenerExtension(extension)
    if (!sanitized) {
      return null
    }

    const bundleId = await this.getBundleIdForExtension(sanitized)
    if (!bundleId) {
      return null
    }

    const appInfo = await this.getAppInfoByBundleId(bundleId)
    if (!appInfo) {
      return null
    }

    let logo = appInfo.logo
    if (!logo) {
      const cached = this.getOpenerFromStorage(sanitized, bundleId)
      if (cached?.logo) {
        logo = cached.logo
        if (appInfo.fileId) {
          this.persistOpenerIcon(appInfo.fileId, cached.logo)
        }
      }
    }

    if (!logo && appInfo.path && this.enableFileIconExtraction) {
      this.scheduleOpenerIconUpdate(sanitized, bundleId, appInfo)
    }

    const opener: ResolvedOpener = {
      bundleId,
      name: appInfo.name,
      logo: this.resolveOpenerLogo(logo),
      path: appInfo.path,
      lastResolvedAt: new Date().toISOString()
    }

    this.persistOpenerToStorage(sanitized, opener)
    return opener
  }

  resolveOpenerLogo(logo?: string | null): string {
    if (logo && logo.trim().length > 0) {
      return logo
    }
    return this.emptyLogo
  }

  getOpenerFromStorageByExtension(extension: string): OpenerInfo | null {
    try {
      const entry = this.getStoredOpeners()[extension]
      return entry ?? null
    } catch (error) {
      this.logWarn('Failed to read openers cache', error, { extension })
      return null
    }
  }

  getOpenerFromStorage(extension: string, bundleId: string): OpenerInfo | null {
    try {
      const entry = this.getStoredOpeners()[extension]
      if (!entry || entry.bundleId !== bundleId) {
        return null
      }
      return entry
    } catch (error) {
      this.logWarn('Failed to read openers cache', error, { extension })
      return null
    }
  }

  persistOpenerIcon(fileId: number, logo: string): void {
    const dbUtils = this.getDbUtils()
    if (!dbUtils || !logo) {
      return
    }

    const db = dbUtils.getDb()
    void this.withDbWrite('file-opener.icon.persist', () =>
      db
        .insert(fileExtensions)
        .values({
          fileId,
          key: 'icon',
          value: logo
        })
        .onConflictDoUpdate({
          target: [fileExtensions.fileId, fileExtensions.key],
          set: { value: logo }
        })
    ).catch((error) => {
      this.logWarn('Failed to persist opener icon', error, { fileId })
    })
  }

  persistOpenerToStorage(extension: string, opener: OpenerInfo): void {
    try {
      const current = this.getStoredOpeners()
      const existing = current[extension]
      const next = { ...existing, ...opener }

      if (
        existing &&
        existing.logo === next.logo &&
        existing.bundleId === next.bundleId &&
        existing.name === next.name &&
        existing.path === next.path &&
        existing.lastResolvedAt === next.lastResolvedAt
      ) {
        return
      }

      this.saveStoredOpeners({ ...current, [extension]: next })
    } catch (error) {
      this.logWarn('Failed to persist opener cache', error, { extension })
    }
  }

  scheduleOpenerIconUpdate(
    extension: string,
    bundleId: string,
    appInfo: { fileId: number; name: string; path: string; logo: string }
  ): void {
    if (!this.enableFileIconExtraction || !appInfo.path) {
      return
    }

    if (this.openerIconJobs.has(extension)) {
      return
    }

    const task = (async () => {
      const logo = await this.generateApplicationIcon(appInfo.path)
      if (!logo) {
        return
      }

      if (appInfo.fileId) {
        this.persistOpenerIcon(appInfo.fileId, logo)
      }

      const opener: ResolvedOpener = {
        bundleId,
        name: appInfo.name,
        logo,
        path: appInfo.path,
        lastResolvedAt: new Date().toISOString()
      }

      this.openerCache.set(extension, opener)
      this.persistOpenerToStorage(extension, opener)
    })()
      .catch((error) => {
        this.logWarn('Failed to refresh opener icon', error, { extension })
      })
      .finally(() => {
        this.openerIconJobs.delete(extension)
      })

    this.openerIconJobs.set(extension, task)
  }

  async getBundleIdForExtension(extension: string): Promise<string | null> {
    if (this.bundleIdCache.has(extension)) {
      return this.bundleIdCache.get(extension) ?? null
    }

    const handlers = await this.loadLaunchServicesHandlers()
    if (handlers.length === 0) {
      this.bundleIdCache.set(extension, null)
      return null
    }

    const lower = extension.toLowerCase()
    const directMatch = handlers.find(
      (handler) =>
        typeof handler?.LSHandlerContentTag === 'string' &&
        handler.LSHandlerContentTag.toLowerCase() === lower &&
        handler.LSHandlerContentTagClass === 'public.filename-extension'
    )

    const directBundle = this.pickBundleIdFromHandler(directMatch)
    if (directBundle) {
      this.bundleIdCache.set(extension, directBundle)
      return directBundle
    }

    const uti = await this.resolveUniformTypeIdentifier(lower)
    if (!uti) {
      this.bundleIdCache.set(extension, null)
      return null
    }

    const utiMatch = handlers.find(
      (handler) =>
        typeof handler?.LSHandlerContentType === 'string' &&
        handler.LSHandlerContentType.toLowerCase() === uti.toLowerCase()
    )

    const bundleId = this.pickBundleIdFromHandler(utiMatch)
    this.bundleIdCache.set(extension, bundleId)
    return bundleId
  }

  pickBundleIdFromHandler(handler: LaunchServicesHandler | null | undefined): string | null {
    if (!handler) {
      return null
    }

    const roleKeys: LaunchServicesRoleKey[] = [
      'LSHandlerRoleAll',
      'LSHandlerRoleViewer',
      'LSHandlerRoleEditor'
    ]

    for (const key of roleKeys) {
      const value = handler[key]
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }

    const preferred = handler.LSHandlerPreferredVersions
    if (preferred) {
      for (const key of roleKeys) {
        const value = preferred[key]
        if (typeof value === 'string' && value.length > 0) {
          return value
        }
      }
    }

    return null
  }

  async loadLaunchServicesHandlers(): Promise<LaunchServicesHandler[]> {
    if (process.platform !== 'darwin') {
      return []
    }

    if (this.launchServicesLoadPromise) {
      return this.launchServicesLoadPromise
    }

    this.launchServicesLoadPromise = (async () => {
      try {
        const stats = await fs.stat(LAUNCH_SERVICES_PLIST_PATH)
        if (this.launchServicesHandlers && this.launchServicesMTime === stats.mtimeMs) {
          return this.launchServicesHandlers
        }

        const { stdout } = await execFileAsync('plutil', [
          '-convert',
          'xml1',
          '-o',
          '-',
          LAUNCH_SERVICES_PLIST_PATH
        ])

        const parsed = plist.parse(stdout.toString()) as {
          LSHandlers?: LaunchServicesHandler[]
        }
        const handlers = Array.isArray(parsed?.LSHandlers) ? parsed.LSHandlers : []

        this.launchServicesHandlers = handlers
        this.launchServicesMTime = stats.mtimeMs
        return handlers
      } catch (error) {
        this.logError('Failed to load LaunchServices configuration for opener resolution.', error)
        this.launchServicesHandlers = []
        this.launchServicesMTime = undefined
        return []
      } finally {
        this.launchServicesLoadPromise = null
      }
    })()

    return this.launchServicesLoadPromise
  }

  async resolveUniformTypeIdentifier(extension: string): Promise<string | null> {
    if (process.platform !== 'darwin') {
      return null
    }

    const safeExt = extension.replace(/[^a-z0-9.+-]/gi, '')
    if (!safeExt) {
      return null
    }

    if (this.utiCache.has(safeExt)) {
      return this.utiCache.get(safeExt) ?? null
    }

    const tempPath = path.join(
      os.tmpdir(),
      `talex-touch-${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`
    )

    try {
      await fs.writeFile(tempPath, '')
      const { stdout } = await execFileAsync('mdls', ['-name', 'kMDItemContentType', tempPath])
      const match = /"([^"\n]+)"/.exec(stdout.toString())
      const uti = match ? match[1] : null
      this.utiCache.set(safeExt, uti)
      return uti
    } catch (error) {
      this.logWarn(`Failed to resolve UTI for extension .${extension}`, error)
      this.utiCache.set(safeExt, null)
      return null
    } finally {
      try {
        await fs.unlink(tempPath)
      } catch {
        // noop
      }
    }
  }

  async getAppInfoByBundleId(bundleId: string): Promise<{
    fileId: number
    name: string
    path: string
    logo: string
  } | null> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return null
    }

    try {
      const db = dbUtils.getDb()
      const mapping = await db
        .select({ fileId: fileExtensions.fileId })
        .from(fileExtensions)
        .where(and(eq(fileExtensions.key, 'bundleId'), eq(fileExtensions.value, bundleId)))
        .limit(1)

      const fileId = mapping[0]?.fileId
      if (!fileId) {
        return null
      }

      const [fileRow] = await db
        .select({
          id: filesSchema.id,
          name: filesSchema.name,
          displayName: filesSchema.displayName,
          path: filesSchema.path
        })
        .from(filesSchema)
        .where(eq(filesSchema.id, fileId))
        .limit(1)

      if (!fileRow) {
        return null
      }

      const [iconRow] = await db
        .select({ value: fileExtensions.value })
        .from(fileExtensions)
        .where(and(eq(fileExtensions.fileId, fileId), eq(fileExtensions.key, 'icon')))
        .limit(1)

      return {
        fileId,
        name: fileRow.displayName || fileRow.name,
        path: fileRow.path,
        logo: iconRow?.value ?? ''
      }
    } catch (error) {
      this.logError('Failed to read app info for bundle', error, { bundleId })
      return null
    }
  }

  async generateApplicationIcon(appPath: string): Promise<string> {
    try {
      const buffer = await this.extractFileIconQueued(appPath)
      if (buffer && buffer.length > 0) {
        const normalized = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
        const iconValue = `data:image/png;base64,${normalized.toString('base64')}`
        return this.isValidBase64DataUrl(iconValue) ? iconValue : ''
      }
    } catch (error) {
      this.logWarn('Failed to extract icon', error, { path: appPath })
    }
    return ''
  }
}

export function normalizeOpenerExtension(rawExtension: string): string {
  return rawExtension.trim().replace(/^\./, '').toLowerCase()
}

export function sanitizeOpenerExtension(extension: string): string {
  const normalized = normalizeOpenerExtension(extension)
  return /^[a-z0-9.+-]{1,32}$/i.test(normalized) ? normalized : ''
}
