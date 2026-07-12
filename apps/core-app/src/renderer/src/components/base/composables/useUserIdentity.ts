import { computed } from 'vue'
import { useAuth } from '~/modules/auth/useAuth'

export function useUserIdentity() {
  const { isLoggedIn, user, getDisplayName, getPrimaryEmail, getUserBio } = useAuth()

  const displayName = computed(() => getDisplayName())
  const displayEmail = computed(() => getPrimaryEmail())
  const profileBio = computed(() => getUserBio())
  const displayId = computed(() => user.value?.id || '')
  const avatarUrl = computed(() => user.value?.avatar || '')
  const displayInitial = computed(() => {
    const seed = displayName.value || displayEmail.value
    return seed ? seed.trim().charAt(0).toUpperCase() : '?'
  })

  return {
    isLoggedIn,
    user,
    displayName,
    displayEmail,
    profileBio,
    displayId,
    avatarUrl,
    displayInitial
  }
}
