import { ref, watch, type Ref } from 'vue'

export function useMarketReadme(readmeUrl: Ref<string | undefined>, t: (key: string) => string) {
  const readmeContent = ref('')
  const readmeLoading = ref(false)
  const readmeError = ref('')

  async function fetchReadme(url: string): Promise<void> {
    if (!url) return

    readmeLoading.value = true
    readmeError.value = ''
    readmeContent.value = ''

    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch README: ${response.status}`)
      readmeContent.value = await response.text()
    } catch (error) {
      console.error('[MarketDetail] Failed to load README:', error)
      readmeError.value = t('market.detailDialog.readmeError') || 'Failed to load README'
    } finally {
      readmeLoading.value = false
    }
  }

  watch(
    readmeUrl,
    (newUrl) => {
      if (newUrl) {
        void fetchReadme(newUrl)
      } else {
        readmeContent.value = ''
        readmeError.value = ''
      }
    },
    { immediate: true }
  )

  return {
    readmeContent,
    readmeLoading,
    readmeError
  }
}
