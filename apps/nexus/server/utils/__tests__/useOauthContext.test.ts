import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OAUTH_CONTEXT_TTL_MS,
  buildOauthCallbackUrl,
  clearOauthContext,
  persistOauthContext,
  readOauthContext,
  resolveOauthContext,
  sanitizeRedirect,
} from '../../../app/composables/useOauthContext'

interface MemoryStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function createMemoryStorage(): MemoryStorage {
  const store: Record<string, string> = {}
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key, value) {
      store[key] = value
    },
    removeItem(key) {
      delete store[key]
    },
  }
}

describe('useOauthContext', () => {
  beforeEach(() => {
    (globalThis as any).window = {
      localStorage: createMemoryStorage(),
    }
  })

  afterEach(() => {
    delete (globalThis as any).window
  })

  it('buildOauthCallbackUrl 会固定到 /sign-in 并带上标准参数', () => {
    const url = buildOauthCallbackUrl({
      flow: 'login',
      provider: 'github',
      redirect: '/dashboard',
      lang: 'zh-CN',
    })

    const query = new URLSearchParams(url.split('?')[1])
    expect(url.startsWith('/sign-in?')).toBe(true)
    expect(query.get('oauth')).toBe('1')
    expect(query.get('flow')).toBe('login')
    expect(query.get('provider')).toBe('github')
    expect(query.get('redirect_url')).toBe('/dashboard')
    expect(query.get('lang')).toBe('zh-CN')
  })

  it('sanitizeRedirect 只允许站内相对路径', () => {
    expect(sanitizeRedirect('/dashboard/account', '/dashboard')).toBe('/dashboard/account')
    expect(sanitizeRedirect('https://evil.com', '/dashboard')).toBe('/dashboard')
    expect(sanitizeRedirect('//evil.com', '/dashboard')).toBe('/dashboard')
    expect(sanitizeRedirect('', '/dashboard')).toBe('/dashboard')
  })

  it('readOauthContext 超时会丢弃并清理状态', () => {
    const now = Date.now()
    persistOauthContext({
      flow: 'bind',
      provider: 'linuxdo',
      redirect: '/dashboard/account',
      ts: now - OAUTH_CONTEXT_TTL_MS - 1,
    })

    expect(readOauthContext(now)).toBeNull()
    expect(readOauthContext(now)).toBeNull()
  })

  it('resolveOauthContext 优先 query，再到 local context', () => {
    const resolved = resolveOauthContext({
      query: {
        flow: 'login',
        provider: 'linuxdo',
        redirect: '/dashboard/docs',
      },
      stored: {
        flow: 'bind',
        provider: 'github',
        redirect: '/dashboard/account',
        ts: Date.now(),
        ver: 1,
      },
      fallbackFlow: 'login',
      fallbackRedirect: '/dashboard',
    })

    expect(resolved.flow).toBe('login')
    expect(resolved.provider).toBe('linuxdo')
    expect(resolved.redirect).toBe('/dashboard/docs')
  })

  it('resolveOauthContext 会拦截非法 redirect', () => {
    const resolved = resolveOauthContext({
      query: {
        flow: 'bind',
        provider: 'github',
        redirect: 'https://evil.com',
      },
      fallbackFlow: 'bind',
      fallbackRedirect: '/dashboard/account',
    })

    expect(resolved.redirect).toBe('/dashboard/account')
  })

  it('clearOauthContext 会移除本地状态', () => {
    persistOauthContext({
      flow: 'login',
      provider: 'github',
      redirect: '/dashboard',
    })
    expect(readOauthContext()).not.toBeNull()

    clearOauthContext()
    expect(readOauthContext()).toBeNull()
  })
})
