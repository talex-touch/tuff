import type { PublicUpdatesPayload } from '~/utils/public-updates'
import { computed, onMounted } from 'vue'
import { hydratePrerenderedUpdates, resolvePublicUpdatesFromApp } from '~/utils/public-updates'
import { requestJson } from '~/utils/request'

const PUBLIC_UPDATES_DATA_KEY = 'public-updates'
const PUBLIC_UPDATES_LIVE_STATE_KEY = 'public-updates-live-loaded'

export async function usePublicUpdates() {
  const nuxtApp = useNuxtApp()
  const liveLoaded = useState(PUBLIC_UPDATES_LIVE_STATE_KEY, () => false)

  const asyncData = useAsyncData(
    PUBLIC_UPDATES_DATA_KEY,
    async () => {
      const payload = await requestJson<PublicUpdatesPayload>('/api/updates')
      if (import.meta.client)
        liveLoaded.value = true
      return payload
    },
    {
      getCachedData: (key, app, ctx) =>
        resolvePublicUpdatesFromApp(app, key, liveLoaded.value, ctx?.cause),
    },
  )

  if (import.meta.client) {
    // Register mount hook before awaiting asyncData so Vue's active instance is preserved.
    onMounted(async () => {
      await hydratePrerenderedUpdates({
        payload: asyncData.data.value,
        prerenderedAt: nuxtApp.payload.prerenderedAt,
        liveLoaded: liveLoaded.value,
        refresh: asyncData.refresh,
        markLiveLoaded: () => {
          if (!asyncData.error.value)
            liveLoaded.value = true
        },
      })
    })
  }

  const { data: updatesPayload, refresh: refreshUpdates } = await asyncData

  const updateItems = computed(() => updatesPayload.value?.updates ?? [])

  return {
    updatesPayload,
    updateItems,
    refreshUpdates,
  }
}
