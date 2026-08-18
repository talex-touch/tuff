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
  feature: {
    onInputChange: vi.fn(),
    dispose: vi.fn(),
  },
  system: {
    resolveApplication: vi.fn(),
  },
  box: {
    expand: vi.fn(),
    getInput: vi.fn(),
  },
}))

vi.mock('@talex-touch/utils/plugin/sdk/clipboard', () => ({
  useClipboard: () => sdkMocks.clipboard,
}))

vi.mock('@talex-touch/utils/plugin/sdk/box-sdk', () => ({
  useBox: () => sdkMocks.box,
}))

vi.mock('@talex-touch/utils/plugin/sdk/feature-sdk', () => ({
  useFeature: () => sdkMocks.feature,
}))

vi.mock('@talex-touch/utils/plugin/sdk/system', () => ({
  system: sdkMocks.system,
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
    sdkMocks.box.getInput.mockResolvedValue('')
    sdkMocks.feature.onInputChange.mockReturnValue(vi.fn())
    sdkMocks.system.resolveApplication.mockResolvedValue(null)
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

  it('debounces CoreBox input into the existing clipboard database query', async () => {
    vi.useFakeTimers()
    let inputHandler: (input: string) => void = () => {}
    sdkMocks.feature.onInputChange.mockImplementation((handler: (input: string) => void) => {
      inputHandler = handler
      return vi.fn()
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    inputHandler('invoice')
    await vi.advanceTimersByTimeAsync(180)
    await flushPromises()

    expect(sdkMocks.clipboard.history.getHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: 'invoice', page: 1, pageSize: 50, sortOrder: 'desc' }),
    )

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('keeps the active query when clipboard history refreshes', async () => {
    vi.useFakeTimers()
    let inputHandler: (input: string) => void = () => {}
    let historyChangeHandler: () => Promise<void> = async () => {}
    sdkMocks.feature.onInputChange.mockImplementation((handler: (input: string) => void) => {
      inputHandler = handler
      return vi.fn()
    })
    sdkMocks.clipboard.history.onDidChange.mockImplementation((handler: () => Promise<void>) => {
      historyChangeHandler = handler
      return vi.fn()
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()
    inputHandler('invoice')
    await vi.advanceTimersByTimeAsync(180)
    await flushPromises()

    await historyChangeHandler()
    expect(sdkMocks.clipboard.history.getHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: 'invoice', page: 1 }),
    )

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('ignores a stale search response that arrives after the latest query', async () => {
    vi.useFakeTimers()
    let inputHandler: (input: string) => void = () => {}
    sdkMocks.feature.onInputChange.mockImplementation((handler: (input: string) => void) => {
      inputHandler = handler
      return vi.fn()
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    const oldResponse = (
      Promise as PromiseConstructor & {
        withResolvers: <T>() => {
          promise: Promise<T>
          resolve: (value: T | PromiseLike<T>) => void
          reject: (reason?: unknown) => void
        }
      }
    ).withResolvers<{
      history: PluginClipboardItem[]
      total: number
      page: number
      pageSize: number
    }>()
    sdkMocks.clipboard.history.getHistory
      .mockImplementationOnce(() => oldResponse.promise)
      .mockResolvedValueOnce({
        history: [{ id: 12, type: 'text', content: 'latest result' }],
        total: 1,
        page: 1,
        pageSize: 50,
      })

    inputHandler('old')
    await vi.advanceTimersByTimeAsync(180)
    inputHandler('latest')
    await vi.advanceTimersByTimeAsync(180)
    await flushPromises()
    expect(wrapper.get('.detail-heading h2').text()).toBe('latest result')

    oldResponse.resolve({
      history: [{ id: 11, type: 'text', content: 'stale result' }],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    await flushPromises()
    expect(wrapper.get('.detail-heading h2').text()).toBe('latest result')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('retries a failed clipboard history read without dropping the active controls', async () => {
    sdkMocks.clipboard.history.getHistory.mockRejectedValueOnce(new Error('read failed'))
    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('.error-banner').text()).toContain('read failed')
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [],
      total: 0,
      page: 1,
      pageSize: 50,
    })
    await wrapper.get('.retry-button').trigger('click')
    await flushPromises()

    expect(sdkMocks.clipboard.history.getHistory).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.error-banner').exists()).toBe(false)
    wrapper.unmount()
  })

  it('falls back to the persisted thumbnail when the original image cannot load', async () => {
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [
        {
          id: 4,
          type: 'image',
          content: 'data:image/png;base64,thumb',
          thumbnail: 'data:image/png;base64,thumb',
          meta: {
            image_content_kind: 'thumbnail',
            image_original_url: 'tfile:///tmp/original.png',
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('.preview-img').attributes('src')).toBe('tfile:///tmp/original.png')

    await wrapper.get('.preview-img').trigger('error')

    expect(wrapper.get('.preview-img').attributes('src')).toBe('data:image/png;base64,thumb')
    expect(wrapper.get('.preview-badge').text()).toBe('缩略图预览')
    wrapper.unmount()
  })

  it('shows the resolved source application name and icon while retaining its id', async () => {
    sdkMocks.system.resolveApplication.mockResolvedValue({
      identifier: 'com.example.source',
      displayName: 'Source App',
      icon: 'tfile:///tmp/source-app.png',
    })
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [
        {
          id: 5,
          type: 'text',
          content: 'from app',
          sourceApp: 'com.example.source',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(sdkMocks.system.resolveApplication).toHaveBeenCalledWith('com.example.source')
    expect(wrapper.get('.source-app-icon').attributes('src')).toBe('tfile:///tmp/source-app.png')
    expect(wrapper.get('.info-value-copy').text()).toContain('Source App')
    expect(wrapper.get('.info-secondary').text()).toBe('com.example.source')
    wrapper.unmount()
  })
})
