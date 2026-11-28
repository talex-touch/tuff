import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBoxToolUsageLimitError,
  createEmptyBoxToolUsageLimits,
  getBoxToolAiCapabilityPort,
  getBoxToolLocalEmbeddingModelKey,
  isBoxToolLocalEmbeddingImageReady,
  isBoxToolLocalEmbeddingReady,
  normalizeBoxToolIntelligenceError,
  notifyBoxToolUsageLimitsChanged,
  readBoxToolUsageLimitInfo,
  registerBoxToolAiCapabilityPort,
  requireBoxToolIntelligence,
  resetBoxToolAiCapabilityPort,
  resolveBoxToolCapabilityStatus,
  runBoxToolWithEmbeddingPriority,
  searchBoxToolConversations,
  subscribeBoxToolUsageLimitsChanged,
  type BoxToolAiCapabilityPort
} from './ai-capability-port'
import {
  extractBoxToolFxConvertFromSceneRun,
  extractBoxToolFxRateSnapshotFromSceneRun,
  extractBoxToolTranslatedImageFromSceneRun,
  getBoxToolCloudScenePort,
  registerBoxToolCloudScenePort,
  resetBoxToolCloudScenePort,
  runBoxToolCloudScene
} from './cloud-scene-port'
import {
  buildBoxToolPluginViewWebPreferences,
  canInstallBoxToolTpexPlugin,
  closeBoxToolPluginWebContents,
  createBoxToolPluginViewNavigationPolicy,
  forwardBoxToolActiveFeatureInput,
  getBoxToolDefaultPluginSearchProviders,
  getBoxToolPluginHostPort,
  getBoxToolPluginProviderDetail,
  hasBoxToolPluginManager,
  installBoxToolDevPluginFromPath,
  installBoxToolPluginViewNavigationPolicy,
  installBoxToolTpexPluginFromPath,
  registerBoxToolPluginHostPort,
  registerBoxToolPluginWebContents,
  resetBoxToolPluginHostPort,
  resolveBoxToolPluginInjections,
  resolveBoxToolPluginViewSecurityProfile,
  searchBoxToolPluginFeatures,
  setBoxToolActivePlugin,
  unregisterBoxToolPluginWebContents,
  type BoxToolPluginHostPort
} from './plugin-host-port'
import {
  getBoxToolSurfaceBridgePort,
  registerBoxToolSurfaceBridgePort,
  resetBoxToolSurfaceBridgePort
} from './surface-bridge-port'

function createPluginHostPortStub(): BoxToolPluginHostPort {
  return {
    hasPluginManager: vi.fn(() => true),
    setActivePlugin: vi.fn(),
    getPluginProviderDetail: vi.fn((id) => ({ id, name: id })),
    installDevPluginFromPath: vi.fn(async () => ({ status: 'success' as const })),
    canInstallTpexPlugin: vi.fn(() => true),
    installTpexPluginFromPath: vi.fn(async () => ({ manifest: { name: 'demo' } as never })),
    handleActiveFeatureInput: vi.fn(async () => true),
    searchPluginFeatures: vi.fn(async () => ({ items: [] }) as never),
    getDefaultSearchProviders: vi.fn(() => ({})),
    usePluginInjections: vi.fn(() => null),
    resolvePluginViewSecurityProfile: vi.fn(() => ({
      candidateProfile: 'trusted-plugin-view' as const,
      effectiveProfile: 'trusted-plugin-view' as const,
      reason: 'trusted-candidate' as const
    })),
    buildPluginViewWebPreferences: vi.fn(() => ({ contextIsolation: true })),
    createPluginViewNavigationPolicy: vi.fn(async () => ({ policy: true })),
    installPluginViewNavigationPolicy: vi.fn(),
    registerPluginWebContents: vi.fn(() => 'reg-token'),
    unregisterPluginWebContents: vi.fn(() => true),
    closePluginWebContents: vi.fn()
  }
}

describe('DP4 box-tool port registries', () => {
  afterEach(() => {
    resetBoxToolPluginHostPort()
    resetBoxToolAiCapabilityPort()
    resetBoxToolSurfaceBridgePort()
    resetBoxToolCloudScenePort()
  })

  describe('plugin-host-port', () => {
    it('fails closed for plugin view security operations and degrades safely for queries when unregistered', async () => {
      const pluginStub = { name: 'demo-plugin' } as never

      expect(getBoxToolPluginHostPort()).toBeNull()
      expect(hasBoxToolPluginManager()).toBe(false)
      expect(getBoxToolPluginProviderDetail('demo-plugin')).toBeNull()
      expect(canInstallBoxToolTpexPlugin()).toBe(false)
      expect(getBoxToolDefaultPluginSearchProviders()).toEqual({})
      expect(resolveBoxToolPluginInjections(pluginStub, 'test')).toBeNull()
      expect(unregisterBoxToolPluginWebContents(10, 'tok')).toBe(false)

      await expect(installBoxToolDevPluginFromPath('/tmp/plugin')).resolves.toEqual({
        status: 'error',
        error: 'PLUGIN_HOST_UNAVAILABLE'
      })
      await expect(installBoxToolTpexPluginFromPath('/tmp/plugin.tpex')).rejects.toThrow(
        /not registered/i
      )
      await expect(
        forwardBoxToolActiveFeatureInput({
          input: 'a',
          query: { text: 'a', inputs: [] },
          source: 'renderer'
        })
      ).resolves.toBe(false)
      await expect(
        searchBoxToolPluginFeatures({ text: 'a', inputs: [] }, new AbortController().signal)
      ).resolves.toBeNull()

      // App-profile (missing plugin) returns missing-plugin; real plugin fails closed
      expect(resolveBoxToolPluginViewSecurityProfile(undefined, { source: 'test' })).toEqual({
        candidateProfile: 'trusted-plugin-view',
        effectiveProfile: 'trusted-plugin-view',
        reason: 'missing-plugin'
      })
      expect(() => resolveBoxToolPluginViewSecurityProfile(pluginStub, { source: 'test' })).toThrow(
        /not registered/i
      )
      expect(() =>
        buildBoxToolPluginViewWebPreferences('trusted-plugin-view', {
          plugin: pluginStub,
          themeStyle: {},
          source: 'test'
        })
      ).toThrow(/not registered/i)
      await expect(
        createBoxToolPluginViewNavigationPolicy({
          pluginRoot: '/tmp',
          targetUrl: 'file:///tmp/index.html',
          appIsPackaged: false,
          pluginDevEnabled: false,
          pluginDevSource: false
        })
      ).rejects.toThrow(/not registered/i)
      expect(() => installBoxToolPluginViewNavigationPolicy({} as never, {})).toThrow(
        /not registered/i
      )
      expect(() =>
        registerBoxToolPluginWebContents(1, { name: 'demo', key: 'k' } as never)
      ).toThrow(/not registered/i)

      // closeBoxToolPluginWebContents still closes live webContents when unregistered
      const liveWebContents = {
        isDestroyed: () => false,
        close: vi.fn()
      } as unknown as Electron.WebContents
      closeBoxToolPluginWebContents(liveWebContents)
      expect(liveWebContents.close).toHaveBeenCalledTimes(1)
    })

    it('delegates to registered port and only clears matching registration on dispose', async () => {
      const portA = createPluginHostPortStub()
      const portB = createPluginHostPortStub()

      const disposeA = registerBoxToolPluginHostPort(portA)
      setBoxToolActivePlugin('plugin-a')
      expect(portA.setActivePlugin).toHaveBeenCalledWith('plugin-a')
      expect(getBoxToolPluginProviderDetail('plugin-a')).toEqual({
        id: 'plugin-a',
        name: 'plugin-a'
      })

      const disposeB = registerBoxToolPluginHostPort(portB)
      // Stale disposer from portA must not clear portB
      disposeA()
      expect(getBoxToolPluginHostPort()).toBe(portB)

      disposeB()
      expect(getBoxToolPluginHostPort()).toBeNull()
    })
  })

  describe('ai-capability-port', () => {
    it('degrades safely when unregistered and bridges usage-limit subscriptions registered before wiring', async () => {
      expect(getBoxToolAiCapabilityPort()).toBeNull()
      expect(isBoxToolLocalEmbeddingReady()).toBe(false)
      expect(isBoxToolLocalEmbeddingImageReady()).toBe(false)
      expect(getBoxToolLocalEmbeddingModelKey()).toBeNull()
      expect(resolveBoxToolCapabilityStatus('code.review')).toEqual({
        capabilityId: 'code.review',
        available: false,
        providerIds: [],
        reason: 'intelligence-unavailable'
      })
      await expect(searchBoxToolConversations('hello')).resolves.toEqual([])
      expect(() => requireBoxToolIntelligence()).toThrow(/not registered/i)
      expect(runBoxToolWithEmbeddingPriority('interactive', () => 42)).toBe(42)

      // Structural fallback reads USAGE_LIMIT_REACHED errors even when unregistered
      const limitError = createBoxToolUsageLimitError('embedding.generate', {
        key: 'requestsPerDay',
        used: 10,
        max: 10,
        resetsAt: 1_800_000_000_000
      })
      expect(readBoxToolUsageLimitInfo(limitError)).toEqual({
        key: 'requestsPerDay',
        used: 10,
        max: 10,
        resetsAt: 1_800_000_000_000
      })
      expect(
        normalizeBoxToolIntelligenceError(limitError, { capabilityId: 'embedding.generate' }).code
      ).toBe('USAGE_LIMIT_REACHED')

      // Subscribe BEFORE port registration; must still fire once port wires its emitter
      const received: number[] = []
      const unsub = subscribeBoxToolUsageLimitsChanged(() => {
        received.push(1)
      })

      notifyBoxToolUsageLimitsChanged(createEmptyBoxToolUsageLimits())
      expect(received).toHaveLength(1)

      type UsageLimitListener = (limits: ReturnType<typeof createEmptyBoxToolUsageLimits>) => void
      const portListenerRef: { current: UsageLimitListener | null } = { current: null }
      const portUnsub = vi.fn(() => {
        portListenerRef.current = null
      })

      const port: BoxToolAiCapabilityPort = {
        intelligence: {} as never,
        normalizeIntelligenceError: vi.fn((error, options) => ({
          code: 'UNKNOWN' as const,
          message: String(error),
          reason: 'r',
          recovery: 'rec',
          capabilityId: options?.capabilityId
        })),
        resolveCapabilityStatus: vi.fn((capabilityId) => ({
          capabilityId,
          available: true,
          providerIds: ['p1']
        })),
        searchConversations: vi.fn(async () => []),
        isLocalEmbeddingReady: vi.fn(() => true),
        isLocalEmbeddingImageReady: vi.fn(() => true),
        getLocalEmbeddingModelKey: vi.fn(() => 'local-model-v1'),
        runWithEmbeddingPriority: vi.fn((_priority, run) => run()),
        onUsageLimitsChanged: vi.fn((listener) => {
          portListenerRef.current = listener
          return portUnsub
        }),
        notifyUsageLimitsChanged: vi.fn((limits) => {
          portListenerRef.current?.(limits)
        }),
        readUsageLimitInfo: vi.fn(() => null)
      }

      const dispose = registerBoxToolAiCapabilityPort(port)
      expect(isBoxToolLocalEmbeddingReady()).toBe(true)
      expect(getBoxToolLocalEmbeddingModelKey()).toBe('local-model-v1')

      // Trigger from DP6 side -> fires DP4 subscriber exactly once
      portListenerRef.current?.(createEmptyBoxToolUsageLimits())
      expect(received).toHaveLength(2)

      // Trigger from DP4 helper -> delegates to port emitter -> fires DP4 subscriber once (no duplicate)
      notifyBoxToolUsageLimitsChanged(createEmptyBoxToolUsageLimits())
      expect(received).toHaveLength(3)

      unsub()
      portListenerRef.current?.(createEmptyBoxToolUsageLimits())
      expect(received).toHaveLength(3)

      dispose()
      expect(portUnsub).toHaveBeenCalledTimes(1)
      expect(getBoxToolAiCapabilityPort()).toBeNull()
    })
  })

  describe('surface-bridge-port & cloud-scene-port', () => {
    it('supports registration, delegation, and clean disposal', async () => {
      expect(getBoxToolSurfaceBridgePort()).toBeNull()
      expect(getBoxToolCloudScenePort()).toBeNull()
      await expect(runBoxToolCloudScene('corebox.fx.convert', {})).resolves.toBeNull()
      expect(extractBoxToolTranslatedImageFromSceneRun(null)).toBeNull()
      expect(extractBoxToolFxConvertFromSceneRun(null)).toBeNull()
      expect(extractBoxToolFxRateSnapshotFromSceneRun(null)).toBeNull()

      const surfacePort = {
        findSessionByWindowWebContentsId: vi.fn(() => undefined),
        createSessionWithoutUI: vi.fn(),
        destroySession: vi.fn()
      }
      const disposeSurface = registerBoxToolSurfaceBridgePort(surfacePort)
      expect(getBoxToolSurfaceBridgePort()).toBe(surfacePort)
      disposeSurface()
      expect(getBoxToolSurfaceBridgePort()).toBeNull()

      const cloudPort = {
        runScene: vi.fn(async () => ({
          runId: 'run-1',
          sceneId: 'corebox.fx.convert',
          status: 'completed' as const,
          mode: 'execute' as const,
          output: {}
        })),
        extractTranslatedImage: vi.fn(() => ({ translatedImageBase64: 'abc' })),
        extractFxConvert: vi.fn(() => null),
        extractFxRateSnapshot: vi.fn(() => null)
      }
      const disposeCloud = registerBoxToolCloudScenePort(cloudPort)
      const run = await runBoxToolCloudScene('corebox.fx.convert', {})
      expect(run?.runId).toBe('run-1')
      expect(extractBoxToolTranslatedImageFromSceneRun(run)).toEqual({
        translatedImageBase64: 'abc'
      })
      disposeCloud()
      expect(getBoxToolCloudScenePort()).toBeNull()
    })
  })
})
