import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import ClipboardManagerView from './ClipboardManagerView.vue'

const sdkMocks = vi.hoisted(() => ({
  clipboard: {
    write: vi.fn(),
    getHistoryImageUrl: vi.fn(),
    history: {
      getHistory: vi.fn(),
      onDidChange: vi.fn(),
      applyToActiveApp: vi.fn(),
      setFavorite: vi.fn(),
      deleteItem: vi.fn(),
    },
  },
  box: {
    expand: vi.fn(),
  },
}))

vi.mock('@talex-touch/utils/plugin/sdk/clipboard', () => ({
  useClipboard: () => sdkMocks.clipboard,
}))

vi.mock('@talex-touch/utils/plugin/sdk/box-sdk', () => ({
  useBox: () => sdkMocks.box,
}))

describe('clipboardManagerView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sdkMocks.clipboard.write.mockResolvedValue(undefined)
    sdkMocks.clipboard.getHistoryImageUrl.mockResolvedValue(null)
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [],
      total: 0,
      page: 1,
      pageSize: 50,
    })
    sdkMocks.clipboard.history.onDidChange.mockReturnValue(vi.fn())
    sdkMocks.clipboard.history.applyToActiveApp.mockResolvedValue(true)
    sdkMocks.clipboard.history.setFavorite.mockResolvedValue(undefined)
    sdkMocks.clipboard.history.deleteItem.mockResolvedValue(undefined)
    sdkMocks.box.expand.mockResolvedValue(undefined)
  })

  it('uses Enter to paste and Cmd/Ctrl+Enter to copy the selected item', async () => {
    const textItem: PluginClipboardItem = {
      id: 1,
      type: 'text',
      content: 'hello keyboard',
      rawContent: '<b>hello keyboard</b>',
    }

    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [textItem],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, {
      attachTo: document.body,
    })
    await flushPromises()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()

    expect(sdkMocks.clipboard.history.applyToActiveApp).toHaveBeenCalledWith({ item: textItem })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }))
    await flushPromises()

    expect(sdkMocks.clipboard.write).toHaveBeenCalledWith({
      text: 'hello keyboard',
      html: '<b>hello keyboard</b>',
    })

    wrapper.unmount()
  })

  it('keeps text split chips visible and copyable in the detail pane', async () => {
    const textItem: PluginClipboardItem = {
      id: 2,
      type: 'text',
      content: '你好 Tuff',
    }

    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [textItem],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, {
      attachTo: document.body,
    })
    await flushPromises()

    expect(wrapper.get('.insight-title').text()).toContain('拆词')
    expect(wrapper.findAll('.character-chip').map(node => node.text())).toEqual(
      expect.arrayContaining(['你', '好', 'T', 'u', 'f']),
    )

    await wrapper.get('.character-chip').trigger('click')

    expect(sdkMocks.clipboard.write).toHaveBeenCalledWith({ text: '你' })

    wrapper.unmount()
  })

  it('writes copyable image insight text to the clipboard', async () => {
    const imageItem: PluginClipboardItem = {
      id: 3,
      type: 'image',
      content: 'data:image/png;base64,thumb',
      thumbnail: 'data:image/png;base64,thumb',
      meta: {
        image_content_kind: 'thumbnail',
        dominantColor: '#112233',
        ocr_status: 'done',
        ocr_text: 'Invoice total',
        ocr_keywords: ['invoice', 'total'],
      },
    }

    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [imageItem],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, {
      attachTo: document.body,
    })
    await flushPromises()

    await wrapper.get('.ocr-text').trigger('click')
    await wrapper.get('.keyword-chip').trigger('click')
    await wrapper.get('.color-chip').trigger('click')

    expect(sdkMocks.clipboard.write).toHaveBeenNthCalledWith(1, { text: 'Invoice total' })
    expect(sdkMocks.clipboard.write).toHaveBeenNthCalledWith(2, { text: 'invoice' })
    expect(sdkMocks.clipboard.write).toHaveBeenNthCalledWith(3, { text: '#112233' })

    wrapper.unmount()
  })
})
