import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

const service = {
  name: 'txt',
  id: Symbol('txt'),
} as any

const channel = {
  send: vi.fn(),
  regChannel: vi.fn(),
}

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  send: vi.fn(),
  useChannel: vi.fn(() => channel),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: mocks.useChannel,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    on: mocks.on,
    send: mocks.send,
  })),
}))

import { regService, unRegService } from '../plugin/sdk/service'

describe('Plugin Service SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.on.mockReset()
    mocks.useChannel.mockClear()
    channel.send.mockReset()
    channel.regChannel.mockReset()
  })

  it('keeps existing service event names behind shared event objects', () => {
    expect(PluginEvents.service.register.toEventName()).toBe('service:reg')
    expect(PluginEvents.service.unregister.toEventName()).toBe('service:unreg')
    expect(PluginEvents.service.handle.toEventName()).toBe('service:handle')
  })

  it('maps register/unregister to shared plugin service events', async () => {
    mocks.send.mockResolvedValueOnce(true).mockResolvedValueOnce(true)
    const handler = vi.fn()

    await expect(regService(service, handler)).resolves.toBe(true)
    await expect(unRegService(service)).resolves.toBe(true)

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.service.register,
      { service: 'txt' },
    )
    expect(mocks.on).toHaveBeenCalledWith(
      PluginEvents.service.handle,
      expect.any(Function),
    )
    expect(channel.regChannel).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.service.unregister,
      { service: 'txt' },
    )
  })
})
