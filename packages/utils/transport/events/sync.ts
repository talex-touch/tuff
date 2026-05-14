import { defineEvent, defineRawEvent } from '../event/builder'

export interface SyncStartRequest {
  reason?: string
}

export interface SyncStopRequest {
  reason?: string
}

export interface SyncTriggerRequest {
  reason?: 'user' | 'focus' | 'online'
}

export interface SyncOperationResponse {
  success: boolean
}

export const SyncEvents = {
  lifecycle: {
    start: defineEvent('sync')
      .module('lifecycle')
      .event('start')
      .define<SyncStartRequest, SyncOperationResponse>(),
    stop: defineEvent('sync')
      .module('lifecycle')
      .event('stop')
      .define<SyncStopRequest, SyncOperationResponse>(),
    trigger: defineEvent('sync')
      .module('lifecycle')
      .event('trigger')
      .define<SyncTriggerRequest, SyncOperationResponse>(),
  },
  legacy: {
    start: defineRawEvent<SyncStartRequest, SyncOperationResponse>('sync:start'),
    stop: defineRawEvent<SyncStopRequest, SyncOperationResponse>('sync:stop'),
    trigger: defineRawEvent<SyncTriggerRequest, SyncOperationResponse>('sync:trigger'),
  },
} as const
