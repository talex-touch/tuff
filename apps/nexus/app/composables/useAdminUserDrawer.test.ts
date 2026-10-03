import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import type { EffectScope } from 'vue'
import { createDrawerRequestTracker, useAdminUserCredits, useAdminUserSubscription } from './useAdminUserDrawer'

/**
 * The user management drawer shows one account at a time, and an administrator
 * can close it and open the next account before the first one's request answers.
 * These tests hold every response back and release them out of order, which is
 * the only way the race shows up: in the real page the late answer for the
 * previous account used to land on top of the account now on screen (the credit
 * view had no request generation at all; the subscription view had one inline).
 */

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

interface Call {
  path: string
  options?: Record<string, unknown>
  answer: Deferred<unknown>
}

/** A request fake whose calls answer only when the test says so. */
function heldRequests() {
  const calls: Call[] = []
  const request = vi.fn((path: string, options?: Record<string, unknown>) => {
    const answer = deferred<unknown>()
    calls.push({ path, options, answer })
    return answer.promise
  })
  return { request, calls }
}

const t = (_key: string, fallback: string) => fallback

function creditsResponse(userId: string, options: { page?: number, quota?: number, used?: number, total?: number, maxDeduct?: number } = {}) {
  const page = options.page ?? 1
  const quota = options.quota ?? 20000
  const used = options.used ?? 100
  return {
    user: { id: userId },
    summary: { month: '2026-10', user: { scope: 'user', scope_id: userId, quota, used }, team: null },
    limits: { planFloor: 20000, used, quota, maxDeduct: options.maxDeduct ?? Math.max(0, quota - Math.max(20000, used)) },
    ledger: {
      entries: [{ id: `${userId}-p${page}`, delta: -5, reason: `${userId} page ${page}`, createdAt: '2026-10-01T00:00:00.000Z', metadata: null }],
      pagination: { page, limit: 10, total: options.total ?? 12, totalPages: 2 },
    },
  }
}

/** The API's 400 for a deduction past the quota floor, as ofetch throws it: the H3 error body is `data`. */
function deductRefusal(maxDeduct: number) {
  return Object.assign(new Error('[PATCH] "/api/admin/users/user-a/credits": 400 Credit deduction exceeds the adjustable amount.'), {
    data: {
      statusCode: 400,
      statusMessage: 'Credit deduction exceeds the adjustable amount.',
      data: { errorCode: 'CREDITS_DEDUCT_LIMIT', maxDeduct, planFloor: 20000, used: 100 },
    },
  })
}

async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

let scope: EffectScope | undefined

function run<T>(factory: () => T): T {
  scope = effectScope()
  return scope.run(factory)!
}

afterEach(() => {
  scope?.stop()
  scope = undefined
})

describe('createDrawerRequestTracker', () => {
  it('keeps a read current until a newer read starts or the drawer moves on', () => {
    const tracker = createDrawerRequestTracker()
    tracker.open('user-a')
    const first = tracker.read()
    expect(first()).toBe(true)

    const second = tracker.read()
    expect(first()).toBe(false)
    expect(second()).toBe(true)

    tracker.open('user-b')
    expect(second()).toBe(false)
    expect(tracker.target).toBe('user-b')

    const third = tracker.read()
    tracker.close()
    expect(third()).toBe(false)
    expect(tracker.target).toBeNull()
  })

  it('keeps a write current across reads, but not across another account', () => {
    const tracker = createDrawerRequestTracker()
    tracker.open('user-a')
    const write = tracker.write()
    tracker.read()
    tracker.supersedeReads()
    expect(write()).toBe(true)

    tracker.close()
    tracker.open('user-a')
    // Reopening the same account is still a new drawer: the old write is stale.
    expect(write()).toBe(false)
  })
})

describe('useAdminUserCredits', () => {
  it('asks for the first ledger page of the account it opens', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user a/1')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/api/admin/users/user%20a%2F1/credits')
    expect(calls[0]!.options).toEqual({ query: { page: 1, limit: 10 } })
    expect(credits.loading.value).toBe(true)
    expect(credits.credits.value).toBeNull()

    calls[0]!.answer.resolve(creditsResponse('user a/1', { quota: 20000, used: 4670 }))
    await settle()
    expect(credits.loading.value).toBe(false)
    expect(credits.credits.value).toMatchObject({ month: '2026-10', balance: { quota: 20000, used: 4670 }, page: 1, limit: 10, total: 12 })
  })

  it('keeps the account on screen when the previous account answers late', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    credits.close()
    void credits.open('user-b')

    calls[1]!.answer.resolve(creditsResponse('user-b', { used: 200 }))
    await settle()
    expect(credits.credits.value?.entries[0]!.id).toBe('user-b-p1')

    // The slow answer for the account that is no longer open.
    calls[0]!.answer.resolve(creditsResponse('user-a', { used: 100 }))
    await settle()
    expect(credits.credits.value?.entries[0]!.id).toBe('user-b-p1')
    expect(credits.credits.value?.balance).toEqual({ quota: 20000, used: 200 })
    expect(credits.loading.value).toBe(false)
  })

  it('keeps the next account loading while only the previous one has answered', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    void credits.open('user-b')

    calls[0]!.answer.resolve(creditsResponse('user-a'))
    await settle()
    expect(credits.credits.value).toBeNull()
    expect(credits.loading.value).toBe(true)

    calls[1]!.answer.resolve(creditsResponse('user-b'))
    await settle()
    expect(credits.credits.value?.entries[0]!.id).toBe('user-b-p1')
    expect(credits.loading.value).toBe(false)
  })

  it('drops a late failure for the previous account', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    void credits.open('user-b')
    calls[1]!.answer.resolve(creditsResponse('user-b'))
    await settle()

    calls[0]!.answer.reject(Object.assign(new Error('boom'), { data: { message: 'User not found.' } }))
    await settle()
    expect(credits.error.value).toBeNull()
    expect(credits.credits.value?.entries[0]!.id).toBe('user-b-p1')
  })

  it('drops a response that arrives after the drawer closed', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    credits.close()
    calls[0]!.answer.resolve(creditsResponse('user-a'))
    await settle()

    expect(credits.credits.value).toBeNull()
    expect(credits.loading.value).toBe(false)
  })

  it('does not let a slower ledger page land on top of a newer one', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a', { page: 1 }))
    await settle()

    void credits.setPage(2)
    void credits.setPage(1)
    expect(calls[1]!.options).toEqual({ query: { page: 2, limit: 10 } })
    expect(calls[2]!.options).toEqual({ query: { page: 1, limit: 10 } })

    calls[2]!.answer.resolve(creditsResponse('user-a', { page: 1, used: 300 }))
    await settle()
    calls[1]!.answer.resolve(creditsResponse('user-a', { page: 2 }))
    await settle()

    expect(credits.credits.value?.page).toBe(1)
    expect(credits.credits.value?.balance?.used).toBe(300)
  })

  it('shows the localized fallback, never the transport string, and prefers the server message', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.reject(new Error('[GET] "/api/admin/users/user-a/credits?page=1&limit=10": 500 Internal Server Error'))
    await settle()
    expect(credits.error.value).toBe('Failed to load credits.')
    expect(credits.loading.value).toBe(false)

    void credits.refresh()
    calls[1]!.answer.reject(Object.assign(new Error('ignored'), { data: { statusMessage: 'Database not available' } }))
    await settle()
    expect(credits.error.value).toBe('Database not available')
  })

  it('keeps the balance on screen when a later page fails', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a'))
    await settle()

    void credits.setPage(2)
    calls[1]!.answer.reject(new Error('offline'))
    await settle()
    expect(credits.error.value).toBe('Failed to load credits.')
    expect(credits.credits.value?.entries[0]!.id).toBe('user-a-p1')
  })

  it('takes an adjustment answer over a page read still in flight', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a', { quota: 20000 }))
    await settle()

    void credits.setPage(2)
    const adjusting = credits.adjust({ ok: true, body: { amount: 500, direction: 'add', reason: 'promo' } })
    expect(credits.saving.value).toBe(true)
    expect(calls[2]!.path).toBe('/api/admin/users/user-a/credits')
    expect(calls[2]!.options).toEqual({ method: 'PATCH', body: { amount: 500, direction: 'add', reason: 'promo' } })

    calls[2]!.answer.resolve(creditsResponse('user-a', { quota: 20500 }))
    await expect(adjusting).resolves.toEqual({ ok: true, applied: true })
    expect(credits.credits.value?.balance?.quota).toBe(20500)
    expect(credits.saving.value).toBe(false)
    expect(credits.loading.value).toBe(false)

    // The page read started before the adjustment answered: it is older news.
    calls[1]!.answer.resolve(creditsResponse('user-a', { page: 2, quota: 20000 }))
    await settle()
    expect(credits.credits.value?.balance?.quota).toBe(20500)
    expect(credits.credits.value?.page).toBe(1)
  })

  it('reports an adjustment for an account that is no longer open without painting it', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a'))
    await settle()

    const adjusting = credits.adjust({ ok: true, body: { amount: 100, direction: 'subtract' } })
    credits.close()
    void credits.open('user-b')
    calls[2]!.answer.resolve(creditsResponse('user-b', { quota: 100000 }))
    await settle()

    calls[1]!.answer.resolve(creditsResponse('user-a', { quota: 19900 }))
    await expect(adjusting).resolves.toEqual({ ok: true, applied: false })
    expect(credits.credits.value?.balance?.quota).toBe(100000)
    expect(credits.saving.value).toBe(false)
  })

  it('reports a failed adjustment with the server message or the localized fallback', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a'))
    await settle()

    const first = credits.adjust({ ok: true, body: { amount: 100, direction: 'subtract' } })
    calls[1]!.answer.reject(Object.assign(new Error('x'), { data: { statusMessage: 'Credit balance update failed.' } }))
    await expect(first).resolves.toEqual({ ok: false, message: 'Credit balance update failed.' })

    const second = credits.adjust({ ok: true, body: { amount: 100, direction: 'add' } })
    calls[2]!.answer.reject(new Error('[PATCH] "/api/admin/users/user-a/credits": 500'))
    await expect(second).resolves.toEqual({ ok: false, message: 'Failed to update credits.' })
    expect(credits.saving.value).toBe(false)
    expect(credits.credits.value?.entries[0]!.id).toBe('user-a-p1')
  })

  it('keeps the deduction limit of the account on screen, from its current answer', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    void credits.open('user-b')
    calls[1]!.answer.resolve(creditsResponse('user-b', { quota: 20080 }))
    await settle()
    expect(credits.credits.value?.limits).toEqual({ maxDeduct: 80 })

    // The previous account's limit, answering late, is not this account's.
    calls[0]!.answer.resolve(creditsResponse('user-a', { quota: 21000 }))
    await settle()
    expect(credits.credits.value?.limits).toEqual({ maxDeduct: 80 })
  })

  it('takes the limit a refused deduction carries and words nothing itself', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a', { quota: 20500 }))
    await settle()
    expect(credits.credits.value?.limits).toEqual({ maxDeduct: 500 })

    const adjusting = credits.adjust({ ok: true, body: { amount: 400, direction: 'subtract' } })
    calls[1]!.answer.reject(deductRefusal(300))

    // The page words the refusal from `maxDeduct`; the server's English is not passed on.
    await expect(adjusting).resolves.toEqual({ ok: false, message: null, maxDeduct: 300 })
    expect(credits.credits.value?.limits).toEqual({ maxDeduct: 300 })
    expect(credits.credits.value?.balance).toEqual({ quota: 20500, used: 100 })
    expect(credits.saving.value).toBe(false)
    expect(credits.error.value).toBeNull()
  })

  it('leaves another account\'s limit alone when a refusal arrives after the drawer moved on', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a', { quota: 20500 }))
    await settle()

    const adjusting = credits.adjust({ ok: true, body: { amount: 400, direction: 'subtract' } })
    credits.close()
    void credits.open('user-b')
    calls[2]!.answer.resolve(creditsResponse('user-b', { quota: 20080 }))
    await settle()

    calls[1]!.answer.reject(deductRefusal(300))
    await expect(adjusting).resolves.toEqual({ ok: false, message: null, maxDeduct: 300 })
    expect(credits.credits.value?.limits).toEqual({ maxDeduct: 80 })
    expect(credits.credits.value?.entries[0]!.id).toBe('user-b-p1')
  })

  it('refuses a second adjustment while one is running', async () => {
    const { request, calls } = heldRequests()
    const credits = run(() => useAdminUserCredits({ request, t }))

    void credits.open('user-a')
    calls[0]!.answer.resolve(creditsResponse('user-a'))
    await settle()

    void credits.adjust({ ok: true, body: { amount: 1, direction: 'add' } })
    await expect(credits.adjust({ ok: true, body: { amount: 1, direction: 'add' } })).resolves.toEqual({ ok: false, message: null })
    expect(calls).toHaveLength(2)
  })
})

describe('useAdminUserSubscription', () => {
  const subscriptionOf = (plan: string) => ({ user: {}, subscription: { plan, activatedAt: null, expiresAt: null, isActive: true } })

  it('keeps the account on screen when the previous account answers late', async () => {
    const { request, calls } = heldRequests()
    const subscription = run(() => useAdminUserSubscription({ request, t }))

    void subscription.open('user-a')
    subscription.close()
    void subscription.open('user-b')
    expect(calls.map(call => call.path)).toEqual(['/api/admin/users/user-a/subscription', '/api/admin/users/user-b/subscription'])

    calls[1]!.answer.resolve(subscriptionOf('PRO'))
    await settle()
    calls[0]!.answer.resolve(subscriptionOf('ENTERPRISE'))
    await settle()

    expect(subscription.subscription.value?.plan).toBe('PRO')
    expect(subscription.loading.value).toBe(false)
  })

  it('grants for the open account and reads the subscription again', async () => {
    const { request, calls } = heldRequests()
    const subscription = run(() => useAdminUserSubscription({ request, t }))

    void subscription.open('user-a')
    calls[0]!.answer.resolve({ subscription: { plan: 'FREE', activatedAt: null, expiresAt: null, isActive: true } })
    await settle()

    const granting = subscription.grant({ ok: true, body: { plan: 'PRO', durationDays: 30, expiresInDays: 30 } })
    expect(subscription.granting.value).toBe(true)
    expect(calls[1]!.path).toBe('/api/admin/subscriptions/grant')
    expect(calls[1]!.options).toEqual({ method: 'POST', body: { userId: 'user-a', plan: 'PRO', durationDays: 30, expiresInDays: 30 } })

    calls[1]!.answer.resolve({ userId: 'user-a', plan: 'PRO' })
    await settle()
    expect(calls[2]!.path).toBe('/api/admin/users/user-a/subscription')
    calls[2]!.answer.resolve(subscriptionOf('PRO'))

    await expect(granting).resolves.toEqual({ ok: true, applied: true })
    expect(subscription.subscription.value?.plan).toBe('PRO')
    expect(subscription.granting.value).toBe(false)
  })

  it('does not read again for an account that is no longer open', async () => {
    const { request, calls } = heldRequests()
    const subscription = run(() => useAdminUserSubscription({ request, t }))

    void subscription.open('user-a')
    calls[0]!.answer.resolve(subscriptionOf('FREE'))
    await settle()

    const granting = subscription.grant({ ok: true, body: { plan: 'PLUS', durationDays: 7, expiresInDays: 7 } })
    subscription.close()
    calls[1]!.answer.resolve({ userId: 'user-a', plan: 'PLUS' })

    await expect(granting).resolves.toEqual({ ok: true, applied: false })
    expect(calls).toHaveLength(2)
    expect(subscription.subscription.value).toBeNull()
  })

  it('reports a failed grant without the transport string', async () => {
    const { request, calls } = heldRequests()
    const subscription = run(() => useAdminUserSubscription({ request, t }))

    void subscription.open('user-a')
    calls[0]!.answer.resolve(subscriptionOf('FREE'))
    await settle()

    const granting = subscription.grant({ ok: true, body: { plan: 'PRO', durationDays: 30, expiresInDays: 30 } })
    calls[1]!.answer.reject(new Error('[POST] "/api/admin/subscriptions/grant": 500'))
    await expect(granting).resolves.toEqual({ ok: false, message: 'Failed to grant subscription.' })
    expect(subscription.granting.value).toBe(false)
  })
})
