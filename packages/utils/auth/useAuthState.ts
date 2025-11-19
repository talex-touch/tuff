import type { ClerkAuthState, CurrentUser } from './clerk-types'
import { createGlobalState } from '@vueuse/core'
import { computed, shallowReactive } from 'vue'

export const useAuthState = createGlobalState(() => {
  const authState = shallowReactive<ClerkAuthState>({
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

    const { firstName, lastName, username, imageUrl } = authState.user
    let name = ''
    if (firstName || lastName) {
      name = [firstName, lastName].filter(Boolean).join(' ')
    }
    else {
      name = username || ''
    }

    const email = authState.user.emailAddresses?.[0]?.emailAddress || ''

    return {
      id: authState.user.id,
      name,
      email,
      avatar: imageUrl,
      provider: 'clerk',
    }
  })

  return { currentUser, authState }
}
