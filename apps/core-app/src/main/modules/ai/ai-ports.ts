import {
  DEFAULT_NEXUS_BASE_URL,
  UNAUTHENTICATED_SESSION_STATE,
  type AuthStateListener,
  type NexusAuthenticatedRequestOptions,
  type NexusMainRequestPayload,
  type NexusResponsePayload,
  type NexusSceneRunRequest,
  type NexusSceneRunResult,
  type NexusTranslatedImageOutput,
  type SanitizedAuthSessionState,
  type TranscribeNexusAudioFn
} from '../../shared/cloud-port-types'

export interface AiAuthPort {
  getAuthToken(): string | null
  getSanitizedAuthSessionState(): SanitizedAuthSessionState
  subscribeAuthState(listener: AuthStateListener): () => void
  performNexusRequestWithAuth(
    payload: NexusMainRequestPayload,
    options?: NexusAuthenticatedRequestOptions
  ): Promise<NexusResponsePayload | null>
}

export interface AiNexusPort {
  getRuntimeNexusBaseUrl(): string
  runNexusScene(sceneId: string, request: NexusSceneRunRequest): Promise<NexusSceneRunResult | null>
  extractTranslatedImageFromSceneRun(
    run: NexusSceneRunResult | null
  ): NexusTranslatedImageOutput | null
  transcribeNexusAudio: TranscribeNexusAudioFn
}

export interface AiPortsRegistry {
  auth: AiAuthPort
  nexus: AiNexusPort
}

const DEFAULT_AI_AUTH_PORT: AiAuthPort = Object.freeze({
  getAuthToken: () => null,
  getSanitizedAuthSessionState: () => UNAUTHENTICATED_SESSION_STATE,
  subscribeAuthState: () => () => undefined,
  performNexusRequestWithAuth: async () => null
})

const DEFAULT_AI_NEXUS_PORT: AiNexusPort = Object.freeze({
  getRuntimeNexusBaseUrl: () => DEFAULT_NEXUS_BASE_URL,
  runNexusScene: async () => null,
  extractTranslatedImageFromSceneRun: () => null,
  transcribeNexusAudio: async () => {
    const error = new Error('Nexus audio transcription port is unavailable.') as Error & {
      code?: string
    }
    error.code = 'NEXUS_AUTH_REQUIRED'
    throw error
  }
})

let authPort: AiAuthPort | null = null
let nexusPort: AiNexusPort | null = null

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

export function registerAiPorts(ports: Partial<AiPortsRegistry>): void {
  if (ports.auth !== undefined && ports.auth !== authPort) {
    authPort = ports.auth
    rebindAuthSubscriptions()
  }
  if (ports.nexus !== undefined) {
    nexusPort = ports.nexus
  }
}

export function resetAiPorts(): void {
  authPort = null
  nexusPort = null
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

export function getAiAuthPort(): AiAuthPort {
  return authPort ?? DEFAULT_AI_AUTH_PORT
}

export function getAiNexusPort(): AiNexusPort {
  return nexusPort ?? DEFAULT_AI_NEXUS_PORT
}

export function subscribeAiAuthState(listener: AuthStateListener): () => void {
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
