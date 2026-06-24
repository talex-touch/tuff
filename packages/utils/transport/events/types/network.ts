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

export interface NetworkCooldownClearRequest {
  key?: string
}

export type NetworkLifecycleReason = 'online' | 'offline' | 'resume' | 'manual' | 'probe'

export interface NetworkLifecycleStatusPayload {
  online: boolean
  reason?: NetworkLifecycleReason
  changedAt: number
}

export interface NetworkLifecycleOnlinePayload {
  online?: true
  reason?: NetworkLifecycleReason
  changedAt?: number
}

export interface NetworkLifecycleOfflinePayload {
  online?: false
  reason?: NetworkLifecycleReason
  changedAt?: number
}
