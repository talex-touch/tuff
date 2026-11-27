/**
 * Composition-root port registrar for DP2 (Security: permission, privacy, build-verification).
 *
 * Wires concrete DP3/DP4/DP5/DP6 runtime implementations into DP2's typed ports
 * so DP2 modules never runtime-import higher domains.
 */

import { scheduleDbWrite } from '../../db/db-write'
import { AiOrchestratorStore } from '../../modules/ai/ai-orchestrator-store'
import { registerPermissionPluginBridge } from '../../modules/permission/permission-ports'
import { teardownPluginStorage } from '../../modules/plugin/runtime/plugin-storage-lifecycle'
import { getPluginSdkHardCutGate } from '../../modules/plugin/sdkapi-hard-cut-gate'
import {
  registerOrchestratorPrivacyStoreFactory,
  registerPrivacyRuntimeDependenciesProvider,
  registerPrivacyVoiceStores,
  type PrivacyRuntimePortDependencies
} from '../../modules/privacy/privacy-ports'
import { voiceInsightsStore } from '../../modules/voice/voice-insights-store'
import { voiceRecognitionStore } from '../../modules/voice/voice-recognition-store'

interface PluginLike {
  sdkapi?: number
}

let pluginModuleImport: Promise<{
  pluginModule?: { pluginManager?: { getPluginByName: (name: string) => unknown } }
}> | null = null

let disposers: Array<() => void> = []
let registered = false

async function resolvePluginDeclaredSdkApi(pluginId: string): Promise<number | undefined> {
  pluginModuleImport = pluginModuleImport ?? import('../../modules/plugin/plugin-module')
  const { pluginModule } = await pluginModuleImport
  const plugin = pluginModule?.pluginManager?.getPluginByName(pluginId) as PluginLike | undefined
  return typeof plugin?.sdkapi === 'number' ? plugin.sdkapi : undefined
}

async function resolveProductionPrivacyRuntimeDependencies(): Promise<PrivacyRuntimePortDependencies> {
  const [
    { contextHygieneService },
    { intelligenceAuditLogger },
    { clipboardModule },
    { default: searchEngineCore },
    { aiCliOrchestrator },
    { aiOrchestratorStore }
  ] = await Promise.all([
    import('../../modules/ai/intelligence-context-hygiene'),
    import('../../modules/ai/intelligence-audit-logger'),
    import('../../modules/clipboard'),
    import('../../modules/box-tool/search-engine/search-core'),
    import('../../modules/ai/ai-cli-orchestrator'),
    import('../../modules/ai/ai-orchestrator-store')
  ])

  return Object.freeze<PrivacyRuntimePortDependencies>({
    clipboardImagePersistence: clipboardModule.getImagePersistenceForPrivacy(),
    onClipboardDeleted: (ids) => clipboardModule.evictCommittedRetentionIdsForPrivacy(ids),
    beforeSearchDelete: () => searchEngineCore.preparePrivacyRetentionCleanup(),
    onSearchCompleted: () => searchEngineCore.completePrivacyRetentionCleanup(),
    auditLifecycle: intelligenceAuditLogger,
    contextLifecycle: contextHygieneService,
    voiceInsightsStore,
    voiceRecognitionStore,
    orchestratorStore: aiOrchestratorStore,
    orchestratorFence: Object.freeze({
      isRunProtected: aiCliOrchestrator.isPrivacyRunProtected.bind(aiCliOrchestrator),
      acquireRunDeletionFence:
        aiCliOrchestrator.acquirePrivacyRunDeletionFence.bind(aiCliOrchestrator)
    })
  })
}

/**
 * Idempotently register all DP2 Security ports against concrete DP3/DP4/DP5/DP6 runtime services.
 */
export function registerDp2Ports(): void {
  if (registered) return
  registered = true

  disposers = [
    registerPermissionPluginBridge({
      resolvePluginDeclaredSdkApi,
      teardownPluginStorage,
      getPluginSdkHardCutGate
    }),
    registerPrivacyVoiceStores({
      voiceInsightsStore,
      voiceRecognitionStore
    }),
    registerPrivacyRuntimeDependenciesProvider(resolveProductionPrivacyRuntimeDependencies),
    registerOrchestratorPrivacyStoreFactory(
      (db) =>
        new AiOrchestratorStore({
          getDb: () => db,
          scheduleWrite: scheduleDbWrite
        })
    )
  ]
}

export function resetDp2PortsForTests(): void {
  for (const dispose of disposers.splice(0).reverse()) {
    dispose()
  }
  pluginModuleImport = null
  registered = false
}
