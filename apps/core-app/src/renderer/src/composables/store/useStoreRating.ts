import type { Ref } from 'vue'
import { useNetworkSdk } from '@talex-touch/utils/renderer'
import { ref, watch } from 'vue'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { fetchNexusWithAuth } from '~/modules/store/nexus-auth-client'
import { normalizeStoreRatingError } from './store-rating-error-utils'

export interface StorePluginRatingSummary {
  average: number
  count: number
}

interface RatingApiResponse {
  rating: StorePluginRatingSummary
}

export function useStoreRating(slug: Ref<string | undefined>) {
  const networkSdk = useNetworkSdk()
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
      const baseUrl = getAuthBaseUrl()
      const response = await networkSdk.request<RatingApiResponse>({
        method: 'GET',
        url: `${baseUrl}/api/store/plugins/${currentSlug}/rating`,
        headers: { Accept: 'application/json' },
        validateStatus: Array.from({ length: 500 }, (_, index) => index + 100)
      })

      if (response.status < 200 || response.status >= 300) {
        error.value = `HTTP_ERROR_${response.status}`
        return
      }

      const data = response.data
      average.value = data.rating.average
      count.value = data.rating.count
    } catch (err) {
      error.value = normalizeStoreRatingError(err)
    } finally {
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
      const response = await fetchNexusWithAuth(
        `/api/store/plugins/${currentSlug}/rating`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ rating: normalized })
        },
        `store-rating:${currentSlug}`
      )

      if (!response) {
        error.value = 'NOT_AUTHENTICATED'
        return
      }
      if (!response.ok) {
        if (response.status === 401) {
          error.value = 'UNAUTHORIZED'
        } else {
          error.value = `HTTP_ERROR_${response.status}`
        }
        return
      }

      const data = (await response.json()) as RatingApiResponse
      userRating.value = normalized
      average.value = data.rating.average
      count.value = data.rating.count
    } catch (err) {
      error.value = normalizeStoreRatingError(err)
    } finally {
      submitting.value = false
    }
  }

  watch(
    slug,
    () => {
      void load()
    },
    { immediate: true }
  )

  return {
    loading,
    submitting,
    error,
    average,
    count,
    userRating,
    load,
    submit
  }
}
