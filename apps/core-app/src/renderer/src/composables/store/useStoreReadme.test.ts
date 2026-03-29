import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStoreReadme } from './useStoreReadme'

const requestMock = vi.fn()
const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('@talex-touch/utils/renderer', () => ({
  useNetworkSdk: () => ({
    request: requestMock
  })
}))

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useStoreReadme', () => {
  beforeEach(() => {
    requestMock.mockReset()
    consoleErrorMock.mockClear()
  })

  it('rejects non-http readme urls before network request', async () => {
    const readmeUrl = ref('file:///tmp/readme.md')
    const state = useStoreReadme(readmeUrl, (key: string) => key)

    await flushPromises()

    expect(requestMock).not.toHaveBeenCalled()
    expect(state.readmeMarkdown.value).toBe('')
    expect(state.readmeError.value).toBe('store.detailDialog.readmeError')
  })

  it('loads markdown from https readme urls', async () => {
    requestMock.mockResolvedValue({ data: '# Hello Tuff' })

    const readmeUrl = ref('https://example.com/readme.md')
    const state = useStoreReadme(readmeUrl, (key: string) => key)

    await flushPromises()

    expect(requestMock).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://example.com/readme.md',
      responseType: 'text'
    })
    expect(state.readmeMarkdown.value).toBe('# Hello Tuff')
    expect(state.readmeError.value).toBe('')
  })
})
