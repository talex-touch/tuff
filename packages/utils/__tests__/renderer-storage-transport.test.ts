import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { initializeRendererStorage } from '../renderer/storage/bootstrap'
import {
  initStorageChannel,
  TouchStorage,
} from '../renderer/storage/base-storage'
import {
  getSubscriptionManager,
  initStorageSubscription,
  subscribeStorage,
} from '../renderer/storage/storage-subscription'
import { StorageEvents } from '../transport/events'

function createTransportMock(seed: Record<string, unknown> = {}) {
  return {
    send: vi.fn(async (_event: unknown, payload?: { key?: string }) => {
      if (payload?.key) {
        return seed[payload.key] ?? null
      }
      return null
    }),
    stream: vi.fn(async () => ({
      cancel: vi.fn(),
      cancelled: false,
      streamId: 'storage-stream',
    })),
    on: vi.fn(() => vi.fn()),
    flush: vi.fn(async () => undefined),
    destroy: vi.fn(),
  }
}

function createLegacyChannelMock(seed: Record<string, unknown> = {}) {
  const cleanup = vi.fn()

  return {
    cleanup,
    channel: {
      send: vi.fn(async (_event: string, key?: string) => {
        if (key) {
          return seed[key] ?? null
        }
        return null
      }),
      regChannel: vi.fn(() => cleanup),
      unRegChannel: vi.fn(() => true),
      sendSync: vi.fn(),
    },
  }
}

describe('renderer storage transport bootstrap', () => {
  afterEach(() => {
    getSubscriptionManager().dispose()
    vi.restoreAllMocks()
  })

  it('subscribes and reads through StorageEvents app transport by default', async () => {
    const transport = createTransportMock({
      'app-setting.ini': { dev: { advancedSettings: true } },
    })
    const callback = vi.fn()

    initializeRendererStorage(transport as any)
    subscribeStorage('app-setting.ini', callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1))

    expect(transport.stream).toHaveBeenCalledWith(
      StorageEvents.app.updated,
      undefined,
      expect.objectContaining({ onData: expect.any(Function) }),
    )
    expect(transport.send).toHaveBeenCalledWith(StorageEvents.app.get, {
      key: 'app-setting.ini',
    })
    expect(callback).toHaveBeenCalledWith({ dev: { advancedSettings: true } })
  })

  it('does not expose retired raw storage update namespace', () => {
    const retiredNamespace = ['leg', 'acy'].join('')
    expect(retiredNamespace in StorageEvents).toBe(false)
  })

  it('ignores compat storage subscription channels and uses transport', async () => {
    const compat = createLegacyChannelMock({
      'app-setting.ini': { source: 'compat' },
    })
    const transport = createTransportMock({
      'app-setting.ini': { source: 'transport' },
    })
    const callback = vi.fn()

    initStorageSubscription(compat.channel as any)
    initStorageSubscription(undefined, transport as any)
    subscribeStorage('app-setting.ini', callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1))

    expect(compat.channel.regChannel).not.toHaveBeenCalled()
    expect(transport.stream).toHaveBeenCalledWith(
      StorageEvents.app.updated,
      undefined,
      expect.objectContaining({ onData: expect.any(Function) }),
    )
    expect(transport.send).toHaveBeenCalledWith(StorageEvents.app.get, {
      key: 'app-setting.ini',
    })
    expect(compat.channel.send).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledWith({ source: 'transport' })
  })

  it('keeps TouchStorage reads and saves on transport when a compat channel is present', async () => {
    const compat = createLegacyChannelMock({
      'hard-cut.ini': { source: 'compat' },
    })
    const transport = createTransportMock({
      'hard-cut.ini': { data: { source: 'transport' }, version: 7 },
    })
    transport.send.mockImplementation(async (event: unknown, payload?: { key?: string }) => {
      if (event === StorageEvents.app.save) {
        return { success: true, version: 8 }
      }
      if (payload?.key) {
        return { data: { source: 'transport' }, version: 7 }
      }
      return null
    })

    initStorageChannel(compat.channel as any)
    initializeRendererStorage(transport as any, { legacyChannel: compat.channel as any })
    const storage = new TouchStorage('hard-cut.ini', { source: 'initial' })

    await storage.whenHydrated()
    await storage.saveToRemote({ force: true })

    expect(storage.data.source).toBe('transport')
    expect(transport.send).toHaveBeenCalledWith(StorageEvents.app.getVersioned, {
      key: 'hard-cut.ini',
    })
    expect(transport.send).toHaveBeenCalledWith(
      StorageEvents.app.save,
      expect.objectContaining({ key: 'hard-cut.ini' }),
    )
    expect(compat.channel.send).not.toHaveBeenCalled()
  })

  it('sends a plain cloneable payload when storage contains nested Vue refs', async () => {
    const transport = createTransportMock({
      'plain-save.ini': { data: {}, version: 1 },
    })
    transport.send.mockImplementation(async (event: unknown, payload?: { key?: string }) => {
      if (event === StorageEvents.app.save) {
        return { success: true, version: 2 }
      }
      if (payload?.key) {
        return { data: {}, version: 1 }
      }
      return null
    })

    initializeRendererStorage(transport as any)
    const storage = new TouchStorage('plain-save.ini', {
      nested: reactive({
        models: [ref('gpt-4.1'), reactive({ id: 'claude-sonnet-4' })],
      }),
    })

    await storage.whenHydrated()
    storage.data.nested = reactive({
      models: [ref('gpt-5'), reactive({ id: 'gemini-2.5-pro' })],
    })
    await storage.saveToRemote({ force: true })

    expect(transport.send).toHaveBeenCalledWith(
      StorageEvents.app.save,
      expect.objectContaining({
        value: {
          nested: {
            models: ['gpt-5', { id: 'gemini-2.5-pro' }],
          },
        },
      }),
    )
  })

  it('reloads and retries without rejecting when save detects a version conflict', async () => {
    const transport = createTransportMock()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let getVersionedCalls = 0
    let saveCalls = 0

    transport.send.mockImplementation(async (event: unknown, payload?: { key?: string }) => {
      if (event === StorageEvents.app.save) {
        saveCalls++
        if (saveCalls === 1) {
          return { success: false, version: 2, conflict: true }
        }
        return { success: true, version: 3 }
      }
      if (event === StorageEvents.app.getVersioned && payload?.key === 'conflict-save.ini') {
        getVersionedCalls++
        return getVersionedCalls === 1
          ? { data: { source: 'initial', theme: 'light' }, version: 1 }
          : { data: { source: 'remote', theme: 'light' }, version: 2 }
      }
      return null
    })

    initializeRendererStorage(transport as any)
    const storage = new TouchStorage('conflict-save.ini', {
      source: 'initial',
      theme: 'light',
    })

    await storage.whenHydrated()
    storage.data.theme = 'dark'

    await expect(storage.saveToRemote({ force: true })).resolves.toBeUndefined()
    await vi.waitFor(() => expect(saveCalls).toBe(2), { timeout: 2000 })

    expect(storage.data.source).toBe('remote')
    expect(storage.data.theme).toBe('dark')
    expect(storage.getVersion()).toBe(3)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Conflict detected for "conflict-save.ini"'),
    )
    expect(transport.send).toHaveBeenLastCalledWith(
      StorageEvents.app.save,
      expect.objectContaining({
        key: 'conflict-save.ini',
        value: { source: 'remote', theme: 'dark' },
        version: 2,
      }),
    )
  })

  it('rejects explicit save when conflict reload fails', async () => {
    const transport = createTransportMock()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let getVersionedCalls = 0

    transport.send.mockImplementation(async (event: unknown, payload?: { key?: string }) => {
      if (event === StorageEvents.app.save) {
        return { success: false, version: 2, conflict: true }
      }
      if (event === StorageEvents.app.getVersioned && payload?.key === 'conflict-reload-fail.ini') {
        getVersionedCalls++
        if (getVersionedCalls === 1) {
          return { data: { source: 'initial' }, version: 1 }
        }
        throw new Error('reload unavailable')
      }
      return null
    })

    initializeRendererStorage(transport as any)
    const storage = new TouchStorage('conflict-reload-fail.ini', { source: 'initial' })

    await storage.whenHydrated()
    storage.data.source = 'local'

    await expect(storage.saveToRemote({ force: true })).rejects.toMatchObject({
      details: {
        key: 'conflict-reload-fail.ini',
        reason: 'remote-failed',
        version: 2,
      },
    })
    expect(storage.savingState.value).toBe(false)
  })

  it('rejects explicit save when conflict retry save fails', async () => {
    const transport = createTransportMock()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let getVersionedCalls = 0
    let saveCalls = 0

    transport.send.mockImplementation(async (event: unknown, payload?: { key?: string }) => {
      if (event === StorageEvents.app.save) {
        saveCalls++
        return saveCalls === 1
          ? { success: false, version: 2, conflict: true }
          : undefined as unknown as null
      }
      if (event === StorageEvents.app.getVersioned && payload?.key === 'conflict-retry-fail.ini') {
        getVersionedCalls++
        return getVersionedCalls === 1
          ? { data: { source: 'initial', theme: 'light' }, version: 1 }
          : { data: { source: 'remote', theme: 'light' }, version: 2 }
      }
      return null
    })

    initializeRendererStorage(transport as any)
    const storage = new TouchStorage('conflict-retry-fail.ini', {
      source: 'initial',
      theme: 'light',
    })

    await storage.whenHydrated()
    storage.data.theme = 'dark'

    await expect(storage.saveToRemote({ force: true })).rejects.toMatchObject({
      details: {
        key: 'conflict-retry-fail.ini',
        reason: 'remote-failed',
        version: 2,
      },
    })
    expect(storage.data.source).toBe('remote')
    expect(storage.data.theme).toBe('dark')
    expect(storage.savingState.value).toBe(false)
    expect(saveCalls).toBe(2)
  })

  it('reports remote save failure when transport returns undefined', async () => {
    const transport = createTransportMock({
      'unstable-save.ini': { data: { source: 'transport' }, version: 3 },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    transport.send.mockImplementation(async (event: unknown, payload?: { key?: string }) => {
      if (event === StorageEvents.app.save) {
        return undefined as unknown as null
      }
      if (payload?.key) {
        return { data: { source: 'transport' }, version: 3 }
      }
      return null
    })

    initializeRendererStorage(transport as any)
    const storage = new TouchStorage('unstable-save.ini', { source: 'initial' })

    await storage.whenHydrated()
    await expect(storage.saveToRemote({ force: true })).rejects.toMatchObject({
      details: {
        key: 'unstable-save.ini',
        reason: 'remote-failed',
        version: 3,
      },
    })

    expect(storage.savingState.value).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('#executeSave("unstable-save.ini") received invalid save result'),
      expect.objectContaining({ resultType: 'undefined' }),
    )
  })

  it('reports remote save failure when transport returns a malformed result', async () => {
    const transport = createTransportMock({
      'malformed-save.ini': { data: { source: 'transport' }, version: 4 },
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    transport.send.mockImplementation(async (event: unknown, payload?: { key?: string }) => {
      if (event === StorageEvents.app.save) {
        return { version: 5 }
      }
      if (payload?.key) {
        return { data: { source: 'transport' }, version: 4 }
      }
      return null
    })

    initializeRendererStorage(transport as any)
    const storage = new TouchStorage('malformed-save.ini', { source: 'initial' })

    await storage.whenHydrated()
    await expect(storage.saveToRemote({ force: true })).rejects.toMatchObject({
      details: {
        key: 'malformed-save.ini',
        reason: 'remote-failed',
        version: 4,
      },
    })

    expect(storage.savingState.value).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('#executeSave("malformed-save.ini") received invalid save result'),
      expect.objectContaining({ resultType: 'object' }),
    )
  })
})
