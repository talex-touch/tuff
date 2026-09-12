import { describe, expect, it } from 'vitest'
import {
  SESSION_HINT_COOKIE,
  hasSessionHintInCookieString,
  resolveSessionHintChange,
} from './session-hint'

describe('session hint cookie', () => {
  it('reads the hint from a cookie header regardless of neighbours and spacing', () => {
    expect(hasSessionHintInCookieString(`foo=bar; ${SESSION_HINT_COOKIE}=1;theme=dark`)).toBe(true)
    expect(hasSessionHintInCookieString(`${SESSION_HINT_COOKIE}=1`)).toBe(true)
  })

  it('treats a missing, empty or foreign-valued hint as absent', () => {
    expect(hasSessionHintInCookieString('')).toBe(false)
    expect(hasSessionHintInCookieString(null)).toBe(false)
    expect(hasSessionHintInCookieString('foo=bar')).toBe(false)
    expect(hasSessionHintInCookieString(`${SESSION_HINT_COOKIE}=`)).toBe(false)
    expect(hasSessionHintInCookieString(`${SESSION_HINT_COOKIE}=0`)).toBe(false)
    // A cookie whose name merely starts with the hint name is not the hint.
    expect(hasSessionHintInCookieString(`${SESSION_HINT_COOKIE}_other=1`)).toBe(false)
  })

  it('reports a set when a session token is issued', () => {
    expect(resolveSessionHintChange([
      'next-auth.csrf-token=abc; Path=/; HttpOnly',
      'next-auth.session-token=eyJ...; Path=/; HttpOnly; SameSite=Lax',
    ])).toBe('set')
    expect(resolveSessionHintChange([
      '__Secure-next-auth.session-token=eyJ...; Path=/; Secure; HttpOnly',
    ])).toBe('set')
  })

  it('reports a clear when the session token is expired or emptied', () => {
    expect(resolveSessionHintChange([
      'next-auth.session-token=; Path=/; Max-Age=0; HttpOnly',
    ])).toBe('clear')
    expect(resolveSessionHintChange([
      'next-auth.session-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly',
    ])).toBe('clear')
  })

  it('lets a set in the same response override a clear of another token name', () => {
    expect(resolveSessionHintChange([
      'next-auth.session-token=; Path=/; Max-Age=0',
      '__Secure-next-auth.session-token=eyJ...; Path=/; Secure',
    ])).toBe('set')
  })

  it('ignores responses that only touch non-session cookies', () => {
    expect(resolveSessionHintChange([
      'next-auth.csrf-token=abc; Path=/',
      'next-auth.callback-url=%2F; Path=/',
    ])).toBe(null)
    expect(resolveSessionHintChange([])).toBe(null)
  })
})
