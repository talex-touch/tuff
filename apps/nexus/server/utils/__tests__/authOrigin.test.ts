import { describe, expect, it } from 'vitest'
import { isLocalAuthOrigin, normalizeAuthOrigin, shouldTrustForwardedAuthHost } from '../authOrigin'

describe('authOrigin', () => {
  it('normalizes valid origins and rejects invalid values', () => {
    expect(normalizeAuthOrigin('https://tuff.tagzxia.com/dashboard')).toBe('https://tuff.tagzxia.com')
    expect(normalizeAuthOrigin(' http://localhost:3200 ')).toBe('http://localhost:3200')
    expect(normalizeAuthOrigin('not a url')).toBe('')
    expect(normalizeAuthOrigin(null)).toBe('')
  })

  it('detects local origins', () => {
    expect(isLocalAuthOrigin('http://localhost:3200')).toBe(true)
    expect(isLocalAuthOrigin('http://127.0.0.1:3000')).toBe(true)
    expect(isLocalAuthOrigin('https://tuff.tagzxia.com')).toBe(false)
  })

  it('trusts forwarded host when production origin is missing or local', () => {
    const previousNodeEnv = process.env.NODE_ENV

    process.env.NODE_ENV = 'production'
    expect(shouldTrustForwardedAuthHost('')).toBe(true)
    expect(shouldTrustForwardedAuthHost('http://localhost:3200')).toBe(true)
    expect(shouldTrustForwardedAuthHost('https://tuff.tagzxia.com')).toBe(false)

    process.env.NODE_ENV = 'development'
    expect(shouldTrustForwardedAuthHost('http://localhost:3200')).toBe(false)

    process.env.NODE_ENV = previousNodeEnv
  })
})
