import { createMemoryHistory } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSessionForTest, setSessionUserForTest } from '@/composables/useSession'
import { consoleRoutes, createConsoleRouter } from '@/router'
import { resolveSafeRedirectUrl } from '@/utils/redirect'

vi.mock('@/api/endpoints', () => ({
  consoleApi: {
    getMe: vi.fn().mockResolvedValue(null),
    signOut: vi.fn().mockResolvedValue({ ok: true }),
  },
}))

const USER_ACCOUNT = {
  id: 'u-1',
  email: 'user@tuff.dev',
  name: 'Normal User',
  image: null,
  role: 'user',
  locale: 'en' as const,
  emailVerified: true,
  emailState: 'verified',
  isRestricted: false,
  passkeyCount: 1,
}

const ADMIN_ACCOUNT = {
  ...USER_ACCOUNT,
  id: 'a-1',
  email: 'admin@tuff.dev',
  name: 'Admin User',
  role: 'admin',
}

describe('console router guards & route inventory', () => {
  beforeEach(() => {
    resetSessionForTest()
    vi.stubGlobal('scrollTo', vi.fn())
  })

  it('redirects unauthenticated visitors from protected routes to /sign-in with redirect_url', async () => {
    setSessionUserForTest(null)
    const router = createConsoleRouter(createMemoryHistory())
    await router.push('/device-auth?code=ABCD-1234')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/sign-in')
    expect(router.currentRoute.value.query.redirect_url).toBe('/device-auth?code=ABCD-1234')
  })

  it('blocks non-admin users from /admin/* routes and redirects to /dashboard?denied=admin', async () => {
    setSessionUserForTest(USER_ACCOUNT)
    const router = createConsoleRouter(createMemoryHistory())
    await router.push('/admin/ai')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(router.currentRoute.value.query.denied).toBe('admin')
  })

  it('allows admin users into all /admin/* views', async () => {
    setSessionUserForTest(ADMIN_ACCOUNT)
    const router = createConsoleRouter(createMemoryHistory())
    for (const adminPath of ['/admin', '/admin/users', '/admin/store', '/admin/releases', '/admin/ai']) {
      await router.push(adminPath)
      expect(router.currentRoute.value.path).toBe(adminPath)
    }
  })

  it('redirects already authenticated visitors away from /sign-in safely', async () => {
    setSessionUserForTest(USER_ACCOUNT)
    const router = createConsoleRouter(createMemoryHistory())
    await router.push('/sign-in?redirect_url=%2Fdashboard%2Fdevices')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/dashboard/devices')
  })

  it('sanitizes open redirects and auth-loop targets', () => {
    expect(resolveSafeRedirectUrl('https://evil.example/steal')).toBe('/dashboard')
    expect(resolveSafeRedirectUrl('//evil.example/steal')).toBe('/dashboard')
    expect(resolveSafeRedirectUrl('/\\evil.example')).toBe('/dashboard')
    expect(resolveSafeRedirectUrl('/sign-in?foo=1')).toBe('/dashboard')
    expect(resolveSafeRedirectUrl('/verify?token=abc')).toBe('/dashboard')
    expect(resolveSafeRedirectUrl('/device-auth?code=1234')).toBe('/device-auth?code=1234')
  })

  it('exposes the exact razor route inventory without deleted team/credits/notifications/governance/checkin/oauth routes', () => {
    const paths = consoleRoutes.map(r => r.path)
    const expected = [
      '/sign-in',
      '/verify',
      '/verify-waiting',
      '/device-auth',
      '/dashboard',
      '/dashboard/account',
      '/dashboard/devices',
      '/dashboard/plugins',
      '/admin',
      '/admin/users',
      '/admin/store',
      '/admin/releases',
      '/admin/ai',
    ]
    for (const p of expected)
      expect(paths).toContain(p)

    const forbidden = [
      '/team/join',
      '/dashboard/team',
      '/dashboard/credits',
      '/dashboard/notifications',
      '/admin/credits',
      '/admin/emergency',
      '/admin/governance',
      '/admin/risk',
      '/admin/audits',
      '/admin/analytics/docs',
      '/admin/release-evidence',
      '/admin/oob',
      '/admin/doc-comments',
      '/admin/telemetry/ip-blocks',
      '/dashboard/oauth',
      '/dashboard/storage',
      '/dashboard/privacy-export-jobs',
      '/credits/checkin',
      '/dashboard/intelligence/ip-bans',
    ]
    for (const p of forbidden)
      expect(paths).not.toContain(p)
  })
})
