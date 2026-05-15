import { computed, ref, watch, type ComputedRef } from 'vue'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
import { fetchNexusWithAuth } from '~/modules/store/nexus-auth-client'
import { normalizeCreditSummary, type CreditSummary } from './credits-summary-normalizer'

export interface CreditSummaryState {
  summary: ComputedRef<CreditSummary | null>
  loading: ComputedRef<boolean>
  error: ComputedRef<string>
  isLoggedIn: ComputedRef<boolean>
  personalRemaining: ComputedRef<number>
  personalUsed: ComputedRef<number>
  personalQuota: ComputedRef<number>
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
const loading = ref(false)
const error = ref('')
let activeRequestId = 0

export function useCreditsSummary(): CreditSummaryState {
  const { isLoggedIn } = useAuth()
  const appSdk = useAppSdk()

  const summary = computed(() => rawSummary.value)
  const personalRemaining = computed(() => summary.value?.user.remaining ?? 0)
  const personalUsed = computed(() => summary.value?.user.used ?? 0)
  const personalQuota = computed(() => summary.value?.user.quota ?? 0)
  const teamRemaining = computed(() => summary.value?.team.remaining ?? 0)
  const teamUsed = computed(() => summary.value?.team.used ?? 0)
  const teamQuota = computed(() => summary.value?.team.quota ?? 0)

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
    },
    { immediate: true }
  )

  return {
    summary,
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    isLoggedIn,
    personalRemaining,
    personalUsed,
    personalQuota,
    teamRemaining,
    teamUsed,
    teamQuota,
    refresh,
    openCreditsDashboard
  }
}
