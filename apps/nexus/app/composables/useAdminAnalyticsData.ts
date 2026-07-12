import { ref } from 'vue'
import type { DocAnalyticsResponse } from '~/types/docs-engagement'
import type {
  AnalyticsData,
  ExchangeRateHistoryItem,
  ExchangeRateSnapshotSummary,
  GeoAnalyticsData,
  IntelligenceAnalyticsData,
  TelemetryMessage,
} from '~/types/admin-analytics'
import { requestJson as defaultRequestJson } from '~/utils/request'

type AnalyticsRequest = typeof defaultRequestJson

interface AdminAnalyticsDataOptions {
  request?: AnalyticsRequest
}

function errorMessage(cause: unknown, fallback: string): string {
  if (typeof cause === 'object' && cause !== null) {
    const data = 'data' in cause ? cause.data : undefined
    if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string')
      return data.message
    if ('message' in cause && typeof cause.message === 'string')
      return cause.message
  }
  return fallback
}

export function useAdminAnalyticsData(options: AdminAnalyticsDataOptions = {}) {
  const request = options.request ?? defaultRequestJson
  const analytics = ref<AnalyticsData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const geoAnalytics = ref<GeoAnalyticsData | null>(null)
  const geoLoading = ref(false)
  const geoError = ref<string | null>(null)
  const messages = ref<TelemetryMessage[]>([])
  const messagesLoading = ref(false)
  const messagesError = ref<string | null>(null)
  const docsAnalytics = ref<DocAnalyticsResponse | null>(null)
  const docsLoading = ref(false)
  const docsError = ref<string | null>(null)
  const intelligenceAnalytics = ref<IntelligenceAnalyticsData | null>(null)
  const intelligenceLoading = ref(false)
  const intelligenceError = ref<string | null>(null)
  const exchangeHistory = ref<ExchangeRateHistoryItem[]>([])
  const exchangeSnapshots = ref<ExchangeRateSnapshotSummary[]>([])
  const exchangeLoading = ref(false)
  const exchangeError = ref<string | null>(null)

  async function fetchAnalytics(days: number): Promise<void> {
    loading.value = true
    error.value = null
    try {
      analytics.value = await request<AnalyticsData>(`/api/admin/analytics?days=${days}`)
    }
    catch (cause) {
      error.value = errorMessage(cause, 'Failed to load analytics')
    }
    finally {
      loading.value = false
    }
  }

  async function fetchGeoAnalytics(days: number, country: string | null): Promise<void> {
    geoLoading.value = true
    geoError.value = null
    try {
      geoAnalytics.value = await request<GeoAnalyticsData>('/api/admin/analytics/geo', {
        query: { days, country: country || undefined, limit: 240 },
      })
    }
    catch (cause) {
      geoError.value = errorMessage(cause, 'Failed to load geo analytics')
    }
    finally {
      geoLoading.value = false
    }
  }

  async function fetchDocsAnalytics(days: number, path: string, source: 'all' | 'docs_page' | 'doc_comments_admin'): Promise<void> {
    docsLoading.value = true
    docsError.value = null
    try {
      docsAnalytics.value = await request<DocAnalyticsResponse>('/api/admin/analytics/docs', {
        query: { days, path: path.trim() || undefined, source: source === 'all' ? undefined : source },
      })
    }
    catch (cause) {
      docsError.value = errorMessage(cause, 'Failed to load docs analytics')
      docsAnalytics.value = null
    }
    finally {
      docsLoading.value = false
    }
  }

  async function fetchIntelligenceAnalytics(days: number): Promise<void> {
    intelligenceLoading.value = true
    intelligenceError.value = null
    try {
      intelligenceAnalytics.value = await request<IntelligenceAnalyticsData>('/api/admin/analytics/intelligence', { query: { days } })
    }
    catch (cause) {
      intelligenceError.value = errorMessage(cause, 'Failed to load intelligence analytics')
      intelligenceAnalytics.value = null
    }
    finally {
      intelligenceLoading.value = false
    }
  }

  async function fetchMessages(): Promise<void> {
    messagesLoading.value = true
    messagesError.value = null
    try {
      const response = await request<{ messages: TelemetryMessage[] }>('/api/telemetry/messages?limit=12')
      messages.value = response.messages ?? []
    }
    catch (cause) {
      messagesError.value = errorMessage(cause, 'Failed to load messages')
      messages.value = []
    }
    finally {
      messagesLoading.value = false
    }
  }

  async function fetchExchangeHistory(view: 'history' | 'snapshots', target: string, limit: number, includePayload: boolean): Promise<void> {
    exchangeLoading.value = true
    exchangeError.value = null
    try {
      if (view === 'history') {
        const normalizedTarget = target.trim().toUpperCase()
        if (!/^[A-Z]{3}$/.test(normalizedTarget))
          throw new Error('Invalid target currency code.')
        const response = await request<{ items?: ExchangeRateHistoryItem[] }>('/api/exchange/history', {
          query: { target: normalizedTarget, limit },
        })
        exchangeHistory.value = response.items ?? []
        exchangeSnapshots.value = []
      }
      else {
        const response = await request<{ items?: ExchangeRateSnapshotSummary[] }>('/api/exchange/history', {
          query: { limit, includePayload: includePayload ? 'true' : undefined },
        })
        exchangeSnapshots.value = response.items ?? []
        exchangeHistory.value = []
      }
    }
    catch (cause) {
      exchangeError.value = errorMessage(cause, 'Failed to load exchange history')
      exchangeHistory.value = []
      exchangeSnapshots.value = []
    }
    finally {
      exchangeLoading.value = false
    }
  }

  return {
    analytics,
    loading,
    error,
    geoAnalytics,
    geoLoading,
    geoError,
    messages,
    messagesLoading,
    messagesError,
    docsAnalytics,
    docsLoading,
    docsError,
    intelligenceAnalytics,
    intelligenceLoading,
    intelligenceError,
    exchangeHistory,
    exchangeSnapshots,
    exchangeLoading,
    exchangeError,
    fetchAnalytics,
    fetchGeoAnalytics,
    fetchDocsAnalytics,
    fetchIntelligenceAnalytics,
    fetchMessages,
    fetchExchangeHistory,
  }
}
