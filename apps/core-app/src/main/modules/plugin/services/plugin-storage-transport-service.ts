import type { Client, InValue } from '@libsql/client'
import type { IPluginManager } from '@talex-touch/utils/plugin'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { Logger } from '../../../utils/logger'
import path from 'node:path'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { createClient } from '@libsql/client'
import { SdkApi } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { shell } from 'electron'
import fse from 'fs-extra'
import { getPermissionModule } from '../../permission'
import {
  getSecureStoreHealth,
  getSecureStoreValue,
  isSecureStoreAvailable,
  setSecureStoreValue
} from '../../../utils/secure-store'
import { TouchPlugin } from '../plugin'

type TransportDisposer = () => void

export interface PluginStorageTransportContext {
  manager: IPluginManager
  transport: ITuffTransportMain
  secureStoreRootPath: string
  pluginSqliteClients: Map<string, Client>
  isRecord: (value: unknown) => value is Record<string, unknown>
  ipcLog: Pick<Logger, 'warn'>
  logHandlerError: (handler: string, error: unknown) => void
  toErrorMessage: (error: unknown) => string
}

/** Registers plugin storage, secret, and SQLite transport handlers. */
export function registerPluginStorageTransportHandlers(
  context: PluginStorageTransportContext
): TransportDisposer[] {
  const {
    manager,
    transport,
    secureStoreRootPath,
    pluginSqliteClients,
    isRecord,
    ipcLog: pluginIpcLog,
    logHandlerError: logIpcHandlerError,
    toErrorMessage
  } = context
  const disposers: TransportDisposer[] = []

  const resolveTouchPlugin = (
    payload: unknown,
    context: unknown
  ): { pluginName: string; plugin: TouchPlugin } | { error: string } => {
    const pluginNameFromContext =
      isRecord(context) && isRecord(context.plugin) && typeof context.plugin.name === 'string'
        ? context.plugin.name
        : undefined
    const pluginNameFromPayload =
      isRecord(payload) && typeof payload.pluginName === 'string' ? payload.pluginName : undefined
    const pluginName = pluginNameFromContext ?? pluginNameFromPayload
    if (!pluginName) {
      return { error: 'Plugin name is required' }
    }
    const plugin = manager.getPluginByName(pluginName) as TouchPlugin
    if (!plugin) {
      return { error: `Plugin ${pluginName} not found` }
    }
    return { pluginName, plugin }
  }
  const PLUGIN_SYNC_QUALIFIED_PREFIX = 'plugin::'

  const parsePluginSyncQualifiedName = (
    qualifiedName: string
  ): { pluginName: string; fileName?: string } | null => {
    const trimmed = qualifiedName.trim()
    if (!trimmed.startsWith(PLUGIN_SYNC_QUALIFIED_PREFIX)) {
      return null
    }

    const body = trimmed.slice(PLUGIN_SYNC_QUALIFIED_PREFIX.length)
    const separatorIndex = body.indexOf('::')
    if (separatorIndex < 0) {
      return null
    }

    const pluginName = body.slice(0, separatorIndex).trim()
    const fileName = body.slice(separatorIndex + 2).trim()
    if (!pluginName) {
      return null
    }

    return {
      pluginName,
      fileName: fileName || undefined
    }
  }

  const normalizeSqlParams = (params: unknown): InValue[] => {
    if (!Array.isArray(params)) {
      return []
    }
    return params.map((value) => {
      if (value === undefined) {
        return null
      }
      if (value instanceof Date) {
        return value.toISOString()
      }
      if (typeof value === 'bigint') {
        return Number(value)
      }
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value)
      }
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        value === null ||
        value instanceof ArrayBuffer ||
        value instanceof Uint8Array
      ) {
        return value
      }
      return String(value)
    })
  }

  const normalizeSqlValue = (value: unknown): unknown => {
    if (typeof value === 'bigint') {
      return Number(value)
    }
    if (value instanceof Uint8Array) {
      return Array.from(value)
    }
    return value
  }

  const normalizeLastInsertRowId = (value: unknown): number | null => {
    if (typeof value === 'bigint') {
      return Number(value)
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value)
    }
    return null
  }

  const getPluginSqliteClient = (plugin: TouchPlugin): Client => {
    const existing = pluginSqliteClients.get(plugin.name)
    if (existing) {
      return existing
    }

    const sqlitePath = path.join(plugin.getDataPath(), 'plugin-sdk.sqlite')
    fse.ensureDirSync(path.dirname(sqlitePath))
    const client = createClient({ url: `file:${sqlitePath}` })
    pluginSqliteClients.set(plugin.name, client)
    return client
  }

  const resolveSqliteVersionError = (plugin: TouchPlugin): string | null => {
    const sdkapi = typeof plugin.sdkapi === 'number' ? plugin.sdkapi : 0
    if (sdkapi >= SdkApi.V260215) {
      return null
    }
    return `plugin sqlite sdk requires sdkapi >= ${SdkApi.V260215}`
  }

  const resolveSqlitePermissionError = (plugin: TouchPlugin): string | null => {
    const permissionModule = getPermissionModule()
    if (!permissionModule) {
      return null
    }

    const result = permissionModule.checkPermission(
      plugin.name,
      'storage:sqlite:query',
      plugin.sdkapi
    )
    if (result.allowed) {
      return null
    }

    return result.reason ?? `Permission '${result.permissionId}' not granted`
  }

  const normalizePluginSecretKey = (pluginName: string, rawKey: unknown): string => {
    const key = typeof rawKey === 'string' ? rawKey.trim() : ''
    if (!/^[a-z0-9._-]{1,48}$/i.test(key)) {
      throw new Error('INVALID_PLUGIN_SECRET_KEY')
    }
    return `plugin.${pluginName}.${key}`
  }

  const ensurePluginSecretPermission = (
    plugin: TouchPlugin
  ): { success: true } | { success: false; error: string } => {
    const permissionModule = getPermissionModule()
    if (!permissionModule) {
      return { success: true }
    }

    const result = permissionModule.checkPermission(
      plugin.name,
      'storage:plugin:secret',
      plugin.sdkapi
    )
    if (result.allowed) {
      return { success: true }
    }

    return {
      success: false,
      error: result.reason ?? `Permission '${result.permissionId}' not granted`
    }
  }

  // Plugin Storage Channel Handlers
  disposers.push(
    transport.on(PluginEvents.storage.getFile, async (payload, context) => {
      try {
        const fileName = payload?.fileName
        if (!fileName) {
          return { error: 'fileName is required' }
        }
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { error: resolved.error }
        }
        return resolved.plugin.getPluginFile(fileName)
      } catch (error) {
        logIpcHandlerError('plugin:storage:get-file', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.setFile, async (payload, context) => {
      try {
        const fileName = payload?.fileName
        if (!fileName) {
          return { success: false, error: 'fileName is required' }
        }
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }
        return resolved.plugin.savePluginFile(fileName, payload?.content)
      } catch (error) {
        logIpcHandlerError('plugin:storage:set-file', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.deleteFile, async (payload, context) => {
      try {
        const fileName = payload?.fileName
        if (!fileName) {
          return { success: false, error: 'fileName is required' }
        }
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }
        return resolved.plugin.deletePluginFile(fileName)
      } catch (error) {
        logIpcHandlerError('plugin:storage:delete-file', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.getSecret, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return null
        }

        const permission = ensurePluginSecretPermission(resolved.plugin)
        if (!permission.success) {
          return null
        }

        const secureKey = normalizePluginSecretKey(resolved.pluginName, payload?.key)
        const rootPath = secureStoreRootPath
        if (!isSecureStoreAvailable(rootPath)) {
          return null
        }

        return await getSecureStoreValue(rootPath, secureKey, 'plugin-secret', (message, error) =>
          pluginIpcLog.warn(message, { error: toErrorMessage(error) })
        )
      } catch (error) {
        logIpcHandlerError('plugin:storage:get-secret', error)
        return null
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.getSecretHealth, async () => {
      try {
        return await getSecureStoreHealth(secureStoreRootPath)
      } catch (error) {
        logIpcHandlerError('plugin:storage:get-secret-health', error)
        return {
          backend: 'unavailable',
          available: false,
          degraded: true,
          reason: toErrorMessage(error)
        }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.setSecret, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }

        const permission = ensurePluginSecretPermission(resolved.plugin)
        if (!permission.success) {
          return permission
        }

        const secureKey = normalizePluginSecretKey(resolved.pluginName, payload?.key)
        const rootPath = secureStoreRootPath
        if (!isSecureStoreAvailable(rootPath)) {
          return { success: false, error: 'Secure storage is unavailable' }
        }

        const persisted = await setSecureStoreValue(
          rootPath,
          secureKey,
          typeof payload?.value === 'string' && payload.value.trim() ? payload.value : null,
          'plugin-secret',
          (message, error) => pluginIpcLog.warn(message, { error: toErrorMessage(error) })
        )
        return persisted
          ? { success: true }
          : { success: false, error: 'Secure storage is unavailable' }
      } catch (error) {
        logIpcHandlerError('plugin:storage:set-secret', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.deleteSecret, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }

        const permission = ensurePluginSecretPermission(resolved.plugin)
        if (!permission.success) {
          return permission
        }

        const secureKey = normalizePluginSecretKey(resolved.pluginName, payload?.key)
        const rootPath = secureStoreRootPath
        if (!isSecureStoreAvailable(rootPath)) {
          return { success: false, error: 'Secure storage is unavailable' }
        }

        const removed = await setSecureStoreValue(
          rootPath,
          secureKey,
          null,
          'plugin-secret',
          (message, error) => pluginIpcLog.warn(message, { error: toErrorMessage(error) })
        )
        return removed
          ? { success: true }
          : { success: false, error: 'Secure storage is unavailable' }
      } catch (error) {
        logIpcHandlerError('plugin:storage:delete-secret', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.listFiles, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return []
        }
        return resolved.plugin.listPluginFiles()
      } catch (error) {
        logIpcHandlerError('plugin:storage:list-files', error)
        return []
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.listSyncItems, async (payload) => {
      try {
        const requestedQualifiedNames = Array.isArray(payload?.qualifiedNames)
          ? payload.qualifiedNames
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
          : []

        const requestedPluginName =
          typeof payload?.pluginName === 'string' ? payload.pluginName.trim() : ''

        const requestedByPlugin = new Map<string, Set<string> | null>()
        for (const qualifiedName of requestedQualifiedNames) {
          const parsed = parsePluginSyncQualifiedName(qualifiedName)
          if (!parsed) {
            continue
          }
          if (!requestedByPlugin.has(parsed.pluginName)) {
            requestedByPlugin.set(parsed.pluginName, new Set())
          }
          const targetFiles = requestedByPlugin.get(parsed.pluginName)
          if (!targetFiles) {
            continue
          }
          if (parsed.fileName) {
            targetFiles.add(parsed.fileName)
          } else {
            requestedByPlugin.set(parsed.pluginName, null)
          }
        }

        if (requestedPluginName && !requestedByPlugin.has(requestedPluginName)) {
          requestedByPlugin.set(requestedPluginName, null)
        }

        const shouldReadAllPlugins = !requestedByPlugin.size
        const targetPluginNames = shouldReadAllPlugins
          ? Array.from(manager.plugins.keys())
          : Array.from(requestedByPlugin.keys())

        const items: Array<{
          pluginName: string
          fileName: string
          qualifiedName: string
          content: unknown
        }> = []

        for (const pluginName of targetPluginNames) {
          const plugin = manager.getPluginByName(pluginName) as TouchPlugin | undefined
          if (!plugin) {
            continue
          }
          const allowedFiles = requestedByPlugin.get(pluginName) ?? null
          const fileNames = plugin.listPluginFiles()
          for (const fileName of fileNames) {
            if (allowedFiles && !allowedFiles.has(fileName)) {
              continue
            }
            items.push({
              pluginName,
              fileName,
              qualifiedName: `${PLUGIN_SYNC_QUALIFIED_PREFIX}${pluginName}::${fileName}`,
              content: plugin.getPluginFile(fileName)
            })
          }
        }

        return items
      } catch (error) {
        logIpcHandlerError('plugin:storage:list-sync-items', error)
        return []
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.applySyncItem, async (payload, context) => {
      try {
        const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : ''
        if (!fileName) {
          return { success: false, error: 'fileName is required' }
        }

        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }

        return resolved.plugin.savePluginFile(fileName, payload?.content, { broadcast: false })
      } catch (error) {
        logIpcHandlerError('plugin:storage:apply-sync-item', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.deleteSyncItem, async (payload, context) => {
      try {
        const fileName = typeof payload?.fileName === 'string' ? payload.fileName.trim() : ''
        if (!fileName) {
          return { success: false, error: 'fileName is required' }
        }

        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }

        const result = resolved.plugin.deletePluginFile(fileName, { broadcast: false })
        if (!result.success && result.error === 'File not found') {
          return { success: true }
        }
        return result
      } catch (error) {
        logIpcHandlerError('plugin:storage:delete-sync-item', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.getStats, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { error: resolved.error }
        }
        return resolved.plugin.getStorageStats()
      } catch (error) {
        logIpcHandlerError('plugin:storage:get-stats', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.getTree, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { error: resolved.error }
        }
        return resolved.plugin.getStorageTree()
      } catch (error) {
        logIpcHandlerError('plugin:storage:get-tree', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  // Plugin Storage: get-file-details (support both MAIN and PLUGIN channels)
  disposers.push(
    transport.on(PluginEvents.storage.getFileDetails, async (payload, context) => {
      try {
        const fileName = payload?.fileName
        if (!fileName) {
          return { error: 'fileName is required' }
        }
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { error: resolved.error }
        }
        return resolved.plugin.getFileDetails(fileName)
      } catch (error) {
        logIpcHandlerError('plugin:storage:get-file-details', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.clear, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }
        return resolved.plugin.clearStorage()
      } catch (error) {
        logIpcHandlerError('plugin:storage:clear', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.openFolder, async (payload, context) => {
      try {
        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return
        }
        const configPath = resolved.plugin.getConfigPath()
        await shell.openPath(configPath)
      } catch (error) {
        logIpcHandlerError('plugin:storage:open-folder', error)
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.openInEditor, async (payload) => {
      try {
        const pluginName = payload?.pluginName
        if (!pluginName) {
          return { success: false, error: 'Plugin name is required' }
        }

        const plugin = manager.getPluginByName(pluginName) as TouchPlugin
        if (!plugin) {
          return { success: false, error: `Plugin ${pluginName} not found` }
        }

        const configPath = plugin.getConfigPath()

        try {
          await execFileSafe('code', [configPath])
        } catch {
          await shell.openPath(configPath)
        }

        return { success: true }
      } catch (error) {
        logIpcHandlerError('plugin:storage:open-in-editor', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.sqlite.execute, async (payload, context) => {
      try {
        const sql = typeof payload?.sql === 'string' ? payload.sql.trim() : ''
        if (!sql) {
          return { success: false, error: 'sql is required' }
        }

        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }
        const sqliteVersionError = resolveSqliteVersionError(resolved.plugin)
        if (sqliteVersionError) {
          return { success: false, error: sqliteVersionError }
        }
        const sqlitePermissionError = resolveSqlitePermissionError(resolved.plugin)
        if (sqlitePermissionError) {
          return { success: false, error: sqlitePermissionError }
        }

        const client = getPluginSqliteClient(resolved.plugin)
        const result = await client.execute({
          sql,
          args: normalizeSqlParams(payload?.params)
        })

        return {
          success: true,
          rowsAffected: Number(result.rowsAffected ?? 0),
          lastInsertRowId: normalizeLastInsertRowId(result.lastInsertRowid)
        }
      } catch (error) {
        logIpcHandlerError('plugin:sqlite:execute', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.sqlite.query, async (payload, context) => {
      try {
        const sql = typeof payload?.sql === 'string' ? payload.sql.trim() : ''
        if (!sql) {
          return {
            success: false,
            error: 'sql is required',
            rows: [] as Array<Record<string, unknown>>
          }
        }

        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return {
            success: false,
            error: resolved.error,
            rows: [] as Array<Record<string, unknown>>
          }
        }
        const sqliteVersionError = resolveSqliteVersionError(resolved.plugin)
        if (sqliteVersionError) {
          return {
            success: false,
            error: sqliteVersionError,
            rows: [] as Array<Record<string, unknown>>
          }
        }
        const sqlitePermissionError = resolveSqlitePermissionError(resolved.plugin)
        if (sqlitePermissionError) {
          return {
            success: false,
            error: sqlitePermissionError,
            rows: [] as Array<Record<string, unknown>>
          }
        }

        const client = getPluginSqliteClient(resolved.plugin)
        const result = await client.execute({
          sql,
          args: normalizeSqlParams(payload?.params)
        })

        const rows = (result.rows ?? []).map((row) => {
          const normalized: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
            normalized[key] = normalizeSqlValue(value)
          }
          return normalized
        })

        return {
          success: true,
          rows,
          columns: Array.isArray(result.columns) ? result.columns : []
        }
      } catch (error) {
        logIpcHandlerError('plugin:sqlite:query', error)
        return {
          success: false,
          error: toErrorMessage(error),
          rows: [] as Array<Record<string, unknown>>
        }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.sqlite.transaction, async (payload, context) => {
      try {
        const statements = Array.isArray(payload?.statements) ? payload.statements : []
        if (!statements.length) {
          return {
            success: false,
            error: 'statements are required',
            results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
          }
        }

        const resolved = resolveTouchPlugin(payload, context)
        if ('error' in resolved) {
          return {
            success: false,
            error: resolved.error,
            results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
          }
        }
        const sqliteVersionError = resolveSqliteVersionError(resolved.plugin)
        if (sqliteVersionError) {
          return {
            success: false,
            error: sqliteVersionError,
            results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
          }
        }
        const sqlitePermissionError = resolveSqlitePermissionError(resolved.plugin)
        if (sqlitePermissionError) {
          return {
            success: false,
            error: sqlitePermissionError,
            results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
          }
        }

        const client = getPluginSqliteClient(resolved.plugin)
        const results: Array<{ rowsAffected: number; lastInsertRowId: number | null }> = []

        await client.execute('BEGIN IMMEDIATE')
        try {
          for (const statement of statements) {
            const sql = typeof statement?.sql === 'string' ? statement.sql.trim() : ''
            if (!sql) {
              throw new Error('sql is required in transaction statement')
            }
            const result = await client.execute({
              sql,
              args: normalizeSqlParams(statement?.params)
            })
            results.push({
              rowsAffected: Number(result.rowsAffected ?? 0),
              lastInsertRowId: normalizeLastInsertRowId(result.lastInsertRowid)
            })
          }
          await client.execute('COMMIT')
        } catch (error) {
          await client.execute('ROLLBACK')
          throw error
        }

        return { success: true, results }
      } catch (error) {
        logIpcHandlerError('plugin:sqlite:transaction', error)
        return {
          success: false,
          error: toErrorMessage(error),
          results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
        }
      }
    })
  )

  return disposers
}
