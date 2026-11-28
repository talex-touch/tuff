import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchCoreAppSvgContent: vi.fn(),
  storeHttpRequest: vi.fn()
}))

vi.mock('~/modules/tuffex/icon-config', () => ({
  fetchCoreAppSvgContent: mocks.fetchCoreAppSvgContent
}))

vi.mock('./store-http-client', () => ({
  storeHttpRequest: mocks.storeHttpRequest
}))

import {
  clearStoreSvgIconCache,
  fetchStoreSvgDataUrl,
  getCachedStoreSvgDataUrl,
  isRemoteSvgIconUrl,
  sanitizeStoreSvg
} from './store-svg-icon'

describe('store-svg-icon', () => {
  beforeEach(() => {
    clearStoreSvgIconCache()
    mocks.fetchCoreAppSvgContent.mockReset()
    mocks.storeHttpRequest.mockReset()
  })

  it('detects remote and api svg URLs while ignoring raster, data, and local file URLs', () => {
    expect(isRemoteSvgIconUrl('https://tuff.tagzxia.com/api/images/abc.svg')).toBe(true)
    expect(isRemoteSvgIconUrl('http://localhost:3200/api/images/icon.SVG?v=1#hash')).toBe(true)
    expect(isRemoteSvgIconUrl('/api/images/icon.svg')).toBe(true)

    expect(isRemoteSvgIconUrl('https://tuff.tagzxia.com/api/images/abc.png')).toBe(false)
    expect(isRemoteSvgIconUrl('data:image/svg+xml;utf8,<svg></svg>')).toBe(false)
    expect(isRemoteSvgIconUrl('tfile:///Users/demo/logo.svg')).toBe(false)
    expect(isRemoteSvgIconUrl(null)).toBe(false)
  })

  it('sanitizes active SVG content while preserving valid vector icons', () => {
    const clean = sanitizeStoreSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><!-- Paweł --><path stroke="currentColor" d="M1 1h22"/></svg>'
    )
    expect(clean).toContain('stroke="currentColor"')
    expect(clean).toContain('d="M1 1h22"')

    const malicious = sanitizeStoreSvg(
      '<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><script>evil()</script><foreignObject><div>bad</div></foreignObject><use xlink:href="https://evil.example/x.svg#p"/><path onclick="steal()" d="M0 0h1v1"/></svg>'
    )
    expect(malicious).not.toContain('<script')
    expect(malicious).not.toContain('evil()')
    expect(malicious).not.toContain('foreignObject')
    expect(malicious).not.toContain('onload')
    expect(malicious).not.toContain('onclick')
    expect(malicious).not.toContain('xlink:href')
    expect(malicious).toContain('<path')

    const withFragmentRef = sanitizeStoreSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"/><path id="p" d="M0 0h24v24H0z"/></defs><use href="#p"/><use xlink:href="#p"/><path fill="url(#g)" d="M0 0h1"/></svg>'
    )
    expect(withFragmentRef).toContain('href="#p"')
    expect(withFragmentRef).toContain('xlink:href="#p"')
    expect(withFragmentRef).toContain('fill="url(#g)"')

    // Nested/smuggled tags, animation handlers, style tags, namespace-prefixed hrefs, foreign namespaces, CSS escapes, and remote url() references are stripped
    const nestedAttack = sanitizeStoreSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink"><style>@import url(https://evil.invalid/a.css);</style><title xmlns="http://www.w3.org/1999/xhtml">xhtml-injected</title><animate onbegin="alert(1)" attributeName="href" to="javascript:alert(1)"/><set attributeName="onmouseover" to="alert(1)"/><image href="https://evil.invalid/track.png"/><use x:href="https://evil.invalid/x.svg#p"/><path style="fill:\\75\r\nrl(https://evil.invalid/g#x)" fill="url (https://evil.invalid/g#x)" d="M0 0h2"/><path style="background:image-\\73/*c*/et(https://evil.invalid/a.png 1x)" d="M1 1h1"/><path style="width:exp\\72/*c*/ession(alert(1)) /* unclosed" d="M2 2h1"/></svg>'
    )
    expect(nestedAttack).not.toContain('<style')
    expect(nestedAttack).not.toContain('xhtml-injected')
    expect(nestedAttack).not.toContain('<animate')
    expect(nestedAttack).not.toContain('<set')
    expect(nestedAttack).not.toContain('<image')
    expect(nestedAttack).not.toContain('evil.invalid')
    expect(nestedAttack).not.toContain('onbegin')
    expect(nestedAttack).not.toContain('x:href')
    expect(nestedAttack).not.toContain('style=')
    expect(nestedAttack).toContain('<path')

    expect(sanitizeStoreSvg('<svg xmlns="http://www.w3.org/2000/svg"><path></svg>')).toBe('')
    expect(sanitizeStoreSvg('<html><body>not svg</body></html>')).toBe('')
  })

  it('rejects malformed XML SVGs without caching a blank data URL', async () => {
    const url = 'https://tuff.tagzxia.com/api/images/broken.svg'
    mocks.fetchCoreAppSvgContent.mockResolvedValueOnce(
      '<svg xmlns="http://www.w3.org/2000/svg"><path></svg>'
    )

    expect(await fetchStoreSvgDataUrl(url)).toBe('')
    expect(getCachedStoreSvgDataUrl(url)).toBeUndefined()
  })

  it('falls back to storeHttpRequest when primary SVG fetch fails and caches sanitized data URL', async () => {
    const url = 'https://tuff.tagzxia.com/api/images/fallback.svg'
    mocks.fetchCoreAppSvgContent.mockRejectedValueOnce(new Error('download unavailable'))
    mocks.storeHttpRequest.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h1"/></svg>',
      url
    })

    const dataUrl = await fetchStoreSvgDataUrl(url)

    expect(dataUrl).toMatch(/^data:image\/svg\+xml;utf8,/)
    expect(getCachedStoreSvgDataUrl(url)).toBe(dataUrl)
    expect(mocks.fetchCoreAppSvgContent).toHaveBeenCalledTimes(1)
    expect(mocks.storeHttpRequest).toHaveBeenCalledTimes(1)

    // Subsequent read hits cache without refetching.
    const cached = await fetchStoreSvgDataUrl(url)
    expect(cached).toBe(dataUrl)
    expect(mocks.fetchCoreAppSvgContent).toHaveBeenCalledTimes(1)
  })

  it('evicts failed fetches so a later call can retry', async () => {
    const url = 'https://tuff.tagzxia.com/api/images/retry.svg'
    mocks.fetchCoreAppSvgContent
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')
    mocks.storeHttpRequest.mockRejectedValueOnce(new Error('offline'))

    expect(await fetchStoreSvgDataUrl(url)).toBe('')
    expect(getCachedStoreSvgDataUrl(url)).toBeUndefined()

    const retried = await fetchStoreSvgDataUrl(url)
    expect(retried).toMatch(/^data:image\/svg\+xml;utf8,/)
    expect(getCachedStoreSvgDataUrl(url)).toBe(retried)
  })
})
