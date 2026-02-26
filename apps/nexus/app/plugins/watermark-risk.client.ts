import type { WatermarkRiskCode } from '~/composables/useWatermarkRisk'

interface RuntimeFetchOptions {
  headers?: HeadersInit
  [key: string]: unknown
}

type FetchInvoker = (request: unknown, options?: RuntimeFetchOptions) => Promise<unknown>

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object')
    return null
  return value as Record<string, unknown>
}

function toRiskCode(value: unknown): WatermarkRiskCode | null {
  if (value === 'WM_MISSING' || value === 'WM_TAMPERED' || value === 'WM_EXPIRED' || value === 'WM_SERVER_RISK')
    return value
  return null
}

export default defineNuxtPlugin((nuxtApp) => {
  const runtimeConfig = useRuntimeConfig()
  if (runtimeConfig.public?.watermark?.enabled !== true)
    return

  const { triggerRisk } = useWatermarkRisk()
  const { token } = useWatermarkToken()
  const baseFetch = (nuxtApp.$fetch ?? $fetch) as typeof $fetch
  const invokeFetch = baseFetch as unknown as FetchInvoker

  const wrappedFetch = (async (request, options) => {
    const nextOptions: RuntimeFetchOptions = { ...(options as RuntimeFetchOptions | undefined) }
    const headers = new Headers(nextOptions.headers ?? undefined)
    if (token.value)
      headers.set('x-wm-token', token.value)
    nextOptions.headers = headers
    try {
      return await invokeFetch(request, nextOptions)
    }
    catch (error: unknown) {
      const errorRecord = toRecord(error)
      const responseRecord = toRecord(errorRecord?.response)
      const dataRecord = toRecord(errorRecord?.data) ?? toRecord(responseRecord?.data)
      const statusValue = responseRecord?.status
      const status = typeof statusValue === 'number' ? statusValue : Number(statusValue ?? 0)
      if (status === 428) {
        const code = toRiskCode(dataRecord?.errorCode) ?? toRiskCode(dataRecord?.code) ?? 'WM_SERVER_RISK'
        const detail = typeof dataRecord?.message === 'string'
          ? dataRecord.message
          : typeof dataRecord?.detail === 'string'
            ? dataRecord.detail
            : undefined
        triggerRisk(code, detail)
      }
      throw error
    }
  }) as typeof baseFetch

  Object.assign(wrappedFetch, baseFetch)
  nuxtApp.$fetch = wrappedFetch
  globalThis.$fetch = wrappedFetch
})
