import type { CatalogStatus, VoiceProviderRegistry } from '@talex-touch/utils/i18n'
import type { AssistantVoiceCommandPayload } from '@talex-touch/utils/transport/events/assistant'
import {
  DEFAULT_NEXUS_BASE_URL,
  UNAUTHENTICATED_SESSION_STATE,
  type AuthStateListener,
  type NexusAuthenticatedRequestOptions,
  type NexusMainRequestPayload,
  type NexusResponsePayload,
  type NexusVoiceToken,
  type SanitizedAuthSessionState,
  type TranscribeNexusAudioFn
} from '../../shared/cloud-port-types'

export interface VoiceAuthPort {
  getAuthToken(): string | null
  getSanitizedAuthSessionState(): SanitizedAuthSessionState
  subscribeAuthState(listener: AuthStateListener): () => void
  performNexusRequestWithAuth(
    payload: NexusMainRequestPayload,
    options?: NexusAuthenticatedRequestOptions
  ): Promise<NexusResponsePayload | null>
}

export interface VoiceNexusPort {
  getRuntimeNexusBaseUrl(): string
  transcribeNexusAudio: TranscribeNexusAudioFn
  requestNexusVoiceToken(options?: { signal?: AbortSignal }): Promise<NexusVoiceToken>
  settleNexusVoiceUsage(input: {
    sessionId: string
    durationMs: number
    transcriptUnits: number
    requestId?: string
  }): Promise<void>
}

export interface VoiceCatalogPort {
  getVoiceProviderRegistry(): VoiceProviderRegistry | null
  getVoiceProviderStatus(): CatalogStatus
}

export interface VoiceGlobalKeyEvent {
  key: 'primary-modifier' | 'escape'
  keycode: number
  hasOtherKeys?: boolean
}

export interface VoiceGlobalOtherKeyEvent {
  key: 'other-key'
  keycode: number
}

export interface VoiceGlobalKeyListener {
  onKeyDown?: (event: VoiceGlobalKeyEvent) => void
  onKeyUp?: (event: VoiceGlobalKeyEvent) => void
  onOtherKeyDown?: (event: VoiceGlobalOtherKeyEvent) => void
}

export interface VoiceSurfacePort {
  registerGlobalKeyListener(listener: VoiceGlobalKeyListener): () => void
  handleVoiceCommandGesture(payload: AssistantVoiceCommandPayload): void | Promise<void>
  isVoiceCommandActive(): boolean
}

export interface VoicePortsRegistry {
  auth: VoiceAuthPort
  nexus: VoiceNexusPort
  catalog: VoiceCatalogPort
  surface: VoiceSurfacePort
}

const DEFAULT_VOICE_AUTH_PORT: VoiceAuthPort = Object.freeze({
  getAuthToken: () => null,
  getSanitizedAuthSessionState: () => UNAUTHENTICATED_SESSION_STATE,
  subscribeAuthState: () => () => undefined,
  performNexusRequestWithAuth: async () => null
})

const DEFAULT_VOICE_NEXUS_PORT: VoiceNexusPort = Object.freeze({
  getRuntimeNexusBaseUrl: () => DEFAULT_NEXUS_BASE_URL,
  transcribeNexusAudio: async () => {
    const error = new Error('Voice Nexus audio port is unavailable.') as Error & { code?: string }
    error.code = 'NEXUS_AUTH_REQUIRED'
    throw error
  },
  requestNexusVoiceToken: async () => {
    const error = new Error('Voice Nexus token port is unavailable.') as Error & { code?: string }
    error.code = 'NEXUS_AUTH_REQUIRED'
    throw error
  },
  settleNexusVoiceUsage: async () => undefined
})

const DEFAULT_VOICE_CATALOG_PORT: VoiceCatalogPort = Object.freeze({
  getVoiceProviderRegistry: () => {
    throw new Error('VOICE_CATALOG_PORT_UNAVAILABLE')
  },
  getVoiceProviderStatus: () => {
    throw new Error('VOICE_CATALOG_PORT_UNAVAILABLE')
  }
})

const DEFAULT_VOICE_SURFACE_PORT: VoiceSurfacePort = Object.freeze({
  registerGlobalKeyListener: () => () => undefined,
  handleVoiceCommandGesture: () => undefined,
  isVoiceCommandActive: () => false
})

let authPort: VoiceAuthPort | null = null
let nexusPort: VoiceNexusPort | null = null
let catalogPort: VoiceCatalogPort | null = null
let surfacePort: VoiceSurfacePort | null = null

interface ActiveAuthSubscription {
  listener: AuthStateListener
  disposeUpstream: (() => void) | null
}

const activeAuthSubscriptions = new Set<ActiveAuthSubscription>()

function rebindAuthSubscriptions(): void {
  for (const sub of activeAuthSubscriptions) {
    try {
      sub.disposeUpstream?.()
    } catch {
      // ignore cleanup failures when swapping auth adapters
    }
    sub.disposeUpstream = authPort ? authPort.subscribeAuthState(sub.listener) : null
  }
}

export function registerVoicePorts(ports: Partial<VoicePortsRegistry>): void {
  if (ports.auth !== undefined && ports.auth !== authPort) {
    authPort = ports.auth
    rebindAuthSubscriptions()
  }
  if (ports.nexus !== undefined) nexusPort = ports.nexus
  if (ports.catalog !== undefined) catalogPort = ports.catalog
  if (ports.surface !== undefined) surfacePort = ports.surface
}

export function resetVoicePorts(): void {
  authPort = null
  nexusPort = null
  catalogPort = null
  surfacePort = null
  for (const sub of activeAuthSubscriptions) {
    try {
      sub.disposeUpstream?.()
    } catch {
      // ignore cleanup failures on reset
    }
    sub.disposeUpstream = null
  }
  activeAuthSubscriptions.clear()
}

export function getVoiceAuthPort(): VoiceAuthPort {
  return authPort ?? DEFAULT_VOICE_AUTH_PORT
}

export function getVoiceNexusPort(): VoiceNexusPort {
  return nexusPort ?? DEFAULT_VOICE_NEXUS_PORT
}

export function getVoiceCatalogPort(): VoiceCatalogPort {
  return catalogPort ?? DEFAULT_VOICE_CATALOG_PORT
}

export function getVoiceSurfacePort(): VoiceSurfacePort {
  return surfacePort ?? DEFAULT_VOICE_SURFACE_PORT
}

export function subscribeVoiceAuthState(listener: AuthStateListener): () => void {
  const entry: ActiveAuthSubscription = {
    listener,
    disposeUpstream: authPort ? authPort.subscribeAuthState(listener) : null
  }
  activeAuthSubscriptions.add(entry)
  return () => {
    if (!activeAuthSubscriptions.delete(entry)) return
    try {
      entry.disposeUpstream?.()
    } catch {
      // ignore cleanup failures
    }
    entry.disposeUpstream = null
  }
}
