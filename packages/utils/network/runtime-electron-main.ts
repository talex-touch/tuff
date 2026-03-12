import type { NetworkClientRuntime } from './client'
import type {
  NetworkConfigSnapshot,
  NetworkFileOptions,
  NetworkRequestOptions,
  NetworkResponse
} from './types'

export interface ElectronMainNetworkServiceLike {
  request: <T = unknown>(options: NetworkRequestOptions) => Promise<NetworkResponse<T>>
  readText: (source: string, options?: NetworkFileOptions) => Promise<string>
  readBinary: (source: string, options?: NetworkFileOptions) => Promise<ArrayBuffer>
  toTfileUrl: (pathOrUrl: string) => string
  getConfig: () => NetworkConfigSnapshot
  updateConfig: (
    patch: Partial<NetworkConfigSnapshot> & { timeoutMs?: number }
  ) => NetworkConfigSnapshot
}

export function createElectronMainNetworkRuntime(
  service: ElectronMainNetworkServiceLike
): NetworkClientRuntime {
  return {
    request: service.request.bind(service),
    readText: service.readText.bind(service),
    readBinary: service.readBinary.bind(service),
    toTfileUrl: service.toTfileUrl.bind(service),
    getConfig: service.getConfig.bind(service),
    updateConfig: service.updateConfig.bind(service)
  }
}
