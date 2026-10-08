import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import type { EffectScope } from 'vue'
import { useAdminList } from '~/composables/useAdminList'
import type { AdminUpdate, AdminUpdateFilters } from './admin-updates'
import {
  ADMIN_UPDATE_FILTER_DEFAULTS,
  createUpdatesListSource,
  isAutoUpdate,
  isEditableUpdate,
  localizedUpdateText,
  isCalendarDayTimestamp,
  matchesUpdateFilters,
  matchesUpdateRange,
  updateDateLabels,
  updateItemPath,
} from './admin-updates'

/**
 * `/admin/updates` rules. The page used to filter with locale-dependent text,
 * page by a hard-coded 5 rows and keep every filter in local refs; these pin the
 * replacements: one matcher, `useAdminList` paging over a client-side copy, and
 * the whole state in the URL.
 */

const NOW = Date.parse('2026-10-03T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function update(overrides: Partial<AdminUpdate> = {}): AdminUpdate {
  return {
    id: 'u1',
    type: 'news',
    scope: 'web',
    channels: [],
    releaseTag: null,
    title: { zh: '插件市场上线', en: 'Plugin market is live' },
    timestamp: new Date(NOW - DAY).toISOString(),
    summary: { zh: '可以在客户端里安装插件了。', en: 'Install plugins from the app.' },
    tags: ['store'],
    link: 'https://tuff.chat/updates/market',
    ...overrides,
  }
}

function filters(overrides: Partial<AdminUpdateFilters> = {}): AdminUpdateFilters {
  return { ...ADMIN_UPDATE_FILTER_DEFAULTS, ...overrides } as AdminUpdateFilters
}

describe('update matching', () => {
  it('matches everything with the default filters', () => {
    expect(matchesUpdateFilters(update(), filters(), NOW)).toBe(true)
    expect(matchesUpdateFilters(update({ type: 'release', releaseTag: 'v2.4.0' }), filters(), NOW)).toBe(true)
  })

  it('filters by type and scope', () => {
    expect(matchesUpdateFilters(update(), filters({ type: 'news' }), NOW)).toBe(true)
    expect(matchesUpdateFilters(update(), filters({ type: 'config' }), NOW)).toBe(false)
    expect(matchesUpdateFilters(update({ scope: 'both' }), filters({ scope: 'both' }), NOW)).toBe(true)
    expect(matchesUpdateFilters(update({ scope: 'both' }), filters({ scope: 'web' }), NOW)).toBe(false)
  })

  it('filters by channel, counting an update without channels as every channel', () => {
    const beta = update({ channels: ['beta', 'SNAPSHOT'] })
    expect(matchesUpdateFilters(beta, filters({ channel: 'BETA' }), NOW)).toBe(true)
    expect(matchesUpdateFilters(beta, filters({ channel: 'RELEASE' }), NOW)).toBe(false)
    expect(matchesUpdateFilters(update({ channels: [] }), filters({ channel: 'RELEASE' }), NOW)).toBe(true)
  })

  it('tells release-synced updates from manual ones', () => {
    const release = update({ type: 'release', releaseTag: 'v2.4.0' })
    const tagged = update({ type: 'news', releaseTag: 'v2.4.1' })
    const manual = update()
    expect([release, tagged, manual].map(isAutoUpdate)).toEqual([true, true, false])
    expect(matchesUpdateFilters(release, filters({ source: 'auto' }), NOW)).toBe(true)
    expect(matchesUpdateFilters(manual, filters({ source: 'auto' }), NOW)).toBe(false)
    expect(matchesUpdateFilters(tagged, filters({ source: 'manual' }), NOW)).toBe(false)
    expect(matchesUpdateFilters(manual, filters({ source: 'manual' }), NOW)).toBe(true)
  })

  it('counts a date range back from now and never hides an unreadable timestamp', () => {
    const eightDaysAgo = new Date(NOW - 8 * DAY).toISOString()
    expect(matchesUpdateRange(eightDaysAgo, '7d', NOW)).toBe(false)
    expect(matchesUpdateRange(eightDaysAgo, '30d', NOW)).toBe(true)
    expect(matchesUpdateRange(new Date(NOW - 91 * DAY).toISOString(), '90d', NOW)).toBe(false)
    expect(matchesUpdateRange('not a date', '7d', NOW)).toBe(true)
    expect(matchesUpdateRange(eightDaysAgo, 'all', NOW)).toBe(true)
  })

  it('searches both languages, the release tag, the tags and the channels', () => {
    const item = update({ releaseTag: 'v2.4.0', channels: ['BETA'], tags: ['Roadmap'] })
    // Whichever language the console is in: the search is not tied to the locale.
    for (const q of ['market', '插件市场', 'install plugins', 'V2.4', 'roadmap', 'beta', '  MARKET  '])
      expect(matchesUpdateFilters(item, filters({ q }), NOW), q).toBe(true)
    expect(matchesUpdateFilters(item, filters({ q: 'nothing like it' }), NOW)).toBe(false)
  })

  it('shows the reader\'s language and falls back to the other half', () => {
    expect(localizedUpdateText({ zh: '中文', en: 'English' }, 'zh')).toBe('中文')
    expect(localizedUpdateText({ zh: '中文', en: 'English' }, 'en')).toBe('English')
    expect(localizedUpdateText({ zh: '', en: 'English' }, 'zh')).toBe('English')
    expect(localizedUpdateText({ zh: '中文', en: '  ' }, 'en')).toBe('中文')
    expect(localizedUpdateText(null, 'en')).toBe('')
  })

  it('reads a manual update\'s day in UTC and a synced release\'s time locally', () => {
    // The form stores the picked day at UTC midnight; read locally, Los Angeles
    // saw 2026-09-25 for a day picked as 2026-09-26. Recorded calls, not printed
    // dates, so the rule holds whatever zone the suite runs in.
    expect(isCalendarDayTimestamp('2026-09-26T00:00:00.000Z')).toBe(true)
    expect(isCalendarDayTimestamp('2026-09-26T00:00:00Z')).toBe(true)
    expect(isCalendarDayTimestamp('2026-09-26T03:12:00Z')).toBe(false)
    expect(isCalendarDayTimestamp('2026-09-26T00:00:00.001Z')).toBe(false)
    expect(isCalendarDayTimestamp('2026-09-26T08:00:00+08:00')).toBe(true)
    for (const value of ['', null, undefined, 'not a date'])
      expect(isCalendarDayTimestamp(value)).toBe(false)

    const calls: string[] = []
    const format = {
      tableDate(_value: unknown, options?: { timeZone?: 'UTC' }) {
        calls.push(`tableDate ${options?.timeZone ?? 'local'}`)
        return 'cell'
      },
      date(_value: unknown, options?: { timeZone?: 'UTC' }) {
        calls.push(`date ${options?.timeZone ?? 'local'}`)
        return 'day'
      },
      dateTimeTitle() {
        calls.push('dateTimeTitle')
        return 'instant'
      },
    }
    expect(updateDateLabels(format, '2026-09-26T00:00:00.000Z')).toEqual({ cell: 'cell', full: 'day' })
    expect(calls.splice(0)).toEqual(['tableDate UTC', 'date UTC'])
    expect(updateDateLabels(format, '2026-09-26T03:12:00Z')).toEqual({ cell: 'cell', full: 'instant' })
    expect(calls.splice(0)).toEqual(['tableDate local', 'dateTimeTitle'])
  })

  it('leaves release entries to the release sync', () => {
    expect(isEditableUpdate(update({ type: 'release' }))).toBe(false)
    expect(isEditableUpdate(update({ type: 'announcement' }))).toBe(true)
    expect(updateItemPath('official-core-app-performance-2026-03')).toBe('/api/dashboard/updates/official-core-app-performance-2026-03')
  })
})

type Query = Record<string, string | string[] | undefined>

let scope: EffectScope | undefined

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/updates', hash: '', query: { ...query } as Query })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({
    replace: vi.fn(async (location: { query: Query }) => {
      route.query = { ...location.query }
    }),
  }))
  return route
}

async function settle() {
  for (let index = 0; index < 6; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

function manyUpdates(count: number): AdminUpdate[] {
  return Array.from({ length: count }, (_, index) => update({
    id: `u${index + 1}`,
    type: index % 2 === 0 ? 'news' : 'announcement',
    title: { zh: `更新 ${index + 1}`, en: `Update ${index + 1}` },
  }))
}

function mountUpdatesList(request: (path: string) => Promise<unknown>, query: Query = {}) {
  const route = installRoute(query)
  scope = effectScope()
  const source = createUpdatesListSource(request, () => 'Updates and news could not be loaded.', () => NOW)
  const list = scope.run(() => useAdminList(source.options))!
  return { route, source, list }
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

describe('updates list', () => {
  it('asks once and pages 20 rows at a time instead of the old 5', async () => {
    const request = vi.fn(async () => ({ updates: manyUpdates(45) }))
    const { list } = mountUpdatesList(request)
    await settle()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/dashboard/updates')
    expect(list.limit.value).toBe(20)
    expect(list.pageSizes).toEqual([20, 50, 100])
    expect(list.rows.value).toHaveLength(20)
    expect(list.total.value).toBe(45)
  })

  it('keeps the page, the page size and every filter in the URL', async () => {
    const request = vi.fn(async () => ({ updates: manyUpdates(45) }))
    const { list, route } = mountUpdatesList(request, { tab: 'kept' })
    await settle()

    list.setPage(2)
    await settle()
    expect(route.query).toEqual({ tab: 'kept', page: '2' })

    list.filters.type = 'news'
    await settle()
    // A filter change goes back to page 1, which is the default and drops out.
    expect(route.query).toEqual({ tab: 'kept', type: 'news' })
    expect(list.total.value).toBe(23)

    list.setLimit(50)
    await settle()
    expect(route.query).toEqual({ tab: 'kept', type: 'news', limit: '50' })
    // Paging and filtering a copy that is already loaded costs no request.
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('opens a shared link on the filtered page it names', async () => {
    const request = vi.fn(async () => ({ updates: manyUpdates(45) }))
    const { list } = mountUpdatesList(request, { type: 'announcement', page: '2', limit: '20', q: 'update' })
    await settle()

    expect(list.filters.type).toBe('announcement')
    expect(list.page.value).toBe(2)
    expect(list.total.value).toBe(22)
    expect(list.rows.value.map(row => row.id)).toEqual(
      manyUpdates(45).filter(row => row.type === 'announcement').slice(20, 40).map(row => row.id),
    )
  })

  it('debounces the search like any console list', async () => {
    const { list } = mountUpdatesList(vi.fn(async () => ({ updates: manyUpdates(45) })))
    await settle()

    list.filters.q = 'Update 4'
    await settle()
    expect(list.total.value).toBe(45)
    vi.advanceTimersByTime(300)
    await settle()
    // "Update 4" and "Update 40" … "Update 45".
    expect(list.total.value).toBe(7)
  })

  it('reloads after invalidate, and only re-slices without it', async () => {
    let count = 10
    const request = vi.fn(async () => ({ updates: manyUpdates(count) }))
    const { list, source } = mountUpdatesList(request)
    await settle()
    expect(list.total.value).toBe(10)

    count = 12
    await list.refresh()
    expect(list.total.value).toBe(10)
    expect(request).toHaveBeenCalledTimes(1)

    source.fetch.invalidate()
    await list.refresh()
    expect(list.total.value).toBe(12)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('reports a failure in words, never as the transport\'s request line', async () => {
    const request = vi.fn(async () => {
      throw new Error('[GET] "/api/dashboard/updates": 500 Internal Server Error')
    })
    const { list } = mountUpdatesList(request)
    await settle()

    expect(list.error.value).toBe('Updates and news could not be loaded.')
    expect(list.error.value).not.toContain('/api/')
    expect(list.rows.value).toEqual([])
  })
})
