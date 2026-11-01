import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '~/modules/auth/useAuth'
import { fetchNexusWithAuth } from '~/modules/store/nexus-auth-client'
import { describeFailure, failureMessage } from '~/utils/failure-text'

interface SubscriptionStatus {
  plan: string
  expiresAt: string | null
  activatedAt: string | null
  isActive?: boolean
  status?: string | null
  features: {
    aiRequests: { limit: number; used: number }
    aiTokens: { limit: number; used: number }
    customModels: boolean
    prioritySupport: boolean
    apiAccess: boolean
  }
  team?: TeamSummary
}

interface TeamSummary {
  id: string
  name: string
  type: 'personal' | 'organization'
  role: 'owner' | 'admin' | 'member'
  collaborationEnabled: boolean
  seats: { total: number; used: number }
  permissions: {
    canInvite: boolean
    canManageMembers: boolean
    canDisband: boolean
    canCreateTeam: boolean
  }
  upgrade: {
    required: boolean
    targetPlan: 'TEAM' | null
  }
  manageUrl?: string
}

export function useAccountOverview() {
  const { t } = useI18n()
  const { isLoggedIn } = useAuth()
  const profileVisible = ref(false)
  const accountLoading = ref(false)
  const accountLoaded = ref(false)
  /**
   * The last load's failure as it came, kept so its words follow the interface language; null when
   * the load did not fail.
   */
  const accountFailure = ref<string | null>(null)
  const subscriptionStatus = ref<SubscriptionStatus | null>(null)
  const teamSummary = ref<TeamSummary | null>(null)
  const deviceCount = ref<number | null>(null)
  const lastFetchedAt = ref(0)

  function resetAccountSnapshot() {
    accountLoaded.value = false
    accountFailure.value = null
    subscriptionStatus.value = null
    teamSummary.value = null
    deviceCount.value = null
    lastFetchedAt.value = 0
  }

  async function fetchNexusJson<T>(path: string): Promise<T> {
    const response = await fetchNexusWithAuth(path, {}, `user-profile:${path}`)
    if (!response) {
      throw new Error('NOT_AUTHENTICATED')
    }
    if (!response.ok) {
      throw new Error(`HTTP_ERROR_${response.status}`)
    }
    return response.json() as Promise<T>
  }

  async function loadDeviceSummary() {
    try {
      const devices = await fetchNexusJson<Array<{ id: string }>>('/api/devices')
      deviceCount.value = Array.isArray(devices) ? devices.length : 0
    } catch {
      deviceCount.value = null
    }
  }

  async function loadAccountOverview() {
    if (!isLoggedIn.value || accountLoading.value) {
      return
    }
    const now = Date.now()
    if (accountLoaded.value && now - lastFetchedAt.value < 60000) {
      return
    }
    accountLoading.value = true
    accountFailure.value = null
    try {
      const subscription = await fetchNexusJson<SubscriptionStatus>('/api/subscription/status')
      subscriptionStatus.value = subscription
      teamSummary.value = subscription.team || null

      await loadDeviceSummary()
      accountLoaded.value = true
      lastFetchedAt.value = now
    } catch (error) {
      accountFailure.value = failureMessage(error)
    } finally {
      accountLoading.value = false
    }
  }

  /**
   * Not being signed in reads as such; any other failure follows the plain sentence, as a status
   * Nexus answered with or the request's own failure.
   */
  const accountError = computed(() => {
    const failure = accountFailure.value
    if (failure === null) return ''
    if (failure === 'NOT_AUTHENTICATED' || failure === 'HTTP_ERROR_401') {
      return t('userProfile.authRequired')
    }
    const status = /^HTTP_ERROR_(\d{3})$/.exec(failure)?.[1]
    const reason = status
      ? t('common.failures.httpStatus', { status })
      : describeFailure(failure, t, '')
    return reason ? t('userProfile.loadFailedReason', { reason }) : t('userProfile.loadFailed')
  })

  function openAccountOverview() {
    if (!isLoggedIn.value) {
      return
    }
    profileVisible.value = true
  }

  watch(profileVisible, (visible) => {
    if (visible) {
      void loadAccountOverview()
    }
  })

  watch(isLoggedIn, (loggedIn) => {
    if (!loggedIn) {
      resetAccountSnapshot()
      profileVisible.value = false
    }
  })

  return {
    profileVisible,
    accountLoading,
    accountError,
    subscriptionStatus,
    teamSummary,
    deviceCount,
    openAccountOverview
  }
}
