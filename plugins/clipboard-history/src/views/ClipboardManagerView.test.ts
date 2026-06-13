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

  it('writes copyable detail insight text to the clipboard', async () => {
    const imageItem: PluginClipboardItem = {
      id: 1,
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
