import { describe, expect, it } from 'vitest'
import { isAllowedBrowserUrl, isAllowedGuestNavigationUrl, normalizeBrowserInput } from './policy'

describe('browser address input', () => {
  it.each([
    ['bare domain', 'example.com', 'https://example.com/'],
    ['domain with port', 'example.com:8443/path', 'https://example.com:8443/path'],
    [
      'domain path and query',
      'docs.example.com/guide?q=one#two',
      'https://docs.example.com/guide?q=one#two'
    ],
    ['explicit HTTP', 'http://example.com:8080/path', 'http://example.com:8080/path'],
    ['trimmed HTTPS', '  https://example.com/guide  ', 'https://example.com/guide']
  ])('navigates %s without turning it into a search', (_name, input, expected) => {
    expect(normalizeBrowserInput(input)).toBe(expected)
  })

  it.each(['how browser tabs work', '中文 搜索 & symbols+#', 'a question with example.com inside'])(
    'preserves the complete search query %j as one query parameter',
    (input) => {
      const result = new URL(normalizeBrowserInput(input))
      expect(isAllowedBrowserUrl(result.href)).toBe(true)
      expect(result.searchParams.get('q')).toBe(input)
      expect(result.hash).toBe('')
    }
  )

  it.each([
    'javascript:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'file:///Users/example/.ssh/id_rsa',
    'tfile://private/document',
    'plugin://example/index.html',
    'devtools://devtools/bundled/inspector.html',
    'about:blank',
    'blob:https://example.com/remote-object',
    'ftp://example.com/private',
    'https://alice:' + 'test-pass' + '@example.com/',
    'http://alice@example.com/',
    'https://alice%40corp@example.com/'
  ])('rejects unsafe address %j rather than loading or searching it', (input) => {
    expect(() => normalizeBrowserInput(input)).toThrow()
    expect(isAllowedBrowserUrl(input)).toBe(false)
  })
})

describe('remote browser navigation policy', () => {
  it.each([
    'https://example.com/',
    'http://localhost:8080/path?q=value#fragment',
    'https://xn--fsqu00a.xn--0zwm56d/'
  ])('allows credential-free HTTP(S) destination %j', (url) => {
    expect(isAllowedBrowserUrl(url)).toBe(true)
  })

  it.each(['not a URL', '', '/relative/path', null, undefined, 42, {}])(
    'rejects malformed remote destination %j',
    (url) => {
      expect(isAllowedBrowserUrl(url)).toBe(false)
    }
  )

  it('allows tuff:// only for host browser URLs and blocks tuff:// for guest navigation', () => {
    expect(isAllowedBrowserUrl('tuff://settings')).toBe(true)
    expect(isAllowedBrowserUrl('tuff://store')).toBe(true)
    expect(isAllowedGuestNavigationUrl('tuff://settings')).toBe(false)
    expect(isAllowedGuestNavigationUrl('tuff://store')).toBe(false)
    expect(isAllowedGuestNavigationUrl('tuff://auth/callback?token=stolen')).toBe(false)
    expect(isAllowedGuestNavigationUrl('https://example.com/path')).toBe(true)
    expect(isAllowedGuestNavigationUrl('https://alice@example.com/')).toBe(false)
  })
})
