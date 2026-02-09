import { computed, watch } from 'vue'

import { fetchCurrentUserProfile, type CurrentUserProfile } from '~/composables/useCurrentUserApi'

export interface AuthUserProfile extends CurrentUserProfile {}

export function useAuthUser() {
  const { status } = useAuth()
  const userState = useState<AuthUserProfile | null>('auth-user', () => null)
  const pendingState = useState<boolean>('auth-user-pending', () => false)
  const errorState = useState<string | null>('auth-user-error', () => null)

  const isAuthenticated = computed(() => status.value === 'authenticated')

  const fetchUser = async () => {
    if (!isAuthenticated.value) {
      userState.value = null
      pendingState.value = false
      return
    }
    if (pendingState.value)
      return

    pendingState.value = true
    errorState.value = null

    try {
      const data = await fetchCurrentUserProfile()
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
    () => status.value,
    (value) => {
      if (value === 'authenticated') {
        void fetchUser()
      }
      else {
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
    refresh: fetchUser,
    status,
    isAuthenticated,
  }
}
