import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthUser } from './useAuthUser'

/** `useAuthUser` reads the profile through the shared cache, and its `refresh` asks the server again. */

const api = vi.hoisted(() => ({
  fetchCurrentUserProfile: vi.fn(),
}))

vi.mock('~/composables/useCurrentUserApi', () => api)

let states: Map<string, ReturnType<typeof ref>>

beforeEach(() => {
  states = new Map()
  api.fetchCurrentUserProfile.mockReset()
  vi.stubGlobal('useNexusAuth', () => ({ status: ref('authenticated') }))
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!states.has(key))
      states.set(key, ref(init()))
    return states.get(key)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAuthUser', () => {
  it('loads the profile without forcing a request, and refreshes it with one', async () => {
    let finishFirst!: (value: unknown) => void
    api.fetchCurrentUserProfile
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
      .mockResolvedValueOnce({ id: 'user_1', name: 'After edit' })

    const scope = effectScope()
    const auth = scope.run(() => useAuthUser())!
    expect(api.fetchCurrentUserProfile).toHaveBeenLastCalledWith({ force: false })

    // A refresh right after an edit is not swallowed by the read already on its way.
    await auth.refresh()
    expect(api.fetchCurrentUserProfile).toHaveBeenLastCalledWith({ force: true })
    expect(auth.user.value).toEqual({ id: 'user_1', name: 'After edit' })

    finishFirst({ id: 'user_1', name: 'After edit' })
    await nextTick()
    scope.stop()
  })
})
