import type {
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceProviderModelOption
} from '@talex-touch/tuff-intelligence'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type {
  VoiceAsrStreamEvent,
  VoiceAsrStreamPayload,
  VoiceDictatePayload,
  VoiceDictateResult,
  VoiceSpeakPayload,
  VoiceSpeakResult
} from '@talex-touch/utils/transport/sdk/domains/voice'
import type {
  AiOrchestratorRunListRequest,
  AiOrchestratorRunRecord
} from '@talex-touch/utils/types/ai-orchestrator'
import type {
  IntelligenceContextExecutionRequest,
  IntelligenceContextExecutionResult,
  IntelligenceContextStreamEvent
} from '@talex-touch/utils/types/intelligence'
import {
  DEFAULT_NEXUS_BASE_URL,
  UNAUTHENTICATED_SESSION_STATE,
  type SanitizedAuthSessionState
} from '../../shared/cloud-port-types'

export type PluginHostIntelligenceInvokeOptions = IntelligenceInvokeOptions & {
  readonly signal?: AbortSignal
}

export interface PluginIntelligencePort {
  invoke(
    capabilityId: string,
    payload: unknown,
    options: PluginHostIntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<unknown>>
  getProviderModelOptions(capabilityId: string): readonly IntelligenceProviderModelOption[]
}

export interface PluginIntelligenceContextActor {
  id: string
  type: 'host' | 'plugin'
}

export interface PluginIntelligenceContextHostOptions {
  readonly signal?: AbortSignal
  readonly persistence?: 'full' | 'ephemeral'
}

export interface PluginIntelligenceContextPort {
  invoke<T = unknown>(
    request: IntelligenceContextExecutionRequest,
    actor: PluginIntelligenceContextActor,
    hostOptions?: PluginIntelligenceContextHostOptions
  ): Promise<IntelligenceContextExecutionResult<T>>
  stream<T = unknown>(
    request: IntelligenceContextExecutionRequest,
    actor: PluginIntelligenceContextActor,
    hostOptions?: PluginIntelligenceContextHostOptions
  ): AsyncIterable<IntelligenceContextStreamEvent<T>>
}

export interface PluginAiOrchestratorPort {
  listOrchestratorRuns(request?: AiOrchestratorRunListRequest): Promise<AiOrchestratorRunRecord[]>
}

export interface PluginVoicePort {
  dictate(
    payload?: VoiceDictatePayload,
    context?: HandlerContext,
    signal?: AbortSignal,
    caller?: string
  ): Promise<VoiceDictateResult>
  speak(
    payload: VoiceSpeakPayload,
    signal?: AbortSignal,
    caller?: string
  ): Promise<VoiceSpeakResult>
  streamDictation(
    payload?: VoiceAsrStreamPayload,
    signal?: AbortSignal,
    options?: { stopSignal?: AbortSignal; caller?: string }
  ): AsyncIterable<VoiceAsrStreamEvent>
}

export interface PluginDivisionBoxSessionHandle {
  readonly sessionId: string
  getAttachedPlugin(): { readonly name: string } | null
  getUIView(): unknown
}

export interface PluginDivisionBoxPort {
  getActiveSessions(): readonly PluginDivisionBoxSessionHandle[]
  destroySession(sessionId: string): Promise<void>
}

export interface PluginCloudAuthPort {
  getAuthToken(): string | null
  getSanitizedAuthSessionState(): SanitizedAuthSessionState
  getRuntimeNexusBaseUrl(): string
  applyExternalAuthCallback(
    token: string,
    appToken?: string,
    refreshToken?: string,
    ttlSeconds?: number,
    state?: string
  ): Promise<boolean>
  applyStepUpToken(token: string, state?: string): boolean | void
}

export interface PluginPortsRegistry {
  intelligence: PluginIntelligencePort
  intelligenceContext: PluginIntelligenceContextPort
  aiOrchestrator: PluginAiOrchestratorPort
  voice: PluginVoicePort
  divisionBox: PluginDivisionBoxPort
  cloudAuth: PluginCloudAuthPort
}

const DEFAULT_PLUGIN_INTELLIGENCE_PORT: PluginIntelligencePort = Object.freeze({
  invoke: async () => {
    throw new Error('PLUGIN_INTELLIGENCE_PORT_UNAVAILABLE')
  },
  getProviderModelOptions: () => []
})

const DEFAULT_PLUGIN_INTELLIGENCE_CONTEXT_PORT: PluginIntelligenceContextPort = Object.freeze({
  invoke: async () => {
    throw new Error('PLUGIN_INTELLIGENCE_CONTEXT_PORT_UNAVAILABLE')
  },
  stream: () => ({
    async *[Symbol.asyncIterator]() {
      throw new Error('PLUGIN_INTELLIGENCE_CONTEXT_PORT_UNAVAILABLE')
    }
  })
})

const DEFAULT_PLUGIN_AI_ORCHESTRATOR_PORT: PluginAiOrchestratorPort = Object.freeze({
  listOrchestratorRuns: async () => []
})

const DEFAULT_PLUGIN_VOICE_PORT: PluginVoicePort = Object.freeze({
  dictate: async () => {
    throw new Error('PLUGIN_VOICE_PORT_UNAVAILABLE')
  },
  speak: async () => {
    throw new Error('PLUGIN_VOICE_PORT_UNAVAILABLE')
  },
  streamDictation: () => ({
    async *[Symbol.asyncIterator]() {
      throw new Error('PLUGIN_VOICE_PORT_UNAVAILABLE')
    }
  })
})

const DEFAULT_PLUGIN_CLOUD_AUTH_PORT: PluginCloudAuthPort = Object.freeze({
  getAuthToken: () => null,
  getSanitizedAuthSessionState: () => UNAUTHENTICATED_SESSION_STATE,
  getRuntimeNexusBaseUrl: () => DEFAULT_NEXUS_BASE_URL,
  applyExternalAuthCallback: async () => false,
  applyStepUpToken: () => undefined
})

let intelligencePort: PluginIntelligencePort | null = null
let intelligenceContextPort: PluginIntelligenceContextPort | null = null
let aiOrchestratorPort: PluginAiOrchestratorPort | null = null
let voicePort: PluginVoicePort | null = null
let divisionBoxPort: PluginDivisionBoxPort | null = null
let cloudAuthPort: PluginCloudAuthPort | null = null

export function registerPluginPorts(ports: Partial<PluginPortsRegistry>): void {
  if (ports.intelligence !== undefined) intelligencePort = ports.intelligence
  if (ports.intelligenceContext !== undefined) intelligenceContextPort = ports.intelligenceContext
  if (ports.aiOrchestrator !== undefined) aiOrchestratorPort = ports.aiOrchestrator
  if (ports.voice !== undefined) voicePort = ports.voice
  if (ports.divisionBox !== undefined) divisionBoxPort = ports.divisionBox
  if (ports.cloudAuth !== undefined) cloudAuthPort = ports.cloudAuth
}

export function resetPluginPorts(): void {
  intelligencePort = null
  intelligenceContextPort = null
  aiOrchestratorPort = null
  voicePort = null
  divisionBoxPort = null
  cloudAuthPort = null
}

export function getPluginIntelligencePort(): PluginIntelligencePort {
  return intelligencePort ?? DEFAULT_PLUGIN_INTELLIGENCE_PORT
}

export function getPluginIntelligenceContextPort(): PluginIntelligenceContextPort {
  return intelligenceContextPort ?? DEFAULT_PLUGIN_INTELLIGENCE_CONTEXT_PORT
}

export function getPluginAiOrchestratorPort(): PluginAiOrchestratorPort {
  return aiOrchestratorPort ?? DEFAULT_PLUGIN_AI_ORCHESTRATOR_PORT
}

export function getPluginVoicePort(): PluginVoicePort {
  return voicePort ?? DEFAULT_PLUGIN_VOICE_PORT
}

export function getPluginDivisionBoxPort(): PluginDivisionBoxPort | null {
  return divisionBoxPort
}

export function getPluginCloudAuthPort(): PluginCloudAuthPort {
  return cloudAuthPort ?? DEFAULT_PLUGIN_CLOUD_AUTH_PORT
}
