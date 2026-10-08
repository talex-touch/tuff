import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The profile read every dashboard page makes, several times over: concurrent callers share one
 * request, a recent answer is reused, `force` asks again, and nothing crosses from one signed-in
 * account to the next.
 */

type Api = typeof import('./useCurrentUserApi')
type Session = typeof import('~/utils/session-generation')

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function profile(name: string) {
  return { id: 'user_1', email: 'a@x.test', name } as unknown as NonNullable<Awaited<ReturnType<Api['fetchCurrentUserProfile']>>>
}

let api: Api
let session: Session
let pending: Array<{ url: string, options: unknown, answer: Deferred<unknown> }>

/** Lets every request's `.then` chain run. */
async function settle() {
  for (let index = 0; index < 5; index += 1)
    await Promise.resolve()
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-08T00:00:00.000Z'))
  pending = []
  vi.stubGlobal('$fetch', vi.fn((url: string, options: unknown) => {
    const answer = deferred<unknown>()
    pending.push({ url, options, answer })
    return answer.promise
  }))
  // One module graph per test, so the cache starts empty and both modules share it.
  session = await import('~/utils/session-generation')
  api = await import('./useCurrentUserApi')
  session.noteSessionIdentity('user_1')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('fetchCurrentUserProfile', () => {
  it('sends one request for callers that ask at the same time', async () => {
    const reads = [api.fetchCurrentUserProfile(), api.fetchCurrentUserProfile(), api.fetchCurrentUserProfile()]

    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({ url: '/api/user/me', options: { cache: 'no-store' } })
    pending[0]!.answer.resolve(profile('Ada'))
    await expect(Promise.all(reads)).resolves.toEqual([profile('Ada'), profile('Ada'), profile('Ada')])
  })

  it('answers from the last profile for 30 seconds, then asks again', async () => {
    const first = api.fetchCurrentUserProfile()
    pending[0]!.answer.resolve(profile('Ada'))
    await first

    vi.setSystemTime(Date.now() + 29_000)
    await expect(api.fetchCurrentUserProfile()).resolves.toEqual(profile('Ada'))
    expect(pending).toHaveLength(1)

    vi.setSystemTime(Date.now() + 2_000)
    const later = api.fetchCurrentUserProfile()
    expect(pending).toHaveLength(2)
    pending[1]!.answer.resolve(profile('Grace'))
    await expect(later).resolves.toEqual(profile('Grace'))
  })

  it('asks again when forced, and later reads get the forced answer', async () => {
    const first = api.fetchCurrentUserProfile()
    pending[0]!.answer.resolve(profile('Ada'))
    await first

    const forced = api.fetchCurrentUserProfile({ force: true })
    expect(pending).toHaveLength(2)
    pending[1]!.answer.resolve(profile('Ada Lovelace'))
    await expect(forced).resolves.toEqual(profile('Ada Lovelace'))

    await expect(api.fetchCurrentUserProfile()).resolves.toEqual(profile('Ada Lovelace'))
    expect(pending).toHaveLength(2)
  })

  it('does not let an older answer that lands late replace a newer one', async () => {
    const older = api.fetchCurrentUserProfile()
    const forced = api.fetchCurrentUserProfile({ force: true })
    expect(pending).toHaveLength(2)

    pending[1]!.answer.resolve(profile('new'))
    await forced
    pending[0]!.answer.resolve(profile('old'))

    // The older caller is handed the newer profile, and the cache keeps it.
    await expect(older).resolves.toEqual(profile('new'))
    await expect(api.fetchCurrentUserProfile()).resolves.toEqual(profile('new'))
    expect(pending).toHaveLength(2)
  })

  it('never serves one account\'s profile to the next', async () => {
    const first = api.fetchCurrentUserProfile()
    pending[0]!.answer.resolve(profile('Ada'))
    await first
    const inFlight = api.fetchCurrentUserProfile({ force: true })

    session.noteSessionIdentity('user_2')
    const afterSwitch = api.fetchCurrentUserProfile()

    // Neither the cached profile nor the request still on its way is the new account's.
    expect(pending).toHaveLength(3)
    pending[1]!.answer.resolve(profile('Ada again'))
    await inFlight
    pending[2]!.answer.resolve(profile('Bob'))
    await expect(afterSwitch).resolves.toEqual(profile('Bob'))
    await expect(api.fetchCurrentUserProfile()).resolves.toEqual(profile('Bob'))
    expect(pending).toHaveLength(3)
  })

  it('reads again after a profile update, and drops answers that started before it', async () => {
    const first = api.fetchCurrentUserProfile()
    pending[0]!.answer.resolve(profile('Ada'))
    await first
    const beforeUpdate = api.fetchCurrentUserProfile({ force: true })

    const update = api.patchCurrentUserProfile({ name: 'Ada L.' })
    expect(pending[2]).toMatchObject({ url: '/api/user/profile', options: { method: 'PATCH', body: { name: 'Ada L.' } } })
    pending[2]!.answer.resolve({ id: 'user_1', name: 'Ada L.' })
    await update
    pending[1]!.answer.resolve(profile('Ada'))
    await beforeUpdate
    await settle()

    const afterUpdate = api.fetchCurrentUserProfile()
    expect(pending).toHaveLength(4)
    pending[3]!.answer.resolve(profile('Ada L.'))
    await expect(afterUpdate).resolves.toEqual(profile('Ada L.'))
  })

  it('remembers no failure: the next read asks again', async () => {
    const failed = api.fetchCurrentUserProfile()
    pending[0]!.answer.reject(new Error('offline'))
    await expect(failed).rejects.toThrow('offline')
    await settle()

    const retried = api.fetchCurrentUserProfile()
    expect(pending).toHaveLength(2)
    pending[1]!.answer.resolve(profile('Ada'))
    await expect(retried).resolves.toEqual(profile('Ada'))
  })

  it('sends a request given by the caller straight through', async () => {
    const request = vi.fn(async () => profile('direct'))

    await expect(api.fetchCurrentUserProfile({ request })).resolves.toEqual(profile('direct'))
    await expect(api.fetchCurrentUserProfile({ request })).resolves.toEqual(profile('direct'))
    expect(request).toHaveBeenCalledTimes(2)
    expect(pending).toHaveLength(0)
  })
})
