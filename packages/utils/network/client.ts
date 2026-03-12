import type {
  NetworkConfigSnapshot,
  NetworkFileOptions,
  NetworkRequestOptions,
  NetworkResponse
} from './types'
import { createNetworkGuard } from './guard'
import type { NetworkGuard } from './guard'

export interface NetworkClientRuntime {
  request: <T = unknown>(options: NetworkRequestOptions) => Promise<NetworkResponse<T>>
  readText: (source: string, options?: NetworkFileOptions) => Promise<string>
  readBinary: (source: string, options?: NetworkFileOptions) => Promise<ArrayBuffer>
  toTfileUrl: (pathOrUrl: string) => string
  getConfig?: () => Promise<NetworkConfigSnapshot> | NetworkConfigSnapshot
  updateConfig?: (
    patch: Partial<NetworkConfigSnapshot> & { timeoutMs?: number }
  ) => Promise<NetworkConfigSnapshot> | NetworkConfigSnapshot
}

export interface NetworkClient {
  request: <T = unknown>(options: NetworkRequestOptions) => Promise<NetworkResponse<T>>
  readText: (source: string, options?: NetworkFileOptions) => Promise<string>
  readBinary: (source: string, options?: NetworkFileOptions) => Promise<ArrayBuffer>
  toTfileUrl: (pathOrUrl: string) => string
  guard: NetworkGuard
  getConfig?: () => Promise<NetworkConfigSnapshot>
  updateConfig?: (
    patch: Partial<NetworkConfigSnapshot> & { timeoutMs?: number }
  ) => Promise<NetworkConfigSnapshot>
}

export function createNetworkClient(
  runtime: NetworkClientRuntime,
  guard: NetworkGuard = createNetworkGuard()
): NetworkClient {
  const client: NetworkClient = {
    request: runtime.request,
    readText: runtime.readText,
    readBinary: runtime.readBinary,
    toTfileUrl: runtime.toTfileUrl,
    guard
  }

  if (runtime.getConfig) {
    client.getConfig = async () => {
      return await runtime.getConfig!()
    }
  }

  if (runtime.updateConfig) {
    client.updateConfig = async (patch) => {
      return await runtime.updateConfig!(patch)
    }
  }

  return client
}
