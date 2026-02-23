export default defineNuxtPlugin((nuxtApp) => {
  const runtimeConfig = useRuntimeConfig()
  if (runtimeConfig.public?.watermark?.enabled !== true)
    return

  const { triggerRisk } = useWatermarkRisk()
  const { token } = useWatermarkToken()
  const baseFetch = nuxtApp.$fetch || $fetch

  const wrappedFetch = (async (...args: Parameters<typeof baseFetch>) => {
    const [request, options = {}] = args as [any, any]
    const headers = new Headers(options.headers || {})
    if (token.value)
      headers.set('x-wm-token', token.value)
    options.headers = headers
    try {
      return await baseFetch(request, options)
    }
    catch (error: any) {
      const status = error?.response?.status
      if (status === 428) {
        const code = (error?.data?.errorCode || error?.data?.code || 'WM_SERVER_RISK') as any
        const detail = error?.data?.message || error?.data?.detail
        triggerRisk(code, detail)
      }
      throw error
    }
  }) as typeof baseFetch

  Object.assign(wrappedFetch, baseFetch)
  nuxtApp.$fetch = wrappedFetch
  globalThis.$fetch = wrappedFetch
})
