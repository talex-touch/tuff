import type {
  PluginStorageErrorCode,
  PluginStorageSecretMutationResponse,
  SecureStoreHealthResponse,
} from '../../transport/events/types'
import type { PluginStorageOperation } from './sqlite'
import { createPluginTuffTransport } from '../../transport'
import { PluginEvents } from '../../transport/events'
import { PLUGIN_STORAGE_ERROR_CODES } from '../../transport/events/types'
import { ensureRendererChannel } from './channel'
import { usePluginName } from './plugin-info'
import { PluginStorageError } from './sqlite'

const pluginStorageErrorCodes = new Set<string>(Object.values(PLUGIN_STORAGE_ERROR_CODES))
const PLUGIN_SECRET_MAX_BYTES = 64 * 1024
const PLUGIN_SECRET_BATCH_MAX_ENTRIES = 32

function normalizeSecretKey(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || !/^[\w.-]{1,48}$/.test(value)) {
    throw new TypeError('PLUGIN_SECRET_KEY_INVALID')
  }
  return value
}

function normalizeSecretValue(value: unknown): string | null {
  if (value === null)
    return null
  if (
    typeof value !== 'string'
    || !value.trim()
    || new TextEncoder().encode(value).byteLength > PLUGIN_SECRET_MAX_BYTES
  ) {
    throw new TypeError('PLUGIN_SECRET_VALUE_INVALID')
  }
  return value
}

function normalizeSecretEntries(value: unknown): Array<{ key: string, value: string | null }> {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length === 0
    || value.length > PLUGIN_SECRET_BATCH_MAX_ENTRIES
  ) {
    throw new TypeError('PLUGIN_SECRET_BATCH_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(descriptors).length !== value.length + 1)
    throw new TypeError('PLUGIN_SECRET_BATCH_INVALID')
  const seen = new Set<string>()
  const result: Array<{ key: string, value: string | null }> = []
  for (let index = 0; index < value.length; index += 1) {
    const itemDescriptor = descriptors[String(index)]
    if (!itemDescriptor?.enumerable || !Object.hasOwn(itemDescriptor, 'value'))
      throw new TypeError('PLUGIN_SECRET_BATCH_INVALID')
    const item = itemDescriptor.value
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.getPrototypeOf(item) !== Object.prototype)
      throw new TypeError('PLUGIN_SECRET_BATCH_INVALID')
    const itemDescriptors = Object.getOwnPropertyDescriptors(item)
    const keys = Reflect.ownKeys(itemDescriptors)
    if (
      keys.length !== 2
      || keys.some(
        key =>
          typeof key !== 'string'
          || (key !== 'key' && key !== 'value')
          || !itemDescriptors[key]?.enumerable
          || !Object.hasOwn(itemDescriptors[key]!, 'value'),
      )
    ) {
      throw new TypeError('PLUGIN_SECRET_BATCH_INVALID')
    }
    const key = normalizeSecretKey(itemDescriptors.key!.value)
    if (seen.has(key))
      throw new TypeError('PLUGIN_SECRET_BATCH_INVALID')
    seen.add(key)
    result.push({ key, value: normalizeSecretValue(itemDescriptors.value!.value) })
  }
  return result
}

function normalizeErrorCode(value: unknown): PluginStorageErrorCode | undefined {
  return typeof value === 'string' && pluginStorageErrorCodes.has(value) ? (value as PluginStorageErrorCode) : undefined
}

function createSecretError(error: unknown, operation: PluginStorageOperation): PluginStorageError {
  if (error instanceof PluginStorageError)
    return error
  const operationLabel = operation.slice('secret:'.length)
  const message
    = error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'error' in error
        ? String((error as { error?: unknown }).error ?? 'Unknown error')
        : 'Unknown error'
  const code
    = error && typeof error === 'object' && 'code' in error
      ? normalizeErrorCode((error as { code?: unknown }).code)
      : undefined
  return new PluginStorageError(`[Plugin Secret SDK] ${operationLabel} failed: ${message}`, operation, code)
}

/** Access secure per-plugin values. */
export function usePluginSecret() {
  const pluginName = usePluginName(
    '[Plugin Secret] Cannot determine plugin name. Make sure this is called in a plugin context.',
  )
  const channel = ensureRendererChannel(
    '[Plugin Secret] Channel not available. Make sure this is called in a plugin context.',
  )
  const transport = createPluginTuffTransport(channel as any)

  return {
    get: async (key: string): Promise<string | null> => {
      try {
        const response = await transport.send(PluginEvents.storage.getSecret, {
          pluginName,
          key: normalizeSecretKey(key),
        })
        if (response && typeof response === 'object')
          throw response
        if (
          response !== null
          && (typeof response !== 'string'
            || !response.trim()
            || new TextEncoder().encode(response).byteLength > PLUGIN_SECRET_MAX_BYTES)
        ) {
          throw new TypeError('PLUGIN_SECRET_RESPONSE_INVALID')
        }
        return response
      }
      catch (error) {
        throw createSecretError(error, 'secret:get')
      }
    },

    set: async (key: string, value: string | null): Promise<PluginStorageSecretMutationResponse> => {
      return transport.send(PluginEvents.storage.setSecret, {
        pluginName,
        key: normalizeSecretKey(key),
        value: normalizeSecretValue(value),
      })
    },

    setMany: async (
      entries: Array<{ key: string, value: string | null }>,
    ): Promise<PluginStorageSecretMutationResponse> => {
      return transport.send(PluginEvents.storage.setSecretBatch, {
        pluginName,
        entries: normalizeSecretEntries(entries),
      })
    },

    delete: async (key: string): Promise<PluginStorageSecretMutationResponse> => {
      return transport.send(PluginEvents.storage.deleteSecret, {
        pluginName,
        key: normalizeSecretKey(key),
      })
    },

    health: async (): Promise<SecureStoreHealthResponse> => {
      try {
        const response = await transport.send(PluginEvents.storage.getSecretHealth)
        if ('backend' in response)
          return response
        throw response
      }
      catch (error) {
        throw createSecretError(error, 'secret:health')
      }
    },
  }
}
