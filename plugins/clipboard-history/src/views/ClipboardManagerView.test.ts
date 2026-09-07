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
    setInput: vi.fn(),
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
    sdkMocks.box.setInput.mockResolvedValue(undefined)
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

    // 含空格 → 走词频而不是字符网格（字符网格只留给验证码 / 编号）。
    expect(wrapper.get('.insight-title').text()).toContain('拆词')
    expect(wrapper.findAll('.word-chip').map(node => node.text())).toEqual(
      expect.arrayContaining(['你好', 'Tuff']),
    )

    await wrapper.get('.word-chip').trigger('click')

    expect(sdkMocks.clipboard.write).toHaveBeenCalledWith({ text: '你好' })

    wrapper.unmount()
  })

  it('routes a spaceless short code to the character grid instead', async () => {
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [{ id: 22, type: 'text', content: '679839' }],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('.insight-title').text()).toContain('字符')
    expect(wrapper.findAll('.character-chip').map(node => node.text())).toEqual([
      '6',
      '7',
      '9',
      '8',
      '3',
      '9',
    ])

    await wrapper.get('.character-chip').trigger('click')
    expect(sdkMocks.clipboard.write).toHaveBeenCalledWith({ text: '6' })

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

    // 洞察区只渲染一块：图片走 OCR。主题色改由缩略图下方的色带承载（09-05-color-capability）。
    expect(wrapper.find('.color-chip').exists()).toBe(false)

    await wrapper.get('.ocr-text').trigger('click')
    await wrapper.get('.keyword-chip').trigger('click')

    expect(sdkMocks.clipboard.write).toHaveBeenNthCalledWith(1, { text: 'Invoice total' })
    expect(sdkMocks.clipboard.write).toHaveBeenNthCalledWith(2, { text: 'invoice' })

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
    expect(wrapper.get('.text-preview').text()).toBe('latest result')

    oldResponse.resolve({
      history: [{ id: 11, type: 'text', content: 'stale result' }],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    await flushPromises()
    expect(wrapper.get('.text-preview').text()).toBe('latest result')

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
    expect(wrapper.get('.source-name').text()).toContain('Source App')
    expect(wrapper.get('.source-bundle').text()).toBe('com.example.source')
    wrapper.unmount()
  })

  it('offers every category once the content-shape classifier is wired', async () => {
    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    const chips = wrapper.findAll('.category-chip')
    expect(chips.map(chip => chip.text())).toEqual([
      '全部',
      '文本',
      '链接',
      '图片',
      '视频',
      '文件',
      '颜色',
      '命令',
      '密钥',
      '收藏',
    ])
    expect(chips.filter(chip => chip.attributes('disabled') !== undefined)).toHaveLength(0)

    wrapper.unmount()
  })

  it('maps a ready category onto the existing history query', async () => {
    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    await wrapper.findAll('.category-chip').find(chip => chip.text() === '图片')?.trigger('click')
    await flushPromises()

    expect(sdkMocks.clipboard.history.getHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'image', isFavorite: undefined }),
    )

    await wrapper.findAll('.category-chip').find(chip => chip.text() === '收藏')?.trigger('click')
    await flushPromises()

    expect(sdkMocks.clipboard.history.getHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: undefined, isFavorite: true }),
    )

    wrapper.unmount()
  })

  it('filters derived categories against the loaded page and says so in the count', async () => {
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [
        { id: 41, type: 'text', content: 'git push --force origin main' },
        { id: 42, type: 'text', content: '这是一段普通的说明文字，没有命令。' },
        { id: 43, type: 'text', content: 'https://dsh.tagzxia.com/dashboard' },
      ],
      total: 3,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('.record-count').text()).toBe('3 条')

    await wrapper.findAll('.category-chip').find(chip => chip.text() === '命令')?.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.ClipboardItem')).toHaveLength(1)
    // 派生分类只能过滤已加载的这一页，计数必须如实说明，不能伪装成全库结果。
    expect(wrapper.get('.record-count').text()).toBe('1 / 3')

    await wrapper.findAll('.category-chip').find(chip => chip.text() === '链接')?.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.ClipboardItem')).toHaveLength(1)

    wrapper.unmount()
  })

  it('turns a copied colour into a swatch preview with four formats and a contrast verdict', async () => {
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [{ id: 51, type: 'text', content: '#ABCDEE' }],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('.color-canvas').text()).toBe('#ABCDEE')
    expect(wrapper.findAll('.kv-label').map(node => node.text())).toEqual([
      'HEX',
      'RGB',
      'HSL',
      'OKLCH',
      '对比度',
    ])
    // 取色时就要知道能不能用，所以对比度结论进标题。
    expect(wrapper.get('.insight-title').text()).toContain('AAA')

    const rgbRow = wrapper.findAll('.kv-value')[1]
    await rgbRow?.trigger('click')
    expect(sdkMocks.clipboard.write).toHaveBeenCalledWith({ text: 'rgb(171, 205, 238)' })

    wrapper.unmount()
  })

  it('keeps secondary metadata behind a collapsed disclosure', async () => {
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [
        {
          id: 61,
          type: 'text',
          content: 'hello',
          timestamp: Date.parse('2026-09-05T03:49:00Z'),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.find('.more-body').exists()).toBe(false)
    // 摘要由实际会渲染的分区名拼出来，不是写死的文案。
    const summary = wrapper.get('.more-summary').text()
    expect(summary).toContain('MIME')
    expect(summary).toContain('记录 ID')
    expect(summary).toContain('字符拆分')

    await wrapper.get('.more-toggle').trigger('click')

    expect(wrapper.findAll('.more-label').map(node => node.text())).toEqual([
      'MIME',
      '记录时间',
      '记录 ID',
    ])

    wrapper.unmount()
  })

  it('abbreviates the mime in the summary strip but spells it out in the disclosure', async () => {
    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [{ id: 62, type: 'files', content: JSON.stringify(['/Users/demo/Downloads/a.pdf']) }],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    // 全称在 720 宽下会撞上右对齐的时间戳，摘要条只放子类型。
    expect(wrapper.get('.summary-mime').text()).toBe('x-tuff-files')

    await wrapper.get('.more-toggle').trigger('click')
    expect(wrapper.findAll('.more-value')[0]?.text()).toBe('application/x-tuff-files')

    wrapper.unmount()
  })

  /**
   * 掩码只在洞察区「值」那一行成立过，同一条记录的完整明文还同时出现在列表标题、
   * 预览区和「更多信息 → 字符拆分」里。断言整棵 DOM 而不是逐个表面，
   * 是因为下一个泄漏点多半出现在这条用例还没点名的第四个地方。
   */
  it('keeps a detected secret masked on every surface, including the character split', async () => {
    const apiKey = `sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`

    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [{ id: 71, type: 'text', content: apiKey }],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('.insight-title').text()).toContain('密钥')
    expect(wrapper.html()).not.toContain(apiKey)
    expect(wrapper.get('.item-preview').text()).not.toContain(apiKey)
    expect(wrapper.get('.item-preview').attributes('title')).not.toContain(apiKey)
    expect(wrapper.get('.text-preview').text()).not.toContain(apiKey)

    // 字符拆分对密钥没有使用价值，只有把掩码拼回原文的泄漏面。
    expect(wrapper.get('.more-summary').text()).not.toContain('字符拆分')
    await wrapper.get('.more-toggle').trigger('click')
    expect(wrapper.find('.more-chars').exists()).toBe(false)

    wrapper.unmount()
  })

  it('never renders private key material, not even a masked prefix', async () => {
    const privateKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAxLoNGoOfHm\n-----END RSA PRIVATE KEY-----'

    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [{ id: 72, type: 'text', content: privateKey }],
      total: 1,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.html()).not.toContain('MIIEowIBAAKCAQEAxLoNGoOfHm')
    expect(wrapper.get('.text-preview').text()).toBe('私钥内容不予显示')
    // 私钥没有显示开关；`getClipboardPreviewText` 那侧也会吞掉 reveal，两层都拦。
    expect(wrapper.find('.reveal-toggle').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * 「看过一次」不能跟着列表往下走：换记录必须复位成掩码，否则用户按住方向键
   * 划过一串密钥时，每一条都是打开状态。
   */
  it('reveals a secret on demand and re-masks it when the selection moves', async () => {
    const first = `sk-${'FAKEKEYFORTESTS0FAKEKEYFORTESTS1FAKEKEY0'}`
    const second = `sk-${'ZZZZZZZZZZFAKEKEYFAKEKEYFORTESTS1FAKEKEY0'}`

    sdkMocks.clipboard.history.getHistory.mockResolvedValue({
      history: [
        { id: 81, type: 'text', content: first },
        { id: 82, type: 'text', content: second },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    })

    const wrapper = mount(ClipboardManagerView, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.html()).not.toContain(first)

    await wrapper.get('.reveal-toggle').trigger('click')
    expect(wrapper.get('.text-preview').text()).toBe(first)
    // 洞察区「值」跟随同一个开关，不需要第二次点击。
    expect(wrapper.findAll('.kv-text')[0]?.text()).toBe(first)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await flushPromises()

    expect(wrapper.get('.text-preview').text()).not.toBe(second)
    expect(wrapper.html()).not.toContain(second)

    wrapper.unmount()
  })
})
