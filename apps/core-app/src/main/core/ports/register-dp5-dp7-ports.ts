import { aiOrchestratorStore } from '../../modules/ai/ai-orchestrator-store'
import { registerAiPorts } from '../../modules/ai/ai-ports'
import { intelligenceContextExecutionService } from '../../modules/ai/intelligence-context-execution'
import { getProviderModelOptions } from '../../modules/ai/intelligence-provider-model-options'
import { tuffIntelligence } from '../../modules/ai/intelligence-sdk'
import { assistantModule } from '../../modules/assistant/module'
import {
  applyExternalAuthCallback,
  applyStepUpToken,
  getAuthToken,
  getSanitizedAuthSessionState,
  performNexusRequestWithAuth,
  subscribeAuthState
} from '../../modules/auth'
import { getCatalogService } from '../../modules/catalog'
import { DivisionBoxManager } from '../../modules/division-box/manager'
import { registerLocalAiCliPorts } from '../../modules/local-ai-cli/local-ai-cli-ports'
import {
  requestNexusVoiceToken,
  settleNexusVoiceUsage,
  transcribeNexusAudio
} from '../../modules/nexus/asr-client'
import { getRuntimeNexusBaseUrl } from '../../modules/nexus/runtime-base'
import {
  extractTranslatedImageFromSceneRun,
  extractTranslatedTextFromSceneRun,
  runNexusScene
} from '../../modules/nexus/scene-client'
import { omniPanelModule } from '../../modules/omni-panel'
import { registerOmniPanelPorts } from '../../modules/omni-panel/omni-panel-ports'
import { registerPluginPorts } from '../../modules/plugin/plugin-ports'
import { registerVoicePorts } from '../../modules/voice/voice-ports'
import { voiceService } from '../../modules/voice/voice-service'

const pluginIntelligenceAdapter = Object.freeze({
  invoke: (
    capabilityId: string,
    payload: unknown,
    options: Parameters<typeof tuffIntelligence.invoke>[2]
  ) => tuffIntelligence.invoke(capabilityId, payload, options),
  getProviderModelOptions
})

const pluginIntelligenceContextAdapter = Object.freeze({
  invoke: <T = unknown>(
    request: Parameters<typeof intelligenceContextExecutionService.invoke>[0],
    actor: Parameters<typeof intelligenceContextExecutionService.invoke>[1],
    hostOptions?: Parameters<typeof intelligenceContextExecutionService.invoke>[2]
  ) => intelligenceContextExecutionService.invoke<T>(request, actor, hostOptions),
  stream: <T = unknown>(
    request: Parameters<typeof intelligenceContextExecutionService.stream>[0],
    actor: Parameters<typeof intelligenceContextExecutionService.stream>[1],
    hostOptions?: Parameters<typeof intelligenceContextExecutionService.stream>[2]
  ) => intelligenceContextExecutionService.stream<T>(request, actor, hostOptions)
})

const pluginAiOrchestratorAdapter = Object.freeze({
  listOrchestratorRuns: (
    request?: Parameters<typeof aiOrchestratorStore.listOrchestratorRuns>[0]
  ) => aiOrchestratorStore.listOrchestratorRuns(request)
})

const pluginVoiceAdapter = Object.freeze({
  dictate: (
    payload?: Parameters<typeof voiceService.dictate>[0],
    context?: Parameters<typeof voiceService.dictate>[1],
    signal?: Parameters<typeof voiceService.dictate>[2],
    caller?: Parameters<typeof voiceService.dictate>[3]
  ) => voiceService.dictate(payload, context, signal, caller),
  speak: (
    payload: Parameters<typeof voiceService.speak>[0],
    signal?: Parameters<typeof voiceService.speak>[1],
    caller?: Parameters<typeof voiceService.speak>[2]
  ) => voiceService.speak(payload, signal, caller),
  streamDictation: (
    payload?: Parameters<typeof voiceService.streamDictation>[0],
    signal?: Parameters<typeof voiceService.streamDictation>[1],
    options?: Parameters<typeof voiceService.streamDictation>[2]
  ) => voiceService.streamDictation(payload, signal, options)
})

const pluginDivisionBoxAdapter = Object.freeze({
  getActiveSessions: () => DivisionBoxManager.getInstance().getActiveSessions(),
  destroySession: (sessionId: string) => DivisionBoxManager.getInstance().destroySession(sessionId)
})

const pluginCloudAuthAdapter = Object.freeze({
  getAuthToken,
  getSanitizedAuthSessionState,
  getRuntimeNexusBaseUrl,
  applyExternalAuthCallback,
  applyStepUpToken
})

const sharedAuthAdapter = Object.freeze({
  getAuthToken,
  getSanitizedAuthSessionState,
  subscribeAuthState,
  performNexusRequestWithAuth
})

const aiNexusAdapter = Object.freeze({
  getRuntimeNexusBaseUrl,
  runNexusScene,
  extractTranslatedImageFromSceneRun,
  transcribeNexusAudio
})

const voiceNexusAdapter = Object.freeze({
  getRuntimeNexusBaseUrl,
  transcribeNexusAudio,
  requestNexusVoiceToken,
  settleNexusVoiceUsage
})

const voiceCatalogAdapter = Object.freeze({
  getVoiceProviderRegistry: () => getCatalogService().getVoiceProviderRegistry(),
  getVoiceProviderStatus: () => getCatalogService().getVoiceProviderStatus()
})

const voiceSurfaceAdapter = Object.freeze({
  registerGlobalKeyListener: (
    listener: Parameters<typeof omniPanelModule.registerGlobalKeyListener>[0]
  ) => omniPanelModule.registerGlobalKeyListener(listener),
  handleVoiceCommandGesture: (
    payload: Parameters<typeof assistantModule.handleVoiceCommandGesture>[0]
  ) => assistantModule.handleVoiceCommandGesture(payload),
  isVoiceCommandActive: () => assistantModule.isVoiceCommandActive()
})

const localAiCliSurfaceAdapter = Object.freeze({
  requestFeatureRefresh: (reason: 'local-ai-cli') => omniPanelModule.requestFeatureRefresh(reason),
  showLocalAi: (draftText?: string) => omniPanelModule.showLocalAi(draftText),
  restoreLocalAi: () => omniPanelModule.restoreLocalAi(),
  hideForPasteBack: () => omniPanelModule.hideForPasteBack()
})

const omniPanelNexusAdapter = Object.freeze({
  runNexusScene,
  extractTranslatedTextFromSceneRun
})

/**
 * Composition-root registrar wiring DP6/DP7/DP8 concrete implementations into DP5/DP6/DP7 ports.
 * Safe to invoke repeatedly (idempotent adapter registration).
 */
export function registerDp5Dp7Ports(): void {
  registerPluginPorts({
    intelligence: pluginIntelligenceAdapter,
    intelligenceContext: pluginIntelligenceContextAdapter,
    aiOrchestrator: pluginAiOrchestratorAdapter,
    voice: pluginVoiceAdapter,
    divisionBox: pluginDivisionBoxAdapter,
    cloudAuth: pluginCloudAuthAdapter
  })

  registerAiPorts({
    auth: sharedAuthAdapter,
    nexus: aiNexusAdapter
  })

  registerVoicePorts({
    auth: sharedAuthAdapter,
    nexus: voiceNexusAdapter,
    catalog: voiceCatalogAdapter,
    surface: voiceSurfaceAdapter
  })

  registerLocalAiCliPorts({
    surface: localAiCliSurfaceAdapter
  })

  registerOmniPanelPorts({
    nexus: omniPanelNexusAdapter
  })
}
