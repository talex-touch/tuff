import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OAUTH_CONTEXT_TTL_MS,
  buildOauthCallbackUrl,
  clearOauthContext,
  persistOauthContext,
  readOauthContext,
  requestOauthAuthorizationUrl,
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
      location: {
        origin: 'https://tuff.tagzxia.com',
      },
    }
  })

  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).$fetch
  })

  it('buildOauthCallbackUrl 会固定到 /sign-in 并带上标准参数', () => {
    const url = buildOauthCallbackUrl({
      flow: 'login',
      provider: 'github',
      redirect: '/dashboard',
    })

    const query = new URLSearchParams(url.split('?')[1])
    expect(url.startsWith('/sign-in?')).toBe(true)
    expect(query.get('oauth')).toBe('1')
    expect(query.get('flow')).toBe('login')
    expect(query.get('provider')).toBe('github')
    expect(query.get('redirect_url')).toBe('/dashboard')
    expect(query.get('lang')).toBeNull()
  })

  it('sanitizeRedirect 只允许站内相对路径，并会清理 oauth 中间态参数', () => {
    expect(sanitizeRedirect('/dashboard/account', '/dashboard')).toBe('/dashboard/account')
    expect(sanitizeRedirect('/?callbackUrl=https://tuff.tagzxia.com/sign-in?oauth=1&error=OAuthSignin', '/dashboard')).toBe('/')
    expect(sanitizeRedirect('/sign-in?oauth=1&provider=linuxdo', '/dashboard')).toBe('/dashboard')
    expect(sanitizeRedirect('https://tuff.tagzxia.com/store?callbackUrl=%2Fsign-in&error=OAuthSignin', '/dashboard')).toBe('/store')
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

  it('requestOauthAuthorizationUrl 会拦截 callbackUrl 套娃 fallback', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ csrfToken: 'csrf-token' })
      .mockResolvedValueOnce({
        url: '/?callbackUrl=https://tuff.tagzxia.com/sign-in?oauth=1%2526flow=login%2526provider=linuxdo&error=OAuthSignin',
      })

    ;(globalThis as any).$fetch = fetchMock

    await expect(requestOauthAuthorizationUrl({
      provider: 'linuxdo',
      callbackUrl: '/sign-in?oauth=1&flow=login&provider=linuxdo&redirect_url=%2Fdashboard',
    })).rejects.toThrow('oauth_redirect_fallback:OAuthSignin')
  })

  it('requestOauthAuthorizationUrl 会拦截同源 fallback（无 error 参数）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ csrfToken: 'csrf-token' })
      .mockResolvedValueOnce({
        url: '/?callbackUrl=https://tuff.tagzxia.com/sign-in?oauth=1%2526flow=login%2526provider=linuxdo',
      })

    ;(globalThis as any).$fetch = fetchMock

    await expect(requestOauthAuthorizationUrl({
      provider: 'linuxdo',
      callbackUrl: '/sign-in?oauth=1&flow=login&provider=linuxdo&redirect_url=%2Fdashboard',
    })).rejects.toThrow('oauth_redirect_fallback')
  })
})
