import type { IPluginManager } from '@talex-touch/utils/plugin'
import type { PluginSecurityContext } from '@talex-touch/utils/transport'
import type { PluginStorageErrorCode } from '@talex-touch/utils/transport/events/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { Logger } from '../../../utils/logger'
import type { TouchPlugin } from '../plugin'
import type { PluginSqliteResourceOwnerRegistry } from '../runtime/plugin-sqlite-resource-owner'
import { Buffer } from 'node:buffer'
import { types as utilTypes } from 'node:util'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { PluginStatus, SdkApi } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { PLUGIN_STORAGE_ERROR_CODES } from '@talex-touch/utils/transport/events/types'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { shell } from 'electron'
import {
  applySecureStoreBatch,
  getSecureStoreHealth,
  getSecureStoreValueStrict,
  isSecureStoreAvailable,
  setSecureStoreValue
} from '../../../utils/secure-store'
import { getPermissionModule } from '../../permission'
import {
  normalizePluginSqlForExecution,
  PluginSqlPolicyError,
  validatePluginSql,
  validatePluginSqlParams,
  validatePluginTransactionStatements
} from '../runtime/plugin-sql-policy'
import { PluginSqliteResourceError } from '../runtime/plugin-sqlite-resource-owner'
import { PluginSqliteWorkerError } from '../runtime/plugin-sqlite-worker-client'
import {
  isTranslationProviderConfigSafe,
  isTranslationProviderSecretKey,
  migrateTranslationProviderCredentials,
  resolveLegacyTranslationCredential,
  stripTranslationProviderCredentials
} from './translation-provider-credential-migration'

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
  const translationMigrationPromises = new Map<string, Promise<Record<string, unknown>>>()

  const currentActivationKey = (plugin: TouchPlugin): string => {
    const activation = plugin.getActivationIdentity()
    return `${activation.name}:${activation.pluginInstanceId}:${activation.activationGeneration}`
  }

  const assertCurrentActivation = (plugin: TouchPlugin, expectedKey: string): void => {
    if (
      (plugin.status !== PluginStatus.ENABLED && plugin.status !== PluginStatus.ACTIVE) ||
      currentActivationKey(plugin) !== expectedKey
    ) {
      throw new Error('TRANSLATION_CREDENTIAL_ACTIVATION_STALE')
    }
  }

  const migrateTranslationConfig = (
    plugin: TouchPlugin,
    rawConfig: unknown
  ): Promise<Record<string, unknown>> => {
    const activationKey = currentActivationKey(plugin)
    const existing = translationMigrationPromises.get(activationKey)
    if (existing) return existing
    const migration = migrateTranslationProviderCredentials({
      pluginName: plugin.name,
      config: rawConfig,
      assertCurrent: () => assertCurrentActivation(plugin, activationKey),
      getSecret: (key) =>
        getSecureStoreValueStrict(secureStoreRootPath, key, 'plugin-secret', () => undefined),
      applySecrets: async (entries) =>
        await applySecureStoreBatch(
          secureStoreRootPath,
          entries.map((entry) => ({ ...entry, purpose: 'plugin-secret' })),
          () => undefined
        ),
      persistConfig: async (config) =>
        plugin.savePluginFile('providers_config', config, { broadcast: false }).success
    }).then((result) => result.config)
    translationMigrationPromises.set(activationKey, migration)
    void migration
      .finally(() => {
        if (translationMigrationPromises.get(activationKey) === migration) {
          translationMigrationPromises.delete(activationKey)
        }
      })
      .catch(() => undefined)
    return migration
  }

  const awaitTranslationMigration = async (
    plugin: TouchPlugin,
    allowFailure = false
  ): Promise<void> => {
    const activationKey = currentActivationKey(plugin)
    const migration = translationMigrationPromises.get(activationKey)
    if (migration) {
      try {
        await migration
      } catch (error) {
        if (!allowFailure) throw error
      }
    }
    assertCurrentActivation(plugin, activationKey)
  }

  const isTranslationProviderConfig = (plugin: TouchPlugin, fileName: string): boolean =>
    plugin.name === 'touch-translation' && fileName === 'providers_config'

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

  class PluginStorageServiceError extends Error {
    constructor(
      readonly code: PluginStorageErrorCode,
      message: string
    ) {
      super(message)
      this.name = 'PluginStorageServiceError'
    }
  }

  const invalidSecretRequest = (): never => {
    throw new PluginStorageServiceError(
      PLUGIN_STORAGE_ERROR_CODES.SECRET_KEY_INVALID,
      'Plugin secret request is invalid.'
    )
  }

  const exactSecretRecord = (
    value: unknown,
    allowedKeys: readonly string[],
    requiredKeys: readonly string[] = allowedKeys
  ): Record<string, unknown> => {
    if (value === undefined && requiredKeys.length === 0) return {}
    if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
      return invalidSecretRequest()
    }
    let prototype: object | null
    let descriptors: PropertyDescriptorMap
    try {
      prototype = Object.getPrototypeOf(value)
      descriptors = Object.getOwnPropertyDescriptors(value)
    } catch {
      return invalidSecretRequest()
    }
    if (prototype !== Object.prototype && prototype !== null) return invalidSecretRequest()
    const keys = Reflect.ownKeys(descriptors)
    if (
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          !allowedKeys.includes(key) ||
          !descriptors[key]?.enumerable ||
          !Object.hasOwn(descriptors[key]!, 'value')
      ) ||
      requiredKeys.some((key) => !Object.hasOwn(descriptors, key))
    ) {
      return invalidSecretRequest()
    }
    return Object.fromEntries(
      keys.map((key) => [
        key,
        (descriptors[key as string] as PropertyDescriptor & { value: unknown }).value
      ])
    )
  }

  const normalizePluginSecretKey = (pluginName: string, rawKey: unknown): string => {
    const key = typeof rawKey === 'string' ? rawKey : ''
    if (key !== key.trim() || !/^[\w.-]{1,48}$/.test(key)) invalidSecretRequest()
    if (pluginName === 'touch-translation' && !isTranslationProviderSecretKey(key)) {
      invalidSecretRequest()
    }
    return `plugin.${pluginName}.${key}`
  }

  const normalizeSecretValue = (value: unknown, allowNull: boolean): string | null => {
    if (value === null && allowNull) return null
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      Buffer.byteLength(value, 'utf8') > 64 * 1024
    ) {
      return invalidSecretRequest()
    }
    return value
  }

  const exactSecretEntries = (value: unknown): Array<{ key: unknown; value: unknown }> => {
    if (
      !Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Array.prototype ||
      value.length === 0 ||
      value.length > 32
    ) {
      return invalidSecretRequest()
    }
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) return invalidSecretRequest()
    const entries: Array<{ key: unknown; value: unknown }> = []
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) invalidSecretRequest()
      const entry = exactSecretRecord(descriptor.value, ['key', 'value'])
      entries.push({ key: entry.key, value: entry.value })
    }
    return entries
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
      isRecord(payload) && Object.hasOwn(payload, 'pluginName') ? payload.pluginName : undefined
    if (
      payloadPluginName !== undefined &&
      (typeof payloadPluginName !== 'string' ||
        payloadPluginName !== payloadPluginName.trim() ||
        payloadPluginName !== identity.pluginName)
    ) {
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
        const translationConfig = isTranslationProviderConfig(resolved.plugin, fileName)
        if (translationConfig) {
          const privilegedPlugin = resolvePrivilegedPlugin(payload, context)
          ensureStoragePermission(privilegedPlugin, 'storage:plugin:file')
        }
        const raw = resolved.plugin.getPluginFile(fileName)
        if (!translationConfig) return raw
        try {
          return await migrateTranslationConfig(resolved.plugin, raw)
        } catch (error) {
          const code =
            error instanceof Error ? error.message : 'TRANSLATION_CREDENTIAL_MIGRATION_FAILED'
          pluginIpcLog.warn('Translation provider credential migration deferred', { error: code })
          return stripTranslationProviderCredentials(raw)
        }
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
        if (isTranslationProviderConfig(resolved.plugin, fileName)) {
          const privilegedPlugin = resolvePrivilegedPlugin(payload, context)
          ensureStoragePermission(privilegedPlugin, 'storage:plugin:file')
          await awaitTranslationMigration(privilegedPlugin)
          if (!isTranslationProviderConfigSafe(payload?.content)) {
            return {
              success: false,
              error: 'TRANSLATION_CREDENTIAL_ORDINARY_STORAGE_FORBIDDEN'
            }
          }
          const sanitized = stripTranslationProviderCredentials(payload?.content)
          return privilegedPlugin.savePluginFile(fileName, sanitized)
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
        const request = exactSecretRecord(payload, ['pluginName', 'key'], ['key'])
        const plugin = ensureSecretAccess(request, context)
        await awaitTranslationMigration(plugin, true)
        const secureKey = normalizePluginSecretKey(plugin.name, request.key)
        const requestedKey = request.key as string
        if (!isSecureStoreAvailable(secureStoreRootPath)) {
          if (plugin.name === 'touch-translation') {
            const fallback = resolveLegacyTranslationCredential(
              plugin.getPluginFile('providers_config'),
              requestedKey
            )
            if (fallback) return fallback
          }
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }

        const stored = await getSecureStoreValueStrict(
          secureStoreRootPath,
          secureKey,
          'plugin-secret',
          (message) =>
            pluginIpcLog.warn(message, {
              error: PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE
            })
        )
        const usableStored = stored && stored.trim() ? stored : null
        if (usableStored || plugin.name !== 'touch-translation') return usableStored
        return resolveLegacyTranslationCredential(
          plugin.getPluginFile('providers_config'),
          requestedKey
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
        const request = exactSecretRecord(payload, ['pluginName'], [])
        ensureSecretAccess(request, context)
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
        const request = exactSecretRecord(payload, ['pluginName', 'key', 'value'], ['key', 'value'])
        const plugin = ensureSecretAccess(request, context)
        await awaitTranslationMigration(plugin)
        const secureKey = normalizePluginSecretKey(plugin.name, request.key)
        const value = normalizeSecretValue(request.value, true)
        if (!isSecureStoreAvailable(secureStoreRootPath)) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }

        const persisted = await setSecureStoreValue(
          secureStoreRootPath,
          secureKey,
          value,
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
    transport.on(PluginEvents.storage.setSecretBatch, async (payload, context) => {
      try {
        const request = exactSecretRecord(payload, ['pluginName', 'entries'], ['entries'])
        const plugin = ensureSecretAccess(request, context)
        await awaitTranslationMigration(plugin)
        const batch = exactSecretEntries(request.entries)
        if (!isSecureStoreAvailable(secureStoreRootPath)) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }
        const seen = new Set<string>()
        const entries = batch.map((entry) => {
          const key = normalizePluginSecretKey(plugin.name, entry.key)
          if (seen.has(key)) invalidSecretRequest()
          seen.add(key)
          return {
            key,
            value: normalizeSecretValue(entry.value, true),
            purpose: 'plugin-secret'
          }
        })
        const persisted = await applySecureStoreBatch(secureStoreRootPath, entries, () => undefined)
        if (!persisted) {
          throw new PluginStorageServiceError(
            PLUGIN_STORAGE_ERROR_CODES.SECRET_UNAVAILABLE,
            'Plugin secret storage is unavailable.'
          )
        }
        return { success: true }
      } catch (error) {
        logSecretFailure('plugin:storage:set-secret-batch', error)
        return toSecretFailure(error)
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.storage.deleteSecret, async (payload, context) => {
      try {
        const request = exactSecretRecord(payload, ['pluginName', 'key'], ['key'])
        const plugin = ensureSecretAccess(request, context)
        await awaitTranslationMigration(plugin)
        const secureKey = normalizePluginSecretKey(plugin.name, request.key)
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
