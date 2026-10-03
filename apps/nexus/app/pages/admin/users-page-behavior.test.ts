import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, reactive, ref } from 'vue'
import type { EffectScope, Ref } from 'vue'
import { useAdminList } from '~/composables/useAdminList'
import {
  ADMIN_USER_FILTER_DEFAULTS,
  buildUserQuery,
  buildUserRoleOptions,
  buildUserStatusLabels,
  buildUserStatusOptions,
  canRequestUserDeletion,
  createUserListOptions,
  creditDeductHint,
  creditDeductRefusalMessage,
  creditLedgerReason,
  creditRemaining,
  creditUsageRatio,
  isUserLifecycleLocked,
  ledgerEntryTokens,
  normalizeCreditAdjustLimits,
  normalizeUserCreditsResponse,
  normalizeUserSubscription,
  readCreditDeductRefusal,
  readWholeNumber,
  userAccessLock,
  userRoleTone,
  userStatusTone,
  validateCreditAdjustment,
  validateSubscriptionGrant,
} from '~/utils/admin-users'
import type { AdminRequest } from '~/utils/admin-users'
import { createRouteI18n } from '../../../test/helpers/route-i18n'

/**
 * Behaviour of `/admin/users`, tested through the pieces the page is built
 * from: `createUserListOptions` handed to `useAdminList` (exactly what the page
 * does with `requestJson`), and the rules in `utils/admin-users.ts`. The drawer's
 * request generations are covered by `composables/useAdminUserDrawer.test.ts`.
 *
 * What the page used to do by hand and where it is held now:
 *
 * | before (users.vue)                                     | now |
 * | ------------------------------------------------------ | --- |
 * | `buildQuery` left blank / `all` filters out            | `request` › defaults, filters |
 * | search waited 300 ms, any filter went back to page 1   | `request` › debounce, page 1 |
 * | Prev / Next with `page / totalPages`                   | `useAdminList` + `TxPagination` (total + page size), state in the URL |
 * | `resolveErrorMessage` (data.message → statusMessage)   | `request` › errors — the shared `resolveAdminErrorMessage` |
 * | Edit disabled for merged / pending deletion            | `rules` › lifecycle |
 * | own role and status locked, own account not deletable  | `rules` › access, deletion |
 * | credit remaining / usage bar                           | `credits` › balance |
 * | `tokens {n}` printed in English                        | `credits` › tokens (the plural `credits.tokens` message now) |
 * | (none: a deduction past the floor "succeeded")         | `credits` › deduction limit: hint, invalid amount, refusal |
 */

type Query = Record<string, string | string[] | undefined>

let scope: EffectScope | undefined

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/users', hash: '', query: { ...query } as Query })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({
    replace: vi.fn(async (location: { query: Query }) => {
      route.query = { ...location.query }
    }),
  }))
  return route
}

/** Mirrors vue-i18n: a loaded locale wins, the inline fallback is only for a missing key. */
function createT(locale: Ref<string>) {
  return (key: string, fallback: string) => (locale.value === 'zh' ? `zh:${key}` : fallback)
}

function userPage(total = 61, count = 20) {
  return {
    users: Array.from({ length: count }, (_, index) => ({ id: `u${index}`, email: `u${index}@example.com`, status: 'active', role: 'user' })),
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
  }
}

type RequestFake = AdminRequest & { mock: { calls: Array<[string, { query: Record<string, string | number> }]> } }

function fakeRequest(answer: (path: string, options: { query: Record<string, string | number> }) => unknown) {
  return vi.fn(async (path: string, options?: Record<string, unknown>) => answer(path, options as { query: Record<string, string | number> })) as unknown as RequestFake
}

function mountUserList(request: AdminRequest, query: Query = {}) {
  installRoute(query)
  scope = effectScope()
  return scope.run(() => useAdminList(createUserListOptions(request, createT(ref('en')))))!
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

describe('admin users: request', () => {
  it('sends exactly { page: 1, limit: 20 } when nothing is filtered', async () => {
    const request = fakeRequest(() => userPage())
    const list = mountUserList(request)
    await settle()

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]![0]).toBe('/api/admin/users')
    expect(request.mock.calls[0]![1].query).toEqual({ page: 1, limit: 20 })
    expect(list.rows.value).toHaveLength(20)
    expect(list.total.value).toBe(61)
  })

  it('sends the search trimmed and only the statuses and roles the API filters by', () => {
    expect(buildUserQuery({ page: 2, limit: 50, filters: { ...ADMIN_USER_FILTER_DEFAULTS, q: '  lin  ' } }))
      .toEqual({ page: 2, limit: 50, q: 'lin' })
    expect(buildUserQuery({ page: 1, limit: 20, filters: { q: '', status: 'deletion_pending', role: 'admin' } }))
      .toEqual({ page: 1, limit: 20, status: 'deletion_pending', role: 'admin' })
    // A hand-edited URL: the API would ignore these, so they are not sent.
    expect(buildUserQuery({ page: 1, limit: 20, filters: { q: '', status: 'banned', role: 'owner' } }))
      .toEqual({ page: 1, limit: 20 })
  })

  it('restores the filters and the page from the URL', async () => {
    const request = fakeRequest(() => userPage())
    const list = mountUserList(request, { q: 'lin', status: 'disabled', role: 'user', page: '2', limit: '50' })
    await settle()

    expect(request.mock.calls[0]![1].query).toEqual({ page: 2, limit: 50, q: 'lin', status: 'disabled', role: 'user' })
    expect(list.hasActiveFilters.value).toBe(true)
  })

  it('waits for the search to settle and goes back to the first page', async () => {
    const request = fakeRequest(() => userPage())
    const list = mountUserList(request, { page: '3' })
    await settle()
    expect(request.mock.calls[0]![1].query).toMatchObject({ page: 3 })

    list.filters.q = 'li'
    await settle()
    list.filters.q = 'lin'
    await settle()
    expect(request).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(300)
    await settle()
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1]![1].query).toEqual({ page: 1, limit: 20, q: 'lin' })

    list.filters.status = 'disabled'
    await settle()
    expect(request.mock.calls[2]![1].query).toEqual({ page: 1, limit: 20, q: 'lin', status: 'disabled' })
  })

  it('shows the localized fallback instead of the transport string, and a server message when there is one', async () => {
    const failing = fakeRequest(() => {
      throw new Error('[GET] "/api/admin/users?page=1&limit=20": 500 Internal Server Error')
    })
    const list = mountUserList(failing)
    await settle()
    expect(list.error.value).toBe('Failed to load users.')
    expect(list.error.value).not.toMatch(/\/api\/admin\/users/)

    scope?.stop()
    const explained = fakeRequest(() => {
      throw Object.assign(new Error('ignored'), { data: { statusMessage: 'Database not available' } })
    })
    const second = mountUserList(explained)
    await settle()
    expect(second.error.value).toBe('Database not available')
  })
})

describe('admin users: labels', () => {
  it('derives the filter options from the label tables and re-translates on a locale switch', () => {
    const locale = ref('en')
    const t = createT(locale)
    const statusOptions = computed(() => buildUserStatusOptions(t))
    const labels = buildUserStatusLabels(t)

    expect(statusOptions.value.map(option => option.value)).toEqual(['all', 'active', 'disabled', 'merged', 'deletion_pending'])
    for (const option of statusOptions.value.slice(1))
      expect(option.label).toBe(labels[option.value])
    expect(buildUserRoleOptions(t).map(option => option.value)).toEqual(['all', 'admin', 'user'])

    locale.value = 'zh'
    expect(statusOptions.value[4]!.label).toBe('zh:dashboard.sections.users.status.deletionPending')
  })

  it('maps status and role to badge tones', () => {
    expect(userStatusTone('active')).toBe('success')
    expect(userStatusTone('disabled')).toBe('danger')
    expect(userStatusTone('deletion_pending')).toBe('warning')
    expect(userStatusTone('merged')).toBe('muted')
    expect(userRoleTone('admin')).toBe('info')
    expect(userRoleTone('user')).toBe('muted')
  })
})

describe('admin users: rules', () => {
  const me = 'admin-1'

  it('locks a merged account or one pending deletion', () => {
    expect(isUserLifecycleLocked({ status: 'merged' })).toBe(true)
    expect(isUserLifecycleLocked({ status: 'deletion_pending' })).toBe(true)
    expect(isUserLifecycleLocked({ status: 'disabled' })).toBe(false)
    expect(isUserLifecycleLocked({ status: 'active' })).toBe(false)
  })

  it('says why access cannot be changed, the operator\'s own account included', () => {
    expect(userAccessLock({ id: 'u1', status: 'merged' }, me)).toBe('merged')
    expect(userAccessLock({ id: 'u1', status: 'deletion_pending' }, me)).toBe('deletionPending')
    expect(userAccessLock({ id: me, status: 'active' }, me)).toBe('self')
    expect(userAccessLock({ id: 'u1', status: 'disabled' }, me)).toBeNull()
  })

  it('offers deletion only for another active account', () => {
    expect(canRequestUserDeletion({ id: 'u1', status: 'active' }, me)).toBe(true)
    expect(canRequestUserDeletion({ id: me, status: 'active' }, me)).toBe(false)
    expect(canRequestUserDeletion({ id: 'u1', status: 'disabled' }, me)).toBe(false)
    expect(canRequestUserDeletion({ id: 'u1', status: 'deletion_pending' }, me)).toBe(false)
    // Without the operator's id it cannot tell their own account apart: fail closed.
    expect(canRequestUserDeletion({ id: 'u1', status: 'active' }, null)).toBe(false)
  })
})

describe('admin users: subscription drawer', () => {
  it('reads the subscription the API returns', () => {
    expect(normalizeUserSubscription({ plan: 'PRO', activatedAt: '2026-09-07T03:26:02.872Z', expiresAt: null, isActive: true }))
      .toEqual({ plan: 'PRO', activatedAt: '2026-09-07T03:26:02.872Z', expiresAt: null, isActive: true })
    expect(normalizeUserSubscription(null)).toBeNull()
    expect(normalizeUserSubscription({})).toEqual({ plan: 'FREE', activatedAt: null, expiresAt: null, isActive: true })
  })

  it('builds the grant body from a whole number of days', () => {
    expect(validateSubscriptionGrant({ plan: 'PRO', durationDays: 365 }))
      .toEqual({ ok: true, body: { plan: 'PRO', durationDays: 365, expiresInDays: 365 } })
    for (const durationDays of ['', 0, -1, 1.5, 3651, null])
      expect(validateSubscriptionGrant({ plan: 'PRO', durationDays })).toEqual({ ok: false, field: 'durationDays' })
    // FREE is not grantable: the API refuses it.
    expect(validateSubscriptionGrant({ plan: 'FREE', durationDays: 30 })).toEqual({ ok: false, field: 'plan' })
  })
})

describe('admin users: credits drawer', () => {
  it('reads the credits response the API returns', () => {
    const credits = normalizeUserCreditsResponse({
      user: { id: 'u1' },
      summary: { month: '2026-10', user: { scope: 'user', scope_id: 'u1', month: '2026-10', quota: 20000, used: 4670 }, team: null },
      limits: { planFloor: 20000, used: 4670, quota: 20000, maxDeduct: 0 },
      ledger: { entries: [{ id: 'l1', delta: -100, reason: 'admin-debit', createdAt: '2026-10-03T10:24:08.308Z', metadata: null }], pagination: { page: 2, limit: 10, total: 11, totalPages: 2 } },
    })
    expect(credits).toEqual({
      month: '2026-10',
      balance: { quota: 20000, used: 4670 },
      limits: { maxDeduct: 0 },
      entries: [{ id: 'l1', delta: -100, reason: 'admin-debit', createdAt: '2026-10-03T10:24:08.308Z', metadata: null }],
      page: 2,
      limit: 10,
      total: 11,
    })
    expect(normalizeUserCreditsResponse(null)).toEqual({ month: '', balance: null, limits: null, entries: [], page: 1, limit: 10, total: 0 })
  })

  it('reads the deduction limit only when it is a whole, non-negative number of credits', () => {
    expect(normalizeCreditAdjustLimits({ planFloor: 20000, used: 5100, quota: 20400, maxDeduct: 400 })).toEqual({ maxDeduct: 400 })
    expect(normalizeCreditAdjustLimits({ maxDeduct: 0 })).toEqual({ maxDeduct: 0 })
    for (const value of [null, undefined, 400, {}, { maxDeduct: -1 }, { maxDeduct: 1.5 }, { maxDeduct: '400' }, { maxDeduct: Number.NaN }])
      expect(normalizeCreditAdjustLimits(value)).toBeNull()
  })

  it('reads the limit of a CREDITS_DEDUCT_LIMIT refusal, and of nothing else', () => {
    // What ofetch throws for the API's 400: the H3 error body is the error's `data`.
    const refusal = Object.assign(new Error('[PATCH] "/api/admin/users/u1/credits": 400 Credit deduction exceeds the adjustable amount.'), {
      data: {
        statusCode: 400,
        statusMessage: 'Credit deduction exceeds the adjustable amount.',
        data: { errorCode: 'CREDITS_DEDUCT_LIMIT', maxDeduct: 400, planFloor: 20000, used: 5100 },
      },
    })
    expect(readCreditDeductRefusal(refusal)).toEqual({ maxDeduct: 400 })

    expect(readCreditDeductRefusal(Object.assign(new Error('x'), { data: { statusMessage: 'Invalid credit amount.' } }))).toBeNull()
    expect(readCreditDeductRefusal(Object.assign(new Error('x'), { data: { data: { errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD', maxDeduct: 1 } } }))).toBeNull()
    expect(readCreditDeductRefusal(new Error('offline'))).toBeNull()
    expect(readCreditDeductRefusal(null)).toBeNull()
  })

  it('says how much can be deducted while subtracting, and marks more than that invalid', async () => {
    const i18n = await createRouteI18n('en')
    const en = (value: number) => new Intl.NumberFormat('en-US').format(value)
    const limits = { maxDeduct: 4000 }

    expect(creditDeductHint({ direction: 'subtract', amount: 100 }, limits, i18n.t, en)).toEqual({ text: 'Up to 4,000 can be deducted', invalid: false })
    expect(creditDeductHint({ direction: 'subtract', amount: 4000 }, limits, i18n.t, en)?.invalid).toBe(false)
    expect(creditDeductHint({ direction: 'subtract', amount: '4001' }, limits, i18n.t, en)).toEqual({ text: 'Up to 4,000 can be deducted', invalid: true })
    // An empty or fractional amount is the amount check's to report, not the limit's.
    expect(creditDeductHint({ direction: 'subtract', amount: '' }, limits, i18n.t, en)?.invalid).toBe(false)
    expect(creditDeductHint({ direction: 'subtract', amount: 4000.5 }, limits, i18n.t, en)?.invalid).toBe(false)
    // Adding has no limit, and none is shown before the API has said what it is.
    expect(creditDeductHint({ direction: 'add', amount: 1_000_000 }, limits, i18n.t, en)).toBeNull()
    expect(creditDeductHint({ direction: 'subtract', amount: 100 }, null, i18n.t, en)).toBeNull()

    i18n.setLocale('zh')
    const zh = (value: number) => new Intl.NumberFormat('zh-CN').format(value)
    expect(creditDeductHint({ direction: 'subtract', amount: 100 }, limits, i18n.t, zh)?.text).toBe('最多可扣 4,000')
  })

  it('says the quota is at its floor when nothing can be deducted, whatever the amount', async () => {
    const i18n = await createRouteI18n('en')
    const en = (value: number) => new Intl.NumberFormat('en-US').format(value)

    expect(creditDeductHint({ direction: 'subtract', amount: 100 }, { maxDeduct: 0 }, i18n.t, en))
      .toEqual({ text: 'The quota is already at its floor; nothing can be deducted', invalid: true })
    expect(creditDeductHint({ direction: 'subtract', amount: '' }, { maxDeduct: 0 }, i18n.t, en)?.invalid).toBe(true)

    i18n.setLocale('zh')
    expect(creditDeductHint({ direction: 'subtract', amount: 100 }, { maxDeduct: 0 }, i18n.t, en)?.text).toBe('当前额度已在下限，不能再扣减')
  })

  it('words a refused deduction with the limit the API gave, in both locales', async () => {
    const i18n = await createRouteI18n('en')
    const en = (value: number) => new Intl.NumberFormat('en-US').format(value)
    expect(creditDeductRefusalMessage(1234, i18n.t, en)).toBe('This deduction is over the limit. Up to 1,234 can be deducted.')
    expect(creditDeductRefusalMessage(0, i18n.t, en)).toBe('The quota is already at its floor; nothing can be deducted.')

    i18n.setLocale('zh')
    const zh = (value: number) => new Intl.NumberFormat('zh-CN').format(value)
    expect(creditDeductRefusalMessage(1234, i18n.t, zh)).toBe('扣减超出可扣上限，最多可扣 1,234。')
    expect(creditDeductRefusalMessage(0, i18n.t, zh)).toBe('当前额度已在下限，不能再扣减。')
  })

  it('computes the remaining credits and the usage share', () => {
    expect(creditRemaining({ quota: 20000, used: 4670 })).toBe(15330)
    expect(creditRemaining({ quota: 100, used: 150 })).toBe(0)
    expect(creditRemaining(null)).toBe(0)
    expect(creditUsageRatio({ quota: 20000, used: 5000 })).toBe(0.25)
    expect(creditUsageRatio({ quota: 100, used: 150 })).toBe(1)
    expect(creditUsageRatio({ quota: 0, used: 0 })).toBe(0)
  })

  it('reads the billed tokens of a usage entry', () => {
    expect(ledgerEntryTokens({ metadata: { tokens: 1234 } })).toBe(1234)
    expect(ledgerEntryTokens({ metadata: { tokens: '88' } })).toBe(88)
    expect(ledgerEntryTokens({ metadata: { tokens: 0 } })).toBeNull()
    expect(ledgerEntryTokens({ metadata: { source: 'admin' } })).toBeNull()
    expect(ledgerEntryTokens({ metadata: null })).toBeNull()
  })

  it('prints the billed tokens after the reason, in both locales and both plural forms', async () => {
    const i18n = await createRouteI18n('en')
    const en = (value: number) => new Intl.NumberFormat('en-US').format(value)
    expect(creditLedgerReason({ reason: 'chat', metadata: { tokens: 1 } }, i18n.t, en)).toBe('chat · 1 token')
    expect(creditLedgerReason({ reason: 'chat', metadata: { tokens: 1234 } }, i18n.t, en)).toBe('chat · 1,234 tokens')
    expect(creditLedgerReason({ reason: 'admin-credit', metadata: { source: 'admin' } }, i18n.t, en)).toBe('admin-credit')
    expect(creditLedgerReason({ reason: '', metadata: null }, i18n.t, en)).toBe('—')

    i18n.setLocale('zh')
    const zh = (value: number) => new Intl.NumberFormat('zh-CN').format(value)
    expect(creditLedgerReason({ reason: 'chat', metadata: { tokens: 1234 } }, i18n.t, zh)).toBe('chat · 1,234 个 token')
  })

  it('builds the adjustment body from a whole, positive amount', () => {
    expect(validateCreditAdjustment({ direction: 'subtract', amount: 100, reason: '  refund  ' }))
      .toEqual({ ok: true, body: { amount: 100, direction: 'subtract', reason: 'refund' } })
    // No reason: the API records `admin-credit` / `admin-debit` itself.
    expect(validateCreditAdjustment({ direction: 'add', amount: '250', reason: ' ' }))
      .toEqual({ ok: true, body: { amount: 250, direction: 'add' } })
    for (const amount of ['', 0, -5, 2.5, 1_000_000_001, null, undefined])
      expect(validateCreditAdjustment({ direction: 'add', amount, reason: '' })).toEqual({ ok: false })
  })

  it('reads a number field as a whole number or nothing', () => {
    expect(readWholeNumber(12)).toBe(12)
    expect(readWholeNumber('12')).toBe(12)
    expect(readWholeNumber('')).toBeNull()
    expect(readWholeNumber('  ')).toBeNull()
    expect(readWholeNumber(1.5)).toBeNull()
    expect(readWholeNumber('abc')).toBeNull()
    expect(readWholeNumber(null)).toBeNull()
  })
})
