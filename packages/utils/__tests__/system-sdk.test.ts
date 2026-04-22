import { beforeEach, describe, expect, it, vi } from 'vitest'
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

import { getActiveAppSnapshot, getTypedActiveAppSnapshot } from '../plugin/sdk/system'

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

  it('falls back to legacy raw channel when typed transport fails', async () => {
    const channel = {
      send: vi.fn(async () => ({
        identifier: 'legacy.app',
        displayName: 'Legacy App',
        bundleId: 'legacy.app',
        processId: 321,
        executablePath: '/Applications/Legacy.app',
        platform: 'macos',
        windowTitle: 'Legacy Window',
        lastUpdated: 2,
      })),
    }
    const transport = {
      send: vi.fn(async () => {
        throw new Error('typed unavailable')
      }),
    }

    useChannelMock.mockReturnValue(channel)
    createPluginTuffTransportMock.mockReturnValue(transport)

    const result = await getActiveAppSnapshot()

    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.getActiveApp, {
      forceRefresh: false,
    })
    expect(channel.send).toHaveBeenCalledWith('system:get-active-app', {
      forceRefresh: false,
    })
    expect(result).toMatchObject({
      identifier: 'legacy.app',
      displayName: 'Legacy App',
    })
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
