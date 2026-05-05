import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useChannelMock } = vi.hoisted(() => ({
  useChannelMock: vi.fn(),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: useChannelMock,
}))

import { regShortcut } from '../plugin/sdk/common'

describe('plugin sdk regShortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards shortcut id and description to the runtime', async () => {
    const channel = {
      regChannel: vi.fn(),
      send: vi.fn(async () => true),
    }
    useChannelMock.mockReturnValue(channel)

    await expect(
      regShortcut('CommandOrControl+Shift+K', vi.fn(), {
        id: 'open-command-center',
        description: 'Open command center',
      }),
    ).resolves.toBe(true)

    expect(channel.send).toHaveBeenCalledWith('shortcon:reg', {
      key: 'CommandOrControl+Shift+K',
      id: 'open-command-center',
      description: 'Open command center',
    })
  })

  it('matches shortcut trigger by custom id', async () => {
    let triggerHandler: ((event: { data: { id: string } }) => void) | undefined
    const callback = vi.fn()
    const channel = {
      regChannel: vi.fn((_eventName: string, handler: typeof triggerHandler) => {
        triggerHandler = handler
        return () => undefined
      }),
      send: vi.fn(async () => true),
    }
    useChannelMock.mockReturnValue(channel)

    await regShortcut('CommandOrControl+Shift+K', callback, {
      id: 'open-command-center',
      description: 'Open command center',
    })

    triggerHandler?.({ data: { id: 'open-command-center' } })

    expect(callback).toHaveBeenCalledTimes(1)
  })
})
