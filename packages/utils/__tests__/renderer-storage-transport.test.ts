import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeRendererStorage } from '../renderer/storage/bootstrap'
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

  it('upgrades an existing legacy storage subscription listener to transport', async () => {
    const legacy = createLegacyChannelMock({
      'app-setting.ini': { source: 'legacy' },
    })
    const transport = createTransportMock({
      'app-setting.ini': { source: 'transport' },
    })
    const callback = vi.fn()

    initStorageSubscription(legacy.channel as any)
    expect(legacy.channel.regChannel).toHaveBeenCalledWith(
      StorageEvents.legacy.update.toEventName(),
      expect.any(Function),
    )

    initStorageSubscription(undefined, transport as any)
    subscribeStorage('app-setting.ini', callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1))

    expect(legacy.cleanup).toHaveBeenCalledTimes(1)
    expect(transport.stream).toHaveBeenCalledWith(
      StorageEvents.app.updated,
      undefined,
      expect.objectContaining({ onData: expect.any(Function) }),
    )
    expect(transport.send).toHaveBeenCalledWith(StorageEvents.app.get, {
      key: 'app-setting.ini',
    })
    expect(legacy.channel.send).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledWith({ source: 'transport' })
  })
})
