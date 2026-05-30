import type {
  IndexedSourceDiagnosticsSnapshot,
  IndexedSourceReconcileReason,
  IndexedSourceReconcileResult,
  IndexedSourceResetReason,
  IndexedSourceResetResult,
  IndexedSourceScanReason,
  SearchProviderDescriptor,
  SearchProviderRegistryIssue,
  SearchProviderRuntimeConfig,
  SearchProviderUserConfig
} from '../../../search'

export interface IndexedSourceDiagnosticsRequest {
  sourceId?: string
}

export type IndexedSourceDiagnosticsResponse = IndexedSourceDiagnosticsSnapshot

export interface IndexedSourceResetRuntimeRequest {
  sourceId: string
  reason: IndexedSourceResetReason
  clearSearchIndex?: boolean
  clearScanProgress?: boolean
}

export type IndexedSourceResetRuntimeResult = IndexedSourceResetResult

export interface IndexedSourceReconcileRuntimeRequest {
  sourceId: string
  reason?: IndexedSourceReconcileReason | (string & {})
}

export type IndexedSourceReconcileRuntimeResult = IndexedSourceReconcileResult

export interface IndexedSourceScanRuntimeRequest {
  sourceId: string
  reason: IndexedSourceScanReason
}

export interface IndexedSourceScanRuntimeResult {
  sourceId: string
  batches: number
  records: number
  startedAt: number
  completedAt: number
  error?: string
}

export interface SearchProviderConfigResponse {
  providers: SearchProviderRuntimeConfig[]
  availableProviders?: SearchProviderDescriptor[]
  sourceLinks?: SearchProviderSourceLink[]
  issues?: SearchProviderRegistryIssue[]
}

export interface SearchProviderSourceLink {
  sourceId: string
  providerIds: string[]
}

export interface SearchProviderConfigUpdateRequest {
  providers: SearchProviderUserConfig[]
}

export type SearchProviderConfigUpdateResult = SearchProviderConfigResponse
