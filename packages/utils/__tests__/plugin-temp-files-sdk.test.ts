import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  useChannel: vi.fn(() => ({
    send: vi.fn(),
  })),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: mocks.useChannel,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
  })),
}))

import { useTempPluginFiles } from '../plugin/sdk/temp-files'

describe('Plugin Temp Files SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.useChannel.mockClear()
  })

  it('maps create/delete to shared temp-file events without changing event names', async () => {
    mocks.send
      .mockResolvedValueOnce({
        url: 'tfile:///tmp/plugin-temp.txt',
        path: '/tmp/plugin-temp.txt',
        sizeBytes: 5,
        createdAt: 1,
      })
      .mockResolvedValueOnce({ success: true })

    const sdk = useTempPluginFiles()

    await expect(
      sdk.create({
        ext: 'txt',
        text: 'hello',
        prefix: 'plugin',
        retentionMs: 1000,
      }),
    ).resolves.toEqual({
      url: 'tfile:///tmp/plugin-temp.txt',
      path: '/tmp/plugin-temp.txt',
      sizeBytes: 5,
      createdAt: 1,
    })
    await expect(sdk.delete('tfile:///tmp/plugin-temp.txt')).resolves.toBe(true)

    expect(PluginEvents.tempFile.create.toEventName()).toBe('temp-file:create')
    expect(PluginEvents.tempFile.delete.toEventName()).toBe('temp-file:delete')
    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.tempFile.create,
      {
        ext: 'txt',
        text: 'hello',
        prefix: 'plugin',
        retentionMs: 1000,
      },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.tempFile.delete,
      { url: 'tfile:///tmp/plugin-temp.txt' },
    )
  })
})
