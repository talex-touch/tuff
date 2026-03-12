import type { Ref } from 'vue'
import { useNetworkSdk } from '@talex-touch/utils/renderer'
import { ref, watch } from 'vue'

export function useStoreReadme(readmeUrl: Ref<string | undefined>, t: (key: string) => string) {
  const networkSdk = useNetworkSdk()
  const readmeMarkdown = ref('')
  const readmeLoading = ref(false)
  const readmeError = ref('')

  async function fetchReadme(url: string): Promise<void> {
    if (!url) return

    readmeLoading.value = true
    readmeError.value = ''
    readmeMarkdown.value = ''

    try {
      const response = await networkSdk.request<string>({
        method: 'GET',
        url,
        responseType: 'text'
      })
      readmeMarkdown.value = response.data
    } catch (error) {
      console.error('[StoreDetail] Failed to load README:', error)
      readmeError.value = t('store.detailDialog.readmeError') || 'Failed to load README'
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
