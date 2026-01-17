/**
 * @fileoverview Type definitions for Market domain events
 * @module @talex-touch/utils/transport/events/types/market
 */

import type { MarketHttpRequestOptions, MarketHttpResponse, MarketPlugin } from '../../../../market/types'

export interface MarketCheckUpdatesResponse {
  updates: MarketPlugin[]
  checkedAt: string
}

export interface MarketSearchRequest {
  keyword?: string
  source?: string
  category?: string
  limit?: number
  offset?: number
}

export type MarketSearchResponse = unknown

export interface MarketGetPluginRequest {
  identifier?: string
  source?: string
}

export type MarketGetPluginResponse = MarketPlugin | null

export type MarketHttpRequest = MarketHttpRequestOptions
export type MarketHttpRequestResponse<T = unknown> = MarketHttpResponse<T>

export interface MarketUpdatesAvailablePayload {
  updates: MarketPlugin[]
}

