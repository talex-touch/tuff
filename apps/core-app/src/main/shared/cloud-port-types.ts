import type { IntelligenceSTTPayload, IntelligenceSTTResult } from '@talex-touch/tuff-intelligence'
import type { VoiceProviderDescriptorV1 } from '@talex-touch/utils/i18n'
import type {
  NexusRequestPayload,
  NexusResponsePayload
} from '@talex-touch/utils/transport/events/auth'

export interface SanitizedAuthSessionState {
  readonly isLoaded: boolean
  readonly isSignedIn: boolean
  readonly user: { readonly id: string; readonly name?: string } | null
}

export interface AuthStateSnapshot {
  readonly isLoaded?: boolean
  readonly isSignedIn: boolean
  readonly user?: { readonly id: string; readonly name?: string | null } | null
  readonly sessionId?: string | null
  readonly isSettled?: boolean
}

export type AuthStateListener = (state: AuthStateSnapshot) => void

export interface NexusAuthenticatedRequestOptions {
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly rejectRedirects?: boolean
  readonly trustedBaseUrl?: string
}

export type NexusMainRequestPayload = Omit<NexusRequestPayload, 'body'> & {
  readonly body?: unknown
}

export type { NexusResponsePayload }

export interface NexusSceneRunRequest {
  input?: unknown
  capability?: string
  providerId?: string
  dryRun?: boolean
  timeoutMs?: number
}

export interface NexusSceneRunResult {
  runId: string
  sceneId: string
  status: 'planned' | 'completed' | 'failed'
  mode: 'dry_run' | 'execute'
  output: unknown
  trace?: unknown[]
  usage?: unknown[]
  selected?: unknown[]
  candidates?: unknown[]
  fallbackTrail?: unknown[]
  error?: {
    code?: string
    message?: string
  }
}

export interface NexusTranslatedImageOutput {
  translatedImageBase64: string
  imageMimeType?: string
  sourceText?: string
  targetText?: string
  overlay?: unknown
}

export interface TranscribeNexusAudioOptions {
  readonly signal?: AbortSignal
  readonly timeout?: number
  readonly idempotencyKey?: string
  readonly route?: VoiceProviderDescriptorV1
}

export interface NexusVoiceToken {
  token: string
  expiresAt: number
  websocketUrl: string
  model: string
  sessionId: string
}

export type TranscribeNexusAudioFn = (
  payload: IntelligenceSTTPayload,
  options?: TranscribeNexusAudioOptions
) => Promise<IntelligenceSTTResult>

export const DEFAULT_NEXUS_BASE_URL = 'https://tuff.tagzxia.com'

export const UNAUTHENTICATED_SESSION_STATE: SanitizedAuthSessionState = Object.freeze({
  isLoaded: false,
  isSignedIn: false,
  user: null
})
