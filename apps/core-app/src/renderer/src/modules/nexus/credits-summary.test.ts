/**
 * The signed-in account's credit state is the balance alone: what was granted, what has been
 * spent, and what is left.
 *
 * Prices are not part of it. The published rate card lives on the Nexus dashboard, so the
 * composable must never ask for one — a second request here would re-introduce the half-fetched
 * state where a balance renders beside a price list that failed to arrive — and its public state
 * must not carry a price list at all.
 *
 * The composable keeps module-scope state, so each test drives it through a fresh sign-in and
 * asserts the state a consumer would render.
 */
import type * as VueModule from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreditsSummary } from './credits-summary'

const authState = vi.hoisted(() => {
  const { ref } = require('vue') as typeof VueModule
  return { isLoggedIn: ref(false) }
})

const fetchNexusWithAuthMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({ openExternal: vi.fn() })
}))

vi.mock('~/modules/auth/auth-env', () => ({
  getAuthBaseUrl: () => 'https://tuff.tagzxia.com'
}))

vi.mock('~/modules/auth/useAuth', () => ({
  useAuth: () => ({ isLoggedIn: authState.isLoggedIn })
}))

vi.mock('~/modules/store/nexus-auth-client', () => ({
  fetchNexusWithAuth: fetchNexusWithAuthMock
}))

interface FakeNexusResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

function nexusResponse(status: number, body: unknown, statusText = ''): FakeNexusResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {},
    url: '',
    json: async () => body,
    text: async () => JSON.stringify(body)
  }
}

type Route = () => unknown

/**
 * Every request the composable makes has to be one of the routes a test declared, so a
 * request for a path no test knows about fails the test rather than being answered.
 */
function serve(routes: Record<string, Route>): void {
  fetchNexusWithAuthMock.mockImplementation(async (path: string) => {
    const route = routes[path]
    if (!route) {
      throw new Error(`credits composable requested an undeclared path: ${path}`)
    }
    return await route()
  })
}

const SUMMARY = {
  month: '2026-09',
  user: { quota: 1000, used: 250 },
  team: { quota: 0, used: 0 },
  teamContext: null
}

beforeEach(() => {
  fetchNexusWithAuthMock.mockReset()
  authState.isLoggedIn.value = false
})

describe('useCreditsSummary', () => {
  it('reads the balance from the summary endpoint and never asks for a price list', async () => {
    serve({ '/api/credits/summary': () => nexusResponse(200, SUMMARY) })

    const credits = useCreditsSummary()
    authState.isLoggedIn.value = true

    await vi.waitFor(() => expect(credits.summary.value?.user.remaining).toBe(750))
    expect(credits.personalQuota.value).toBe(1000)
    expect(credits.personalUsed.value).toBe(250)
    expect(credits.error.value).toBe('')

    // Every request went to the summary endpoint. `serve` also refuses undeclared paths, so a
    // resurrected price-list read fails the balance assertions above instead of being answered.
    expect(
      fetchNexusWithAuthMock.mock.calls.every(([path]) => path === '/api/credits/summary')
    ).toBe(true)
    expect('pricing' in credits).toBe(false)
  })

  /**
   * A balance read that cannot be served must say so and leave no balance behind: a number
   * left over from an earlier read would look like a fresh one next to the error.
   */
  const FAILED_SUMMARY: Array<{ name: string; route: Route; error: string }> = [
    {
      name: 'an expired session',
      route: () => nexusResponse(401, { message: 'unauthenticated' }, 'Unauthorized'),
      error: '登录状态已失效，请重新登录后刷新。'
    },
    {
      name: 'a forbidden session',
      route: () => nexusResponse(403, { message: 'forbidden' }, 'Forbidden'),
      error: '登录状态已失效，请重新登录后刷新。'
    },
    {
      name: 'a gateway failure',
      route: () => nexusResponse(502, { message: 'bad gateway' }, 'Bad Gateway'),
      error: 'Credits 信息获取失败：502 Bad Gateway'
    },
    {
      name: 'an unreachable endpoint',
      route: () => {
        throw new Error('summary unreachable')
      },
      error: 'summary unreachable'
    }
  ]

  it.each(FAILED_SUMMARY)(
    'reports $name as an error and no balance at all',
    async ({ route, error }) => {
      serve({ '/api/credits/summary': route })

      const credits = useCreditsSummary()
      authState.isLoggedIn.value = true

      await vi.waitFor(() => expect(credits.error.value).toBe(error))
      expect(credits.summary.value).toBeNull()
    }
  )

  it('clears a stale balance when a later refresh cannot be served', async () => {
    serve({ '/api/credits/summary': () => nexusResponse(200, SUMMARY) })

    const credits = useCreditsSummary()
    authState.isLoggedIn.value = true
    await vi.waitFor(() => expect(credits.summary.value?.user.remaining).toBe(750))

    // The next refresh loses the endpoint. Keeping the previous number would show a balance
    // the account may already have spent, beside an error that says the read failed.
    serve({
      '/api/credits/summary': () => nexusResponse(502, { message: 'bad gateway' }, 'Bad Gateway')
    })

    await credits.refresh()

    await vi.waitFor(() => expect(credits.summary.value).toBeNull())
    expect(credits.error.value).toBe('Credits 信息获取失败：502 Bad Gateway')
  })

  it('clears the balance and the error when the account signs out', async () => {
    serve({ '/api/credits/summary': () => nexusResponse(200, SUMMARY) })

    const credits = useCreditsSummary()
    authState.isLoggedIn.value = true
    await vi.waitFor(() => expect(credits.summary.value?.user.remaining).toBe(750))

    authState.isLoggedIn.value = false

    await vi.waitFor(() => expect(credits.summary.value).toBeNull())
    expect(credits.error.value).toBe('')
  })
})
