import { describe, expect, it, vi } from 'vitest'
import type { FileIndexSettings } from '../types'
import { DEFAULT_FILE_INDEX_SETTINGS } from '../types'
import { FileProviderContentIndexPolicyService } from './file-provider-content-index-policy-service'

function createService(overrides: Partial<FileIndexSettings>, cleanupVersion: number) {
  let settings: FileIndexSettings = { ...DEFAULT_FILE_INDEX_SETTINGS, ...overrides }
  const clearData = vi.fn(async () => undefined)
  const compact = vi.fn(async () => undefined)
  const service = new FileProviderContentIndexPolicyService({
    cleanupVersion,
    getSettings: () => settings,
    updateSettings: async (patch) => {
      settings = { ...settings, ...patch }
      return settings
    },
    syncSettings: () => undefined,
    getSchedulerSnapshot: () => ({ activeBatches: 0, queuedBatches: 0 }),
    isResumeActive: () => false,
    resume: () => undefined,
    stop: () => undefined,
    cancelPending: () => undefined,
    clearData,
    compact
  })
  return { service, clearData, compact, getSettings: () => settings }
}

describe('FileProviderContentIndexPolicyService', () => {
  it('re-runs the cleanup on startup when the policy version moved, then compacts', async () => {
    const { service, clearData, compact, getSettings } = createService(
      { contentIndexingEnabled: false, contentIndexCleanupVersion: 1 },
      2
    )

    await service.reconcileAtStartup()

    expect(clearData).toHaveBeenCalledTimes(1)
    expect(getSettings().contentIndexCleanupVersion).toBe(2)
    expect(compact).toHaveBeenCalledWith('content-cleanup-startup')
  })

  it('leaves a profile alone when its cleanup version is current', async () => {
    const { service, clearData, compact } = createService(
      { contentIndexingEnabled: false, contentIndexCleanupVersion: 2 },
      2
    )

    await service.reconcileAtStartup()

    expect(clearData).not.toHaveBeenCalled()
    expect(compact).not.toHaveBeenCalled()
  })

  it('compacts after the user switches content indexing off', async () => {
    const { service, clearData, compact } = createService(
      { contentIndexingEnabled: true, contentIndexCleanupVersion: 2 },
      2
    )

    const snapshot = await service.update(false)

    expect(snapshot.contentIndexingEnabled).toBe(false)
    expect(clearData).toHaveBeenCalledTimes(1)
    expect(compact).toHaveBeenCalledWith('content-indexing-disabled')
  })
})
