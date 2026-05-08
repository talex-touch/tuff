import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  useChannel: vi.fn(() => ({ send: vi.fn() })),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: mocks.useChannel,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
  })),
}))

import {
  createWindow,
  setWindowProperty,
  toggleWinVisible,
} from '../plugin/sdk/window'

describe('Plugin Window SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.useChannel.mockClear()
  })

  it('keeps existing window event names behind shared event objects', () => {
    expect(PluginEvents.window.new.toEventName()).toBe('window:new')
    expect(PluginEvents.window.visible.toEventName()).toBe('window:visible')
    expect(PluginEvents.window.property.toEventName()).toBe('window:property')
  })

  it('maps window operations to shared plugin window events', async () => {
    mocks.send
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({ visible: false })
      .mockResolvedValueOnce({ success: true })

    await expect(createWindow({ url: 'https://example.test' })).resolves.toBe(42)
    await expect(toggleWinVisible(42, false)).resolves.toBe(false)
    await expect(
      setWindowProperty(42, { window: { setTitle: ['Demo'] } } as any),
    ).resolves.toBe(true)

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.window.new,
      { url: 'https://example.test' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.window.visible,
      { id: 42, visible: false },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      3,
      PluginEvents.window.property,
      {
        id: 42,
        property: { window: { setTitle: ['Demo'] } },
      },
    )
  })
})
