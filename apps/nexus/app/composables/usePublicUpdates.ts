import type { PublicUpdatesPayload } from '~/utils/public-updates'
import { computed, onMounted, shallowRef, watch } from 'vue'
import {
  hydratePrerenderedUpdates,
  markLivePublicUpdatesPayload,
  resolvePublicUpdatesFromApp,
} from '~/utils/public-updates'
import { requestJson } from '~/utils/request'

const PUBLIC_UPDATES_DATA_KEY = 'public-updates'

function fetchPublicUpdates() {
  return requestJson<PublicUpdatesPayload>('/api/updates')
}

function transformPublicUpdatesPayload(payload: PublicUpdatesPayload): PublicUpdatesPayload {
  // Only mark responses when Nuxt commits transform (never for superseded in-flight calls).
  return import.meta.client ? markLivePublicUpdatesPayload(payload) : payload
}

export async function usePublicUpdates() {
  const nuxtApp = useNuxtApp()

  const asyncData = useAsyncData(
    PUBLIC_UPDATES_DATA_KEY,
    fetchPublicUpdates,
    {
      transform: transformPublicUpdatesPayload,
      getCachedData: (key, app, ctx) =>
        resolvePublicUpdatesFromApp(app, key, ctx?.cause),
    },
  )

  const lastValidPayload = shallowRef<PublicUpdatesPayload | null>(
    asyncData.data.value
    ?? (nuxtApp.payload.data[PUBLIC_UPDATES_DATA_KEY] as PublicUpdatesPayload | undefined)
    ?? null,
  )

  // Register reactive hooks before awaiting asyncData so Vue's active instance is preserved.
  watch(
    [asyncData.data, asyncData.error],
    ([next, err]) => {
      if (next && !err)
        lastValidPayload.value = next
    },
    { immediate: true },
  )

  if (import.meta.client) {
    onMounted(async () => {
      await hydratePrerenderedUpdates({
        payload: asyncData.data.value,
        prerenderedAt: nuxtApp.payload.prerenderedAt,
        serverRendered: Boolean(nuxtApp.payload.serverRendered),
        refresh: asyncData.refresh,
      })
    })
  }

  const { data: updatesPayload, refresh: refreshUpdates } = await asyncData
  const displayedUpdatesPayload = computed(() => updatesPayload.value ?? lastValidPayload.value)
  const updateItems = computed(() => displayedUpdatesPayload.value?.updates ?? [])

  return {
    updatesPayload: displayedUpdatesPayload,
    updateItems,
    refreshUpdates,
  }
}
