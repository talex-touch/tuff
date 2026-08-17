import type {
  PluginNetworkRequest,
  PluginNetworkResponse,
  PluginNetworkSdk,
} from '@talex-touch/utils/plugin/sdk'
import { usePluginNetwork } from '@talex-touch/utils/plugin/sdk'

let pluginNetworkClient: PluginNetworkSdk | null = null

function isNetworkResponse<T>(value: unknown): value is PluginNetworkResponse<T> {
  if (!value || typeof value !== 'object') return false
  return (
    'status' in value
    && typeof value.status === 'number'
    && 'statusText' in value
    && typeof value.statusText === 'string'
    && 'headers' in value
    && Boolean(value.headers)
    && typeof value.headers === 'object'
    && 'data' in value
    && 'url' in value
    && typeof value.url === 'string'
    && 'ok' in value
    && typeof value.ok === 'boolean'
  )
}

export function getPluginNetworkClient(): PluginNetworkSdk {
  if (!pluginNetworkClient) {
    const hostNetwork = usePluginNetwork()
    pluginNetworkClient = {
      request: async <T = unknown>(request: PluginNetworkRequest) => {
        const response: unknown = await hostNetwork.request<T>(request)
        if (isNetworkResponse<T>(response)) {
          return response
        }
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          data: response as T,
          url: request.url,
          ok: true,
        }
      },
    }
  }
  return pluginNetworkClient
}
