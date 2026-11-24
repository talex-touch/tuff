import { describe, expect, it } from 'vitest'
import {
  basenameOfPath,
  buildBrowserFilePreviewUrl,
  parseBrowserFilePreviewUrl
} from './preview-url'

describe('preview-url', () => {
  it('round-trips file preview URLs with optional conversationId and line', () => {
    const url = buildBrowserFilePreviewUrl({
      path: '/private/tmp/tuff-spaces/daa3de7e/login.html',
      conversationId: 'daa3de7e',
      line: 18
    })

    expect(url.startsWith('tuff://preview?')).toBe(true)
    expect(parseBrowserFilePreviewUrl(url)).toEqual({
      path: '/private/tmp/tuff-spaces/daa3de7e/login.html',
      conversationId: 'daa3de7e',
      line: 18
    })
  })

  it('ignores non-preview URLs and extracts clean basenames', () => {
    expect(parseBrowserFilePreviewUrl('tuff://store')).toBeNull()
    expect(parseBrowserFilePreviewUrl('https://example.com')).toBeNull()
    expect(parseBrowserFilePreviewUrl('tuff://preview')).toBeNull()
    expect(basenameOfPath('/private/tmp/tuff-spaces/daa3de7e/login.html')).toBe('login.html')
    expect(basenameOfPath('C:\\Users\\demo\\index.html')).toBe('index.html')
  })
})
