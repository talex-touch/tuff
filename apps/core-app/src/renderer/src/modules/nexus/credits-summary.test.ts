/**
 * The signed-in account's credit state has two halves, and the published price list must never be
 * able to take the balance down with it.
 *
 * The balance says how much is left; the price list says what spending it buys, which is why it is
 * fetched alongside rather than behind a click. But they fail independently: the pricing endpoint
 * can reject, return nothing, or hand back a rule set whose rows are not quotable, and in every one
 * of those cases the user still has to see their remaining credits and no error that suggests the
 * balance itself was lost. The composable keeps module-scope state, so each test drives it through
 * a fresh sign-in and asserts the state a consumer would render.
 */
import type * as VueModule from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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

/** Every request the composable makes has to be one of the routes a test declared. */
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

const PRICE_LIST = [
  { capability: 'text.chat', unit: '1k_tokens', creditsPerUnit: 2, minCredits: 1 },
  {
    capability: 'audio.stt',
    unit: 'minute',
    creditsPerUnit: 5,
    secondaryUnit: 'second',
    secondaryCreditsPerUnit: 0.1,
    minCredits: 1
  }
]

const EXPECTED_PRICES = [
  {
    capability: 'text.chat',
    unit: '1k_tokens',
    creditsPerUnit: 2,
    secondaryUnit: null,
    secondaryCreditsPerUnit: null,
    minCredits: 1
  },
  {
    capability: 'audio.stt',
    unit: 'minute',
    creditsPerUnit: 5,
    secondaryUnit: 'second',
    secondaryCreditsPerUnit: 0.1,
    minCredits: 1
  }
]

beforeEach(() => {
  fetchNexusWithAuthMock.mockReset()
  authState.isLoggedIn.value = false
})

describe('useCreditsSummary pricing', () => {
  it('publishes the normalized price list next to the balance', async () => {
    serve({
      '/api/credits/summary': () => nexusResponse(200, SUMMARY),
      '/api/credits/pricing': () => nexusResponse(200, { rules: PRICE_LIST })
    })

    const credits = useCreditsSummary()
    authState.isLoggedIn.value = true

    await vi.waitFor(() => expect(credits.pricing.value).toEqual(EXPECTED_PRICES))
    expect(credits.summary.value?.user.remaining).toBe(750)
    expect(credits.error.value).toBe('')
    expect(fetchNexusWithAuthMock.mock.calls.map(([path]) => path)).toContain(
      '/api/credits/pricing'
    )
  })

  it('leaves the balance usable with an empty price list when pricing is unusable', async () => {
    const unusablePricing: Array<[string, Route]> = [
      ['transport returned nothing', () => null],
      [
        'transport rejected',
        () => {
          throw new Error('pricing unreachable')
        }
      ],
      ['gateway error', () => nexusResponse(502, { message: 'bad gateway' }, 'Bad Gateway')],
      ['rules are not a list', () => nexusResponse(200, { rules: 'not-a-list' })],
      ['payload is empty', () => nexusResponse(200, {})]
    ]

    for (const [name, priceRoute] of unusablePricing) {
      authState.isLoggedIn.value = false
      await nextTick()

      serve({
        '/api/credits/summary': () => nexusResponse(200, SUMMARY),
        '/api/credits/pricing': priceRoute
      })

      const credits = useCreditsSummary()
      authState.isLoggedIn.value = true

      await vi.waitFor(() => expect(credits.summary.value?.user.remaining, name).toBe(750))
      expect(credits.error.value, name).toBe('')
      expect(credits.pricing.value, name).toEqual([])
    }
  })

  it('filters unquotable price rows instead of exposing them', async () => {
    serve({
      '/api/credits/summary': () => nexusResponse(200, SUMMARY),
      '/api/credits/pricing': () =>
        nexusResponse(200, {
          rules: [
            { unit: '1k_tokens', creditsPerUnit: 2 },
            { capability: '', creditsPerUnit: 2 },
            { capability: 'text.chat', creditsPerUnit: 0 },
            { capability: 'audio.stt', creditsPerUnit: -3 },
            { capability: 'image.edit', creditsPerUnit: 'free' },
            { capability: 'video.gen', creditsPerUnit: 9 },
            'not-a-row'
          ]
        })
    })

    const credits = useCreditsSummary()
    authState.isLoggedIn.value = true

    await vi.waitFor(() => expect(credits.pricing.value).toHaveLength(1))
    expect(credits.pricing.value[0]).toEqual({
      capability: 'video.gen',
      unit: '',
      creditsPerUnit: 9,
      secondaryUnit: null,
      secondaryCreditsPerUnit: null,
      minCredits: 0
    })
  })

  it('clears the price list when the account signs out', async () => {
    serve({
      '/api/credits/summary': () => nexusResponse(200, SUMMARY),
      '/api/credits/pricing': () => nexusResponse(200, { rules: PRICE_LIST })
    })

    const credits = useCreditsSummary()
    authState.isLoggedIn.value = true
    await vi.waitFor(() => expect(credits.pricing.value).toHaveLength(2))

    authState.isLoggedIn.value = false

    await vi.waitFor(() => expect(credits.pricing.value).toEqual([]))
    expect(credits.summary.value).toBeNull()
  })
})
