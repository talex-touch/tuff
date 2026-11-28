import type { Client, ResultSet } from '@libsql/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPrivacyProductionOwnerRegistry } from './privacy-module'
import {
  getRegisteredPrivacyVoiceStores,
  registerOrchestratorPrivacyStoreFactory,
  registerPrivacyRuntimeDependenciesProvider,
  registerPrivacyVoiceStores,
  resetPrivacyPorts,
  resolveOrchestratorPrivacyStoreFactory,
  resolvePrivacyRuntimeDependencies
} from './privacy-ports'

function createNoopClient(): Pick<Client, 'execute' | 'batch'> {
  return {
    execute: vi.fn(async () => ({ rows: [] }) as unknown as ResultSet),
    batch: vi.fn(async () => [])
  }
}

describe('privacy-ports', () => {
  afterEach(() => {
    resetPrivacyPorts()
  })

  it('fails closed when runtime dependencies provider is not registered', async () => {
    await expect(resolvePrivacyRuntimeDependencies()).rejects.toThrow(
      'PRIVACY_RUNTIME_DEPENDENCIES_UNAVAILABLE'
    )
  })

  it('resolves registered runtime dependencies and preserves non-clobbering disposal', async () => {
    const firstDeps = { marker: 'first' } as never
    const secondDeps = { marker: 'second' } as never

    const disposeFirst = registerPrivacyRuntimeDependenciesProvider(() => firstDeps)
    await expect(resolvePrivacyRuntimeDependencies()).resolves.toBe(firstDeps)

    const disposeSecond = registerPrivacyRuntimeDependenciesProvider(async () => secondDeps)
    disposeFirst()
    disposeFirst()
    await expect(resolvePrivacyRuntimeDependencies()).resolves.toBe(secondDeps)

    disposeSecond()
    await expect(resolvePrivacyRuntimeDependencies()).rejects.toThrow(
      'PRIVACY_RUNTIME_DEPENDENCIES_UNAVAILABLE'
    )
  })

  it('routes voice-insights owner operations through registered voice stores', async () => {
    const getInsights = vi.fn(async () => ({ sessionCount: 3 }))
    const clearInsights = vi.fn(async () => undefined)
    const listRecords = vi.fn(async () => [{ audioBytes: 128 }, { audioBytes: 256 }])
    const clearRecords = vi.fn(async () => undefined)

    const disposeVoice = registerPrivacyVoiceStores({
      voiceInsightsStore: { getInsights, clearInsights },
      voiceRecognitionStore: { list: listRecords, clear: clearRecords }
    })

    expect(getRegisteredPrivacyVoiceStores()?.voiceInsightsStore).toBeDefined()

    const registry = createPrivacyProductionOwnerRegistry({
      coreClient: createNoopClient(),
      auxiliaryClient: createNoopClient(),
      tempFileService: {
        registerNamespace: vi.fn(),
        inspectNamespace: vi.fn()
      } as never,
      clipboardImagePersistence: {
        deleteOwnedImageReferences: vi.fn(),
        cleanupOrphanClipboardImages: vi.fn()
      },
      onClipboardDeleted: vi.fn(),
      beforeSearchDelete: vi.fn(),
      onSearchCompleted: vi.fn(),
      auditLifecycle: { cleanupRetentionPage: vi.fn() },
      contextLifecycle: { cleanupRetentionPage: vi.fn() },
      telemetryLifecycle: { clearFailureBefore: vi.fn() },
      logDirectory: '/tmp/privacy-ports-logs'
    })

    const signal = new AbortController().signal
    const nowMs = Date.UTC(2026, 6, 31)
    const voiceOwner = registry.get('voice-insights')

    const inspected = await voiceOwner.inspect(
      {
        category: 'voice-insights',
        policy: { enabled: false, retentionMs: null },
        nowMs
      },
      signal
    )
    expect(inspected.ok).toBe(true)
    expect(inspected.itemCount).toBe(1)
    expect(getInsights).toHaveBeenCalledWith(nowMs)

    const deleted = await voiceOwner.delete(
      {
        category: 'voice-insights',
        mode: 'manual-delete',
        policy: { enabled: false, retentionMs: null },
        nowMs
      },
      signal
    )
    expect(deleted.ok).toBe(true)
    expect(deleted.deletedItemCount).toBe(3)
    expect(deleted.deletedByteCount).toBe(384)
    expect(clearInsights).toHaveBeenCalledWith(nowMs)
    expect(clearRecords).toHaveBeenCalledOnce()

    disposeVoice()
    expect(getRegisteredPrivacyVoiceStores()).toBeNull()
  })

  it('registers and disposes orchestrator privacy store factory cleanly', () => {
    expect(resolveOrchestratorPrivacyStoreFactory()).toBeNull()
    const factory = vi.fn(() => ({}) as never)
    const dispose = registerOrchestratorPrivacyStoreFactory(factory)
    expect(resolveOrchestratorPrivacyStoreFactory()).toBe(factory)
    dispose()
    expect(resolveOrchestratorPrivacyStoreFactory()).toBeNull()
  })
})
