import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import type { EffectScope, Ref } from 'vue'
import { useAdminList } from '~/composables/useAdminList'
import {
  ADMIN_CODE_FILTER_DEFAULTS,
  buildCodePlanOptions,
  buildCodeQuery,
  buildCodeStatusLabels,
  buildCodeStatusOptions,
  CODE_GENERATION_DEFAULTS,
  codeDurationLabel,
  codeStatusTone,
  createCodeListOptions,
  isRevocableCode,
  showCodeActionsColumn,
  validateCodeGeneration,
} from '~/utils/admin-codes'
import type { AdminRequest } from '~/utils/admin-users'
import { createRouteI18n } from '../../../test/helpers/route-i18n'

/**
 * Behaviour of `/admin/subscriptions` (activation codes), tested through the
 * pieces the page is built from: `createCodeListOptions` handed to
 * `useAdminList` (exactly what the page does with `requestJson`), and the rules in
 * `utils/admin-codes.ts`.
 *
 * | before (subscriptions.vue)                              | now |
 * | ------------------------------------------------------- | --- |
 * | `q` / `plan` / `status` sent only when set              | `request` › defaults, filters |
 * | search waited 300 ms, any filter went back to page 1    | `request` › debounce, page 1 |
 * | request generation (`latestCodesRequest`)              | `useAdminList`'s own generation (`useAdminList.test.ts`) |
 * | "Actions" column always present, empty for spent codes  | `actions column` |
 * | revoke offered only for active codes                    | `actions column` › revocable |
 * | generator sent whatever the inputs held                 | `generator` |
 * | `{{ days }} {{ t('codes.days') }}` ("1 days")           | `duration` — the first plural message in Nexus |
 */

type Query = Record<string, string | string[] | undefined>

let scope: EffectScope | undefined

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/subscriptions', hash: '', query: { ...query } as Query })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({
    replace: vi.fn(async (location: { query: Query }) => {
      route.query = { ...location.query }
    }),
  }))
  return route
}

function createT(locale: Ref<string>) {
  return (key: string, fallback: string) => (locale.value === 'zh' ? `zh:${key}` : fallback)
}

function codePage(total = 8, count = 8, status = 'exhausted') {
  return {
    codes: Array.from({ length: count }, (_, index) => ({ id: `c${index}`, code: `TUFF-PRO-${index}`, plan: 'PRO', status })),
    pagination: { page: 1, limit: 20, total, totalPages: 1 },
  }
}

type RequestFake = AdminRequest & { mock: { calls: Array<[string, { query: Record<string, string | number> }]> } }

function fakeRequest(answer: () => unknown) {
  return vi.fn(async () => answer()) as unknown as RequestFake
}

function mountCodeList(request: AdminRequest, query: Query = {}) {
  installRoute(query)
  scope = effectScope()
  return scope.run(() => useAdminList(createCodeListOptions(request, createT(ref('en')))))!
}

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

describe('admin activation codes: request', () => {
  it('sends exactly { page: 1, limit: 20 } when nothing is filtered', async () => {
    const request = fakeRequest(() => codePage())
    mountCodeList(request)
    await settle()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toBe('/api/admin/codes')
    expect(request.mock.calls[0]![1].query).toEqual({ page: 1, limit: 20 })
  })

  it('sends the search trimmed and only the plans and statuses the API filters by', () => {
    expect(buildCodeQuery({ page: 1, limit: 20, filters: { ...ADMIN_CODE_FILTER_DEFAULTS, q: ' TUFF-PRO ' } }))
      .toEqual({ page: 1, limit: 20, q: 'TUFF-PRO' })
    expect(buildCodeQuery({ page: 3, limit: 50, filters: { q: '', plan: 'ENTERPRISE', status: 'revoked' } }))
      .toEqual({ page: 3, limit: 50, plan: 'ENTERPRISE', status: 'revoked' })
    expect(buildCodeQuery({ page: 1, limit: 20, filters: { q: '', plan: 'pro', status: 'used' } }))
      .toEqual({ page: 1, limit: 20 })
  })

  it('restores the filters and the page from the URL, and a filter goes back to page 1', async () => {
    const request = fakeRequest(() => codePage(61, 20, 'active'))
    const list = mountCodeList(request, { plan: 'PRO', page: '2' })
    await settle()
    expect(request.mock.calls[0]![1].query).toEqual({ page: 2, limit: 20, plan: 'PRO' })

    list.filters.status = 'active'
    await settle()
    expect(request.mock.calls[1]![1].query).toEqual({ page: 1, limit: 20, plan: 'PRO', status: 'active' })

    list.filters.q = 'TUFF'
    await settle()
    expect(request).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(300)
    await settle()
    expect(request.mock.calls[2]![1].query).toEqual({ page: 1, limit: 20, q: 'TUFF', plan: 'PRO', status: 'active' })
  })

  it('shows the localized fallback instead of the transport string', async () => {
    const request = fakeRequest(() => {
      throw new Error('[GET] "/api/admin/codes?page=1&limit=20": 500 Internal Server Error')
    })
    const list = mountCodeList(request)
    await settle()
    expect(list.error.value).toBe('Failed to load activation codes.')
    expect(list.error.value).not.toMatch(/\/api\/admin\/codes/)
  })
})

describe('admin activation codes: labels', () => {
  it('derives the status options from the label table', () => {
    const t = createT(ref('en'))
    const labels = buildCodeStatusLabels(t)
    const options = buildCodeStatusOptions(t)
    expect(options[0]).toEqual({ value: 'all', label: 'All statuses' })
    expect(options.slice(1).map(option => option.value)).toEqual(['active', 'exhausted', 'expired', 'revoked'])
    for (const option of options.slice(1))
      expect(option.label).toBe(labels[option.value])
  })

  it('lists every plan a code can carry, under its own name', () => {
    expect(buildCodePlanOptions(createT(ref('zh')))).toEqual([
      { value: 'all', label: 'zh:dashboard.sections.codes.filters.allPlans' },
      { value: 'FREE', label: 'FREE' },
      { value: 'PLUS', label: 'PLUS' },
      { value: 'PRO', label: 'PRO' },
      { value: 'ENTERPRISE', label: 'ENTERPRISE' },
      { value: 'TEAM', label: 'TEAM' },
    ])
  })

  it('maps a status to a badge tone', () => {
    expect(codeStatusTone('active')).toBe('success')
    expect(codeStatusTone('expired')).toBe('danger')
    expect(codeStatusTone('revoked')).toBe('warning')
    expect(codeStatusTone('exhausted')).toBe('muted')
  })
})

describe('admin activation codes: actions column', () => {
  it('only offers to revoke a code that can still be redeemed', () => {
    expect(isRevocableCode({ status: 'active' })).toBe(true)
    for (const status of ['exhausted', 'expired', 'revoked'])
      expect(isRevocableCode({ status })).toBe(false)
  })

  it('has no actions column when nothing on the page can be revoked', () => {
    // The baseline: eight spent demo codes and a column of empty cells.
    expect(showCodeActionsColumn({ rows: codePage().codes, loading: false, status: 'all' })).toBe(false)
    expect(showCodeActionsColumn({ rows: [{ status: 'exhausted' }, { status: 'active' }], loading: false, status: 'all' })).toBe(true)
    expect(showCodeActionsColumn({ rows: [], loading: false, status: 'all' })).toBe(false)
  })

  it('keeps the column in the first skeleton when the filter can still return a revocable code', () => {
    expect(showCodeActionsColumn({ rows: [], loading: true, status: 'all' })).toBe(true)
    expect(showCodeActionsColumn({ rows: [], loading: true, status: 'active' })).toBe(true)
    expect(showCodeActionsColumn({ rows: [], loading: true, status: 'revoked' })).toBe(false)
  })
})

describe('admin activation codes: generator', () => {
  it('sends the defaults as typed', () => {
    expect(validateCodeGeneration({ ...CODE_GENERATION_DEFAULTS })).toEqual({
      ok: true,
      body: { plan: 'PLUS', durationDays: 30, maxUses: 1, expiresInDays: 90, count: 1 },
    })
  })

  it('reads the number fields the way the inputs emit them', () => {
    expect(validateCodeGeneration({ plan: 'TEAM', durationDays: '365', maxUses: 1000, expiresInDays: 1, count: '100' }))
      .toEqual({ ok: true, body: { plan: 'TEAM', durationDays: 365, maxUses: 1000, expiresInDays: 1, count: 100 } })
  })

  it('names every field that is out of the API\'s range instead of sending it', () => {
    // The API clamps `count` silently and accepts a fractional duration, so the
    // form is what keeps "101 codes" or "1.5 days" from turning into something else.
    expect(validateCodeGeneration({ plan: 'PRO', durationDays: 366, maxUses: 0, expiresInDays: '', count: 101 }))
      .toEqual({ ok: false, plan: false, fields: ['durationDays', 'maxUses', 'expiresInDays', 'count'] })
    expect(validateCodeGeneration({ plan: 'PRO', durationDays: 1.5, maxUses: 1, expiresInDays: 30, count: 1 }))
      .toEqual({ ok: false, plan: false, fields: ['durationDays'] })
    expect(validateCodeGeneration({ plan: 'GOLD', durationDays: 30, maxUses: 1, expiresInDays: 30, count: 1 }))
      .toEqual({ ok: false, plan: true, fields: [] })
  })
})

describe('admin activation codes: duration', () => {
  // `codes.durationValue` (`'{count} day | {count} days'`) is the first plural
  // message in Nexus. `createRouteI18n` renders it with the vue-i18n the console
  // runs, from the dashboard route chunk merged as the console merges it, so the
  // message compiler reads the `|` in the real chunk, not in a copy.
  it('reads "1 day" and "30 days" in English, with the count in the reader\'s number format', async () => {
    const i18n = await createRouteI18n('en')
    const number = (value: number) => new Intl.NumberFormat('en-US').format(value)
    expect(codeDurationLabel(1, i18n.t, number)).toBe('1 day')
    expect(codeDurationLabel(30, i18n.t, number)).toBe('30 days')
    expect(codeDurationLabel(365, i18n.t, number)).toBe('365 days')
    expect(codeDurationLabel(1000, i18n.t, number)).toBe('1,000 days')
  })

  it('reads "1 天" and "30 天" in Chinese, which has one form', async () => {
    const i18n = await createRouteI18n('zh')
    const number = (value: number) => new Intl.NumberFormat('zh-CN').format(value)
    expect(codeDurationLabel(1, i18n.t, number)).toBe('1 天')
    expect(codeDurationLabel(30, i18n.t, number)).toBe('30 天')
  })
})
