import { computed, ref } from 'vue'
import { consoleApi } from '@/api/endpoints'
import { ApiError, resolveErrorMessage } from '@/api/http'
import type { AuthUser } from '@/api/types'
import { setConsoleLocale } from '@/i18n'

const user = ref<AuthUser | null>(null)
const loaded = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)
let inflight: Promise<AuthUser | null> | null = null

export function resetSessionForTest() {
  user.value = null
  loaded.value = false
  loading.value = false
  error.value = null
  inflight = null
}

export function setSessionUserForTest(next: AuthUser | null) {
  user.value = next
  loaded.value = true
  loading.value = false
  error.value = null
}

export function useSession() {
  const isAuthenticated = computed(() => Boolean(user.value?.id))
  const isAdmin = computed(() => user.value?.role?.toLowerCase() === 'admin')

  async function refresh(): Promise<AuthUser | null> {
    if (inflight)
      return inflight

    loading.value = true
    error.value = null
    inflight = (async () => {
      try {
        const me = await consoleApi.getMe()
        user.value = me
        loaded.value = true
        if (me?.locale === 'en' || me?.locale === 'zh')
          setConsoleLocale(me.locale)
        return me
      }
      catch (cause) {
        if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
          user.value = null
          loaded.value = true
          return null
        }
        error.value = resolveErrorMessage(cause, 'Unable to verify session.')
        return user.value
      }
      finally {
        loading.value = false
        inflight = null
      }
    })()

    return inflight
  }

  async function ensureLoaded(): Promise<AuthUser | null> {
    if (loaded.value)
      return user.value
    return refresh()
  }

  async function signOut(): Promise<void> {
    try {
      await consoleApi.signOut()
    }
    catch {
      // Clear local session state even if cookie was already invalidated.
    }
    finally {
      user.value = null
      loaded.value = true
      error.value = null
    }
  }

  return {
    user,
    loaded,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    refresh,
    ensureLoaded,
    signOut,
  }
}
