import type {
  CatalogErrorCode,
  CatalogPackDiagnostic,
  CatalogRollbackReason,
  CatalogStatus,
} from '../../../i18n/catalog'
import type { LocalizedText } from '../../../i18n/localized'

/**
 * What Settings shows about the active voice pack beyond its identity.
 *
 * Built in main from the stored pack and the verified registry. Endpoints, headers and limits stay
 * in main: the page has no use for them, and keeping protocol detail out of the client is why the
 * pack is encrypted at all.
 */
export interface CatalogVoiceProviderPackSummary {
  /** Size of the signed payload as downloaded, in bytes. */
  payloadBytes: number
  /** When this machine downloaded and stored the pack (epoch ms). */
  importedAt: number
  /** ISO-8601 instant after which the pack stops routing; null when it does not expire. */
  expiresAt: string | null
  /** The routes the pack carries, in pack order. */
  providers: Array<{ id: string, displayName: LocalizedText }>
}

export interface CatalogVoiceProviderStatusResponse {
  status: CatalogStatus
  /** Null until a voice pack is active. */
  pack: CatalogVoiceProviderPackSummary | null
  /** A check/download/activate pass is running in main — the one that follows sign-in included. */
  syncing: boolean
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
