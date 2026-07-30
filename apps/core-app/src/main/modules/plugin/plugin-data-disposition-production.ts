import type { PluginSqliteResourceOwnerRegistry } from './runtime/plugin-sqlite-resource-owner'
import type { TempFileService } from '../../service/temp-file.service'
import type {
  PluginDataDispositionCoordinator,
  PluginDataDispositionOwner,
  PluginDataDispositionStepOutcome
} from './plugin-data-disposition'
import path from 'node:path'
import { dialog } from 'electron'
import fse from 'fs-extra'
import {
  countSecureStoreValuesByPrefixes,
  deleteSecureStoreValuesByPrefixes
} from '../../utils/secure-store'
import { createPrivacyCategoryExporter } from '../privacy/privacy-export'
import { exportPluginOrdinaryData } from '../privacy/plugin-ordinary-data-export'
import {
  PORTABLE_SECRET_CATALOG_V1,
  type PortableSecretCatalogEntry
} from '../privacy/portable-secret-catalog'
import {
  createMainPrivacySecretFileAdapter,
  createPrivacySecretService
} from '../privacy/privacy-secret-service'
import { createPluginDataDispositionCoordinator } from './plugin-data-disposition'
import { pluginBusinessSecretPrefix } from './host/plugin-business-capabilities'
import { hasPluginTempNamespaceResidual, purgePluginTempNamespace } from './plugin-temp-namespace'

export interface ProductionPluginDataDispositionOwner extends PluginDataDispositionOwner {
  readonly dataRootPath: string
  readonly codePath: string
}

interface PluginDispositionDbUtils {
  listPluginData: (
    pluginId: string
  ) => Promise<readonly { readonly key: string; readonly value: string | null }[]>
  countPluginData: (pluginId: string) => Promise<number>
  deletePluginData: (pluginId: string) => Promise<unknown>
}

export interface ProductionPluginDataDispositionOptions {
  readonly secureStoreRootPath: string
  readonly dbUtils: PluginDispositionDbUtils
  readonly tempFileService: TempFileService
  readonly sqliteResources?: PluginSqliteResourceOwnerRegistry
  readonly resolveOwner: (pluginName: string) => ProductionPluginDataDispositionOwner | null
  readonly canStart?: (owner: ProductionPluginDataDispositionOwner) => boolean
  readonly closeAdmission: (
    owner: ProductionPluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  readonly closeRuntime: (
    owner: ProductionPluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  readonly closeLogger: (
    owner: ProductionPluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  readonly revokePermissions: (owner: ProductionPluginDataDispositionOwner) => Promise<void>
  readonly invalidateAuthority: (owner: ProductionPluginDataDispositionOwner) => Promise<void>
  readonly inspectAuthorityResiduals: (owner: ProductionPluginDataDispositionOwner) => Promise<{
    readonly runtime: boolean
    readonly permissions: boolean
    readonly pendingAuthority: boolean
  }>
  readonly purgeSecrets?: (pluginName: string) => Promise<void>
  readonly deletePluginRow?: (owner: ProductionPluginDataDispositionOwner) => Promise<void>
  readonly finalize: (
    owner: ProductionPluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  readonly reportUninstall: (
    owner: ProductionPluginDataDispositionOwner
  ) => Promise<PluginDataDispositionStepOutcome>
  readonly reportLocalError?: (code: string) => void
}

function asProductionOwner(
  owner: PluginDataDispositionOwner
): ProductionPluginDataDispositionOwner {
  return owner as ProductionPluginDataDispositionOwner
}

function secretPrefixes(pluginName: string): readonly string[] {
  return Object.freeze([`plugin.${pluginName}.`, pluginBusinessSecretPrefix(pluginName)])
}

async function entryExists(targetPath: string): Promise<boolean> {
  try {
    await fse.lstat(targetPath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function assertOrdinaryDirectory(targetPath: string): Promise<void> {
  const stat = await fse.lstat(targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!stat) return
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('PLUGIN_DISPOSITION_OWNER_PATH_INVALID')
  }
  const canonical = await fse.realpath(targetPath)
  if (canonical !== path.resolve(targetPath)) {
    throw new Error('PLUGIN_DISPOSITION_OWNER_PATH_INVALID')
  }
}

async function deleteDurableData(owner: ProductionPluginDataDispositionOwner): Promise<void> {
  const root = owner.dataRootPath
  await assertOrdinaryDirectory(root)
  if (!(await entryExists(root))) return
  const entries = await fse.readdir(root)
  for (const name of entries) {
    if (name === 'cache' || name === 'temp') continue
    await fse.remove(path.join(root, name))
  }
}

async function removeEmptyOwnerRoot(root: string): Promise<void> {
  try {
    await fse.rmdir(root)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error
  }
}

async function deleteOwnedChild(root: string, childName: 'cache' | 'temp'): Promise<void> {
  await assertOrdinaryDirectory(root)
  if (!(await entryExists(root))) return
  await fse.remove(path.join(root, childName))
}

function pluginSecretCatalog(pluginName: string): readonly PortableSecretCatalogEntry[] {
  return Object.freeze(
    PORTABLE_SECRET_CATALOG_V1.filter(
      (entry) => entry.ownerKind === 'plugin' && entry.ownerId === pluginName
    )
  )
}

export function createProductionPluginDataDispositionCoordinator(
  options: ProductionPluginDataDispositionOptions
): PluginDataDispositionCoordinator {
  const ordinaryExporter = createPrivacyCategoryExporter({
    showSaveDialog: async () => {
      const result = await dialog.showSaveDialog({
        title: 'Export plugin data',
        defaultPath: 'talex-touch-plugin-data-export.json',
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        filters: [{ name: 'Talex Touch Privacy Export', extensions: ['json'] }]
      })
      return Object.freeze({
        canceled: result.canceled,
        ...(result.filePath ? { filePath: result.filePath } : {})
      })
    }
  })
  const secretFiles = createMainPrivacySecretFileAdapter({
    showSaveDialog: async () => {
      const result = await dialog.showSaveDialog({
        title: 'Export encrypted plugin credentials',
        defaultPath: 'talex-touch-plugin-secret-backup.json',
        properties: ['createDirectory', 'showOverwriteConfirmation'],
        filters: [{ name: 'Talex Touch Secret Backup', extensions: ['json'] }]
      })
      return Object.freeze({
        canceled: result.canceled,
        ...(result.filePath ? { filePath: result.filePath } : {})
      })
    },
    showOpenDialog: async () => Object.freeze({ canceled: true, filePaths: Object.freeze([]) })
  })

  return createPluginDataDispositionCoordinator({
    resolveCurrentOwner: options.resolveOwner,
    ...(options.canStart
      ? {
          canStart: (owner: PluginDataDispositionOwner) =>
            options.canStart!(asProductionOwner(owner))
        }
      : {}),
    closeAdmission: (owner) => options.closeAdmission(asProductionOwner(owner)),
    closeRuntime: (owner) => options.closeRuntime(asProductionOwner(owner)),
    closeSqlite: async (owner) => {
      const current = asProductionOwner(owner)
      await options.sqliteResources?.closePlugin(current.pluginName)
      return 'completed'
    },
    closeLogger: (owner) => options.closeLogger(asProductionOwner(owner)),
    exportOrdinary: async (owner) => {
      const current = asProductionOwner(owner)
      const rows = await options.dbUtils.listPluginData(current.pluginName)
      const result = await exportPluginOrdinaryData(ordinaryExporter, {
        pluginId: current.pluginName,
        rows,
        roots: Object.freeze([
          Object.freeze({
            area: 'data' as const,
            rootPath: current.dataRootPath,
            ownerRootPath: current.dataRootPath,
            excludedNames: Object.freeze(['config'])
          }),
          Object.freeze({
            area: 'config' as const,
            rootPath: path.join(current.dataRootPath, 'config'),
            ownerRootPath: current.dataRootPath
          })
        ])
      })
      return result.cancelled ? 'cancelled' : 'completed'
    },
    backupPortableSecrets: async (owner, password) => {
      const current = asProductionOwner(owner)
      const catalog = pluginSecretCatalog(current.pluginName)
      const ownedSecretCount = options.secureStoreRootPath
        ? await countSecureStoreValuesByPrefixes(
            options.secureStoreRootPath,
            secretPrefixes(current.pluginName),
            () => options.reportLocalError?.('PLUGIN_SECRET_UNAVAILABLE')
          )
        : 0
      if (catalog.length === 0) {
        if (ownedSecretCount > 0) throw new Error('PLUGIN_PORTABLE_SECRET_CATALOG_INCOMPLETE')
        return 'no-data'
      }
      const service = createPrivacySecretService({
        rootPath: options.secureStoreRootPath,
        files: secretFiles,
        catalog
      })
      try {
        const preview = await service.backupPreview()
        if (!preview.ok) throw new Error(preview.code)
        if (!preview.data.available || preview.data.portableEntryCount === 0) {
          if (ownedSecretCount > 0) throw new Error('PLUGIN_PORTABLE_SECRET_CATALOG_INCOMPLETE')
          return 'no-data'
        }
        if (ownedSecretCount > preview.data.portableEntryCount) {
          throw new Error('PLUGIN_PORTABLE_SECRET_CATALOG_INCOMPLETE')
        }
        const result = await service.backupWrite(password)
        if (!result.ok) {
          if (result.cancelled) return 'cancelled'
          throw new Error(result.code)
        }
        return result.data.cancelled ? 'cancelled' : 'completed'
      } finally {
        await service.destroy()
      }
    },
    verifySqliteClosed: async (owner) => {
      const current = asProductionOwner(owner)
      return options.sqliteResources?.hasPlugin(current.pluginName) ? 'residual' : 'completed'
    },
    revokePermissions: async (owner) => {
      await options.revokePermissions(asProductionOwner(owner))
      return 'completed'
    },
    invalidateAuthority: async (owner) => {
      await options.invalidateAuthority(asProductionOwner(owner))
      return 'completed'
    },
    purgeSecrets: async (owner) => {
      const current = asProductionOwner(owner)
      if (options.purgeSecrets) {
        await options.purgeSecrets(current.pluginName)
      } else if (options.secureStoreRootPath) {
        await deleteSecureStoreValuesByPrefixes(
          options.secureStoreRootPath,
          secretPrefixes(current.pluginName),
          () => options.reportLocalError?.('PLUGIN_SECRET_UNAVAILABLE')
        )
      }
      return 'completed'
    },
    deleteData: async (owner) => {
      await deleteDurableData(asProductionOwner(owner))
      return 'completed'
    },
    deleteCache: async (owner) => {
      const current = asProductionOwner(owner)
      await deleteOwnedChild(current.dataRootPath, 'cache')
      await removeEmptyOwnerRoot(current.dataRootPath)
      return 'completed'
    },
    deleteTemp: async (owner) => {
      const current = asProductionOwner(owner)
      await deleteOwnedChild(current.dataRootPath, 'temp')
      await purgePluginTempNamespace(options.tempFileService, current.pluginName)
      return 'completed'
    },
    deletePluginData: async (owner) => {
      const current = asProductionOwner(owner)
      if (options.deletePluginRow) {
        await options.deletePluginRow(current)
      } else {
        await options.dbUtils.deletePluginData(current.pluginName)
      }
      return 'completed'
    },
    deleteCode: async (owner) => {
      const current = asProductionOwner(owner)
      await assertOrdinaryDirectory(current.codePath)
      await fse.remove(current.codePath)
      return 'completed'
    },
    inspectResiduals: async (owner) => {
      const current = asProductionOwner(owner)
      const sqliteFilePaths = [
        path.join(current.dataRootPath, 'plugin-sdk.sqlite'),
        path.join(current.dataRootPath, 'plugin-sdk.sqlite-wal'),
        path.join(current.dataRootPath, 'plugin-sdk.sqlite-shm')
      ]
      const [
        sqliteFileStates,
        authorityResiduals,
        secretCount,
        tempNamespaceResidual,
        localTemp,
        cache,
        data,
        pluginDataCount,
        code
      ] = await Promise.all([
        Promise.all(sqliteFilePaths.map(entryExists)),
        options.inspectAuthorityResiduals(current),
        options.secureStoreRootPath
          ? countSecureStoreValuesByPrefixes(
              options.secureStoreRootPath,
              secretPrefixes(current.pluginName),
              () => options.reportLocalError?.('PLUGIN_SECRET_UNAVAILABLE')
            )
          : Promise.resolve(0),
        hasPluginTempNamespaceResidual(options.tempFileService, current.pluginName),
        entryExists(path.join(current.dataRootPath, 'temp')),
        entryExists(path.join(current.dataRootPath, 'cache')),
        entryExists(current.dataRootPath),
        options.dbUtils.countPluginData(current.pluginName),
        entryExists(current.codePath)
      ])
      return Object.freeze({
        runtime: authorityResiduals.runtime,
        sqliteOwner: options.sqliteResources?.hasPlugin(current.pluginName) ?? false,
        sqliteFile: sqliteFileStates.some(Boolean),
        permissions: authorityResiduals.permissions,
        pendingAuthority: authorityResiduals.pendingAuthority,
        secrets: secretCount > 0,
        temp: tempNamespaceResidual || localTemp,
        cache,
        data,
        pluginData: pluginDataCount > 0,
        code
      })
    },
    finalize: (owner) => options.finalize(asProductionOwner(owner)),
    reportUninstall: (owner) => options.reportUninstall(asProductionOwner(owner))
  })
}
