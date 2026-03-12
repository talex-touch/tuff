import type {
  NetworkConfigGetResponse,
  NetworkConfigUpdateRequest,
  NetworkReadBinaryRequest,
  NetworkReadTextRequest,
  NetworkRequest,
  NetworkRequestResponse,
  NetworkToTfileRequest
} from '../../events/types'
import type { NetworkFileOptions } from '../../../network'
import type { ITuffTransport } from '../../types'
import { NetworkEvents } from '../../events'

export interface NetworkSdk {
  request: <T = unknown>(req: NetworkRequest) => Promise<NetworkRequestResponse<T>>
  readText: (source: string, options?: NetworkFileOptions) => Promise<string>
  readBinary: (source: string, options?: NetworkFileOptions) => Promise<ArrayBuffer>
  toTfileUrl: (pathOrUrl: string) => Promise<string>
  getConfig: () => Promise<NetworkConfigGetResponse>
  updateConfig: (request: NetworkConfigUpdateRequest) => Promise<NetworkConfigGetResponse>
}

export function createNetworkSdk(transport: ITuffTransport): NetworkSdk {
  return {
    request: <T = unknown>(req: NetworkRequest) =>
      transport.send(NetworkEvents.api.request, req) as Promise<NetworkRequestResponse<T>>,
    readText: (source: string, options?: NetworkFileOptions) =>
      transport.send(NetworkEvents.api.readText, {
        source,
        options
      } as NetworkReadTextRequest),
    readBinary: (source: string, options?: NetworkFileOptions) =>
      transport.send(NetworkEvents.api.readBinary, {
        source,
        options
      } as NetworkReadBinaryRequest),
    toTfileUrl: (pathOrUrl: string) =>
      transport.send(NetworkEvents.api.toTfileUrl, { source: pathOrUrl } as NetworkToTfileRequest),
    getConfig: () => transport.send(NetworkEvents.api.getConfig),
    updateConfig: (request: NetworkConfigUpdateRequest) =>
      transport.send(NetworkEvents.api.updateConfig, request)
  }
}
