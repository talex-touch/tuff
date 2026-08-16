import type { Account, User } from 'next-auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthOptions } from '../../../server/api/auth/[...]'

type MagicLinkTestGlobal = typeof globalThis & { __env__?: unknown }

// Nuxt's worker runtime stores the Cloudflare bindings on this global.
const magicLinkTestGlobal = globalThis as MagicLinkTestGlobal

const runtimeConfig = vi.hoisted(() => ({ auth: {} }))
const authStoreMocks = vi.hoisted(() => ({
  consumeLoginToken: vi.fn(),
  getUserByAccount: vi.fn(),
  getUserByEmail: vi.fn(),
  logLoginAttempt: vi.fn(),
  restorePendingDeletionIfWithinWindow: vi.fn(),
}))

vi.mock('#auth', () => ({
  NuxtAuthHandler: vi.fn(),
}))
vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))
vi.mock('next-auth/providers/credentials', () => ({
  default: (options: unknown) => options,
}))
vi.mock('next-auth/providers/github', () => ({
  default: (options: unknown) => options,
}))
vi.mock('@talex-touch/utils/network', () => ({
  networkClient: { request: vi.fn() },
}))
vi.mock('../../../server/utils/authAdapter', () => ({
  createD1Adapter: vi.fn(() => ({})),
}))
vi.mock('../../../server/utils/authOrigin', () => ({
  normalizeAuthOrigin: () => '',
  shouldTrustForwardedAuthHost: () => true,
}))
vi.mock('../../../server/utils/authStore', () => authStoreMocks)

const originalRuntimeBindings = magicLinkTestGlobal.__env__
const originalNextAuthUrl = process.env.NEXTAUTH_URL

function emailSignInCallback() {
  const signIn = getAuthOptions('regression-test-secret').callbacks?.signIn
  if (!signIn) throw new Error('Email sign-in callback was not configured')
  return signIn
}

function consumedMagicLink(email: string) {
  const user = {
    id: `email:${email}`,
    name: null,
    email,
    image: null,
  } satisfies User
  const account = {
    providerAccountId: email,
    provider: 'email',
    type: 'email',
  } satisfies Account

  return { user, account, email: { verificationRequest: false } }
}

beforeEach(() => {
  vi.clearAllMocks()
  magicLinkTestGlobal.__env__ = { DB: {} }
  process.env.NEXTAUTH_URL = 'https://nexus.test'
})

afterEach(() => {
  if (originalRuntimeBindings === undefined) delete magicLinkTestGlobal.__env__
  else magicLinkTestGlobal.__env__ = originalRuntimeBindings

  if (originalNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL
  else process.env.NEXTAUTH_URL = originalNextAuthUrl
})

describe('Magic Link sign-in callback', () => {
  it('permits a first-time mailbox owner after the Magic Link is consumed', async () => {
    authStoreMocks.getUserByEmail.mockResolvedValue(null)

    await expect(emailSignInCallback()(consumedMagicLink('first-time@example.test'))).resolves.toBe(true)
  })

  it('denies an existing account that cannot be restored for interactive sign-in', async () => {
    authStoreMocks.getUserByEmail.mockResolvedValue({ id: 'disabled-user', status: 'disabled' })
    authStoreMocks.restorePendingDeletionIfWithinWindow.mockResolvedValue({ id: 'disabled-user', status: 'disabled' })

    await expect(emailSignInCallback()(consumedMagicLink('disabled@example.test'))).resolves.toBe(false)
  })
})
