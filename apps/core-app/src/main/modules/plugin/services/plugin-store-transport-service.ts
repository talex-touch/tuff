import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { StoreEvents } from '@talex-touch/utils/transport/events'
import {
  getFeaturedPlugins,
  getPluginDetails,
  listNpmPlugins,
  searchPlugins
} from '../../../service/plugin-store.service'

type TransportDisposer = () => void

export interface PluginStoreTransportContext {
  transport: ITuffTransportMain
  isRecord: (value: unknown) => value is Record<string, unknown>
  logHandlerError: (handler: string, error: unknown) => void
}

/** Registers plugin-store transport handlers. */
export function registerPluginStoreTransportHandlers(
  context: PluginStoreTransportContext
): TransportDisposer[] {
  const { transport, isRecord, logHandlerError: logIpcHandlerError } = context

  return [
    transport.on(StoreEvents.api.search, async (payload) => {
      try {
        const source =
          payload?.source === 'tpex' || payload?.source === 'npm' || payload?.source === 'all'
            ? payload.source
            : undefined
        return await searchPlugins({
          keyword: payload?.keyword,
          source,
          category: payload?.category,
          limit: payload?.limit,
          offset: payload?.offset
        })
      } catch (error: unknown) {
        logIpcHandlerError('plugin:store:search', error)
        return { error: error instanceof Error ? error.message : 'STORE_SEARCH_FAILED' }
      }
    }),
    transport.on(StoreEvents.api.getPlugin, async (payload) => {
      try {
        const identifier = payload?.identifier
        if (!identifier) return null
        const source =
          payload?.source === 'tpex' || payload?.source === 'npm' ? payload.source : undefined
        const plugin = await getPluginDetails(identifier, source)
        return plugin ?? null
      } catch (error: unknown) {
        logIpcHandlerError('plugin:store:get-plugin', error)
        return null
      }
    }),
    transport.on(StoreEvents.api.featured, async (payload) => {
      try {
        const limit =
          isRecord(payload) && typeof payload.limit === 'number' ? payload.limit : undefined
        const plugins = await getFeaturedPlugins(limit)
        return { plugins }
      } catch (error: unknown) {
        logIpcHandlerError('plugin:store:featured', error)
        return { plugins: [] }
      }
    }),
    transport.on(StoreEvents.api.npmList, async () => {
      try {
        const plugins = await listNpmPlugins()
        return { plugins }
      } catch (error: unknown) {
        logIpcHandlerError('plugin:store:npm-list', error)
        return { plugins: [] }
      }
    })
  ]
}
