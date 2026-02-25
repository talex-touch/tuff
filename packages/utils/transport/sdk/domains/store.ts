import type {
  StoreCheckUpdatesResponse,
  StoreGetPluginRequest,
  StoreGetPluginResponse,
  StoreHttpRequest,
  StoreHttpRequestResponse,
  StoreSearchRequest,
  StoreSearchResponse,
  StoreUpdatesAvailablePayload,
} from '../../events/types'
import type { ITuffTransport } from '../../types'
import { StoreEvents } from '../../events'

export interface StoreSdk {
  checkUpdates: () => Promise<StoreCheckUpdatesResponse>
  search: (request: StoreSearchRequest) => Promise<StoreSearchResponse>
  getPlugin: (request: StoreGetPluginRequest) => Promise<StoreGetPluginResponse>
  httpRequest: <T = unknown>(request: StoreHttpRequest) => Promise<StoreHttpRequestResponse<T>>
  featured: (payload?: unknown) => Promise<unknown>
  npmList: () => Promise<unknown>
  onUpdatesAvailable: (handler: (payload: StoreUpdatesAvailablePayload) => void) => () => void
}

export function createStoreSdk(transport: ITuffTransport): StoreSdk {
  return {
    checkUpdates: async () => transport.send(StoreEvents.api.checkUpdates),
    search: async request => transport.send(StoreEvents.api.search, request),
    getPlugin: async request => transport.send(StoreEvents.api.getPlugin, request),
    httpRequest: async <T = unknown>(request: StoreHttpRequest) =>
      transport.send(StoreEvents.api.httpRequest, request) as Promise<StoreHttpRequestResponse<T>>,
    featured: async payload => transport.send(StoreEvents.api.featured, payload),
    npmList: async () => transport.send(StoreEvents.api.npmList),
    onUpdatesAvailable: handler => transport.on(StoreEvents.push.updatesAvailable, handler),
  }
}
