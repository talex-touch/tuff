import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import type { EffectScope } from 'vue'
import { useAdminList } from './useAdminList'
import type { AdminListFetchParams, AdminListOptions, AdminListPage } from './useAdminList'

type Query = Record<string, string | string[] | undefined>

interface Filters extends Record<string, string> {
  q: string
  status: string
}

const DEFAULTS: Filters = { q: '', status: 'all' }

interface Row { id: string }

function rows(count: number, prefix = 'r'): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}` }))
}

let scope: EffectScope | undefined

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/users', hash: '', query: { ...query } as Query })
  const replace = vi.fn(async (location: { path: string, query: Query }) => {
    route.query = { ...location.query }
  })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({ replace }))
  return { route, replace }
}

function createList(
  fetch: (params: AdminListFetchParams<Filters>) => Promise<AdminListPage<Row>>,
  options: Partial<AdminListOptions<Row, Filters>> = {},
) {
  scope = effectScope()
  return scope.run(() => useAdminList<Row, Filters>({
    fetch,
    defaults: DEFAULTS,
    debounceKeys: ['q'],
    errorFallback: 'Failed to load users.',
    ...options,
  }))!
}

/** Lets watchers, the route stub and the request promises settle. */
async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useAdminList', () => {
  it('starts in the skeleton state and asks with the defaults', async () => {
    installRoute()
    const fetch = vi.fn(async () => ({ rows: rows(3), total: 3 }))
    const list = createList(fetch)

    // Before the response there is nothing to say "no data" about.
    expect(list.loading.value).toBe(true)
    expect(list.rows.value).toEqual([])

    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith({ page: 1, limit: 20, filters: { q: '', status: 'all' } })
    expect(list.loading.value).toBe(false)
    expect(list.rows.value).toHaveLength(3)
    expect(list.total.value).toBe(3)
  })

  it('restores page, page size and filters from the URL', async () => {
    installRoute({ q: ' ada ', status: 'disabled', page: '3', limit: '50', tab: 'x' })
    const fetch = vi.fn(async () => ({ rows: rows(50), total: 400 }))
    const list = createList(fetch)
    await settle()

    expect(fetch).toHaveBeenCalledWith({ page: 3, limit: 50, filters: { q: 'ada', status: 'disabled' } })
    expect(list.filters.q).toBe('ada')
    expect(list.page.value).toBe(3)
    expect(list.limit.value).toBe(50)
  })

  it('ignores a page size the list does not offer and a malformed page', async () => {
    installRoute({ page: 'two', limit: '5000' })
    const fetch = vi.fn(async () => ({ rows: rows(1), total: 1 }))
    createList(fetch)
    await settle()
    expect(fetch).toHaveBeenCalledWith({ page: 1, limit: 20, filters: DEFAULTS })
  })

  it('writes only non-default values and keeps keys it does not own', async () => {
    const { replace, route } = installRoute({ tab: 'docs' })
    const list = createList(vi.fn(async () => ({ rows: rows(20), total: 61 })))
    await settle()
    expect(replace).not.toHaveBeenCalled()

    list.setPage(2)
    await settle()
    expect(route.query).toEqual({ tab: 'docs', page: '2' })

    list.filters.status = 'active'
    await settle()
    // A filter change goes back to page 1, which is the default and so is dropped.
    expect(route.query).toEqual({ tab: 'docs', status: 'active' })
    expect(list.page.value).toBe(1)

    list.setLimit(50)
    await settle()
    expect(route.query).toEqual({ tab: 'docs', status: 'active', limit: '50' })
  })

  it('debounces text filters and applies select filters at once', async () => {
    installRoute()
    const fetch = vi.fn(async () => ({ rows: rows(5), total: 5 }))
    const list = createList(fetch)
    await settle()
    fetch.mockClear()

    list.filters.q = 'a'
    await settle()
    list.filters.q = 'ad'
    await settle()
    vi.advanceTimersByTime(299)
    await settle()
    expect(fetch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenLastCalledWith({ page: 1, limit: 20, filters: { q: 'ad', status: 'all' } })

    // Whitespace alone is not a new search.
    list.filters.q = 'ad '
    await settle()
    vi.advanceTimersByTime(300)
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)

    list.filters.status = 'disabled'
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(list.hasActiveFilters.value).toBe(true)
  })

  it('drops a response that a newer request overtook', async () => {
    installRoute()
    const pending: Array<(page: AdminListPage<Row>) => void> = []
    const fetch = vi.fn(() => new Promise<AdminListPage<Row>>((resolve) => {
      pending.push(resolve)
    }))
    const list = createList(fetch)
    await settle()
    pending[0]!({ rows: rows(20, 'first'), total: 100 })
    await settle()

    list.setPage(2)
    list.setPage(3)
    await settle()
    expect(fetch).toHaveBeenCalledTimes(3)

    // Page 3 answers first, then the slow page 2 arrives.
    pending[2]!({ rows: rows(20, 'third'), total: 100 })
    await settle()
    pending[1]!({ rows: rows(20, 'second'), total: 100 })
    await settle()

    expect(list.rows.value[0]!.id).toBe('third0')
    expect(list.refreshing.value).toBe(false)
  })

  it('keeps the rows during a refresh and only then replaces them', async () => {
    installRoute()
    let resolveNext: ((page: AdminListPage<Row>) => void) | undefined
    const fetch = vi.fn(async () => ({ rows: rows(2), total: 2 }))
    const list = createList(fetch)
    await settle()

    fetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveNext = resolve
    }))
    void list.refresh()
    await settle()
    expect(list.refreshing.value).toBe(true)
    expect(list.loading.value).toBe(false)
    expect(list.rows.value).toHaveLength(2)

    resolveNext!({ rows: rows(4), total: 4 })
    await settle()
    expect(list.refreshing.value).toBe(false)
    expect(list.rows.value).toHaveLength(4)
  })

  it('clears the rows on failure and shows a presentable message', async () => {
    installRoute()
    let fail = false
    const fetch = vi.fn(async () => {
      if (fail)
        throw new Error('[GET] "/api/admin/users?page=1": 500 Internal Server Error')
      return { rows: rows(3), total: 3 }
    })
    const list = createList(fetch)
    await settle()

    fail = true
    await list.refresh()
    expect(list.error.value).toBe('Failed to load users.')
    expect(list.rows.value).toEqual([])
    expect(list.total.value).toBe(0)
    expect(list.loading.value).toBe(false)

    fail = false
    await list.refresh()
    expect(list.error.value).toBeNull()
    expect(list.rows.value).toHaveLength(3)
  })

  it('moves back to the last page when the requested one is past the end', async () => {
    installRoute({ page: '9' })
    const fetch = vi.fn(async (params: AdminListFetchParams<Filters>) => ({
      rows: params.page <= 4 ? rows(20) : [],
      total: 61,
    }))
    const list = createList(fetch)
    await settle()

    expect(fetch.mock.calls.map(([params]) => params.page)).toEqual([9, 4])
    expect(list.page.value).toBe(4)
    expect(list.rows.value).toHaveLength(20)

    // Out of range or not a page at all: ignored.
    list.setPage(5)
    list.setPage(0)
    list.setPage(1.5)
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('follows the URL when it changes underneath (back / forward)', async () => {
    const { route } = installRoute()
    const fetch = vi.fn(async () => ({ rows: rows(20), total: 100 }))
    const list = createList(fetch)
    await settle()

    route.query = { status: 'disabled', page: '2' }
    await settle()
    expect(list.filters.status).toBe('disabled')
    expect(list.page.value).toBe(2)
    expect(fetch).toHaveBeenLastCalledWith({ page: 2, limit: 20, filters: { q: '', status: 'disabled' } })
    // Taking the URL's filters is not a filter change: the page is kept.
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('clears every filter at once', async () => {
    const { route } = installRoute({ q: 'ada', status: 'disabled' })
    const fetch = vi.fn(async () => ({ rows: rows(1), total: 1 }))
    const list = createList(fetch)
    await settle()
    expect(list.hasActiveFilters.value).toBe(true)

    list.clearFilters()
    await settle()
    expect(list.filters).toEqual(DEFAULTS)
    expect(list.hasActiveFilters.value).toBe(false)
    expect(route.query).toEqual({})
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('stops writing state once its scope is gone', async () => {
    installRoute()
    let resolveLate: ((page: AdminListPage<Row>) => void) | undefined
    const fetch = vi.fn(() => new Promise<AdminListPage<Row>>((resolve) => {
      resolveLate = resolve
    }))
    const list = createList(fetch)
    await settle()
    scope!.stop()

    resolveLate!({ rows: rows(5), total: 5 })
    await settle()
    expect(list.rows.value).toEqual([])
  })
})
