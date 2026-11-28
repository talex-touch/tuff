import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import { resolveCapabilityStatus } from '../../modules/ai/intelligence-capability-status'
import { normalizeIntelligenceError } from '../../modules/ai/intelligence-error-normalizer'
import { tuffIntelligence } from '../../modules/ai/intelligence-sdk'
import { LOCAL_EMBEDDING_MODEL_KEY } from '../../modules/ai/local-embedding-model'
import { runWithEmbeddingPriority } from '../../modules/ai/local-embedding-queue'
import { getLocalEmbeddingRuntime } from '../../modules/ai/local-embedding-runtime'
import {
  notifyUsageLimitsChanged,
  onUsageLimitsChanged,
  readUsageLimitInfo
} from '../../modules/ai/usage-ledger/usage-limits'
import {
  registerBoxToolAiCapabilityPort,
  registerBoxToolCloudScenePort,
  registerBoxToolPluginHostPort,
  registerBoxToolSurfaceBridgePort,
  resetBoxToolAiCapabilityPort,
  resetBoxToolCloudScenePort,
  resetBoxToolPluginHostPort,
  resetBoxToolSurfaceBridgePort
} from '../../modules/box-tool/ports'
import { searchConversations } from '../../modules/conversation/conversation-store'
import { DivisionBoxManager } from '../../modules/division-box/manager'
import {
  extractFxConvertFromSceneRun,
  extractFxRateSnapshotFromSceneRun,
  extractTranslatedImageFromSceneRun,
  runNexusScene
} from '../../modules/nexus/scene-client'
import { pluginEntityProvider } from '../../modules/plugin/adapters/plugin-entity-provider'
import PluginFeaturesAdapter from '../../modules/plugin/adapters/plugin-features-adapter'
import { installDevPluginFromPath } from '../../modules/plugin/dev-plugin-installer'
import { pluginModule } from '../../modules/plugin/plugin-module'
import { usePluginInjections } from '../../modules/plugin/runtime/plugin-injections'
import { closePluginWebContents } from '../../modules/plugin/runtime/plugin-view-close'
import { buildPluginViewWebPreferences } from '../../modules/plugin/runtime/plugin-view-host'
import {
  registerPluginWebContents,
  unregisterPluginWebContents
} from '../../modules/plugin/runtime/plugin-view-registry'
import { resolvePluginViewSecurityProfile } from '../../modules/plugin/runtime/plugin-view-security-profile'
import {
  createPluginViewNavigationPolicy,
  installPluginViewNavigationPolicy,
  type PluginViewNavigationPolicy
} from '../../modules/plugin/runtime/plugin-window-policy'

let registeredDisposer: (() => void) | null = null

/**
 * Composition-root wiring for DP4 (Search & Intent Dispatch) ports.
 *
 * Idempotent: repeated calls return the existing disposer without duplicating subscriptions.
 */
export function registerDp4Ports(): () => void {
  if (registeredDisposer) {
    return registeredDisposer
  }

  const disposePluginHost = registerBoxToolPluginHostPort({
    hasPluginManager: () => Boolean(pluginModule.pluginManager),
    setActivePlugin: (pluginName) => {
      pluginModule.pluginManager?.setActivePlugin(pluginName)
    },
    getPluginProviderDetail: (pluginId) => {
      const plugin = pluginModule.pluginManager?.plugins.get(pluginId)
      if (!plugin) return null
      return {
        id: plugin.name,
        name: plugin.name,
        icon: plugin.icon
      }
    },
    installDevPluginFromPath: (sourcePath, options) =>
      installDevPluginFromPath(sourcePath, options),
    canInstallTpexPlugin: () => Boolean(pluginModule.pluginManager?.installFromSource),
    installTpexPluginFromPath: async (sourcePath) => {
      const manager = pluginModule.pluginManager
      if (!manager?.installFromSource) {
        return null
      }
      return await manager.installFromSource({
        source: sourcePath,
        hintType: PluginProviderType.TPEX
      })
    },
    handleActiveFeatureInput: (payload) => PluginFeaturesAdapter.handleActiveFeatureInput(payload),
    searchPluginFeatures: (query, signal) => PluginFeaturesAdapter.onSearch(query, signal),
    getDefaultSearchProviders: () => ({
      featuresAdapter: PluginFeaturesAdapter,
      entityProvider: pluginEntityProvider
    }),
    usePluginInjections: (plugin, source) => usePluginInjections(plugin, source),
    resolvePluginViewSecurityProfile: (plugin, context) =>
      resolvePluginViewSecurityProfile(plugin, context),
    buildPluginViewWebPreferences: (profile, options) =>
      buildPluginViewWebPreferences(profile, options),
    createPluginViewNavigationPolicy: (options) => createPluginViewNavigationPolicy(options),
    installPluginViewNavigationPolicy: (webContents, policy) =>
      installPluginViewNavigationPolicy(webContents, policy as PluginViewNavigationPolicy),
    registerPluginWebContents: (webContentsId, activation) =>
      registerPluginWebContents(webContentsId, activation),
    unregisterPluginWebContents: (webContentsId, registrationToken) =>
      unregisterPluginWebContents(webContentsId, registrationToken),
    closePluginWebContents: (webContents) => closePluginWebContents(webContents)
  })

  const disposeAiCapability = registerBoxToolAiCapabilityPort({
    intelligence: {
      code: {
        review: (payload, options) => tuffIntelligence.code.review(payload, options)
      },
      text: {
        summarize: (payload, options) => tuffIntelligence.text.summarize(payload, options),
        rewrite: (payload, options) => tuffIntelligence.text.rewrite(payload, options),
        translate: (payload, options) => tuffIntelligence.text.translate(payload, options)
      },
      vision: {
        ocr: (payload, options) => tuffIntelligence.vision.ocr(payload, options),
        caption: (payload, options) => tuffIntelligence.vision.caption(payload, options)
      },
      embedding: {
        generate: (payload, options) => tuffIntelligence.embedding.generate(payload, options),
        generateLocalImage: (input, options) =>
          tuffIntelligence.embedding.generateLocalImage(input, options)
      },
      rag: {
        rerank: (payload, options) => tuffIntelligence.rag.rerank(payload, options)
      }
    },
    normalizeIntelligenceError: (error, options) => normalizeIntelligenceError(error, options),
    resolveCapabilityStatus: (capabilityId) => resolveCapabilityStatus(capabilityId),
    searchConversations: (term) => searchConversations(term),
    isLocalEmbeddingReady: () => getLocalEmbeddingRuntime().isReady(),
    isLocalEmbeddingImageReady: () => getLocalEmbeddingRuntime().isImageReady(),
    getLocalEmbeddingModelKey: () => LOCAL_EMBEDDING_MODEL_KEY,
    runWithEmbeddingPriority: (priority, run) => runWithEmbeddingPriority(priority, run),
    onUsageLimitsChanged: (listener) => onUsageLimitsChanged(listener),
    notifyUsageLimitsChanged: (limits) => notifyUsageLimitsChanged(limits),
    readUsageLimitInfo: (error) => readUsageLimitInfo(error)
  })

  const disposeSurfaceBridge = registerBoxToolSurfaceBridgePort({
    findSessionByWindowWebContentsId: (webContentsId) =>
      DivisionBoxManager.getInstance().findSessionByWindowWebContentsId(webContentsId),
    createSessionWithoutUI: (config) =>
      DivisionBoxManager.getInstance().createSessionWithoutUI(config),
    destroySession: (sessionId) => DivisionBoxManager.getInstance().destroySession(sessionId)
  })

  const disposeCloudScene = registerBoxToolCloudScenePort({
    runScene: (sceneId, request) => runNexusScene(sceneId, request),
    extractTranslatedImage: (run) => extractTranslatedImageFromSceneRun(run),
    extractFxConvert: (run) => extractFxConvertFromSceneRun(run),
    extractFxRateSnapshot: (run) => extractFxRateSnapshotFromSceneRun(run)
  })

  const disposer = (): void => {
    if (registeredDisposer !== disposer) return
    registeredDisposer = null
    disposeCloudScene()
    disposeSurfaceBridge()
    disposeAiCapability()
    disposePluginHost()
  }

  registeredDisposer = disposer
  return disposer
}

export function resetDp4Ports(): void {
  if (registeredDisposer) {
    registeredDisposer()
    return
  }
  resetBoxToolCloudScenePort()
  resetBoxToolSurfaceBridgePort()
  resetBoxToolAiCapabilityPort()
  resetBoxToolPluginHostPort()
}
