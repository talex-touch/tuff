import type { EffectScope } from 'vue'
import type { RegistryTranslate } from '~/utils/admin-provider-registry'
import type { ProviderRegistryRecord, SceneRegistryRecord } from '~/utils/provider-registry-admin'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { useAdminList } from '~/composables/useAdminList'
import { useAdminQueryState } from '~/composables/useAdminQueryState'
import {
  createCapabilityListOptions,
  createHealthListOptions,
  createProviderListOptions,
  createRouteListOptions,
  createUsageListOptions,
  PROVIDER_REGISTRY_TABS,
} from '~/utils/admin-provider-registry'

/**
 * Behaviour of `/admin/provider-registry`'s lists and tabs, through the pieces
 * the page is built from: each list's options handed to `useAdminList` (exactly
 * what the tabs do), and `useAdminQueryState` for `?tab=`, on a stubbed route.
 *
 * | before (one panel, one load)                              | now |
 * | --------------------------------------------------------- | --- |
 * | usage and health: the latest 25 rows, filtered in memory   | `usage` / `health` › server pages, filters in the query |
 * | tab, search and status chips nowhere in the URL            | `addresses` › `?tab=`, `pv_` / `rt_` / `cap_` / `u_` / `h_` |
 */

type Query = Record<string, string | string[] | undefined>

let scopes: EffectScope[] = []

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/provider-registry', hash: '', query: { ...query } as Query })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({
    replace: vi.fn(async (location: { query: Query }) => {
      route.query = { ...location.query }
    }),
  }))
  // The client lists leave their error line to `useAdminList`'s own default.
  vi.stubGlobal('useI18n', () => ({ t: (key: string, fallback?: string) => fallback ?? key }))
  return route
}

/** English fallbacks: the list options only read their error fallback through it. */
const en = ((_key: string, second: unknown, third?: unknown) => (typeof second === 'string' ? second : third as string)) as RegistryTranslate

function run<T>(setup: () => T): T {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(setup)!
}

async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

/** A page of `count` rows (only their ids matter here) out of `total`. */
function serverPage(total: number, count = 20) {
  return { entries: Array.from({ length: count }, (_, index) => ({ id: `row_${index}` })) as never[], total }
}

function provider(id: string): ProviderRegistryRecord {
  return { id, name: id, displayName: `Provider ${id}`, vendor: 'openai', status: 'enabled', authType: 'api_key', authRef: null, ownerScope: 'system', ownerId: null, description: null, endpoint: null, region: null, metadata: null, capabilities: [], createdBy: 'admin', createdAt: '', updatedAt: '' }
}

function scene(id: string): SceneRegistryRecord {
  return { id, displayName: `Scene ${id}`, owner: 'nexus', ownerScope: 'system', ownerId: null, status: 'enabled', requiredCapabilities: [], strategyMode: 'priority', fallback: 'enabled', meteringPolicy: null, auditPolicy: null, metadata: null, bindings: [], createdBy: 'admin', createdAt: '', updatedAt: '' }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const scope of scopes)
    scope.stop()
  scopes = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usage ledger: server pages', () => {
  it('asks for one page and shows the server\'s total', async () => {
    installRoute()
    const request = vi.fn(async (_query: Record<string, string | number>) => serverPage(61))
    const list = run(() => useAdminList(createUsageListOptions(request, en)))
    await settle()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toEqual({ page: 1, limit: 20 })
    expect(list.rows.value).toHaveLength(20)
    expect(list.total.value).toBe(61)
  })

  it('sends 需关注 as attention=true, back on page 1, with the filter under u_ in the URL', async () => {
    const route = installRoute({ u_page: '3' })
    const request = vi.fn(async (_query: Record<string, string | number>) => serverPage(61))
    const list = run(() => useAdminList(createUsageListOptions(request, en)))
    await settle()
    expect(request.mock.calls[0]![0]).toEqual({ page: 3, limit: 20 })

    list.filters.status = 'attention'
    await settle()

    expect(request.mock.calls.at(-1)![0]).toEqual({ page: 1, limit: 20, attention: 'true' })
    expect(route.query).toEqual({ u_status: 'attention' })
  })

  it('writes the page and the size under u_, and a link with them opens the same page', async () => {
    const route = installRoute()
    const request = vi.fn(async (_query: Record<string, string | number>) => serverPage(200))
    const list = run(() => useAdminList(createUsageListOptions(request, en)))
    await settle()

    list.setLimit(50)
    await settle()
    list.setPage(2)
    await settle()
    expect(route.query).toEqual({ u_limit: '50', u_page: '2' })
    expect(request.mock.calls.at(-1)![0]).toEqual({ page: 2, limit: 50 })

    installRoute({ u_status: 'failed', u_page: '2', u_mode: 'dry_run' })
    const reopened = vi.fn(async (_query: Record<string, string | number>) => serverPage(200))
    run(() => useAdminList(createUsageListOptions(reopened, en)))
    await settle()
    expect(reopened.mock.calls[0]![0]).toEqual({ page: 2, limit: 20, status: 'failed', mode: 'dry_run' })
  })
})

describe('health checks: server pages', () => {
  it('sends 需关注 as status=degraded,unhealthy, with the filter under h_ in the URL', async () => {
    const route = installRoute()
    const request = vi.fn(async (_query: Record<string, string | number>) => serverPage(7, 7))
    const list = run(() => useAdminList(createHealthListOptions(request, en)))
    await settle()

    list.filters.status = 'attention'
    list.filters.provider = 'prv_a'
    await settle()

    expect(request.mock.calls.at(-1)![0]).toEqual({ page: 1, limit: 20, status: 'degraded,unhealthy', providerId: 'prv_a' })
    expect(route.query).toEqual({ h_status: 'attention', h_provider: 'prv_a' })
    expect(list.total.value).toBe(7)
  })
})

describe('client lists: a link\'s page and a registry that answers late', () => {
  it('waits for the registry instead of paging nothing, and keeps rt_page', async () => {
    const route = installRoute({ tab: 'routes', rt_page: '2' })
    let scenes: SceneRegistryRecord[] = []
    let answer!: () => void
    const loaded = new Promise<void>((resolve) => {
      answer = resolve
    })
    const setup = createRouteListOptions(() => scenes, () => ({}), () => loaded)
    const list = run(() => useAdminList(setup.options))
    await settle()
    expect(route.query.rt_page).toBe('2')

    scenes = Array.from({ length: 30 }, (_, index) => scene(`s${index}`))
    answer()
    await settle()

    expect(route.query.rt_page).toBe('2')
    expect(list.rows.value.map(row => row.id)).toEqual(scenes.slice(20).map(row => row.id))
  })

  it('keeps the page through a first load that fails', async () => {
    const route = installRoute({ cap_page: '2' })
    const setup = createCapabilityListOptions(() => [], () => Promise.reject(new Error('Failed to load provider registry.')))
    const list = run(() => useAdminList(setup.options))
    await settle()

    expect(route.query.cap_page).toBe('2')
    expect(list.error.value).not.toBeNull()
  })
})

describe('addresses: five lists and a tab on one route', () => {
  it('keeps each list\'s page and filters under its own prefix', async () => {
    const route = installRoute()
    const providers = Array.from({ length: 45 }, (_, index) => provider(`p${index}`))
    const scenes = Array.from({ length: 30 }, (_, index) => scene(`s${index}`))
    const providerSetup = createProviderListOptions(() => providers, () => ({}))
    const routeSetup = createRouteListOptions(() => scenes, () => ({}))
    const capabilitySetup = createCapabilityListOptions(() => [])
    const providerList = run(() => useAdminList(providerSetup.options))
    const routeList = run(() => useAdminList(routeSetup.options))
    run(() => useAdminList(capabilitySetup.options))
    await settle()

    providerList.filters.q = 'p1'
    // The debounce timer starts once the filter's watcher has run.
    await settle()
    vi.advanceTimersByTime(299)
    await settle()
    expect(route.query.pv_q).toBeUndefined()
    vi.advanceTimersByTime(1)
    await settle()
    expect(route.query).toEqual({ pv_q: 'p1' })
    routeList.setPage(2)
    await settle()

    expect(route.query).toEqual({ pv_q: 'p1', rt_page: '2' })
    expect(providerList.total.value).toBe(11)
    expect(routeList.rows.value.map(row => row.id)).toEqual(scenes.slice(20).map(row => row.id))
  })

  it('switches tabs through ?tab=, keeps the other keys, and reads an unknown tab as providers', async () => {
    const route = installRoute({ pv_q: 'openai' })
    const tab = run(() => useAdminQueryState('tab', PROVIDER_REGISTRY_TABS, 'providers'))

    tab.value = 'routes'
    await settle()
    expect(route.query).toEqual({ pv_q: 'openai', tab: 'routes' })

    tab.value = 'providers'
    await settle()
    expect(route.query).toEqual({ pv_q: 'openai' })

    route.query = { tab: 'unknown' }
    expect(tab.value).toBe('providers')
  })
})
