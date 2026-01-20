import { describe, expect, it } from 'vitest'
import { detectClipboardTags } from './clipboard-tagging'

describe('detectClipboardTags', () => {
  it('detects url tags from text', () => {
    const tags = detectClipboardTags({
      type: 'text',
      content: 'Visit https://example.com for details.',
      rawContent: null
    })
    expect(tags).toContain('url')
  })

  it('detects api key and password/account patterns', () => {
    const tags = detectClipboardTags({
      type: 'text',
      content: 'username: alice\npassword: hunter2\napi_key=sk-1234567890abcdef',
      rawContent: null
    })
    expect(tags).toEqual(['api_key', 'password', 'account'])
  })

  it('detects email and bearer token patterns', () => {
    const tags = detectClipboardTags({
      type: 'text',
      content: 'contact: dev@example.com\nAuthorization: Bearer abcdefghijklmnop',
      rawContent: null
    })
    expect(tags).toEqual(['token', 'email'])
  })

  it('ignores non-text clipboard items', () => {
    const tags = detectClipboardTags({
      type: 'image',
      content: 'data:image/png;base64,abc',
      rawContent: null
    })
    expect(tags).toEqual([])
  })
})
