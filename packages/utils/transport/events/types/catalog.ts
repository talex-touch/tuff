import type {
  CatalogErrorCode,
  CatalogPackDiagnostic,
  CatalogRollbackReason,
  CatalogStatus,
} from '../../../i18n/catalog'

export interface CatalogVoiceProviderStatusResponse {
  status: CatalogStatus
}

export type CatalogVoiceProviderCheckOutcome = 'no-update' | 'update-available' | 'failed'

export interface CatalogVoiceProviderCheckResponse {
  outcome: CatalogVoiceProviderCheckOutcome
  status: CatalogStatus
  /** Safe manifest projection; the raw signature and payload never cross IPC. */
  candidate: CatalogPackDiagnostic | null
  errorCode: CatalogErrorCode | null
}

export type CatalogVoiceProviderSyncOutcome = 'no-update' | 'activated' | 'failed'

export interface CatalogVoiceProviderSyncResponse {
  outcome: CatalogVoiceProviderSyncOutcome
  status: CatalogStatus
  activated: CatalogPackDiagnostic | null
  errorCode: CatalogErrorCode | null
}

export interface CatalogVoiceProviderRollbackRequest {
  reason?: CatalogRollbackReason
}

export interface CatalogVoiceProviderRollbackResponse {
  outcome: 'rolled-back' | 'failed'
  status: CatalogStatus
  errorCode: CatalogErrorCode | null
}
