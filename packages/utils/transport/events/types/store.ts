/**
 * @fileoverview Type definitions for Store domain events
 * @module @talex-touch/utils/transport/events/types/store
 */

import type { StoreHttpRequestOptions, StoreHttpResponse } from '../../../store/types'
import type { StorePluginInfo, StoreSearchOptions, StoreSearchResult } from '../../../plugin/providers'

export interface StorePluginUpdateInfo {
  slug: string
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl?: string
  changelog?: string
}

export interface StoreCheckUpdatesResponse {
  updates: StorePluginUpdateInfo[]
  checkedAt: string
}

export type StoreSearchRequest = StoreSearchOptions

export type StoreSearchResponse = StoreSearchResult

export interface StoreGetPluginRequest {
  identifier?: string
  source?: 'tpex' | 'npm'
}

export type StoreGetPluginResponse = StorePluginInfo | null

export type StoreHttpRequest = StoreHttpRequestOptions
export type StoreHttpRequestResponse<T = unknown> = StoreHttpResponse<T>

export interface StoreUpdatesAvailablePayload {
  updates: StorePluginUpdateInfo[]
}
