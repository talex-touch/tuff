import type {
  PluginStorageDeleteRequest,
  PluginStorageGetRequest,
  PluginStorageSetRequest,
  StorageDeleteRequest,
  StorageGetRequest,
  StorageGetVersionedResponse,
  StorageSaveRequest,
  StorageSaveResult,
  StorageSetRequest,
  StorageUpdateNotification,
} from '../../events/types/storage'
import type { ITuffTransport, StreamController, StreamOptions } from '../../types'
import { StorageEvents } from '../../events'

export interface StorageSdk {
  app: {
    get: <T = unknown>(key: string | StorageGetRequest) => Promise<T | null>
    getVersioned: <T = unknown>(
      key: string | StorageGetRequest,
    ) => Promise<(StorageGetVersionedResponse & { data: T }) | null>
    set: (payload: StorageSetRequest) => Promise<void>
    save: (payload: StorageSaveRequest) => Promise<StorageSaveResult>
    delete: (key: string | StorageDeleteRequest) => Promise<void>
    streamUpdated: (
      options: StreamOptions<StorageUpdateNotification>,
    ) => Promise<StreamController>
  }
  plugin: {
    get: <T = unknown>(payload: PluginStorageGetRequest) => Promise<T | null>
    set: (payload: PluginStorageSetRequest) => Promise<void>
    delete: (payload: PluginStorageDeleteRequest) => Promise<void>
  }
}

function normalizeStorageGetRequest(key: string | StorageGetRequest): StorageGetRequest {
  return typeof key === 'string' ? { key } : key
}

function normalizeStorageDeleteRequest(
  key: string | StorageDeleteRequest,
): StorageDeleteRequest {
  return typeof key === 'string' ? { key } : key
}

export function createStorageSdk(transport: ITuffTransport): StorageSdk {
  return {
    app: {
      get: async <T = unknown>(key: string | StorageGetRequest) => {
        const data = await transport.send(StorageEvents.app.get, normalizeStorageGetRequest(key))
        return (data ?? null) as T | null
      },
      getVersioned: async <T = unknown>(key: string | StorageGetRequest) => {
        const data = await transport.send(
          StorageEvents.app.getVersioned,
          normalizeStorageGetRequest(key),
        )
        return data as (StorageGetVersionedResponse & { data: T }) | null
      },
      set: payload => transport.send(StorageEvents.app.set, payload),
      save: payload => transport.send(StorageEvents.app.save, payload),
      delete: key => transport.send(StorageEvents.app.delete, normalizeStorageDeleteRequest(key)),
      streamUpdated: options =>
        transport.stream(StorageEvents.app.updated, undefined, options),
    },
    plugin: {
      get: async <T = unknown>(payload: PluginStorageGetRequest) => {
        const data = await transport.send(StorageEvents.plugin.get, payload)
        return (data ?? null) as T | null
      },
      set: payload => transport.send(StorageEvents.plugin.set, payload),
      delete: payload => transport.send(StorageEvents.plugin.delete, payload),
    },
  }
}

export type {
  PluginStorageDeleteRequest,
  PluginStorageGetRequest,
  PluginStorageSetRequest,
  StorageDeleteRequest,
  StorageGetRequest,
  StorageGetVersionedResponse,
  StorageSaveRequest,
  StorageSaveResult,
  StorageSetRequest,
  StorageUpdateNotification,
}
