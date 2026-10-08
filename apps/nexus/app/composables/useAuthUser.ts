import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'

import { fetchCurrentUserProfile, type CurrentUserProfile } from '~/composables/useCurrentUserApi'

export interface AuthUserProfile extends CurrentUserProfile {}

interface AuthUserOptions {
  fetchOnAuth?: MaybeRefOrGetter<boolean>
  server?: boolean
}

export function useAuthUser(options: AuthUserOptions = {}) {
  const { status } = useNexusAuth()
  const userState = useState<AuthUserProfile | null>('auth-user', () => null)
  const pendingState = useState<boolean>('auth-user-pending', () => false)
  const errorState = useState<string | null>('auth-user-error', () => null)

  const isAuthenticated = computed(() => status.value === 'authenticated')
  const shouldFetchOnAuth = computed(() => options.fetchOnAuth === undefined || toValue(options.fetchOnAuth))

  /**
   * Every mount of this composable reads the profile, and `fetchCurrentUserProfile` answers those
   * reads from one shared request or a recent answer. `refresh` is for callers that just changed
   * something the profile shows (their role, linked accounts, passkeys) and must see it: it asks again.
   */
  const fetchUser = async (force = false) => {
    if (!isAuthenticated.value) {
      userState.value = null
      pendingState.value = false
      return
    }
    if (pendingState.value && !force)
      return

    pendingState.value = true
    errorState.value = null

    try {
      const data = await fetchCurrentUserProfile({ force })
      userState.value = data ?? null
    }
    catch (error: any) {
      errorState.value = error?.data?.statusMessage || error?.message || 'Failed to load user.'
      if (!userState.value)
        userState.value = null
    }
    finally {
      pendingState.value = false
    }
  }

  watch(
    () => [status.value, shouldFetchOnAuth.value] as const,
    ([value, shouldFetch]) => {
      if (import.meta.server && options.server === false)
        return

      if (value === 'authenticated' && shouldFetch) {
        void fetchUser()
      }
      else {
        if (value !== 'authenticated')
          userState.value = null
        pendingState.value = false
      }
    },
    { immediate: true },
  )

  return {
    user: computed(() => userState.value),
    pending: computed(() => pendingState.value),
    error: computed(() => errorState.value),
    refresh: () => fetchUser(true),
    status,
    isAuthenticated,
  }
}
