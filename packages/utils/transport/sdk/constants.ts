/**
 * @fileoverview Constants for TuffTransport SDK
 * @module @talex-touch/utils/transport/sdk/constants
 */

/**
 * Default timeout for transport requests (ms)
 */
export const DEFAULT_TIMEOUT = 10_000

/**
 * Stream message types
 */
export const STREAM_MESSAGE_TYPES = {
  DATA: 'data',
  ERROR: 'error',
  END: 'end',
} as const

/**
 * Stream event name suffixes
 */
export const STREAM_SUFFIXES = {
  START: ':stream:start',
  DATA: ':stream:data',
  END: ':stream:end',
  ERROR: ':stream:error',
  CANCEL: ':stream:cancel',
} as const
