/**
 * Typed Dependency Inversion ports for DP2 Privacy module.
 *
 * Higher-layer domains (DP3 Clipboard, DP4 Search, DP6 AI & Voice) bind concrete
 * runtime owners and lifecycle hooks here from the composition root
 * (`core/ports/register-dp2-ports.ts`) so DP2 Security never runtime-imports DP3..DP8.
 */

import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../db/schema'
import type { ClipboardImagePersistenceAdapter } from './owners/clipboard-retention-owner'
import type {
  IntelligenceAuditRetentionLifecycle,
  IntelligenceContextRetentionLifecycle
} from './owners/intelligence-retention-owner'
import type {
  OrchestratorRunPrivacyFence,
  OrchestratorRunPrivacyStore
} from './owners/orchestrator-run-privacy-lifecycle'
import type {
  VoiceInsightsPrivacyStore,
  VoiceRecognitionPrivacyStore
} from './owners/voice-insights-privacy-owner'

export interface PrivacyVoiceStoresPort {
  readonly voiceInsightsStore: VoiceInsightsPrivacyStore
  readonly voiceRecognitionStore?: VoiceRecognitionPrivacyStore
}

export interface PrivacyRuntimePortDependencies {
  readonly clipboardImagePersistence: ClipboardImagePersistenceAdapter
  readonly onClipboardDeleted: (ids: readonly number[]) => void
  readonly beforeSearchDelete: () => void | Promise<void>
  readonly onSearchCompleted: () => void | Promise<void>
  readonly auditLifecycle: IntelligenceAuditRetentionLifecycle
  readonly contextLifecycle: IntelligenceContextRetentionLifecycle
  readonly voiceInsightsStore: VoiceInsightsPrivacyStore
  readonly voiceRecognitionStore?: VoiceRecognitionPrivacyStore
  readonly orchestratorStore: OrchestratorRunPrivacyStore
  readonly orchestratorFence: OrchestratorRunPrivacyFence
}

export type PrivacyRuntimeDependenciesProvider = () =>
  | PrivacyRuntimePortDependencies
  | Promise<PrivacyRuntimePortDependencies>

export type OrchestratorPrivacyAcceptanceStoreFactory = (
  db: LibSQLDatabase<typeof schema>
) => OrchestratorRunPrivacyStore

let runtimeDependenciesProvider: PrivacyRuntimeDependenciesProvider | null = null
let registeredVoiceStores: PrivacyVoiceStoresPort | null = null
let orchestratorAcceptanceStoreFactory: OrchestratorPrivacyAcceptanceStoreFactory | null = null

export function registerPrivacyRuntimeDependenciesProvider(
  provider: PrivacyRuntimeDependenciesProvider
): () => void {
  runtimeDependenciesProvider = provider
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (runtimeDependenciesProvider === provider) {
      runtimeDependenciesProvider = null
    }
  }
}

export async function resolvePrivacyRuntimeDependencies(): Promise<PrivacyRuntimePortDependencies> {
  if (!runtimeDependenciesProvider) {
    throw new Error('PRIVACY_RUNTIME_DEPENDENCIES_UNAVAILABLE')
  }
  return await runtimeDependenciesProvider()
}

export function registerPrivacyVoiceStores(stores: PrivacyVoiceStoresPort): () => void {
  registeredVoiceStores = stores
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (registeredVoiceStores === stores) {
      registeredVoiceStores = null
    }
  }
}

export function getRegisteredPrivacyVoiceStores(): PrivacyVoiceStoresPort | null {
  return registeredVoiceStores
}

export function registerOrchestratorPrivacyStoreFactory(
  factory: OrchestratorPrivacyAcceptanceStoreFactory
): () => void {
  orchestratorAcceptanceStoreFactory = factory
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (orchestratorAcceptanceStoreFactory === factory) {
      orchestratorAcceptanceStoreFactory = null
    }
  }
}

export function resolveOrchestratorPrivacyStoreFactory(): OrchestratorPrivacyAcceptanceStoreFactory | null {
  return orchestratorAcceptanceStoreFactory
}

export function resetPrivacyPorts(): void {
  runtimeDependenciesProvider = null
  registeredVoiceStores = null
  orchestratorAcceptanceStoreFactory = null
}
