export function useSvgContent(tempUrl: string = '', autoFetch = true) {
  const url = ref(tempUrl ?? '')
  const content = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  if (autoFetch && url.value) {
    fetchSvgContent()
  }

  function fetchSvgContent() {
    loading.value = true
    fetch(url.value)
      .then((res) => res.text())
      .then((text) => {
        content.value = text
        console.log('fetchSvgContent success', url.value, content.value)
      })
      .catch((err) => {
        error.value = err
      })
      .finally(() => {
        loading.value = false
        console.log('fetchSvgContent', url.value, content.value)
      })
  }

  function setUrl(newUrl: string) {
    url.value = newUrl
    if (autoFetch) {
      fetchSvgContent()
    }
  }

  return { content, loading, error, fetchSvgContent, setUrl }
}
