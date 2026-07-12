import type {
  AppIndexEntryMutationResult,
  AppIndexManagedEntry,
  AppIndexUpsertEntryRequest
} from '@talex-touch/utils/transport/events/types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { DbUtils } from '../../../../../db/utils'
import { fileExtensions, files as filesSchema } from '../../../../../db/schema'
import {
  APP_ENTRY_ENABLED_EXTENSION_KEY,
  APP_ENTRY_SOURCE_MANUAL,
  buildManagedEntryExtensions,
  isManagedEntryExtensionMap,
  isManagedEntryEnabledExtensionMap,
  resolveAppItemIds
} from '../app-index-metadata'
import { inferManagedEntryLaunchKind, normalizeOptionalString } from '../app-provider-path-utils'
import type { AppLaunchKind, ScannedAppInfo } from '../app-types'
import { resolveDisplayName } from '../display-name-sync-utils'

type DbAppRecord = typeof filesSchema.$inferSelect
type DbAppWithExtensions = DbAppRecord & { extensions: Record<string, string | null> }

export interface AppManagedEntryServiceOptions {
  getDbUtils: () => DbUtils | null
  fetchExtensions: (apps: DbAppRecord[]) => Promise<DbAppWithExtensions[]>
  mapDbAppToScannedInfo: (app: DbAppWithExtensions) => ScannedAppInfo
  toExtensionMap: (
    records: Array<{ key: string; value: string | null }>
  ) => Record<string, string | null>
  syncKeywords: (appInfo: ScannedAppInfo) => Promise<void>
  removeIndexedItems: (itemIds: string[]) => Promise<void>
  syncIndexedState: (
    appInfo: ScannedAppInfo,
    extensions: Record<string, string | null> | undefined
  ) => Promise<void>
}

export class AppManagedEntryService {
  constructor(private readonly options: AppManagedEntryServiceOptions) {}

  public async list(): Promise<AppIndexManagedEntry[]> {
    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) return []

    const entries = await this.options.fetchExtensions(await dbUtils.getFilesByType('app'))

    return entries
      .map((app) => this.mapEntry(app))
      .sort((left, right) =>
        resolveDisplayName(left.displayName, left.name).localeCompare(
          resolveDisplayName(right.displayName, right.name)
        )
      )
  }

  public async upsert(input: AppIndexUpsertEntryRequest): Promise<AppIndexEntryMutationResult> {
    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) return { success: false, status: 'error', reason: 'db-not-ready' }

    const normalized = this.normalizeInput(input)
    if ('reason' in normalized)
      return { success: false, status: 'invalid', reason: normalized.reason }

    const { appInfo, enabled } = normalized
    const displayName = resolveDisplayName(appInfo.displayName, appInfo.name)
    const existingFile = await dbUtils.getFileByPath(appInfo.path)
    const db = dbUtils.getDb()

    if (existingFile) {
      const extensions = this.options.toExtensionMap(
        await dbUtils.getFileExtensions(existingFile.id)
      )
      if (!isManagedEntryExtensionMap(extensions)) {
        return { success: false, status: 'invalid', reason: 'path-conflicts-with-scanned-app' }
      }

      await db
        .update(filesSchema)
        .set({ name: appInfo.name, displayName, mtime: appInfo.lastModified })
        .where(eq(filesSchema.id, existingFile.id))

      const nextExtensions = buildManagedEntryExtensions(existingFile.id, appInfo, enabled)
      await dbUtils.addFileExtensions(nextExtensions)
      if (enabled) {
        await this.options.syncKeywords(appInfo)
      } else {
        await this.options.removeIndexedItems(resolveAppItemIds(appInfo))
      }

      return {
        success: true,
        status: 'updated',
        entry: this.mapEntry({
          ...existingFile,
          name: appInfo.name,
          displayName,
          mtime: appInfo.lastModified,
          extensions: { ...extensions, ...this.options.toExtensionMap(nextExtensions) }
        })
      }
    }

    const [insertedFile] = await db
      .insert(filesSchema)
      .values({
        path: appInfo.path,
        name: appInfo.name,
        displayName,
        type: 'app' as const,
        mtime: appInfo.lastModified,
        ctime: new Date()
      })
      .returning()
    if (!insertedFile) return { success: false, status: 'error', reason: 'insert-failed' }

    const nextExtensions = buildManagedEntryExtensions(insertedFile.id, appInfo, enabled)
    await dbUtils.addFileExtensions(nextExtensions)
    if (enabled) await this.options.syncKeywords(appInfo)

    return {
      success: true,
      status: 'added',
      entry: this.mapEntry({
        ...insertedFile,
        extensions: this.options.toExtensionMap(nextExtensions)
      })
    }
  }

  public async remove(pathValue: string): Promise<AppIndexEntryMutationResult> {
    const path = normalizeOptionalString(pathValue)
    if (!path) return { success: false, status: 'invalid', reason: 'path-empty' }

    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) return { success: false, status: 'error', reason: 'db-not-ready' }

    const existingFile = await dbUtils.getFileByPath(path)
    if (!existingFile) return { success: false, status: 'not-found', reason: 'entry-not-found' }

    const extensions = this.options.toExtensionMap(await dbUtils.getFileExtensions(existingFile.id))
    if (!isManagedEntryExtensionMap(extensions)) {
      return { success: false, status: 'invalid', reason: 'not-user-managed' }
    }

    const db = dbUtils.getDb()
    await db.transaction(async (tx) => {
      await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, existingFile.id))
      await tx.delete(filesSchema).where(eq(filesSchema.id, existingFile.id))
    })
    await this.options.removeIndexedItems(
      resolveAppItemIds({
        bundleId: extensions.bundleId,
        appIdentity: extensions.appIdentity,
        path: existingFile.path
      })
    )

    return {
      success: true,
      status: 'removed',
      entry: this.mapEntry({ ...existingFile, extensions })
    }
  }

  public async setEnabled(
    pathValue: string,
    enabled: boolean
  ): Promise<AppIndexEntryMutationResult> {
    const path = normalizeOptionalString(pathValue)
    if (!path) return { success: false, status: 'invalid', reason: 'path-empty' }

    const dbUtils = this.options.getDbUtils()
    if (!dbUtils) return { success: false, status: 'error', reason: 'db-not-ready' }

    const existingFile = await dbUtils.getFileByPath(path)
    if (!existingFile) return { success: false, status: 'not-found', reason: 'entry-not-found' }

    const extensions = this.options.toExtensionMap(await dbUtils.getFileExtensions(existingFile.id))
    const nextExtensions = { ...extensions, [APP_ENTRY_ENABLED_EXTENSION_KEY]: enabled ? '1' : '0' }
    await dbUtils.addFileExtension(
      existingFile.id,
      APP_ENTRY_ENABLED_EXTENSION_KEY,
      enabled ? '1' : '0'
    )
    await this.options.syncIndexedState(
      this.options.mapDbAppToScannedInfo({ ...existingFile, extensions: nextExtensions }),
      nextExtensions
    )

    return {
      success: true,
      status: 'updated',
      entry: this.mapEntry({ ...existingFile, extensions: nextExtensions })
    }
  }

  private mapEntry(app: DbAppWithExtensions): AppIndexManagedEntry {
    const appInfo = this.options.mapDbAppToScannedInfo(app)
    const isManualEntry = isManagedEntryExtensionMap(app.extensions)
    return {
      path: app.path,
      name: appInfo.name,
      displayName: appInfo.displayName,
      icon: appInfo.icon || undefined,
      enabled: isManagedEntryEnabledExtensionMap(app.extensions),
      source: isManualEntry ? APP_ENTRY_SOURCE_MANUAL : 'scanned',
      removable: isManualEntry,
      bundleId: appInfo.bundleId || undefined,
      identityKind: appInfo.identityKind,
      launchKind: appInfo.launchKind,
      launchTarget: appInfo.launchTarget,
      launchArgs: appInfo.launchArgs,
      workingDirectory: appInfo.workingDirectory,
      displayPath: appInfo.displayPath,
      description: appInfo.description
    }
  }

  private normalizeInput(
    input: AppIndexUpsertEntryRequest
  ): { reason: string } | { appInfo: ScannedAppInfo; enabled: boolean } {
    const normalizedPath = normalizeOptionalString(input.path)
    if (!normalizedPath) return { reason: 'path-empty' }

    const launchTarget = normalizeOptionalString(input.launchTarget) || normalizedPath
    const launchKind = input.launchKind || inferManagedEntryLaunchKind(launchTarget)
    if (launchKind === 'uwp' && process.platform !== 'win32')
      return { reason: 'launch-kind-unsupported' }

    if (launchKind !== 'uwp') {
      if (launchKind === 'protocol') {
        if (!/^steam:\/\/rungameid\/\d+$/i.test(launchTarget))
          return { reason: 'protocol-not-allowed' }
      } else {
        if (!path.isAbsolute(normalizedPath)) return { reason: 'path-not-absolute' }
        if (!existsSync(normalizedPath)) return { reason: 'path-not-found' }
        if (!path.isAbsolute(launchTarget)) return { reason: 'launch-target-not-absolute' }
        if (!existsSync(launchTarget)) return { reason: 'launch-target-not-found' }
      }
    }

    const displayPath = normalizeOptionalString(input.displayPath) || normalizedPath
    const fileName = path.basename(displayPath)
    const name =
      path.basename(displayPath, path.extname(displayPath) || undefined) ||
      path.basename(normalizedPath) ||
      normalizedPath
    const displayName = normalizeOptionalString(input.displayName) || name
    const workingDirectory =
      normalizeOptionalString(input.workingDirectory) ||
      (launchKind === 'shortcut' && path.isAbsolute(launchTarget)
        ? path.dirname(launchTarget)
        : undefined)

    return {
      enabled: input.enabled !== false,
      appInfo: {
        name,
        displayName,
        fileName,
        path: normalizedPath,
        icon: normalizeOptionalString(input.icon) || '',
        bundleId: '',
        uniqueId: normalizedPath,
        stableId: normalizedPath,
        launchKind: launchKind as AppLaunchKind,
        launchTarget,
        launchArgs: normalizeOptionalString(input.launchArgs),
        workingDirectory,
        displayPath,
        description: normalizeOptionalString(input.description),
        lastModified: new Date()
      }
    }
  }
}
