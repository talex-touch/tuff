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

function normalizeErrorCode(value: unknown): PluginStorageErrorCode | undefined {
  return typeof value === 'string' && pluginStorageErrorCodes.has(value)
    ? (value as PluginStorageErrorCode)
    : undefined
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
  return new PluginStorageError(
    `[Plugin Secret SDK] ${operationLabel} failed: ${message}`,
    operation,
    code,
  )
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
        const response = await transport.send(PluginEvents.storage.getSecret, { pluginName, key })
        if (response && typeof response === 'object')
          throw response
        return response
      }
      catch (error) {
        throw createSecretError(error, 'secret:get')
      }
    },

    set: async (
      key: string,
      value: string | null,
    ): Promise<PluginStorageSecretMutationResponse> => {
      return transport.send(PluginEvents.storage.setSecret, { pluginName, key, value })
    },

    delete: async (key: string): Promise<PluginStorageSecretMutationResponse> => {
      return transport.send(PluginEvents.storage.deleteSecret, { pluginName, key })
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
