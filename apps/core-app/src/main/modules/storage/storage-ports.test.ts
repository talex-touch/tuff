import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { StorageList } from '@talex-touch/utils'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearStoragePortsForTesting,
  hasStorageBeforeRendererSaveObservers,
  notifyStorageBeforeRendererSave,
  registerStorageBeforeRendererSaveObserver,
  type StorageBeforeRendererSaveEvent
} from './storage-ports'
import { StorageModule } from './index'

const transportMocks = vi.hoisted(() => ({
  on: vi.fn(() => vi.fn()),
  onStream: vi.fn(() => vi.fn())
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => transportMocks
}))

describe('storage-ports', () => {
  afterEach(() => {
    clearStoragePortsForTesting()
    transportMocks.on.mockClear()
    transportMocks.onStream.mockClear()
    vi.restoreAllMocks()
  })

  it('replaces observers idempotently by (key, id) and ignores stale disposers', () => {
    const first = vi.fn()
    const second = vi.fn()

    const disposeFirst = registerStorageBeforeRendererSaveObserver(
      StorageList.IntelligenceConfig,
      'probe',
      first
    )
    expect(hasStorageBeforeRendererSaveObservers(StorageList.IntelligenceConfig)).toBe(true)
    expect(hasStorageBeforeRendererSaveObservers(StorageList.APP_SETTING)).toBe(false)

    const disposeSecond = registerStorageBeforeRendererSaveObserver(
      StorageList.IntelligenceConfig,
      'probe',
      second
    )

    const event: StorageBeforeRendererSaveEvent = {
      key: StorageList.IntelligenceConfig,
      previousDocument: { providers: [] },
      incomingPayload: { providers: [] },
      clientVersion: 1,
      serverVersion: 1
    }
    notifyStorageBeforeRendererSave(event)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledWith(event)

    // Disposing the replaced observer must not detach the newer observer.
    disposeFirst()
    expect(hasStorageBeforeRendererSaveObservers(StorageList.IntelligenceConfig)).toBe(true)

    disposeSecond()
    expect(hasStorageBeforeRendererSaveObservers(StorageList.IntelligenceConfig)).toBe(false)
  })

  it('isolates observer failures so subsequent observers still execute', () => {
    const errors: Array<{ error: unknown; observerId: string }> = []
    const second = vi.fn()

    registerStorageBeforeRendererSaveObserver(StorageList.IntelligenceConfig, 'broken', () => {
      throw new Error('probe boom')
    })
    registerStorageBeforeRendererSaveObserver(StorageList.IntelligenceConfig, 'healthy', second)

    notifyStorageBeforeRendererSave(
      {
        key: StorageList.IntelligenceConfig,
        previousDocument: {},
        incomingPayload: {},
        clientVersion: 2,
        serverVersion: 2
      },
      (error, observerId) => {
        errors.push({ error, observerId })
      }
    )

    expect(errors).toHaveLength(1)
    expect(errors[0]?.observerId).toBe('broken')
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('invokes registered before-save observers only on accepted renderer saves and never breaks save on observer error', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-ports-'))
    const storage = new StorageModule()
    try {
      await storage.init({
        app: { channel: {} },
        file: { create: true, dirName: 'config', dirPath: configDir }
      } as unknown as Parameters<StorageModule['init']>[0])

      const initialSave = storage.saveConfig(
        StorageList.IntelligenceConfig,
        { providers: [{ id: 'alpha', type: 'openai', name: 'Alpha', enabled: true }] },
        false,
        true
      )

      const observed: StorageBeforeRendererSaveEvent[] = []
      registerStorageBeforeRendererSaveObserver(
        StorageList.IntelligenceConfig,
        'faulty-probe',
        () => {
          throw new Error('non-fatal observer error')
        }
      )
      registerStorageBeforeRendererSaveObserver(
        StorageList.IntelligenceConfig,
        'recorder',
        (event) => {
          observed.push(event)
        }
      )

      const registration = (
        transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
      ).find(([event]) => event === StorageEvents.app.save)
      const saveHandler = registration?.[1] as (request: {
        key: string
        value: object
        version?: number
      }) => Promise<{ success: boolean; version: number; conflict?: boolean }>

      // Stale client version is rejected by conflict gate: observer must NOT fire.
      const conflicted = await saveHandler({
        key: StorageList.IntelligenceConfig,
        value: { providers: [] },
        version: initialSave.version - 1
      })
      expect(conflicted.success).toBe(false)
      expect(conflicted.conflict).toBe(true)
      expect(observed).toHaveLength(0)

      // Accepted write fires observer even though another observer throws, and save still succeeds.
      const accepted = await saveHandler({
        key: StorageList.IntelligenceConfig,
        value: { providers: [] },
        version: initialSave.version
      })
      expect(accepted.success).toBe(true)
      expect(observed).toHaveLength(1)
      expect(observed[0]).toEqual({
        key: StorageList.IntelligenceConfig,
        previousDocument: {
          providers: [{ id: 'alpha', type: 'openai', name: 'Alpha', enabled: true }]
        },
        incomingPayload: { providers: [] },
        clientVersion: initialSave.version,
        serverVersion: initialSave.version
      })
    } finally {
      await storage.onDestroy()
      await rm(configDir, { recursive: true, force: true })
    }
  })
})
