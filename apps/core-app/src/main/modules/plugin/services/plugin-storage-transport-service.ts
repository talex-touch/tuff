import type { IPluginManager } from '@talex-touch/utils/plugin'
import type { PluginSecurityContext } from '@talex-touch/utils/transport'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { PluginStorageErrorCode } from '@talex-touch/utils/transport/events/types'
import type { Logger } from '../../../utils/logger'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { PluginStatus, SdkApi } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { PLUGIN_STORAGE_ERROR_CODES } from '@talex-touch/utils/transport/events/types'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { shell } from 'electron'
import { getPermissionModule } from '../../permission'
import {
  getSecureStoreHealth,
  getSecureStoreValueStrict,
  isSecureStoreAvailable,
  setSecureStoreValue
} from '../../../utils/secure-store'
import { TouchPlugin } from '../plugin'
import {
  normalizePluginSqlForExecution,
  PluginSqlPolicyError,
  validatePluginSql,
  validatePluginSqlParams,
  validatePluginTransactionStatements
} from '../runtime/plugin-sql-policy'
import {
  PluginSqliteResourceError,
  PluginSqliteResourceOwnerRegistry
} from '../runtime/plugin-sqlite-resource-owner'
import { PluginSqliteWorkerError } from '../runtime/plugin-sqlite-worker-client'

type TransportDisposer = () => void

export interface PluginStorageTransportContext {
  manager: IPluginManager
  transport: ITuffTransportMain
  secureStoreRootPath: string
  pluginSqliteResources: PluginSqliteResourceOwnerRegistry
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
    pluginSqliteResources,
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

  const normalizePluginSecretKey = (pluginName: string, rawKey: unknown): string => {
    const key = typeof rawKey === 'string' ? rawKey.trim() : ''
    if (!/^[a-z0-9._-]{1,48}$/i.test(key)) {
      throw new PluginStorageServiceError(
        PLUGIN_STORAGE_ERROR_CODES.SECRET_KEY_INVALID,
        'Plugin secret key is invalid.'
      )
    }
    return `plugin.${pluginName}.${key}`
  }

  class PluginStorageServiceError extends Error {
    constructor(
      readonly code: PluginStorageErrorCode,
      message: string
    ) {
      super(message)
      this.name = 'PluginStorageServiceError'
    }
  }

  const resolvePrivilegedPlugin = (payload: unknown, handlerContext: unknown): TouchPlugin => {
    const securityContext = (
      isRecord(handlerContext) && isRecord(handlerContext.plugin)
        ? handlerContext.plugin
        : undefined
    ) as PluginSecurityContext | undefined
    if (!isAuthoritativePluginContext(securityContext)) {
      throw new PluginStorageServiceError(
        PLUGIN_STORAGE_ERROR_CODES.CALLER_UNVERIFIED,
        'Authoritative plugin caller identity is required.'
      )
    }

    const identity = securityContext.identity
    const plugin = manager.getPluginByName(identity.pluginName) as TouchPlugin | undefined
    const current = plugin?.getActivationIdentity()
    if (
      !plugin ||
      !current ||
      (plugin.status !== PluginStatus.ENABLED && plugin.status !== PluginStatus.ACTIVE) ||
      current.pluginInstanceId !== identity.pluginInstanceId ||
      current.activationGeneration !== identity.activationGeneration
    ) {
      throw new PluginStorageServiceError(
        PLUGIN_STORAGE_ERROR_CODES.PLUGIN_UNAVAILABLE,
        'Current plugin activation is unavailable.'
      )
    }

    const payloadPluginName =
      isRecord(payload) && typeof payload.pluginName === 'string' ? payload.pluginName.trim() : ''
    if (payloadPluginName && payloadPluginName !== identity.pluginName) {
      throw new PluginStorageServiceError(
        PLUGIN_STORAGE_ERROR_CODES.CALLER_UNVERIFIED,
        'Plugin caller identity does not match the request.'
      )
    }
    return plugin
  }

  const ensureStoragePermission = (plugin: TouchPlugin, apiName: string): void => {
    const permissionModule = getPermissionModule()
    if (!permissionModule) {
      throw new PluginStorageServiceError(
        PLUGIN_STORAGE_ERROR_CODES.PERMISSION_UNAVAILABLE,
        'Plugin storage permission runtime is unavailable.'
      )
    }
    const result = permissionModule.checkPermission(plugin.name, apiName, plugin.sdkapi)
    if (!result.allowed) {
      throw new PluginStorageServiceError(
        PLUGIN_STORAGE_ERROR_CODES.PERMISSION_DENIED,
        'Plugin storage permission is denied.'
      )
    }
  }

  const ensureSqliteAccess = (payload: unknown, handlerContext: unknown): TouchPlugin => {
    const plugin = resolvePrivilegedPlugin(payload, handlerContext)
    const sdkapi = typeof plugin.sdkapi === 'number' ? plugin.sdkapi : 0
    if (sdkapi < SdkApi.V260215) {
      throw new PluginStorageServiceError(
        PLUGIN_STORAGE_ERROR_CODES.SDKAPI_MISMATCH,
        `Plugin SQLite requires sdkapi >= ${SdkApi.V260215}.`
      )
    }
    ensureStoragePermission(plugin, 'storage:sqlite:query')
    return plugin
  }

  const ensureSecretAccess = (payload: unknown, handlerContext: unknown): TouchPlugin => {
    const plugin = resolvePrivilegedPlugin(payload, handlerContext)
    ensureStoragePermission(plugin, 'storage:plugin:secret')
    return plugin
  }

  const getSqliteResource = async (plugin: TouchPlugin) => {
    const activation = plugin.getActivationIdentity()
    return pluginSqliteResources.acquire(
      {
        pluginName: activation.name,
        pluginInstanceId: activation.pluginInstanceId,
        activationGeneration: activation.activationGeneration
      },
      plugin.getDataPath()
    )
  }

  const toStorageFailure = (error: unknown) => {
    if (
      error instanceof PluginStorageServiceError ||
      error instanceof PluginSqlPolicyError ||
      error instanceof PluginSqliteResourceError ||
      error instanceof PluginSqliteWorkerError
    ) {
      return { success: false as const, code: error.code, error: error.message }
    }
    return {
      success: false as const,
      code: PLUGIN_STORAGE_ERROR_CODES.SQLITE_UNAVAILABLE,
      error: 'Plugin SQLite operation failed.'
    }
  }

  const toSecretFailure = (error: unknown) => {
    if (error instanceof PluginStorageServiceError) {
      return { success: false as const, code: error.code, error: error.message }
    }
    return {
      success: false as const,
      code: PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
      error: 'Plugin secret storage is unavailable.'
    }
  }

  const logSecretFailure = (handler: string, error: unknown): void => {
    const code =
      error instanceof PluginStorageServiceError
        ? error.code
        : PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE
    logIpcHandlerError(handler, new Error(code))
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
        const plugin = ensureSecretAccess(payload, context)
        const secureKey = normalizePluginSecretKey(plugin.name, payload?.key)
        if (!isSecureStoreAvailable(secureStoreRootPath)) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }

        return await getSecureStoreValueStrict(
          secureStoreRootPath,
          secureKey,
          'plugin-secret',
          (message) =>
            pluginIpcLog.warn(message, {
              error: PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE
            })
        )
      } catch (error) {
        logSecretFailure('plugin:storage:get-secret', error)
        return toSecretFailure(error)
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.getSecretHealth, async (payload, context) => {
      try {
        ensureSecretAccess(payload, context)
        return await getSecureStoreHealth(secureStoreRootPath)
      } catch (error) {
        logSecretFailure('plugin:storage:get-secret-health', error)
        return toSecretFailure(error)
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.setSecret, async (payload, context) => {
      try {
        const plugin = ensureSecretAccess(payload, context)
        const secureKey = normalizePluginSecretKey(plugin.name, payload?.key)
        if (!isSecureStoreAvailable(secureStoreRootPath)) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }

        const persisted = await setSecureStoreValue(
          secureStoreRootPath,
          secureKey,
          typeof payload?.value === 'string' && payload.value.trim() ? payload.value : null,
          'plugin-secret',
          (message) =>
            pluginIpcLog.warn(message, {
              error: PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE
            })
        )
        if (!persisted) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }
        return { success: true }
      } catch (error) {
        logSecretFailure('plugin:storage:set-secret', error)
        return toSecretFailure(error)
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.deleteSecret, async (payload, context) => {
      try {
        const plugin = ensureSecretAccess(payload, context)
        const secureKey = normalizePluginSecretKey(plugin.name, payload?.key)
        if (!isSecureStoreAvailable(secureStoreRootPath)) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }

        const removed = await setSecureStoreValue(
          secureStoreRootPath,
          secureKey,
          null,
          'plugin-secret',
          (message) =>
            pluginIpcLog.warn(message, {
              error: PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE
            })
        )
        if (!removed) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }
        return { success: true }
      } catch (error) {
        logSecretFailure('plugin:storage:delete-secret', error)
        return toSecretFailure(error)
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
        const plugin = ensureSqliteAccess(payload, context)
        validatePluginSql(payload?.sql, 'execute')
        const params = validatePluginSqlParams(payload?.params)
        const client = await getSqliteResource(plugin)
        const result = await client.execute(normalizePluginSqlForExecution(payload.sql), params)
        return { success: true, ...result }
      } catch (error) {
        logIpcHandlerError('plugin:sqlite:execute', error)
        return toStorageFailure(error)
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.sqlite.query, async (payload, context) => {
      try {
        const plugin = ensureSqliteAccess(payload, context)
        validatePluginSql(payload?.sql, 'query')
        const params = validatePluginSqlParams(payload?.params)
        const client = await getSqliteResource(plugin)
        const result = await client.query(normalizePluginSqlForExecution(payload.sql), params)
        return { success: true, ...result }
      } catch (error) {
        logIpcHandlerError('plugin:sqlite:query', error)
        return { ...toStorageFailure(error), rows: [] as Array<Record<string, unknown>> }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.sqlite.transaction, async (payload, context) => {
      try {
        const plugin = ensureSqliteAccess(payload, context)
        const statements = validatePluginTransactionStatements(payload?.statements)
        const client = await getSqliteResource(plugin)
        const result = await client.transaction(
          statements.map((statement) => ({
            sql: normalizePluginSqlForExecution(statement.sql),
            params: validatePluginSqlParams(statement.params)
          }))
        )
        return { success: true, ...result }
      } catch (error) {
        logIpcHandlerError('plugin:sqlite:transaction', error)
        return {
          ...toStorageFailure(error),
          results: [] as Array<{ rowsAffected: number; lastInsertRowId: number | null }>
        }
      }
    })
  )

  return disposers
}
