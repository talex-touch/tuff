import type { Ref } from 'vue'
import { ref, watch } from 'vue'

export function useMarketReadme(readmeUrl: Ref<string | undefined>, t: (key: string) => string) {
  const readmeMarkdown = ref('')
  const readmeLoading = ref(false)
  const readmeError = ref('')

  async function fetchReadme(url: string): Promise<void> {
    if (!url) return

    readmeLoading.value = true
    readmeError.value = ''
    readmeMarkdown.value = ''

    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch README: ${response.status}`)
      const markdown = await response.text()
      readmeMarkdown.value = markdown
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
        readmeMarkdown.value = ''
        readmeError.value = ''
      }
    },
    { immediate: true }
  )

  return {
    readmeMarkdown,
    readmeLoading,
    readmeError
  }
}
