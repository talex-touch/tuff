import { getTouchSDK } from '@talex-touch/utils/renderer'
import { ref, onMounted, onUnmounted } from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'

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
  const touchSDK = getTouchSDK()
  
  const availableUpdates = ref<PluginUpdateInfo[]>([])
  const lastCheckedAt = ref<number | null>(null)
  const isChecking = ref(false)

  let unsubscribe: (() => void) | null = null

  function handleUpdatesAvailable(data: { updates: PluginUpdateInfo[] }) {
    const updates = data.updates.filter(u => u.hasUpdate)
    availableUpdates.value = updates

    if (updates.length > 0) {
      toast.info(
        t('market.updates.available', { count: updates.length }),
        {
          description: updates.map(u => `${u.slug}: ${u.currentVersion} → ${u.latestVersion}`).join(', '),
          duration: 8000,
          action: {
            label: t('market.updates.viewAll'),
            onClick: () => {
              // Navigate to market or updates page
              window.location.hash = '#/market'
            }
          }
        }
      )
    }
  }

  async function checkForUpdates(): Promise<PluginUpdateInfo[]> {
    if (isChecking.value) return availableUpdates.value

    isChecking.value = true
    try {
      const response = await touchSDK.rawChannel.send('market:check-updates')
      
      if (response?.code === 'SUCCESS' && response?.data?.updates) {
        const updates = response.data.updates.filter((u: PluginUpdateInfo) => u.hasUpdate)
        availableUpdates.value = updates
        lastCheckedAt.value = Date.now()
        return updates
      }
      
      return []
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
    unsubscribe = touchSDK.onChannelEvent('market:updates-available', handleUpdatesAvailable)
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
