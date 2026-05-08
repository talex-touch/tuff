import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CoreBoxEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  useChannel: vi.fn(() => ({ send: vi.fn() })),
  usePluginName: vi.fn(() => 'demo-plugin'),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: mocks.useChannel,
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  usePluginName: mocks.usePluginName,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
  })),
}))

import { clearCoreBoxItems } from '../plugin/sdk/core-box'

describe('Plugin CoreBox SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.useChannel.mockClear()
    mocks.usePluginName.mockClear()
  })

  it('maps clearCoreBoxItems to the shared CoreBox item clear event', async () => {
    await clearCoreBoxItems()

    expect(mocks.send).toHaveBeenCalledWith(CoreBoxEvents.item.clear, {
      pluginName: 'demo-plugin',
    })
  })
})
