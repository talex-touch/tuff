import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'

export type EverythingBackendType = 'sdk-napi' | 'cli' | 'unavailable'
export type EverythingHealthState = 'healthy' | 'degraded' | 'unsupported'

export interface EverythingStatusResponse {
  enabled: boolean
  available: boolean
  backend: EverythingBackendType
  health: EverythingHealthState
  healthReason: string | null
  version: string | null
  esPath: string | null
  error: string | null
  lastBackendError: string | null
  fallbackChain: EverythingBackendType[]
  lastChecked: number | null
}

export interface EverythingToggleRequest {
  enabled: boolean
}

export interface EverythingToggleResponse {
  success: boolean
  enabled: boolean
}

export interface EverythingTestResponse {
  success: boolean
  backend?: EverythingBackendType
  error?: string
  resultCount?: number
  duration?: number
}

export const everythingStatusEvent = defineRawEvent<void, EverythingStatusResponse>(
  'everything:status'
)

export const everythingToggleEvent = defineRawEvent<
  EverythingToggleRequest,
  EverythingToggleResponse
>('everything:toggle')

export const everythingTestEvent = defineRawEvent<void, EverythingTestResponse>('everything:test')
