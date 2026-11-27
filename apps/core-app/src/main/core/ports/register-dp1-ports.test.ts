import { StorageList } from '@talex-touch/utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { writerMocks, probeMocks } = vi.hoisted(() => ({
  writerMocks: {
    getStatus: vi.fn(),
    withPausedAdmission: vi.fn()
  },
  probeMocks: {
    describeIntelligenceWriteRegression: vi.fn(),
    reportIntelligenceWriteRegression: vi.fn()
  }
}))

vi.mock('../../modules/box-tool/search-engine/search-index-writer', () => ({
  searchIndexWriter: {
    getStatus: writerMocks.getStatus,
    withPausedAdmission: writerMocks.withPausedAdmission
  }
}))

vi.mock('../../modules/ai/intelligence-config-write-probe', () => ({
  describeIntelligenceWriteRegression: probeMocks.describeIntelligenceWriteRegression,
  reportIntelligenceWriteRegression: probeMocks.reportIntelligenceWriteRegression
}))

import {
  getDatabaseWalSearchIndexWriterPort,
  registerDatabaseWalSearchIndexWriterPort
} from '../../modules/database/database-ports'
import {
  clearStoragePortsForTesting,
  hasStorageBeforeRendererSaveObservers,
  notifyStorageBeforeRendererSave
} from '../../modules/storage/storage-ports'
import { registerDp1Ports } from './register-dp1-ports'

describe('registerDp1Ports', () => {
  let dispose: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    registerDatabaseWalSearchIndexWriterPort(null)
    clearStoragePortsForTesting()
  })

  afterEach(() => {
    dispose?.()
    dispose = null
    registerDatabaseWalSearchIndexWriterPort(null)
    clearStoragePortsForTesting()
  })

  it('wires search-index writer WAL port and intelligence write probe observer idempotently', async () => {
    writerMocks.getStatus.mockReturnValue({
      readiness: 'ready',
      admissionPaused: true,
      activeAdmissions: 0,
      pending: 0
    })
    writerMocks.withPausedAdmission.mockImplementation(async (_reason, operation) =>
      operation({
        readiness: 'ready',
        admissionPaused: true,
        activeAdmissions: 0,
        pending: 0
      })
    )
    const fakeRegression = {
      clientVersion: 3,
      serverVersion: 3,
      unconditional: false,
      droppedProviderIds: ['alpha'],
      droppedLiveBindingKeys: [],
      droppedIdleBindingKeys: [],
      disabledBindingKeys: [],
      programOwnedLosses: [],
      providerCount: { before: 1, after: 0 },
      bindingCount: { before: 0, after: 0 }
    }
    probeMocks.describeIntelligenceWriteRegression.mockReturnValue(fakeRegression)

    const disposeFirst = registerDp1Ports()
    dispose = registerDp1Ports()

    // Database WAL writer port delegates to searchIndexWriter.
    const writerPort = getDatabaseWalSearchIndexWriterPort()
    expect(writerPort).not.toBeNull()
    expect(writerPort?.getStatus()).toMatchObject({ readiness: 'ready', pending: 0 })
    const result = await writerPort?.withPausedAdmission('test-reason', async () => 'ok', 1000)
    expect(result).toBe('ok')
    expect(writerMocks.withPausedAdmission).toHaveBeenCalledWith(
      'test-reason',
      expect.any(Function),
      1000
    )

    // Storage before-save observer fires exactly once despite double registration.
    expect(hasStorageBeforeRendererSaveObservers(StorageList.IntelligenceConfig)).toBe(true)
    notifyStorageBeforeRendererSave({
      key: StorageList.IntelligenceConfig,
      previousDocument: { providers: [{ id: 'alpha' }] },
      incomingPayload: { providers: [] },
      clientVersion: 3,
      serverVersion: 3
    })
    expect(probeMocks.describeIntelligenceWriteRegression).toHaveBeenCalledTimes(1)
    expect(probeMocks.reportIntelligenceWriteRegression).toHaveBeenCalledTimes(1)
    expect(probeMocks.reportIntelligenceWriteRegression).toHaveBeenCalledWith(fakeRegression)

    // Disposing the superseded registration leaves the active registration intact.
    disposeFirst()
    expect(getDatabaseWalSearchIndexWriterPort()).not.toBeNull()
    expect(hasStorageBeforeRendererSaveObservers(StorageList.IntelligenceConfig)).toBe(true)

    // Disposing the active registration clears both ports.
    dispose()
    dispose = null
    expect(getDatabaseWalSearchIndexWriterPort()).toBeNull()
    expect(hasStorageBeforeRendererSaveObservers(StorageList.IntelligenceConfig)).toBe(false)
  })
})
