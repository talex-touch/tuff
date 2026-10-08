import { computed, onMounted, readonly, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'

/**
 * - `resolving`: not mounted yet, the session is still loading, or the signed-in
 *   account's profile is on its way. The layout draws a skeleton.
 * - `allowed`: an administrator. The page mounts.
 * - `denied`: signed in, not an administrator. The page never mounts, so it never
 *   sends a request that could only answer 403.
 * - `error`: signed in, but the profile request failed and nothing is asking again,
 *   so the role is unknown. The layout offers a retry instead of a skeleton that
 *   would never end.
 */
export type AdminGateState = 'resolving' | 'allowed' | 'denied' | 'error'

export interface AdminGateInput {
  mounted: boolean
  status: string
  hasUser: boolean
  isAdmin: boolean
  /** The last profile request failed and no other is running (or a retry of it is). */
  profileFailed: boolean
}

export const ADMIN_GATE_DENIED_REDIRECT = '/dashboard/overview'

export function resolveAdminGateState(input: AdminGateInput): AdminGateState {
  // The server and the first client frame have no profile: both render the
  // skeleton, so hydration agrees (the same reason `AdminNav` waits for mount).
  if (!input.mounted || input.status !== 'authenticated')
    return 'resolving'
  // A known account decides, whatever a later request is doing: a background
  // refetch, or one that failed, never tears down a page that is already open.
  if (input.hasUser)
    return input.isAdmin ? 'allowed' : 'denied'
  return input.profileFailed ? 'error' : 'resolving'
}

export interface AdminGate {
  state: ComputedRef<AdminGateState>
  /** The `error` state's retry is running. */
  retrying: Readonly<Ref<boolean>>
  /** Asks for the profile again: the `error` state's action. */
  retry: () => Promise<void>
}

/**
 * The administrator gate, owned by `layouts/admin.vue` for every console page.
 *
 * The profile comes through `useAuthUser()`, the same shared `auth-user` state
 * `app.vue` fills for every `requiresAuth` route: on a cold landing `app.vue`'s
 * request is already in flight when the layout sets up, so ours is skipped as a
 * duplicate; on the way in from a dashboard page the role comes from the profile
 * read in the last 30 seconds, or is read again (`fetchCurrentUserProfile`). Its
 * `refresh` is the retry. Signed-out visitors are `app.vue`'s to send to sign-in;
 * this stays `resolving` for them.
 */
export function useAdminGate(): AdminGate {
  const { user, pending, error, status, refresh } = useAuthUser({ server: false })
  const { isAdmin } = useAccountRole()
  const nuxtApp = useNuxtApp()
  const router = useRouter()
  const mounted = ref(false)
  const retrying = ref(false)

  const state = computed(() => resolveAdminGateState({
    mounted: mounted.value,
    status: status.value,
    hasUser: Boolean(user.value),
    isAdmin: isAdmin.value,
    // The failed state holds while its retry runs, so the error does not flick
    // to a skeleton and back when the retry fails again at once.
    profileFailed: retrying.value || (Boolean(error.value) && !pending.value),
  }))

  /**
   * While the gate holds the page back nothing renders `<NuxtPage>`, and it is
   * `<NuxtPage>` that moves Nuxt's deferred route (`useRoute()` outside a page)
   * onto a new route once the page resolves. `app.vue` reads that route to know
   * a route needs a session. Arriving from a public page — the redirect after
   * signing in, Back after signing out — it would still describe that page, so
   * `app.vue` would neither fetch the profile nor send a signed-out visitor to
   * sign-in, and this skeleton would never end. So the gate does the sync the page
   * would have done.
   */
  function releaseDeferredRoute() {
    if (state.value === 'resolving' || state.value === 'error')
      nuxtApp._route.sync?.()
  }

  onMounted(() => {
    mounted.value = true
    releaseDeferredRoute()
  })

  watch(() => router.currentRoute.value, () => {
    if (mounted.value)
      releaseDeferredRoute()
  })

  let redirected = false
  watch(state, (value) => {
    if (value !== 'denied' || redirected)
      return
    redirected = true
    void navigateTo(ADMIN_GATE_DENIED_REDIRECT, { replace: true })
  }, { immediate: true })

  async function retry() {
    if (retrying.value)
      return
    retrying.value = true
    try {
      await refresh()
    }
    finally {
      retrying.value = false
    }
  }

  return { state, retrying: readonly(retrying), retry }
}
