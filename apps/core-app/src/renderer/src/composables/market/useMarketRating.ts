import { getTuffBaseUrl } from '@talex-touch/utils/env'
import { ref, watch, type Ref } from 'vue'
import { getAuthToken } from '~/modules/market/auth-token-service'

const NEXUS_URL = getTuffBaseUrl()

export interface MarketPluginRatingSummary {
  average: number
  count: number
}

interface RatingApiResponse {
  rating: MarketPluginRatingSummary
}

export function useMarketRating(slug: Ref<string | undefined>) {
  const loading = ref(false)
  const submitting = ref(false)
  const error = ref<string | null>(null)

  const average = ref<number | null>(null)
  const count = ref(0)
  const userRating = ref(0)

  async function load(): Promise<void> {
    const currentSlug = slug.value
    if (!currentSlug) {
      average.value = null
      count.value = 0
      userRating.value = 0
      return
    }

    loading.value = true
    error.value = null
    try {
      const response = await fetch(`${NEXUS_URL}/api/market/plugins/${currentSlug}/rating`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        error.value = `HTTP_ERROR_${response.status}`
        return
      }

      const data = await response.json() as RatingApiResponse
      average.value = data.rating.average
      count.value = data.rating.count
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
    }
    finally {
      loading.value = false
    }
  }

  async function submit(nextRating: number): Promise<void> {
    const currentSlug = slug.value
    if (!currentSlug) {
      return
    }

    const normalized = Math.round(nextRating)
    if (normalized < 1 || normalized > 5) {
      error.value = 'INVALID_RATING'
      return
    }

    submitting.value = true
    error.value = null

    try {
      const token = await getAuthToken()
      if (!token) {
        error.value = 'NOT_AUTHENTICATED'
        return
      }

      const response = await fetch(`${NEXUS_URL}/api/market/plugins/${currentSlug}/rating`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating: normalized }),
      })

      if (!response.ok) {
        if (response.status === 401) {
          error.value = 'UNAUTHORIZED'
        }
        else {
          error.value = `HTTP_ERROR_${response.status}`
        }
        return
      }

      const data = await response.json() as RatingApiResponse
      userRating.value = normalized
      average.value = data.rating.average
      count.value = data.rating.count
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'UNKNOWN_ERROR'
    }
    finally {
      submitting.value = false
    }
  }

  watch(slug, () => {
    void load()
  }, { immediate: true })

  return {
    loading,
    submitting,
    error,
    average,
    count,
    userRating,
    load,
    submit,
  }
}

