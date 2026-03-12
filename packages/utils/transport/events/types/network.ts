import type {
  NetworkConfigSnapshot,
  NetworkFileOptions,
  NetworkRequestOptions,
  NetworkResponse
} from '../../../network'

export type NetworkRequest = Omit<NetworkRequestOptions, 'signal'>
export type NetworkRequestResponse<T = unknown> = NetworkResponse<T>

export interface NetworkReadTextRequest {
  source: string
  options?: NetworkFileOptions
}

export interface NetworkReadBinaryRequest {
  source: string
  options?: NetworkFileOptions
}

export interface NetworkToTfileRequest {
  source: string
}

export type NetworkConfigGetResponse = NetworkConfigSnapshot

export interface NetworkConfigUpdateRequest {
  proxy?: NetworkConfigSnapshot['proxy']
  retry?: NetworkConfigSnapshot['retry']
  cooldown?: NetworkConfigSnapshot['cooldown']
  timeoutMs?: number
}
