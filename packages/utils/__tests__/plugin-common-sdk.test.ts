import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

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

import { communicateWithPlugin, regShortcut, sendMessage } from '../plugin/sdk/common'

describe('Plugin Common SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.on.mockReset()
    mocks.useChannel.mockClear()
    channel.send.mockReset()
    channel.regChannel.mockReset()
  })

  it('keeps shortcut and communicate event names behind shared event objects', () => {
    expect(PluginEvents.shortcut.register.toEventName()).toBe('shortcon:reg')
    expect(PluginEvents.shortcut.trigger.toEventName()).toBe('shortcon:trigger')
    expect(PluginEvents.communicate.index.toEventName()).toBe('index:communicate')
  })

  it('maps shortcut registration to shared plugin shortcut events', async () => {
    mocks.send.mockResolvedValueOnce(true)
    const handler = vi.fn()

    await expect(
      regShortcut('CommandOrControl+K', handler, {
        id: 'quick-open',
        description: 'Quick open',
      }),
    ).resolves.toBe(true)

    expect(mocks.send).toHaveBeenCalledWith(
      PluginEvents.shortcut.register,
      {
        key: 'CommandOrControl+K',
        id: 'quick-open',
        description: 'Quick open',
      },
    )
    expect(mocks.on).toHaveBeenCalledWith(
      PluginEvents.shortcut.trigger,
      expect.any(Function),
    )
    expect(channel.regChannel).not.toHaveBeenCalled()
  })

  it('maps plugin communication to the shared communicate event', async () => {
    mocks.send.mockResolvedValueOnce({ status: 'message_sent' })

    await expect(
      communicateWithPlugin('sync', { value: 1 }),
    ).resolves.toEqual({ status: 'message_sent' })

    expect(mocks.send).toHaveBeenCalledWith(
      PluginEvents.communicate.index,
      {
        key: 'sync',
        info: { value: 1 },
      },
    )
  })

  it('maps sendMessage compatibility wrapper to shared communicate event', async () => {
    mocks.send.mockResolvedValueOnce({ status: 'message_sent' })

    await expect(sendMessage('sync', { value: 2 })).resolves.toEqual({
      status: 'message_sent',
    })

    expect(mocks.send).toHaveBeenCalledWith(
      PluginEvents.communicate.index,
      {
        key: 'sync',
        info: { value: 2 },
      },
    )
    expect(channel.send).not.toHaveBeenCalled()
  })
})
