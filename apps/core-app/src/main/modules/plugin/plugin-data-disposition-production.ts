import type { PluginSqliteResourceOwnerRegistry } from './runtime/plugin-sqlite-resource-owner'
import type { TempFileService } from '../../service/temp-file.service'
import type {
  PluginDataDispositionCoordinator,
  PluginDataDispositionOwner,
  PluginDataDispositionStepOutcome
} from './plugin-data-disposition'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { rename } from 'node:fs/promises'
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

interface DirectoryIdentity {
  readonly state: 'ordinary' | 'missing' | 'invalid'
  readonly dev?: number
  readonly ino?: number
}

interface DirectoryQuarantineState {
  recoveryPath?: string
}

const DATA_ROOT_IDENTITY = Symbol('plugin-data-root-identity')
const CODE_ROOT_IDENTITY = Symbol('plugin-code-root-identity')

interface PinnedProductionPluginDataDispositionOwner extends ProductionPluginDataDispositionOwner {
  readonly [DATA_ROOT_IDENTITY]: DirectoryIdentity
  readonly [CODE_ROOT_IDENTITY]: DirectoryIdentity
}

function captureDirectoryIdentity(targetPath: string): DirectoryIdentity {
  try {
    const stat = lstatSync(targetPath)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return Object.freeze({ state: 'invalid' })
    if (realpathSync(targetPath) !== path.resolve(targetPath)) {
      return Object.freeze({ state: 'invalid' })
    }
    return Object.freeze({ state: 'ordinary', dev: Number(stat.dev), ino: Number(stat.ino) })
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? Object.freeze({ state: 'missing' })
      : Object.freeze({ state: 'invalid' })
  }
}

function pinOwner(
  owner: ProductionPluginDataDispositionOwner
): PinnedProductionPluginDataDispositionOwner {
  return Object.freeze({
    ...owner,
    [DATA_ROOT_IDENTITY]: captureDirectoryIdentity(owner.dataRootPath),
    [CODE_ROOT_IDENTITY]: captureDirectoryIdentity(owner.codePath)
  })
}

function asPinnedOwner(
  owner: PluginDataDispositionOwner
): PinnedProductionPluginDataDispositionOwner {
  return owner as PinnedProductionPluginDataDispositionOwner
}

async function assertPinnedDirectory(
  targetPath: string,
  expected: DirectoryIdentity,
  allowMissing: boolean
): Promise<boolean> {
  if (expected.state === 'invalid') throw new Error('PLUGIN_DISPOSITION_OWNER_PATH_INVALID')
  const stat = await fse.lstat(targetPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!stat) {
    if (expected.state === 'ordinary' && !allowMissing) {
      throw new Error('PLUGIN_DISPOSITION_OWNER_PATH_CHANGED')
    }
    return false
  }
  if (expected.state !== 'ordinary' || !stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('PLUGIN_DISPOSITION_OWNER_PATH_CHANGED')
  }
  const canonical = await fse.realpath(targetPath)
  if (
    canonical !== path.resolve(targetPath) ||
    Number(stat.dev) !== expected.dev ||
    Number(stat.ino) !== expected.ino
  ) {
    throw new Error('PLUGIN_DISPOSITION_OWNER_PATH_CHANGED')
  }
  return true
}

async function deletePinnedDirectory(
  targetPath: string,
  expected: DirectoryIdentity,
  quarantine: DirectoryQuarantineState
): Promise<void> {
  if (quarantine.recoveryPath) {
    if (await entryExists(quarantine.recoveryPath)) {
      await assertPinnedDirectory(quarantine.recoveryPath, expected, false)
      await fse.remove(quarantine.recoveryPath)
      if (await entryExists(quarantine.recoveryPath)) {
        throw new Error('PLUGIN_DISPOSITION_OWNER_DELETE_FAILED')
      }
    }
    quarantine.recoveryPath = undefined
  }

  if (!(await assertPinnedDirectory(targetPath, expected, true))) return
  const recoveryPath = `${targetPath}.uninstall-${randomUUID()}.recovery`
  quarantine.recoveryPath = recoveryPath
  try {
    await rename(targetPath, recoveryPath)
  } catch (error) {
    quarantine.recoveryPath = undefined
    throw error
  }

  await assertPinnedDirectory(recoveryPath, expected, false)
  await fse.remove(recoveryPath)
  if (await entryExists(recoveryPath)) {
    throw new Error('PLUGIN_DISPOSITION_OWNER_DELETE_FAILED')
  }
  quarantine.recoveryPath = undefined
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

  const quarantineByOwner = new Map<
    string,
    { readonly data: DirectoryQuarantineState; readonly code: DirectoryQuarantineState }
  >()
  const quarantineFor = (owner: ProductionPluginDataDispositionOwner) => {
    const key = `${owner.pluginName}:${owner.pluginInstanceId}:${owner.activationGeneration}`
    let state = quarantineByOwner.get(key)
    if (!state) {
      state = { data: {}, code: {} }
      quarantineByOwner.set(key, state)
    }
    return { key, state }
  }

  return createPluginDataDispositionCoordinator({
    resolveCurrentOwner: (pluginName) => {
      const owner = options.resolveOwner(pluginName)
      return owner ? pinOwner(owner) : null
    },
    ...(options.canStart
      ? {
          canStart: (owner: PluginDataDispositionOwner) =>
            options.canStart!(asProductionOwner(owner))
        }
      : {}),
    closeAdmission: async (owner) => {
      const current = asPinnedOwner(owner)
      await assertPinnedDirectory(current.dataRootPath, current[DATA_ROOT_IDENTITY], false)
      await assertPinnedDirectory(current.codePath, current[CODE_ROOT_IDENTITY], false)
      return await options.closeAdmission(current)
    },
    closeRuntime: (owner) => options.closeRuntime(asProductionOwner(owner)),
    closeSqlite: async (owner) => {
      const current = asProductionOwner(owner)
      await options.sqliteResources?.closePlugin(current.pluginName)
      return 'completed'
    },
    closeLogger: (owner) => options.closeLogger(asProductionOwner(owner)),
    exportOrdinary: async (owner) => {
      const current = asPinnedOwner(owner)
      await assertPinnedDirectory(current.dataRootPath, current[DATA_ROOT_IDENTITY], false)
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
      await assertPinnedDirectory(current.dataRootPath, current[DATA_ROOT_IDENTITY], false)
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
      const current = asPinnedOwner(owner)
      const { state } = quarantineFor(current)
      await deletePinnedDirectory(current.dataRootPath, current[DATA_ROOT_IDENTITY], state.data)
      return 'completed'
    },
    deleteCache: async (owner) => {
      const current = asPinnedOwner(owner)
      await assertPinnedDirectory(current.dataRootPath, current[DATA_ROOT_IDENTITY], true)
      return 'completed'
    },
    deleteTemp: async (owner) => {
      const current = asPinnedOwner(owner)
      await assertPinnedDirectory(current.dataRootPath, current[DATA_ROOT_IDENTITY], true)
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
      const current = asPinnedOwner(owner)
      const { state } = quarantineFor(current)
      await deletePinnedDirectory(current.codePath, current[CODE_ROOT_IDENTITY], state.code)
      return 'completed'
    },
    inspectResiduals: async (owner) => {
      const current = asPinnedOwner(owner)
      const { state } = quarantineFor(current)
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
        code,
        dataRecovery,
        codeRecovery
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
        entryExists(current.codePath),
        state.data.recoveryPath ? entryExists(state.data.recoveryPath) : Promise.resolve(false),
        state.code.recoveryPath ? entryExists(state.code.recoveryPath) : Promise.resolve(false)
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
        data: data || dataRecovery,
        pluginData: pluginDataCount > 0,
        code: code || codeRecovery
      })
    },
    finalize: async (owner) => {
      const current = asProductionOwner(owner)
      const result = await options.finalize(current)
      if (result === 'completed') {
        quarantineByOwner.delete(quarantineFor(current).key)
      }
      return result
    },
    reportUninstall: (owner) => options.reportUninstall(asProductionOwner(owner))
  })
}
