import { computed, ref, shallowRef, watch, type ComputedRef } from 'vue'
import { isTimeoutLikeError, isTransportFailureError } from '@talex-touch/utils/network'
import { useAppSdk } from '@talex-touch/utils/renderer'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useAuth } from '~/modules/auth/useAuth'
import { useI18nText, type Translate } from '~/modules/lang/useI18nText'
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

/**
 * Why the last read failed, kept apart from its wording. The state outlives any one caller, so it
 * is worded when read: a language switch rewords an error that is already on screen.
 */
type CreditsError =
  | { reason: 'session-expired' | 'signed-out' | 'unavailable' }
  | { reason: 'http'; status: number; statusText: string }
  | { reason: 'thrown'; message: string }

function describeCreditsError(failure: CreditsError, t: Translate): string {
  switch (failure.reason) {
    case 'session-expired':
      return t('creditsSummary.errorSessionExpired')
    case 'signed-out':
      return t('creditsSummary.errorSignInRequired')
    case 'http':
      return t('creditsSummary.errorHttp', {
        status: failure.status,
        statusText: failure.statusText
      })
    case 'thrown':
      return failure.message
    case 'unavailable':
      return t('creditsSummary.errorFetch')
  }
}

function resolveCreditsError(status: number, statusText: string): CreditsError {
  if (status === 401 || status === 403) {
    return { reason: 'session-expired' }
  }
  return statusText ? { reason: 'http', status, statusText } : { reason: 'unavailable' }
}

function resolveCreditsRequestError(error: unknown): CreditsError {
  if (isTimeoutLikeError(error) || isTransportFailureError(error)) {
    return { reason: 'unavailable' }
  }
  if (
    error instanceof Error &&
    /NETWORK_COOLDOWN_ACTIVE|Network guard cooldown active/i.test(error.message)
  ) {
    return { reason: 'unavailable' }
  }
  return error instanceof Error && error.message
    ? { reason: 'thrown', message: error.message }
    : { reason: 'unavailable' }
}

const rawSummary = ref<CreditSummary | null>(null)
const loading = ref(false)
const error = shallowRef<CreditsError | null>(null)
let activeRequestId = 0
let lastFetchedAt = 0
let inFlightPromise: Promise<void> | null = null
let authWatchInitialized = false

const CREDITS_SUMMARY_CACHE_TTL_MS = 15_000
export function useCreditsSummary(): CreditSummaryState {
  const { isLoggedIn } = useAuth()
  const appSdk = useAppSdk()
  const { t } = useI18nText()

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
      error.value = null
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
    error.value = null

    inFlightPromise = (async () => {
      try {
        const response = await fetchNexusWithAuth('/api/credits/summary', {}, 'credits-summary')
        if (requestId !== activeRequestId) return
        if (!response) {
          rawSummary.value = null
          error.value = { reason: 'signed-out' }
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
        error.value = null
        lastFetchedAt = 0
      },
      { immediate: true }
    )
  }

  return {
    summary,
    loading: computed(() => loading.value),
    error: computed(() => (error.value ? describeCreditsError(error.value, t) : '')),
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
