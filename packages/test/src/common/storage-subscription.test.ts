import type { IStorageChannel } from '@talex-touch/utils/renderer/storage'
import type { ITuffTransport } from '@talex-touch/utils/transport'
import { getSubscriptionManager, initStorageSubscription, subscribeStorage } from '@talex-touch/utils/renderer/storage/storage-subscription'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import { describe, expect, it, vi } from 'vitest'

function createTransport(send: ITuffTransport['send']): ITuffTransport {
  return {
    send,
    stream: vi.fn(async () => ({ cancel: vi.fn() })),
    on: vi.fn(() => () => {}),
    upgrade: vi.fn(),
    openPort: vi.fn(),
    flush: vi.fn(async () => {}),
    destroy: vi.fn(),
  } as unknown as ITuffTransport
}

describe('storage subscription', () => {
  it('prefers typed storage transport over legacy channel snapshots', async () => {
    const channelSend = vi.fn(async () => {
      throw new Error('legacy channel should not be used')
    })
    const channelReg = vi.fn()
    const channel = {
      send: channelSend,
      regChannel: channelReg,
      unRegChannel: vi.fn(),
    } as unknown as IStorageChannel
    const transportSend = vi.fn(async (event, payload) => {
      expect(event).toBe(StorageEvents.app.get)
      expect(payload).toEqual({ key: 'app-setting.ini' })
      return { locale: 'zh' }
    }) as ITuffTransport['send']
    const callback = vi.fn()

    getSubscriptionManager().clear()
    initStorageSubscription(channel, createTransport(transportSend))
    const unsubscribe = subscribeStorage('app-setting.ini', callback)

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledWith({ locale: 'zh' })
    })

    expect(transportSend).toHaveBeenCalledTimes(1)
    expect(channelSend).not.toHaveBeenCalled()
    expect(channelReg).not.toHaveBeenCalled()

    unsubscribe()
    getSubscriptionManager().clear()
  })
})
