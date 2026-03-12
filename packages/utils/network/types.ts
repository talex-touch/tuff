export type NetworkMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'

export type NetworkResponseType = 'json' | 'text' | 'arrayBuffer' | 'stream'

export interface NetworkRetryPolicy {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
  retryOnNetworkError?: boolean
  retryOnTimeout?: boolean
  retryableStatusCodes?: number[]
}

export interface NetworkCooldownPolicy {
  key?: string
  failureThreshold?: number
  cooldownMs?: number
  autoResetOnSuccess?: boolean
}

export interface NetworkProxyCustomConfig {
  httpProxy?: string
  httpsProxy?: string
  socksProxy?: string
  pacUrl?: string
  bypass?: string[]
}

export interface NetworkProxyConfig {
  mode: 'direct' | 'system' | 'custom'
  custom?: NetworkProxyCustomConfig
  authRef?: string | null
}

export interface NetworkRequestOptions<TBody = unknown> {
  method?: NetworkMethod
  url: string
  headers?: Record<string, string>
  body?: TBody
  query?: Record<string, string | number | boolean | null | undefined>
  timeoutMs?: number
  signal?: AbortSignal
  retryPolicy?: NetworkRetryPolicy
  cooldownPolicy?: NetworkCooldownPolicy
  proxyOverride?: NetworkProxyConfig
  responseType?: NetworkResponseType
  validateStatus?: number[]
}

export interface NetworkResponse<T = unknown> {
  status: number
  statusText: string
  headers: Record<string, string>
  data: T
  url: string
  ok: boolean
}

export interface NetworkFileOptions {
  encoding?: string
  allowMissing?: boolean
  timeoutMs?: number
  retryPolicy?: NetworkRetryPolicy
  cooldownPolicy?: NetworkCooldownPolicy
  proxyOverride?: NetworkProxyConfig
}

export interface NetworkConfigSnapshot {
  proxy: NetworkProxyConfig
  retry: NetworkRetryPolicy
  cooldown: NetworkCooldownPolicy
  timeoutMs: number
}
