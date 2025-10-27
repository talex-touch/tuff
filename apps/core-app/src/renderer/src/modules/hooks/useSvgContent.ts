import { createRetrier, type RetrierOptions } from '@talex-touch/utils'

export function useSvgContent(
  tempUrl: string = '',
  autoFetch = true,
  retrierOptions?: RetrierOptions
) {
  const url = ref(tempUrl ?? '')
  const content = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const retrier = createRetrier(
    retrierOptions ?? {
      maxRetries: 2,
      timeoutMs: 5000
    }
  )

  if (autoFetch && url.value) {
    fetchSvgContent()
  }

  async function doFetch(): Promise<string> {
    const response = await fetch(url.value)
    return await response.text()
  }

  const fetchWithRetry = retrier(doFetch) as () => Promise<string>

  async function fetchSvgContent() {
    loading.value = true
    error.value = null

    try {
      const text = await fetchWithRetry()
      content.value = text
    } catch (err) {
      error.value = err as Error
      console.error('fetchSvgContent failed after retries', url.value, err)
    } finally {
      loading.value = false
    }
  }

  function setUrl(newUrl: string) {
    url.value = newUrl
    if (autoFetch) {
      fetchSvgContent()
    }
  }

  return { content, loading, error, fetchSvgContent, setUrl }
}
