import { describe, expect, it } from 'vitest'
import { isApiSvgIconUrl, sanitizePluginSvg } from './useTxIconConfig'

describe('useTxIconConfig SVG sanitization', () => {
  it('preserves clean monochrome Tabler SVG icons returned by /api/images/*.svg', () => {
    const raw = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="M20 16V8l3 8V8"/></svg>'
    const clean = sanitizePluginSvg(raw)
    expect(clean).toContain('<svg')
    expect(clean).toContain('stroke="currentColor"')
    expect(clean).toContain('d="M20 16V8l3 8V8"')
  })

  it('strips active elements, event handlers, and external href attributes', () => {
    const malicious = '<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><script>evil()</script><foreignObject><div>bad</div></foreignObject><use xlink:href="https://evil.example/x.svg#p"/><path onclick="steal()" d="M0 0h1v1"/></svg>'
    const clean = sanitizePluginSvg(malicious)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('foreignObject')
    expect(clean).not.toContain('onload')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('xlink:href')
    expect(clean).toContain('<path')
  })

  it('rejects non-SVG payloads', () => {
    expect(sanitizePluginSvg('<html><body>nope</body></html>')).toBe('')
    expect(sanitizePluginSvg('')).toBe('')
  })

  it('detects .svg URLs ignoring query or fragment', () => {
    expect(isApiSvgIconUrl('/api/images/40a7e9c3-7bca-493e-a6cf-e7ea9cf23a4a.svg')).toBe(true)
    expect(isApiSvgIconUrl('/api/images/icon.SVG?v=1')).toBe(true)
    expect(isApiSvgIconUrl('/api/images/icon.png')).toBe(false)
    expect(isApiSvgIconUrl(null)).toBe(false)
  })
})
