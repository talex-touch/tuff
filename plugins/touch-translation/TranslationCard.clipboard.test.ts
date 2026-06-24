import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TranslationCard from './src/components/TranslationCard.vue'

const sdkMocks = vi.hoisted(() => ({
  clipboard: {
    writeText: vi.fn(),
  },
  useClipboard: vi.fn(),
}))

vi.mock('@talex-touch/utils/plugin/sdk/clipboard', () => ({
  useClipboard: sdkMocks.useClipboard,
}))

function createResult() {
  return {
    text: 'translated text',
    sourceLanguage: 'en',
    targetLanguage: 'zh',
    provider: 'Baidu',
    timestamp: 1,
  }
}

describe('TranslationCard clipboard boundary', () => {
  beforeEach(() => {
    sdkMocks.clipboard.writeText.mockReset()
    sdkMocks.useClipboard.mockReset()
    sdkMocks.useClipboard.mockReturnValue(sdkMocks.clipboard)
  })

  it('copies translation text through the plugin clipboard SDK', async () => {
    const wrapper = mount(TranslationCard, {
      props: {
        providerId: 'baidu',
        result: createResult(),
      },
    })

    await wrapper.find('button[title="复制翻译结果"]').trigger('click')

    expect(sdkMocks.clipboard.writeText).toHaveBeenCalledWith('translated text')
  })

  it('fails closed when the plugin clipboard SDK is unavailable', async () => {
    sdkMocks.useClipboard.mockImplementation(() => {
      throw new Error('plugin clipboard unavailable')
    })
    const nativeClipboardWrite = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: nativeClipboardWrite },
    })

    const wrapper = mount(TranslationCard, {
      props: {
        providerId: 'baidu',
        result: createResult(),
      },
    })

    await wrapper.find('button[title="复制翻译结果"]').trigger('click')

    expect(sdkMocks.clipboard.writeText).not.toHaveBeenCalled()
    expect(nativeClipboardWrite).not.toHaveBeenCalled()
  })
})
