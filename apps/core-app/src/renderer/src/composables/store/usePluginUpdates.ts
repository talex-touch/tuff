import type { StoreUpdatesAvailablePayload } from '@talex-touch/utils/transport/events/types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createStoreSdk } from '@talex-touch/utils/transport/sdk/domains/store'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

export interface PluginUpdateInfo {
  slug: string
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  downloadUrl?: string
  changelog?: string
}

export function usePluginUpdates() {
  const { t } = useI18n()
  const transport = useTuffTransport()
  const storeSdk = createStoreSdk(transport)

  const availableUpdates = ref<PluginUpdateInfo[]>([])
  const lastCheckedAt = ref<number | null>(null)
  const isChecking = ref(false)

  let unsubscribe: (() => void) | null = null

  function handleUpdatesAvailable(data: StoreUpdatesAvailablePayload) {
    const updates = (data.updates as unknown as PluginUpdateInfo[]).filter((u) => u.hasUpdate)
    availableUpdates.value = updates

    if (updates.length > 0) {
      toast.info(t('store.updates.available', { count: updates.length }), {
        description: updates
          .map((u) => `${u.slug}: ${u.currentVersion} → ${u.latestVersion}`)
          .join(', '),
        duration: 8000,
        action: {
          label: t('store.updates.viewAll'),
          onClick: () => {
            // Navigate to store or updates page
            window.location.hash = '#/store'
          }
        }
      })
    }
  }

  async function checkForUpdates(): Promise<PluginUpdateInfo[]> {
    if (isChecking.value) return availableUpdates.value

    isChecking.value = true
    try {
      const response = await storeSdk.checkUpdates()
      const updates = (response?.updates || []).filter((u: PluginUpdateInfo) => u.hasUpdate)
      availableUpdates.value = updates
      lastCheckedAt.value = Date.now()
      return updates
    } catch (error) {
      console.error('[PluginUpdates] Failed to check for updates:', error)
      return []
    } finally {
      isChecking.value = false
    }
  }

  function clearUpdates() {
    availableUpdates.value = []
  }

  onMounted(() => {
    unsubscribe = storeSdk.onUpdatesAvailable(handleUpdatesAvailable)
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return {
    availableUpdates,
    lastCheckedAt,
    isChecking,
    checkForUpdates,
    clearUpdates
  }
}
