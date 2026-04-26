import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '../transport/events'

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

  it('preserves failed copy-and-paste message as a thrown SDK error', async () => {
    mocks.send.mockResolvedValueOnce({
      success: false,
      message: '需要在“系统设置 -> 隐私与安全性 -> 自动化/辅助功能”允许 Tuff 控制 System Events。',
      code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
    })

    await expect(useClipboard().copyAndPaste({ text: 'secret text' })).rejects.toMatchObject({
      message: '需要在“系统设置 -> 隐私与安全性 -> 自动化/辅助功能”允许 Tuff 控制 System Events。',
      code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
    })

    expect(mocks.send).toHaveBeenCalledWith(
      ClipboardEvents.copyAndPaste,
      expect.objectContaining({ text: 'secret text' }),
    )
  })

  it('preserves failed history apply message for item-id apply requests', async () => {
    mocks.send.mockResolvedValueOnce({
      success: false,
      message: 'Clipboard history item not found: 42',
      code: 'CLIPBOARD_ITEM_NOT_FOUND',
    })

    await expect(
      useClipboard().history.applyToActiveApp({
        item: {
          id: 42,
          type: 'text',
          content: 'secret text',
        },
      }),
    ).rejects.toMatchObject({
      message: 'Clipboard history item not found: 42',
      code: 'CLIPBOARD_ITEM_NOT_FOUND',
    })

    expect(mocks.send).toHaveBeenCalledWith(
      ClipboardEvents.apply,
      expect.objectContaining({ id: 42, autoPaste: true }),
    )
  })
})
