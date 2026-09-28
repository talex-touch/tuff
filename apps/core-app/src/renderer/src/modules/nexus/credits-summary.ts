import { computed, ref, watch, type ComputedRef } from 'vue'
import { isTimeoutLikeError, isTransportFailureError } from '@talex-touch/utils/network'
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
  hasTeamPool: ComputedRef<boolean>
  teamRemaining: ComputedRef<number>
  teamUsed: ComputedRef<number>
  teamQuota: ComputedRef<number>
  refresh: (options?: { force?: boolean }) => Promise<void>
  openCreditsDashboard: () => void
}

export interface RefreshCreditsOptions {
  force?: boolean
}

function resolveCreditsError(status: number, statusText: string): string {
  if (status === 401 || status === 403) {
    return '登录状态已失效，请重新登录后刷新。'
  }
  return statusText ? `Credits 信息获取失败：${status} ${statusText}` : 'Credits 信息获取失败。'
}

function resolveCreditsRequestError(error: unknown): string {
  if (isTimeoutLikeError(error) || isTransportFailureError(error)) {
    return 'Credits 信息获取失败。'
  }
  if (
    error instanceof Error &&
    /NETWORK_COOLDOWN_ACTIVE|Network guard cooldown active/i.test(error.message)
  ) {
    return 'Credits 信息获取失败。'
  }
  return error instanceof Error && error.message ? error.message : 'Credits 信息获取失败。'
}

const rawSummary = ref<CreditSummary | null>(null)
const loading = ref(false)
const error = ref('')
let activeRequestId = 0
let lastFetchedAt = 0
let inFlightPromise: Promise<void> | null = null
let authWatchInitialized = false

const CREDITS_SUMMARY_CACHE_TTL_MS = 15_000
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

  async function refresh(options: RefreshCreditsOptions = { force: true }): Promise<void> {
    if (!isLoggedIn.value) {
      rawSummary.value = null
      error.value = ''
      lastFetchedAt = 0
      return
    }

    // 1. 如果已有相同请求在进行中，聚合复用该 in-flight promise，避免并发重复打远端
    if (inFlightPromise) {
      return inFlightPromise
    }

    // 2. 非强制刷新且在缓存有效时间内，直接复用当前缓存
    const isForce = options.force ?? true
    if (
      !isForce &&
      rawSummary.value !== null &&
      Date.now() - lastFetchedAt < CREDITS_SUMMARY_CACHE_TTL_MS
    ) {
      return
    }

    const requestId = ++activeRequestId
    loading.value = true
    error.value = ''

    inFlightPromise = (async () => {
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
        lastFetchedAt = Date.now()
      } catch (err) {
        if (requestId !== activeRequestId) return
        rawSummary.value = null
        error.value = resolveCreditsRequestError(err)
      } finally {
        if (requestId === activeRequestId) {
          loading.value = false
        }
        inFlightPromise = null
      }
    })()

    return inFlightPromise
  }

  function openCreditsDashboard() {
    const baseUrl = getAuthBaseUrl().replace(/\/$/, '')
    void appSdk.openExternal(`${baseUrl}/dashboard/credits`)
  }

  if (!authWatchInitialized) {
    authWatchInitialized = true
    watch(
      isLoggedIn,
      (signedIn) => {
        if (signedIn) {
          void refresh({ force: false })
          return
        }
        rawSummary.value = null
        error.value = ''
        lastFetchedAt = 0
      },
      { immediate: true }
    )
  }

  return {
    summary,
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
