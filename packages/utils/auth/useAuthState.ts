import type { AuthState, CurrentUser } from './clerk-types'
import { createGlobalState } from '@vueuse/core'
import { computed, shallowReactive } from 'vue'

export const useAuthState = createGlobalState(() => {
  const authState = shallowReactive<AuthState>({
    isLoaded: false,
    isSignedIn: false,
    user: null,
    sessionId: null,
  })

  return { authState }
})

export function useCurrentUser() {
  const { authState } = useAuthState()

  const currentUser = computed((): CurrentUser | null => {
    if (!authState.isSignedIn || !authState.user) {
      return null
    }

    const name = authState.user.name || authState.user.email || ''
    const email = authState.user.email

    return {
      id: authState.user.id,
      name,
      email,
      avatar: authState.user.avatar || undefined,
      provider: 'nexus',
    }
  })

  return { currentUser, authState }
}
