/**
 * @fileoverview Type definitions for Market domain events
 * @module @talex-touch/utils/transport/events/types/market
 */

import type { MarketHttpRequestOptions, MarketHttpResponse } from '../../../market/types'
import type { MarketPluginInfo, MarketSearchOptions, MarketSearchResult } from '../../../plugin/providers'

export interface MarketPluginUpdateInfo {
  slug: string
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl?: string
  changelog?: string
}

export interface MarketCheckUpdatesResponse {
  updates: MarketPluginUpdateInfo[]
  checkedAt: string
}

export type MarketSearchRequest = MarketSearchOptions

export type MarketSearchResponse = MarketSearchResult

export interface MarketGetPluginRequest {
  identifier?: string
  source?: 'tpex' | 'npm'
}

export type MarketGetPluginResponse = MarketPluginInfo | null

export type MarketHttpRequest = MarketHttpRequestOptions
export type MarketHttpRequestResponse<T = unknown> = MarketHttpResponse<T>

export interface MarketUpdatesAvailablePayload {
  updates: MarketPluginUpdateInfo[]
}
