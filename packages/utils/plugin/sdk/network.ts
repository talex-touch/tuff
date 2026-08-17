import type {
  NetworkRequest,
  NetworkRequestResponse,
} from '../../transport/events/types'
import { createPluginTuffTransport } from '../../transport'
import { NetworkEvents } from '../../transport/events'
import { ensureRendererChannel } from './channel'

export type PluginNetworkRequest = NetworkRequest
export type PluginNetworkResponse<T = unknown> = NetworkRequestResponse<T>

export interface PluginNetworkSdk {
  request: <T = unknown>(request: PluginNetworkRequest) => Promise<PluginNetworkResponse<T>>
}

/** Send permission-gated network requests through the host from a plugin Surface. */
export function usePluginNetwork(): PluginNetworkSdk {
  const channel = ensureRendererChannel(
    '[Plugin Network] Channel not available. Make sure this is called in a plugin context.',
  )
  const transport = createPluginTuffTransport(channel as any)

  return {
    request: <T = unknown>(request: PluginNetworkRequest) =>
      transport.send(NetworkEvents.api.request, request) as Promise<PluginNetworkResponse<T>>,
  }
}
