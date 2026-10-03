import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createRenderer, defineComponent, nextTick, ref } from 'vue'
import { ADMIN_GATE_DENIED_REDIRECT, resolveAdminGateState, useAdminGate } from './useAdminGate'
import type { AdminGate, AdminGateState } from './useAdminGate'

describe('resolveAdminGateState', () => {
  const ready = { mounted: true, status: 'authenticated', hasUser: true, isAdmin: true, profileFailed: false }

  it('resolves on the server, before mount, while the session or profile loads', () => {
    expect(resolveAdminGateState({ ...ready, mounted: false })).toBe('resolving')
    expect(resolveAdminGateState({ ...ready, status: 'loading' })).toBe('resolving')
    expect(resolveAdminGateState({ ...ready, hasUser: false })).toBe('resolving')
    // Signed-out visitors are app.vue's to redirect, not ours to deny.
    expect(resolveAdminGateState({ ...ready, status: 'unauthenticated', hasUser: false, isAdmin: false })).toBe('resolving')
  })

  it('allows an administrator and denies anyone else', () => {
    expect(resolveAdminGateState(ready)).toBe('allowed')
    expect(resolveAdminGateState({ ...ready, isAdmin: false })).toBe('denied')
  })

  it('offers a retry when the profile failed and there is no account to decide on', () => {
    expect(resolveAdminGateState({ ...ready, hasUser: false, isAdmin: false, profileFailed: true })).toBe('error')
    // Not before mount, and not for a session app.vue has yet to settle.
    expect(resolveAdminGateState({ ...ready, mounted: false, hasUser: false, profileFailed: true })).toBe('resolving')
    expect(resolveAdminGateState({ ...ready, status: 'loading', hasUser: false, profileFailed: true })).toBe('resolving')
  })

  it('keeps deciding on a known account when a later profile request fails', () => {
    expect(resolveAdminGateState({ ...ready, profileFailed: true })).toBe('allowed')
    expect(resolveAdminGateState({ ...ready, isAdmin: false, profileFailed: true })).toBe('denied')
  })
})

describe('useAdminGate', () => {
  const renderer = createRenderer<object, object>({
    patchProp: () => undefined,
    insert: () => undefined,
    remove: () => undefined,
    createElement: () => ({}),
    createText: () => ({}),
    createComment: () => ({}),
    setText: () => undefined,
    setElementText: () => undefined,
    parentNode: () => null,
    nextSibling: () => null,
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  interface Profile { role: string }

  /**
   * Stands in for the shared `auth-user` state and `useAuthUser()`: `refresh`
   * behaves like its `fetchUser` (pending on, error cleared, then the result),
   * answered by hand through `answer` / `fail`.
   */
  function mountGate(initial: { status?: string, role?: string | null, pending?: boolean, error?: string | null } = {}) {
    const status = ref(initial.status ?? 'authenticated')
    const user = ref<Profile | null>(initial.role ? { role: initial.role } : null)
    const pending = ref(initial.pending ?? false)
    const error = ref<string | null>(initial.error ?? null)
    let settleRefresh: ((outcome: { role?: string, error?: string }) => void) | undefined
    const refresh = vi.fn(() => {
      if (pending.value)
        return Promise.resolve()
      pending.value = true
      error.value = null
      return new Promise<void>((resolve) => {
        settleRefresh = (outcome) => {
          if (outcome.role)
            user.value = { role: outcome.role }
          else
            error.value = outcome.error ?? 'Failed to load user.'
          pending.value = false
          resolve()
        }
      })
    })
    const sync = vi.fn()
    const currentRoute = ref({ path: '/admin/audits' })
    const navigateTo = vi.fn()

    vi.stubGlobal('useAuthUser', () => ({
      user: computed(() => user.value),
      pending: computed(() => pending.value),
      error: computed(() => error.value),
      status: computed(() => status.value),
      refresh,
    }))
    vi.stubGlobal('useAccountRole', () => ({ isAdmin: computed(() => user.value?.role === 'admin') }))
    vi.stubGlobal('useNuxtApp', () => ({ _route: { sync } }))
    vi.stubGlobal('useRouter', () => ({ currentRoute }))
    vi.stubGlobal('navigateTo', navigateTo)

    const states: AdminGateState[] = []
    let gate: AdminGate | undefined
    const Host = defineComponent({
      setup() {
        gate = useAdminGate()
        states.push(gate.state.value)
        return () => null
      },
    })
    const app = renderer.createApp(Host)
    app.mount({})
    return {
      app,
      status,
      user,
      pending,
      error,
      refresh,
      sync,
      currentRoute,
      navigateTo,
      states,
      gate: () => gate!,
      current: () => gate!.state.value,
      answer: (role: string) => settleRefresh?.({ role }),
      fail: (message = 'Failed to load user.') => settleRefresh?.({ error: message }),
    }
  }

  it('is resolving on the first frame even when the profile is already known', () => {
    const gate = mountGate({ role: 'admin' })
    // Setup ran before mount: the server render and the hydrating client frame
    // both see `resolving`, so their markup agrees.
    expect(gate.states[0]).toBe('resolving')
    expect(gate.current()).toBe('allowed')
    gate.app.unmount()
  })

  it('waits for the profile, then allows an administrator without navigating', async () => {
    const gate = mountGate({ pending: true })
    expect(gate.current()).toBe('resolving')

    gate.user.value = { role: 'admin' }
    gate.pending.value = false
    await nextTick()
    expect(gate.current()).toBe('allowed')
    expect(gate.navigateTo).not.toHaveBeenCalled()
    gate.app.unmount()
  })

  it('denies a member and sends them to the dashboard exactly once', async () => {
    const gate = mountGate({ pending: true })
    gate.user.value = { role: 'member' }
    gate.pending.value = false
    await nextTick()
    expect(gate.current()).toBe('denied')
    expect(gate.navigateTo).toHaveBeenCalledTimes(1)
    expect(gate.navigateTo).toHaveBeenCalledWith(ADMIN_GATE_DENIED_REDIRECT, { replace: true })

    // A session recheck flips the state through `resolving` and back: still one navigation.
    gate.status.value = 'loading'
    await nextTick()
    gate.status.value = 'authenticated'
    await nextTick()
    expect(gate.current()).toBe('denied')
    expect(gate.navigateTo).toHaveBeenCalledTimes(1)
    gate.app.unmount()
  })

  it('keeps an allowed page mounted through a background refetch, even a failed one', async () => {
    const gate = mountGate({ role: 'admin' })
    expect(gate.current()).toBe('allowed')
    // An unmigrated page's own useAuthUser() asks again on mount.
    gate.pending.value = true
    await nextTick()
    expect(gate.current()).toBe('allowed')
    gate.user.value = { role: 'admin' }
    gate.error.value = 'Failed to load user.'
    gate.pending.value = false
    await nextTick()
    expect(gate.current()).toBe('allowed')
    expect(gate.navigateTo).not.toHaveBeenCalled()
    gate.app.unmount()
  })

  it('stops at an error when the profile request fails, then a retry lets an administrator in', async () => {
    // app.vue's request is in flight when the layout mounts, then fails.
    const gate = mountGate({ pending: true })
    expect(gate.current()).toBe('resolving')
    gate.error.value = 'Failed to load user.'
    gate.pending.value = false
    await nextTick()
    expect(gate.current()).toBe('error')

    const retried = gate.gate().retry()
    await nextTick()
    expect(gate.refresh).toHaveBeenCalledTimes(1)
    // The error stays up while the retry runs: no skeleton flicker in between.
    expect(gate.current()).toBe('error')
    expect(gate.gate().retrying.value).toBe(true)

    gate.answer('admin')
    await retried
    await nextTick()
    expect(gate.current()).toBe('allowed')
    expect(gate.gate().retrying.value).toBe(false)
    expect(gate.navigateTo).not.toHaveBeenCalled()
    gate.app.unmount()
  })

  it('denies a member once a retry brings the profile', async () => {
    const gate = mountGate({ error: 'Failed to load user.' })
    expect(gate.current()).toBe('error')

    const retried = gate.gate().retry()
    gate.answer('member')
    await retried
    await nextTick()
    expect(gate.current()).toBe('denied')
    expect(gate.navigateTo).toHaveBeenCalledTimes(1)
    expect(gate.navigateTo).toHaveBeenCalledWith(ADMIN_GATE_DENIED_REDIRECT, { replace: true })
    gate.app.unmount()
  })

  it('returns to the error when a retry fails, and runs one retry at a time', async () => {
    const gate = mountGate({ error: 'Failed to load user.' })

    const first = gate.gate().retry()
    void gate.gate().retry()
    expect(gate.refresh).toHaveBeenCalledTimes(1)
    gate.fail()
    await first
    await nextTick()
    expect(gate.current()).toBe('error')
    expect(gate.gate().retrying.value).toBe(false)

    const second = gate.gate().retry()
    gate.answer('admin')
    await second
    await nextTick()
    expect(gate.refresh).toHaveBeenCalledTimes(2)
    expect(gate.current()).toBe('allowed')
    gate.app.unmount()
  })

  it('moves Nuxt\'s deferred route on while it holds the page back', async () => {
    // Arriving from a public page with no profile yet: nothing renders <NuxtPage>,
    // so the gate syncs the route app.vue reads to see a session is required.
    const gate = mountGate()
    expect(gate.current()).toBe('resolving')
    expect(gate.sync).toHaveBeenCalledTimes(1)

    gate.currentRoute.value = { path: '/admin/users' }
    await nextTick()
    expect(gate.sync).toHaveBeenCalledTimes(2)
    gate.app.unmount()
  })

  it('leaves the deferred route to the page once it is allowed', async () => {
    const gate = mountGate({ role: 'admin' })
    expect(gate.current()).toBe('allowed')
    gate.currentRoute.value = { path: '/admin/users' }
    await nextTick()
    expect(gate.sync).not.toHaveBeenCalled()
    gate.app.unmount()
  })
})
