import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEXUS_BASE_URL } from '@talex-touch/utils/env'

const mocks = vi.hoisted(() => ({
  tuffIntelligenceInvoke: vi.fn(),
  getProviderModelOptions: vi.fn(),
  contextInvoke: vi.fn(),
  contextStream: vi.fn(),
  listOrchestratorRuns: vi.fn(),
  voiceDictate: vi.fn(),
  voiceSpeak: vi.fn(),
  voiceStreamDictation: vi.fn(),
  divisionBoxGetActiveSessions: vi.fn(),
  divisionBoxDestroySession: vi.fn(),
  getAuthToken: vi.fn(),
  getSanitizedAuthSessionState: vi.fn(),
  subscribeAuthState: vi.fn(),
  performNexusRequestWithAuth: vi.fn(),
  applyExternalAuthCallback: vi.fn(),
  applyStepUpToken: vi.fn(),
  getRuntimeNexusBaseUrl: vi.fn(),
  runNexusScene: vi.fn(),
  extractTranslatedImageFromSceneRun: vi.fn(),
  extractTranslatedTextFromSceneRun: vi.fn(),
  transcribeNexusAudio: vi.fn(),
  requestNexusVoiceToken: vi.fn(),
  settleNexusVoiceUsage: vi.fn(),
  getVoiceProviderRegistry: vi.fn(),
  getVoiceProviderStatus: vi.fn(),
  registerGlobalKeyListener: vi.fn(),
  requestFeatureRefresh: vi.fn(),
  showLocalAi: vi.fn(),
  restoreLocalAi: vi.fn(),
  hideForPasteBack: vi.fn(),
  handleVoiceCommandGesture: vi.fn(),
  isVoiceCommandActive: vi.fn()
}))

vi.mock('../../modules/ai/intelligence-sdk', () => ({
  tuffIntelligence: { invoke: mocks.tuffIntelligenceInvoke }
}))
vi.mock('../../modules/ai/intelligence-provider-model-options', () => ({
  getProviderModelOptions: mocks.getProviderModelOptions
}))
vi.mock('../../modules/ai/intelligence-context-execution', () => ({
  intelligenceContextExecutionService: {
    invoke: mocks.contextInvoke,
    stream: mocks.contextStream
  }
}))
vi.mock('../../modules/ai/ai-orchestrator-store', () => ({
  aiOrchestratorStore: { listOrchestratorRuns: mocks.listOrchestratorRuns }
}))
vi.mock('../../modules/voice/voice-service', () => ({
  voiceService: {
    dictate: mocks.voiceDictate,
    speak: mocks.voiceSpeak,
    streamDictation: mocks.voiceStreamDictation
  }
}))
vi.mock('../../modules/division-box/manager', () => ({
  DivisionBoxManager: {
    getInstance: () => ({
      getActiveSessions: mocks.divisionBoxGetActiveSessions,
      destroySession: mocks.divisionBoxDestroySession
    })
  }
}))
vi.mock('../../modules/auth', () => ({
  getAuthToken: mocks.getAuthToken,
  getSanitizedAuthSessionState: mocks.getSanitizedAuthSessionState,
  subscribeAuthState: mocks.subscribeAuthState,
  performNexusRequestWithAuth: mocks.performNexusRequestWithAuth,
  applyExternalAuthCallback: mocks.applyExternalAuthCallback,
  applyStepUpToken: mocks.applyStepUpToken
}))
vi.mock('../../modules/nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: mocks.getRuntimeNexusBaseUrl
}))
vi.mock('../../modules/nexus/scene-client', () => ({
  runNexusScene: mocks.runNexusScene,
  extractTranslatedImageFromSceneRun: mocks.extractTranslatedImageFromSceneRun,
  extractTranslatedTextFromSceneRun: mocks.extractTranslatedTextFromSceneRun
}))
vi.mock('../../modules/nexus/asr-client', () => ({
  transcribeNexusAudio: mocks.transcribeNexusAudio,
  requestNexusVoiceToken: mocks.requestNexusVoiceToken,
  settleNexusVoiceUsage: mocks.settleNexusVoiceUsage
}))
vi.mock('../../modules/catalog', () => ({
  getCatalogService: () => ({
    getVoiceProviderRegistry: mocks.getVoiceProviderRegistry,
    getVoiceProviderStatus: mocks.getVoiceProviderStatus
  })
}))
vi.mock('../../modules/omni-panel', () => ({
  omniPanelModule: {
    registerGlobalKeyListener: mocks.registerGlobalKeyListener,
    requestFeatureRefresh: mocks.requestFeatureRefresh,
    showLocalAi: mocks.showLocalAi,
    restoreLocalAi: mocks.restoreLocalAi,
    hideForPasteBack: mocks.hideForPasteBack
  }
}))
vi.mock('../../modules/assistant/module', () => ({
  assistantModule: {
    handleVoiceCommandGesture: mocks.handleVoiceCommandGesture,
    isVoiceCommandActive: mocks.isVoiceCommandActive
  }
}))

import {
  getAiAuthPort,
  getAiNexusPort,
  resetAiPorts,
  subscribeAiAuthState
} from '../../modules/ai/ai-ports'
import {
  getLocalAiCliSurfacePort,
  resetLocalAiCliPorts
} from '../../modules/local-ai-cli/local-ai-cli-ports'
import {
  getOmniPanelNexusPort,
  resetOmniPanelPorts
} from '../../modules/omni-panel/omni-panel-ports'
import {
  getPluginAiOrchestratorPort,
  getPluginCloudAuthPort,
  getPluginDivisionBoxPort,
  getPluginIntelligenceContextPort,
  getPluginIntelligencePort,
  getPluginVoicePort,
  resetPluginPorts
} from '../../modules/plugin/plugin-ports'
import {
  getVoiceAuthPort,
  getVoiceCatalogPort,
  getVoiceNexusPort,
  getVoiceSurfacePort,
  resetVoicePorts,
  subscribeVoiceAuthState
} from '../../modules/voice/voice-ports'
import { parseManifestDivisionBoxConfig } from '../../shared/division-box-manifest-parser'
import { classifyIntelligenceErrorCode } from '../../shared/intelligence-error-code'
import { registerDp5Dp7Ports } from './register-dp5-dp7-ports'

function resetAllPorts(): void {
  resetPluginPorts()
  resetAiPorts()
  resetVoicePorts()
  resetLocalAiCliPorts()
  resetOmniPanelPorts()
}

describe('DP5-DP7 axiomatic ports and composition root registrar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetAllPorts()
  })

  afterEach(() => {
    resetAllPorts()
  })

  it('provides fail-closed defaults before registration', async () => {
    expect(getPluginCloudAuthPort().getAuthToken()).toBeNull()
    expect(getPluginCloudAuthPort().getSanitizedAuthSessionState()).toEqual({
      isLoaded: false,
      isSignedIn: false,
      user: null
    })
    expect(getPluginCloudAuthPort().getRuntimeNexusBaseUrl()).toBe(NEXUS_BASE_URL)
    await expect(getPluginCloudAuthPort().applyExternalAuthCallback('tok')).resolves.toBe(false)
    expect(getPluginDivisionBoxPort()).toBeNull()
    await expect(getPluginAiOrchestratorPort().listOrchestratorRuns()).resolves.toEqual([])
    await expect(getPluginIntelligencePort().invoke('text.chat', {}, {})).rejects.toThrow(
      'PLUGIN_INTELLIGENCE_PORT_UNAVAILABLE'
    )
    await expect(
      getPluginIntelligenceContextPort().invoke({} as never, { id: 'p', type: 'plugin' })
    ).rejects.toThrow('PLUGIN_INTELLIGENCE_CONTEXT_PORT_UNAVAILABLE')
    await expect(getPluginVoicePort().dictate()).rejects.toThrow('PLUGIN_VOICE_PORT_UNAVAILABLE')

    expect(getAiAuthPort().getAuthToken()).toBeNull()
    await expect(
      getAiAuthPort().performNexusRequestWithAuth({ url: 'https://x' })
    ).resolves.toBeNull()
    expect(getAiNexusPort().getRuntimeNexusBaseUrl()).toBe(NEXUS_BASE_URL)
    await expect(getAiNexusPort().runNexusScene('scene', {})).resolves.toBeNull()
    await expect(getAiNexusPort().transcribeNexusAudio({} as never)).rejects.toMatchObject({
      code: 'NEXUS_AUTH_REQUIRED'
    })

    expect(getVoiceAuthPort().getAuthToken()).toBeNull()
    expect(getVoiceNexusPort().getRuntimeNexusBaseUrl()).toBe(NEXUS_BASE_URL)
    await expect(getVoiceNexusPort().requestNexusVoiceToken()).rejects.toMatchObject({
      code: 'NEXUS_AUTH_REQUIRED'
    })
    expect(() => getVoiceCatalogPort().getVoiceProviderRegistry()).toThrow(
      'VOICE_CATALOG_PORT_UNAVAILABLE'
    )
    expect(getVoiceSurfacePort().isVoiceCommandActive()).toBe(false)
    expect(getOmniPanelNexusPort().extractTranslatedTextFromSceneRun(null)).toBeNull()
    await expect(getOmniPanelNexusPort().runNexusScene('scene', {})).resolves.toBeNull()
  })

  it('wires all DP5/DP6/DP7 ports to concrete DP6/DP7/DP8 implementations idempotently', async () => {
    const authListeners: Array<(state: { isSignedIn: boolean }) => void> = []
    mocks.subscribeAuthState.mockImplementation((listener) => {
      authListeners.push(listener)
      return () => {
        const index = authListeners.indexOf(listener)
        if (index >= 0) authListeners.splice(index, 1)
      }
    })
    mocks.getAuthToken.mockReturnValue('token-123')
    mocks.getRuntimeNexusBaseUrl.mockReturnValue('https://nexus.custom.test')
    mocks.getSanitizedAuthSessionState.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'u-1', name: 'Alice' }
    })
    mocks.divisionBoxGetActiveSessions.mockReturnValue([{ sessionId: 's-1' }])
    mocks.isVoiceCommandActive.mockReturnValue(true)
    mocks.extractTranslatedTextFromSceneRun.mockReturnValue('你好')

    const aiAuthEvents: boolean[] = []
    const voiceAuthEvents: boolean[] = []
    const disposeAi = subscribeAiAuthState((state) => aiAuthEvents.push(state.isSignedIn))
    const disposeVoice = subscribeVoiceAuthState((state) => voiceAuthEvents.push(state.isSignedIn))

    // Call registrar twice to prove idempotency (must not duplicate auth subscriptions)
    registerDp5Dp7Ports()
    registerDp5Dp7Ports()

    expect(mocks.subscribeAuthState).toHaveBeenCalledTimes(2)
    for (const listener of [...authListeners]) {
      listener({ isSignedIn: true })
    }
    expect(aiAuthEvents).toEqual([true])
    expect(voiceAuthEvents).toEqual([true])

    disposeAi()
    disposeVoice()
    expect(authListeners).toHaveLength(0)

    // Verify DP5 ports
    expect(getPluginCloudAuthPort().getAuthToken()).toBe('token-123')
    expect(getPluginCloudAuthPort().getRuntimeNexusBaseUrl()).toBe('https://nexus.custom.test')
    getPluginCloudAuthPort().applyStepUpToken('step-up-1')
    expect(mocks.applyStepUpToken).toHaveBeenCalledWith('step-up-1')
    expect(getPluginDivisionBoxPort()?.getActiveSessions()).toEqual([{ sessionId: 's-1' }])
    await getPluginDivisionBoxPort()?.destroySession('s-1')
    expect(mocks.divisionBoxDestroySession).toHaveBeenCalledWith('s-1')
    await getPluginIntelligencePort().invoke('text.chat', { messages: [] }, {})
    expect(mocks.tuffIntelligenceInvoke).toHaveBeenCalledWith('text.chat', { messages: [] }, {})
    await getPluginAiOrchestratorPort().listOrchestratorRuns({ limit: 5 })
    expect(mocks.listOrchestratorRuns).toHaveBeenCalledWith({ limit: 5 })
    await getPluginVoicePort().dictate({}, undefined, undefined, 'plugin:test')
    expect(mocks.voiceDictate).toHaveBeenCalledWith({}, undefined, undefined, 'plugin:test')

    // Verify DP6 AI, Voice, LocalAiCli ports
    expect(getAiAuthPort().getAuthToken()).toBe('token-123')
    expect(getAiNexusPort().getRuntimeNexusBaseUrl()).toBe('https://nexus.custom.test')
    expect(getVoiceNexusPort().getRuntimeNexusBaseUrl()).toBe('https://nexus.custom.test')
    expect(getVoiceSurfacePort().isVoiceCommandActive()).toBe(true)
    getLocalAiCliSurfacePort().requestFeatureRefresh('local-ai-cli')
    expect(mocks.requestFeatureRefresh).toHaveBeenCalledWith('local-ai-cli')
    await getLocalAiCliSurfacePort().showLocalAi('draft')
    expect(mocks.showLocalAi).toHaveBeenCalledWith('draft')

    // Verify DP7 OmniPanel port
    expect(getOmniPanelNexusPort().extractTranslatedTextFromSceneRun(null)).toBe('你好')
    await getOmniPanelNexusPort().runNexusScene('translate', { input: { text: 'hi' } })
    expect(mocks.runNexusScene).toHaveBeenCalledWith('translate', { input: { text: 'hi' } })
  })

  it('keeps shared pure contracts working without port registration', () => {
    const parsed = parseManifestDivisionBoxConfig(
      { defaultSize: 'expanded', keepAlive: true, header: { show: false, title: 'Demo' } },
      'demo-plugin'
    )
    expect(parsed).toEqual({
      defaultSize: 'expanded',
      keepAlive: true,
      header: { show: false, title: 'Demo' }
    })

    expect(
      classifyIntelligenceErrorCode(Object.assign(new Error('x'), { code: 'USAGE_LIMIT_REACHED' }))
    ).toBe('USAGE_LIMIT_REACHED')
    expect(classifyIntelligenceErrorCode(new Error('NEXUS_AUTH_REQUIRED'))).toBe(
      'NEXUS_AUTH_REQUIRED'
    )
    expect(classifyIntelligenceErrorCode(new Error('fetch failed: socket hang up'))).toBe(
      'NETWORK_FAILURE'
    )
    expect(classifyIntelligenceErrorCode(new Error('unclassified boom'))).toBe('UNKNOWN')
  })
})
