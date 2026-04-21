import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  stream: vi.fn(),
  useChannel: vi.fn(() => ({})),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: mocks.useChannel,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
    stream: mocks.stream,
  })),
}))

import { useClipboard } from '../plugin/sdk/clipboard'

describe('Plugin Clipboard SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.stream.mockReset()
    mocks.useChannel.mockClear()
  })

  it('keeps clipboard change subscription non-fatal when stream throws synchronously', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const onChange = vi.fn()
    mocks.stream.mockImplementation(() => {
      throw new Error('[TuffPluginTransport] Stream is not supported in plugin transport')
    })

    const unsubscribe = useClipboard().history.onDidChange(onChange)

    expect(unsubscribe).toEqual(expect.any(Function))
    expect(onChange).not.toHaveBeenCalled()
    expect(() => unsubscribe()).not.toThrow()
    expect(warn).toHaveBeenCalledWith(
      '[Plugin SDK] Failed to subscribe clipboard changes',
      expect.any(Error),
    )

    warn.mockRestore()
  })
})
