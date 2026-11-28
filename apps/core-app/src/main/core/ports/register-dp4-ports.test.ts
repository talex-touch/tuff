import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pluginMap: new Map<string, { name: string; icon?: { type: string; value: string } }>(),
  setActivePlugin: vi.fn(),
  installFromSource: vi.fn(async () => ({ manifest: { name: 'tpex-demo' } })),
  installDevPluginFromPath: vi.fn(async () => ({ status: 'success' as const })),
  handleActiveFeatureInput: vi.fn(async () => true),
  pluginFeaturesSearch: vi.fn(async () => ({ items: [] })),
  pluginFeaturesAttach: vi.fn(),
  usePluginInjections: vi.fn(() => null),
  resolvePluginViewSecurityProfile: vi.fn(() => ({
    candidateProfile: 'trusted-plugin-view' as const,
    effectiveProfile: 'trusted-plugin-view' as const,
    reason: 'trusted-candidate' as const
  })),
  buildPluginViewWebPreferences: vi.fn(() => ({ contextIsolation: true })),
  createPluginViewNavigationPolicy: vi.fn(async () => ({ allowed: true })),
  installPluginViewNavigationPolicy: vi.fn(),
  registerPluginWebContents: vi.fn(() => 'reg-1'),
  unregisterPluginWebContents: vi.fn(() => true),
  closePluginWebContents: vi.fn(),
  codeReview: vi.fn(async () => ({
    result: { summary: 'ok', score: 100, issues: [], improvements: [] }
  })),
  summarize: vi.fn(async () => ({ result: 'sum' })),
  rewrite: vi.fn(async () => ({ result: 'rew' })),
  translate: vi.fn(async () => ({ result: 'tr' })),
  ocr: vi.fn(async () => ({ result: { text: 'ocr' } })),
  caption: vi.fn(async () => ({ result: { caption: 'cap' } })),
  embedGenerate: vi.fn(async () => ({ result: [1, 0], model: 'm1' })),
  embedGenerateLocalImage: vi.fn(async () => ({ result: [0, 1], model: 'local-model-key' })),
  ragRerank: vi.fn(async () => ({ result: { results: [] } })),
  normalizeIntelligenceError: vi.fn(() => ({
    code: 'UNKNOWN' as const,
    message: 'err',
    reason: 'reason',
    recovery: 'recovery'
  })),
  resolveCapabilityStatus: vi.fn((capabilityId: string) => ({
    capabilityId,
    available: true,
    providerIds: ['p1']
  })),
  searchConversations: vi.fn(async () => []),
  localEmbeddingReady: vi.fn(() => true),
  localEmbeddingImageReady: vi.fn(() => true),
  runWithEmbeddingPriority: vi.fn((_priority: string, run: () => unknown) => run()),
  usageLimitListeners: new Set<(limits: unknown) => void>(),
  readUsageLimitInfo: vi.fn(() => null),
  findSessionByWindowWebContentsId: vi.fn(() => undefined),
  createSessionWithoutUI: vi.fn(async () => ({ sessionId: 's1' })),
  destroySession: vi.fn(async () => undefined),
  runNexusScene: vi.fn(async () => null),
  extractTranslatedImageFromSceneRun: vi.fn(() => null),
  extractFxConvertFromSceneRun: vi.fn(() => null),
  extractFxRateSnapshotFromSceneRun: vi.fn(() => null)
}))

vi.mock('../../modules/plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: mocks.pluginMap,
      setActivePlugin: mocks.setActivePlugin,
      installFromSource: mocks.installFromSource
    }
  }
}))
vi.mock('../../modules/plugin/dev-plugin-installer', () => ({
  installDevPluginFromPath: mocks.installDevPluginFromPath
}))
vi.mock('../../modules/plugin/adapters/plugin-features-adapter', () => ({
  default: {
    id: 'plugin-features',
    attach: mocks.pluginFeaturesAttach,
    handleActiveFeatureInput: mocks.handleActiveFeatureInput,
    onSearch: mocks.pluginFeaturesSearch
  }
}))
vi.mock('../../modules/plugin/adapters/plugin-entity-provider', () => ({
  pluginEntityProvider: { id: 'plugin-entities' }
}))
vi.mock('../../modules/plugin/runtime/plugin-injections', () => ({
  usePluginInjections: mocks.usePluginInjections
}))
vi.mock('../../modules/plugin/runtime/plugin-view-security-profile', () => ({
  resolvePluginViewSecurityProfile: mocks.resolvePluginViewSecurityProfile
}))
vi.mock('../../modules/plugin/runtime/plugin-view-host', () => ({
  buildPluginViewWebPreferences: mocks.buildPluginViewWebPreferences
}))
vi.mock('../../modules/plugin/runtime/plugin-window-policy', () => ({
  createPluginViewNavigationPolicy: mocks.createPluginViewNavigationPolicy,
  installPluginViewNavigationPolicy: mocks.installPluginViewNavigationPolicy
}))
vi.mock('../../modules/plugin/runtime/plugin-view-registry', () => ({
  registerPluginWebContents: mocks.registerPluginWebContents,
  unregisterPluginWebContents: mocks.unregisterPluginWebContents
}))
vi.mock('../../modules/plugin/runtime/plugin-view-close', () => ({
  closePluginWebContents: mocks.closePluginWebContents
}))
vi.mock('../../modules/ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    code: { review: mocks.codeReview },
    text: { summarize: mocks.summarize, rewrite: mocks.rewrite, translate: mocks.translate },
    vision: { ocr: mocks.ocr, caption: mocks.caption },
    embedding: {
      generate: mocks.embedGenerate,
      generateLocalImage: mocks.embedGenerateLocalImage
    },
    rag: { rerank: mocks.ragRerank }
  }
}))
vi.mock('../../modules/ai/intelligence-error-normalizer', () => ({
  normalizeIntelligenceError: mocks.normalizeIntelligenceError
}))
vi.mock('../../modules/ai/intelligence-capability-status', () => ({
  resolveCapabilityStatus: mocks.resolveCapabilityStatus
}))
vi.mock('../../modules/ai/local-embedding-runtime', () => ({
  getLocalEmbeddingRuntime: () => ({
    isReady: mocks.localEmbeddingReady,
    isImageReady: mocks.localEmbeddingImageReady
  })
}))
vi.mock('../../modules/ai/local-embedding-model', () => ({
  LOCAL_EMBEDDING_MODEL_KEY: 'local-model-key'
}))
vi.mock('../../modules/ai/local-embedding-queue', () => ({
  runWithEmbeddingPriority: mocks.runWithEmbeddingPriority
}))
vi.mock('../../modules/ai/usage-ledger/usage-limits', () => ({
  onUsageLimitsChanged: (listener: (limits: unknown) => void) => {
    mocks.usageLimitListeners.add(listener)
    return () => {
      mocks.usageLimitListeners.delete(listener)
    }
  },
  notifyUsageLimitsChanged: (limits: unknown) => {
    for (const listener of mocks.usageLimitListeners) {
      listener(limits)
    }
  },
  readUsageLimitInfo: mocks.readUsageLimitInfo
}))
vi.mock('../../modules/conversation/conversation-store', () => ({
  searchConversations: mocks.searchConversations
}))
vi.mock('../../modules/division-box/manager', () => ({
  DivisionBoxManager: {
    getInstance: () => ({
      findSessionByWindowWebContentsId: mocks.findSessionByWindowWebContentsId,
      createSessionWithoutUI: mocks.createSessionWithoutUI,
      destroySession: mocks.destroySession
    })
  }
}))
vi.mock('../../modules/nexus/scene-client', () => ({
  runNexusScene: mocks.runNexusScene,
  extractTranslatedImageFromSceneRun: mocks.extractTranslatedImageFromSceneRun,
  extractFxConvertFromSceneRun: mocks.extractFxConvertFromSceneRun,
  extractFxRateSnapshotFromSceneRun: mocks.extractFxRateSnapshotFromSceneRun
}))

import {
  getBoxToolAiCapabilityPort,
  getBoxToolCloudScenePort,
  getBoxToolDefaultPluginSearchProviders,
  getBoxToolLocalEmbeddingModelKey,
  getBoxToolPluginHostPort,
  getBoxToolPluginProviderDetail,
  getBoxToolSurfaceBridgePort,
  installBoxToolTpexPluginFromPath,
  runBoxToolCloudScene,
  subscribeBoxToolUsageLimitsChanged
} from '../../modules/box-tool/ports'
import { registerDp4Ports, resetDp4Ports } from './register-dp4-ports'

describe('registerDp4Ports composition-root registrar', () => {
  afterEach(() => {
    resetDp4Ports()
    mocks.pluginMap.clear()
    mocks.usageLimitListeners.clear()
    vi.clearAllMocks()
  })

  it('registers all four DP4 ports idempotently and wires concrete DP5-DP8 implementations', async () => {
    mocks.pluginMap.set('demo-plugin', { name: 'demo-plugin' })

    const dispose1 = registerDp4Ports()
    const dispose2 = registerDp4Ports()
    expect(dispose2).toBe(dispose1)
    expect(mocks.usageLimitListeners.size).toBe(1)

    expect(getBoxToolPluginHostPort()).not.toBeNull()
    expect(getBoxToolAiCapabilityPort()).not.toBeNull()
    expect(getBoxToolSurfaceBridgePort()).not.toBeNull()
    expect(getBoxToolCloudScenePort()).not.toBeNull()

    expect(getBoxToolPluginProviderDetail('demo-plugin')).toEqual({
      id: 'demo-plugin',
      name: 'demo-plugin',
      icon: undefined
    })
    expect(getBoxToolDefaultPluginSearchProviders().featuresAdapter?.id).toBe('plugin-features')
    expect(getBoxToolDefaultPluginSearchProviders().entityProvider?.id).toBe('plugin-entities')
    await installBoxToolTpexPluginFromPath('/tmp/test.tpex')
    expect(mocks.installFromSource).toHaveBeenCalledWith({
      source: '/tmp/test.tpex',
      hintType: 'tpex'
    })

    expect(getBoxToolLocalEmbeddingModelKey()).toBe('local-model-key')

    const onChange = vi.fn()
    const unsub = subscribeBoxToolUsageLimitsChanged(onChange)
    for (const listener of mocks.usageLimitListeners) {
      listener({ requestsPerDay: null })
    }
    expect(onChange).toHaveBeenCalledTimes(1)
    unsub()

    await runBoxToolCloudScene('corebox.fx.convert', { capability: 'fx.convert' })
    expect(mocks.runNexusScene).toHaveBeenCalledWith('corebox.fx.convert', {
      capability: 'fx.convert'
    })

    dispose1()
    expect(getBoxToolPluginHostPort()).toBeNull()
    expect(getBoxToolAiCapabilityPort()).toBeNull()
    expect(getBoxToolSurfaceBridgePort()).toBeNull()
    expect(getBoxToolCloudScenePort()).toBeNull()
    expect(mocks.usageLimitListeners.size).toBe(0)

    // Re-registration after disposal works cleanly
    const dispose3 = registerDp4Ports()
    expect(dispose3).not.toBe(dispose1)
    expect(getBoxToolPluginHostPort()).not.toBeNull()
    expect(mocks.usageLimitListeners.size).toBe(1)
    dispose3()
  })
})
