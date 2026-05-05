import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getActiveAppSnapshot, getTypedActiveAppSnapshot } from '../plugin/sdk/system'
import { AppEvents } from '../transport/events'

const { useChannelMock, createPluginTuffTransportMock } = vi.hoisted(() => ({
  useChannelMock: vi.fn(),
  createPluginTuffTransportMock: vi.fn(),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: useChannelMock,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: createPluginTuffTransportMock,
}))

describe('plugin sdk system.getActiveAppSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers typed transport event when available', async () => {
    const channel = {
      send: vi.fn(),
    }
    const transport = {
      send: vi.fn(async () => ({
        identifier: 'com.demo.app',
        displayName: 'Demo',
        bundleId: 'com.demo.app',
        processId: 123,
        executablePath: '/Applications/Demo.app',
        platform: 'macos',
        windowTitle: 'Demo Window',
        lastUpdated: 1,
      })),
    }

    useChannelMock.mockReturnValue(channel)
    createPluginTuffTransportMock.mockReturnValue(transport)

    const result = await getActiveAppSnapshot({ forceRefresh: true })

    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.getActiveApp, {
      forceRefresh: true,
    })
    expect(channel.send).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      identifier: 'com.demo.app',
      displayName: 'Demo',
      platform: 'macos',
    })
  })

  it('propagates typed transport failures instead of calling the legacy raw channel', async () => {
    const channel = {
      send: vi.fn(),
    }
    const transport = {
      send: vi.fn(async () => {
        throw new Error('typed unavailable')
      }),
    }

    useChannelMock.mockReturnValue(channel)
    createPluginTuffTransportMock.mockReturnValue(transport)

    await expect(getActiveAppSnapshot()).rejects.toThrow('typed unavailable')

    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.getActiveApp, {
      forceRefresh: false,
    })
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('getTypedActiveAppSnapshot keeps pure typed transport semantics', async () => {
    const channel = {
      send: vi.fn(),
    }
    const transport = {
      send: vi.fn(async () => {
        throw new Error('typed unavailable')
      }),
    }

    useChannelMock.mockReturnValue(channel)
    createPluginTuffTransportMock.mockReturnValue(transport)

    await expect(getTypedActiveAppSnapshot()).rejects.toThrow('typed unavailable')
    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.getActiveApp, {
      forceRefresh: false,
    })
    expect(channel.send).not.toHaveBeenCalled()
  })
})
