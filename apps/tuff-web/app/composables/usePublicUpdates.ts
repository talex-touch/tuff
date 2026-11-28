import type { DashboardUpdate, PublicUpdatesPayload } from '~/utils/public-updates'
import { computed } from 'vue'
import { requestJson } from '~/utils/request'

const PUBLIC_UPDATES_DATA_KEY = 'tuff-web-public-updates'

/**
 * Lightweight client-side Edge Data Island for `GET /api/updates`:
 * - `server: false` + `lazy: true` keeps `/updates` 100% pure SSG with zero build-time API dependency.
 * - Exposes `showSkeleton` (`pending || status === 'idle'`) so SSR and hydrating client render the
 *   exact same skeleton geometry until `/api/updates` settles (zero hydration mismatch!).
 */
export function usePublicUpdates() {
  const { data, pending, status, error, refresh } = useAsyncData<PublicUpdatesPayload>(
    PUBLIC_UPDATES_DATA_KEY,
    () => requestJson<PublicUpdatesPayload>('/api/updates').catch(() => ({ updates: [] })),
    {
      server: false,
      lazy: true,
      default: () => ({ updates: [] }),
    },
  )

  const updateItems = computed<DashboardUpdate[]>(() => data.value?.updates ?? [])
  const showSkeleton = computed(() => pending.value || status.value === 'idle')

  return {
    updatesPayload: data,
    updateItems,
    pending,
    showSkeleton,
    error,
    refreshUpdates: refresh,
  }
}
