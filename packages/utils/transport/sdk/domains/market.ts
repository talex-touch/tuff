import type { ITuffTransport } from '../../types'
import type {
  MarketCheckUpdatesResponse,
  MarketGetPluginRequest,
  MarketGetPluginResponse,
  MarketHttpRequest,
  MarketHttpRequestResponse,
  MarketSearchRequest,
  MarketSearchResponse,
  MarketUpdatesAvailablePayload,
} from '../../events/types'
import { MarketEvents } from '../../events'

export interface MarketSdk {
  checkUpdates(): Promise<MarketCheckUpdatesResponse>
  search(request: MarketSearchRequest): Promise<MarketSearchResponse>
  getPlugin(request: MarketGetPluginRequest): Promise<MarketGetPluginResponse>
  httpRequest<T = unknown>(request: MarketHttpRequest): Promise<MarketHttpRequestResponse<T>>
  featured(payload?: unknown): Promise<unknown>
  npmList(): Promise<unknown>
  onUpdatesAvailable(handler: (payload: MarketUpdatesAvailablePayload) => void): () => void
}

export function createMarketSdk(transport: ITuffTransport): MarketSdk {
  return {
    checkUpdates: async () => transport.send(MarketEvents.api.checkUpdates),
    search: async (request) => transport.send(MarketEvents.api.search, request),
    getPlugin: async (request) => transport.send(MarketEvents.api.getPlugin, request),
    httpRequest: async (request) => transport.send(MarketEvents.api.httpRequest, request),
    featured: async (payload) => transport.send(MarketEvents.api.featured, payload),
    npmList: async () => transport.send(MarketEvents.api.npmList),
    onUpdatesAvailable: (handler) => transport.on(MarketEvents.push.updatesAvailable, handler),
  }
}

