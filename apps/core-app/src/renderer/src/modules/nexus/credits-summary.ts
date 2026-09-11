import { computed, ref, watch, type ComputedRef } from 'vue'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
import { fetchNexusWithAuth } from '~/modules/store/nexus-auth-client'
import {
  normalizeCreditPricing,
  normalizeCreditSummary,
  type CreditPricingEntry,
  type CreditSummary
} from './credits-summary-normalizer'

export interface CreditSummaryState {
  summary: ComputedRef<CreditSummary | null>
  pricing: ComputedRef<CreditPricingEntry[]>
  loading: ComputedRef<boolean>
  error: ComputedRef<string>
  isLoggedIn: ComputedRef<boolean>
  personalRemaining: ComputedRef<number>
  personalUsed: ComputedRef<number>
  personalQuota: ComputedRef<number>
  hasTeamPool: ComputedRef<boolean>
  teamRemaining: ComputedRef<number>
  teamUsed: ComputedRef<number>
  teamQuota: ComputedRef<number>
  refresh: () => Promise<void>
  openCreditsDashboard: () => void
}

function resolveCreditsError(status: number, statusText: string): string {
  if (status === 401 || status === 403) {
    return '登录状态已失效，请重新登录后刷新。'
  }
  return statusText ? `Credits 信息获取失败：${status} ${statusText}` : 'Credits 信息获取失败。'
}

const rawSummary = ref<CreditSummary | null>(null)
const pricing = ref<CreditPricingEntry[]>([])
const loading = ref(false)
const error = ref('')
let activeRequestId = 0

/**
 * The published price list is fetched alongside the balance so a user never has to
 * guess what a capability costs: the balance alone says how much is left, not what
 * spending it buys.
 */
async function refreshPricing(requestId: number): Promise<void> {
  try {
    const response = await fetchNexusWithAuth('/api/credits/pricing', {}, 'credits-pricing')
    if (requestId !== activeRequestId || !response?.ok) return
    pricing.value = normalizeCreditPricing(await response.json())
  } catch {
    // A missing price list must never block the balance itself.
  }
}

export function useCreditsSummary(): CreditSummaryState {
  const { isLoggedIn } = useAuth()
  const appSdk = useAppSdk()

  const summary = computed(() => rawSummary.value)
  const personalRemaining = computed(() => summary.value?.user.remaining ?? 0)
  const personalUsed = computed(() => summary.value?.user.used ?? 0)
  const personalQuota = computed(() => summary.value?.user.quota ?? 0)
  const hasTeamPool = computed(
    () =>
      summary.value?.teamContext?.type === 'organization' &&
      summary.value?.teamContext?.hasTeamPool !== false
  )
  const teamRemaining = computed(() =>
    hasTeamPool.value ? (summary.value?.team.remaining ?? 0) : 0
  )
  const teamUsed = computed(() => (hasTeamPool.value ? (summary.value?.team.used ?? 0) : 0))
  const teamQuota = computed(() => (hasTeamPool.value ? (summary.value?.team.quota ?? 0) : 0))

  async function refresh() {
    if (!isLoggedIn.value) {
      rawSummary.value = null
      error.value = ''
      return
    }

    const requestId = ++activeRequestId
    loading.value = true
    error.value = ''

    try {
      const response = await fetchNexusWithAuth('/api/credits/summary', {}, 'credits-summary')
      if (requestId !== activeRequestId) return
      if (!response) {
        rawSummary.value = null
        error.value = '登录后才能获取 AI 积分信息。'
        return
      }
      if (!response.ok) {
        rawSummary.value = null
        error.value = resolveCreditsError(response.status, response.statusText)
        return
      }
      rawSummary.value = normalizeCreditSummary(await response.json())
      void refreshPricing(requestId)
    } catch (err) {
      if (requestId !== activeRequestId) return
      rawSummary.value = null
      error.value = err instanceof Error && err.message ? err.message : 'Credits 信息获取失败。'
    } finally {
      if (requestId === activeRequestId) {
        loading.value = false
      }
    }
  }

  function openCreditsDashboard() {
    const baseUrl = getAuthBaseUrl().replace(/\/$/, '')
    void appSdk.openExternal(`${baseUrl}/dashboard/credits`)
  }

  watch(
    isLoggedIn,
    (signedIn) => {
      if (signedIn) {
        void refresh()
        return
      }
      rawSummary.value = null
      error.value = ''
      pricing.value = []
    },
    { immediate: true }
  )

  return {
    summary,
    pricing: computed(() => pricing.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    isLoggedIn,
    personalRemaining,
    personalUsed,
    personalQuota,
    hasTeamPool,
    teamRemaining,
    teamUsed,
    teamQuota,
    refresh,
    openCreditsDashboard
  }
}
