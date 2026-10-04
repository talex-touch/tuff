import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import type { EffectScope } from 'vue'
import { useAdminResource } from './useAdminResource'
import type { AdminResourceOptions } from './useAdminResource'

/**
 * `useAdminResource` against requests the test answers by hand, in any order:
 * the generation and disposal rules only show up when an older request answers
 * after a newer one, or after the page is gone.
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

interface Overview { total: number }

/** A fetch whose calls answer only when the test says so. */
function heldFetch() {
  const answers: Array<Deferred<Overview>> = []
  const fetch = vi.fn(() => {
    const answer = deferred<Overview>()
    answers.push(answer)
    return answer.promise
  })
  return { fetch, answers }
}

/** What ofetch rejects with when the server answered nothing presentable. */
function transportError() {
  return Object.assign(new Error('[GET] "/api/x": 500 Internal Server Error'), { data: null })
}

const FALLBACK = 'Failed to load the overview.'

let scope: EffectScope | undefined

function create(fetch: () => Promise<Overview>, options: Partial<AdminResourceOptions<Overview>> = {}) {
  scope = effectScope()
  return scope.run(() => useAdminResource<Overview>({
    fetch,
    errorFallback: () => FALLBACK,
    ...options,
  }))!
}

/** Lets the request promises and the state they write settle. */
async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

afterEach(() => {
  scope?.stop()
  scope = undefined
})

describe('useAdminResource: first load and refresh', () => {
  it('is loading, not refreshing, until the first answer', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(resource.loading.value).toBe(true)
    expect(resource.refreshing.value).toBe(false)
    expect(resource.data.value).toBeNull()
    expect(resource.error.value).toBeNull()

    answers[0]!.resolve({ total: 3 })
    await settle()
    expect(resource.data.value).toEqual({ total: 3 })
    expect(resource.loading.value).toBe(false)
    expect(resource.refreshing.value).toBe(false)
    expect(resource.error.value).toBeNull()
  })

  it('keeps the data on screen while a refresh runs, then replaces it', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch)
    answers[0]!.resolve({ total: 3 })
    await settle()

    void resource.refresh()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(resource.refreshing.value).toBe(true)
    expect(resource.loading.value).toBe(false)
    expect(resource.data.value).toEqual({ total: 3 })

    answers[1]!.resolve({ total: 4 })
    await settle()
    expect(resource.refreshing.value).toBe(false)
    expect(resource.data.value).toEqual({ total: 4 })
  })
})

describe('useAdminResource: failure', () => {
  it('shows the localized fallback, never the transport string, and recovers on retry', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch)

    answers[0]!.reject(transportError())
    await settle()
    expect(resource.error.value).toBe(FALLBACK)
    expect(resource.error.value).not.toContain('/api/')
    expect(resource.data.value).toBeNull()
    expect(resource.loading.value).toBe(false)
    expect(resource.refreshing.value).toBe(false)

    void resource.refresh()
    await settle()
    // A retry with nothing on screen is a first load again: skeleton, not refresh.
    expect(resource.loading.value).toBe(true)

    answers[1]!.resolve({ total: 5 })
    await settle()
    expect(resource.error.value).toBeNull()
    expect(resource.data.value).toEqual({ total: 5 })
  })

  it('keeps the last result when a refresh fails', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch)
    answers[0]!.resolve({ total: 3 })
    await settle()

    void resource.refresh()
    answers[1]!.reject(transportError())
    await settle()
    expect(resource.data.value).toEqual({ total: 3 })
    expect(resource.error.value).toBe(FALLBACK)
    expect(resource.loading.value).toBe(false)
    expect(resource.refreshing.value).toBe(false)
  })

  it('prefers a message the server wrote for people', async () => {
    const fetch = vi.fn(async (): Promise<Overview> => {
      throw Object.assign(new Error('[GET] "/api/x": 503'), { data: { message: 'Audit store unavailable.' } })
    })
    const resource = create(fetch)
    await settle()
    expect(resource.error.value).toBe('Audit store unavailable.')
  })

  it('reads the fallback when the request fails, so it follows the current locale', async () => {
    let locale = 'en'
    const fetch = vi.fn(async (): Promise<Overview> => {
      throw transportError()
    })
    const resource = create(fetch, { errorFallback: () => (locale === 'zh' ? '加载失败。' : FALLBACK) })
    await settle()
    expect(resource.error.value).toBe(FALLBACK)

    locale = 'zh'
    await resource.refresh()
    expect(resource.error.value).toBe('加载失败。')
  })

  it('resolves refresh() when the request settles and never rejects', async () => {
    const fetch = vi.fn(async (): Promise<Overview> => {
      throw transportError()
    })
    const resource = create(fetch)
    await expect(resource.refresh()).resolves.toBeUndefined()
    expect(resource.error.value).toBe(FALLBACK)
  })
})

describe('useAdminResource: request generations', () => {
  it('keeps the newer result when an older request answers after it', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch, { immediate: false })

    void resource.refresh()
    void resource.refresh()
    expect(fetch).toHaveBeenCalledTimes(2)

    // The second request answers first, then the first one arrives late.
    answers[1]!.resolve({ total: 2 })
    await settle()
    expect(resource.data.value).toEqual({ total: 2 })
    expect(resource.loading.value).toBe(false)

    answers[0]!.resolve({ total: 1 })
    await settle()
    expect(resource.data.value).toEqual({ total: 2 })
  })

  it('drops a late failure of an older request', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch, { immediate: false })

    void resource.refresh()
    void resource.refresh()
    answers[1]!.resolve({ total: 2 })
    await settle()

    answers[0]!.reject(transportError())
    await settle()
    expect(resource.error.value).toBeNull()
    expect(resource.data.value).toEqual({ total: 2 })
    expect(resource.refreshing.value).toBe(false)
  })

  it('stays busy until the newest request answers, whatever older ones do', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch, { immediate: false })

    void resource.refresh()
    void resource.refresh()
    // The older request finishing first is not the end of the load.
    answers[0]!.resolve({ total: 1 })
    await settle()
    expect(resource.data.value).toBeNull()
    expect(resource.loading.value).toBe(true)

    answers[1]!.resolve({ total: 2 })
    await settle()
    expect(resource.loading.value).toBe(false)
    expect(resource.data.value).toEqual({ total: 2 })
  })

  it('resolves each refresh() when its own request settles', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch, { immediate: false })

    let firstDone = false
    let secondDone = false
    void resource.refresh().then(() => {
      firstDone = true
    })
    void resource.refresh().then(() => {
      secondDone = true
    })

    answers[1]!.resolve({ total: 2 })
    await settle()
    expect(secondDone).toBe(true)
    expect(firstDone).toBe(false)

    answers[0]!.reject(transportError())
    await settle()
    expect(firstDone).toBe(true)
  })

  it('writes nothing once its scope is disposed', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch)
    void resource.refresh()
    scope!.stop()

    answers[0]!.resolve({ total: 1 })
    answers[1]!.reject(transportError())
    await settle()
    expect(resource.data.value).toBeNull()
    expect(resource.error.value).toBeNull()

    // And sends nothing more.
    await resource.refresh()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('useAdminResource: on demand', () => {
  it('sends nothing until the first refresh()', async () => {
    const { fetch, answers } = heldFetch()
    const resource = create(fetch, { immediate: false })
    await settle()

    expect(fetch).not.toHaveBeenCalled()
    expect(resource.loading.value).toBe(false)
    expect(resource.refreshing.value).toBe(false)
    expect(resource.data.value).toBeNull()
    expect(resource.error.value).toBeNull()

    void resource.refresh()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(resource.loading.value).toBe(true)

    answers[0]!.resolve({ total: 7 })
    await settle()
    expect(resource.loading.value).toBe(false)
    expect(resource.data.value).toEqual({ total: 7 })
  })
})
