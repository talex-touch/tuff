import { describe, expect, it } from 'vitest'
import { resolveOpenBrowserInvocation, validateBrowserUrl } from '../open-browser'

describe('cLI openBrowser URL validation & platform invocation', () => {
  it('accepts valid https and http URLs including multi-parameter query strings', () => {
    const oauthUrl = 'https://tuff.tagzxia.com/auth/device?device_code=abc&user_code=XYZ-123'
    expect(validateBrowserUrl(oauthUrl)).toBe(oauthUrl)
    expect(validateBrowserUrl('http://localhost:3200/auth?a=1&b=2')).toBe('http://localhost:3200/auth?a=1&b=2')
  })

  it('rejects non-http(s) schemes, control characters, quotes, and whitespace', () => {
    for (const bad of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'custom-app://open',
      'https://example.com/a & calc.exe',
      'https://example.com/a"calc',
      'https://example.com/a\ncalc',
      '',
      'not-a-url',
    ]) {
      expect(() => validateBrowserUrl(bad), bad).toThrow()
    }
  })

  it('launches via rundll32.exe on Windows without cmd.exe shell parsing', () => {
    const url = 'https://tuff.tagzxia.com/auth?code=1&state=2'
    expect(resolveOpenBrowserInvocation(url, 'win32')).toEqual({
      command: 'rundll32.exe',
      args: ['url.dll,FileProtocolHandler', url],
    })
    expect(resolveOpenBrowserInvocation(url, 'darwin')).toEqual({
      command: 'open',
      args: [url],
    })
    expect(resolveOpenBrowserInvocation(url, 'linux')).toEqual({
      command: 'xdg-open',
      args: [url],
    })
  })
})
