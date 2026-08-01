/// <reference types="node" />

import type {
  NapiCarrier,
  NativeCarrierLogger,
  NativeProtocolBinding,
} from './protocol'

export type ScreenshotCarrierUnavailableReason
  = | 'disabled-by-env'
    | 'binding-unavailable'
    | 'export-mismatch'

export interface CreateScreenshotCarrierOptions {
  binding: NativeProtocolBinding
  id?: string
  logger?: NativeCarrierLogger
  clientName?: string
  clientVersion?: string
}

export interface LoadScreenshotCarrierOptions
  extends Omit<CreateScreenshotCarrierOptions, 'binding'> {
  binding?: NativeProtocolBinding
  baseDir?: string
}

export type ScreenshotCarrierLoadResult
  = | { carrier: NapiCarrier, reason: null }
    | { carrier: null, reason: ScreenshotCarrierUnavailableReason }

export declare const SCREENSHOT_PROTOCOL_EXPORTS: readonly string[]

export declare function createScreenshotCarrier(
  options: CreateScreenshotCarrierOptions,
): NapiCarrier

export declare function loadScreenshotCarrier(
  options?: LoadScreenshotCarrierOptions,
): ScreenshotCarrierLoadResult
