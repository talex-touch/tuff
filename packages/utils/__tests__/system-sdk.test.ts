import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureSelectedText, getActiveAppSnapshot, getTypedActiveAppSnapshot, system } from '../plugin/sdk/system'
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
      includeIcon: false,
    })
    expect(channel.send).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      identifier: 'com.demo.app',
      displayName: 'Demo',
      platform: 'macos',
    })
  })

  it('propagates typed transport failures instead of calling the retired raw channel', async () => {
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
      includeIcon: false,
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
      includeIcon: false,
    })
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('only requests app icon when includeIcon is explicit', async () => {
    const channel = {
      send: vi.fn(),
    }
    const transport = {
      send: vi.fn(async () => ({
        identifier: 'com.demo.app',
        displayName: 'Demo',
        platform: 'macos',
        lastUpdated: 1,
      })),
    }

    useChannelMock.mockReturnValue(channel)
    createPluginTuffTransportMock.mockReturnValue(transport)

    await getActiveAppSnapshot({ includeIcon: true })

    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.getActiveApp, {
      forceRefresh: false,
      includeIcon: true,
    })
  })
})

describe('plugin sdk system.captureSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the typed selection event and preserves a valid capture result exactly', async () => {
    const channel = { send: vi.fn() }
    const captureResult = {
      text: 'selected text',
      supportLevel: 'best_effort' as const,
      issueCode: 'empty' as const,
      issueMessage: 'No selected text was captured from the active application.',
      limitations: ['Focused application controls copy behavior.'],
      capturedAt: 1_784_115_200_000
    }
    const transport = { send: vi.fn(async () => captureResult) }
    useChannelMock.mockReturnValue(channel)
    createPluginTuffTransportMock.mockReturnValue(transport)

    await expect(captureSelectedText()).resolves.toEqual(captureResult)
    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.captureSelection, {})
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('exposes system.captureSelection as the typed SDK entry point', async () => {
    const channel = { send: vi.fn() }
    const transport = {
      send: vi.fn(async () => ({
        text: 'direct selection',
        supportLevel: 'supported',
        capturedAt: 1_784_115_200_001
      }))
    }
    useChannelMock.mockReturnValue(channel)
    createPluginTuffTransportMock.mockReturnValue(transport)

    await expect(system.captureSelection()).resolves.toEqual({
      text: 'direct selection',
      supportLevel: 'supported',
      issueCode: undefined,
      issueMessage: undefined,
      limitations: undefined,
      capturedAt: 1_784_115_200_001
    })
    expect(transport.send).toHaveBeenCalledWith(AppEvents.system.captureSelection, {})
  })

  it.each([
    ['a non-object response', null],
    ['an array response', []],
    ['an unsupported support level', { text: 'x', supportLevel: 'partial', capturedAt: 1 }],
    ['a non-finite capture timestamp', { text: 'x', supportLevel: 'supported', capturedAt: Infinity }],
    [
      'a malformed limitations envelope',
      { text: 'x', supportLevel: 'supported', limitations: ['safe', 1], capturedAt: 1 }
    ]
  ])('rejects $0 instead of exposing malformed selection metadata', async (_name, response) => {
    const transport = { send: vi.fn(async () => response) }
    useChannelMock.mockReturnValue({ send: vi.fn() })
    createPluginTuffTransportMock.mockReturnValue(transport)

    await expect(captureSelectedText()).rejects.toThrow('Selection capture returned an invalid result.')
  })
})
