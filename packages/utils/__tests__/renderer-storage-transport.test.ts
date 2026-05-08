import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('keeps TouchStorage save stable when transport returns undefined', async () => {
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
    await expect(storage.saveToRemote({ force: true })).resolves.toBeUndefined()

    expect(storage.savingState.value).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('#executeSave("unstable-save.ini") received invalid save result'),
      expect.objectContaining({ resultType: 'undefined' }),
    )
  })

  it('keeps TouchStorage save stable when transport returns a malformed result', async () => {
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
    await expect(storage.saveToRemote({ force: true })).resolves.toBeUndefined()

    expect(storage.savingState.value).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('#executeSave("malformed-save.ini") received invalid save result'),
      expect.objectContaining({ resultType: 'object' }),
    )
  })
})
