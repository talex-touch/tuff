import type { NetworkRequestOptions } from '@talex-touch/utils/network'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createNetworkSdk } from '@talex-touch/utils/transport/sdk/domains/network'

const networkSdk = createNetworkSdk(useTuffTransport())

export interface IReqConfig {
  url?: string
  baseURL?: string
  method?: NetworkRequestOptions['method']
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean | null | undefined>
  data?: unknown
  timeout?: number
  responseType?: 'json' | 'text' | 'arraybuffer'
}

interface WrapperDefaults {
  timeout?: number
  headers?: Record<string, string>
}

function resolveUrl(baseUrl: string, inputUrl: string): string {
  const raw = inputUrl.trim()
  if (!raw) {
    return baseUrl
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw
  }

  try {
    return new URL(raw, baseUrl).toString()
  } catch {
    const normalizedBase = baseUrl.replace(/\/+$/, '')
    const normalizedPath = raw.replace(/^\/+/, '')
    return `${normalizedBase}/${normalizedPath}`
  }
}

function mapResponseType(
  responseType: IReqConfig['responseType']
): NetworkRequestOptions['responseType'] {
  if (responseType === 'text') return 'text'
  if (responseType === 'arraybuffer') return 'arrayBuffer'
  return 'json'
}

async function performRequest(baseUrl: string, defaults: WrapperDefaults, config: IReqConfig) {
  const requestUrl = resolveUrl(config.baseURL || baseUrl, config.url || '')

  try {
    const response = await networkSdk.request({
      method: config.method || 'GET',
      url: requestUrl,
      headers: {
        ...(defaults.headers ?? {}),
        ...(config.headers ?? {})
      },
      query: config.params,
      body: config.data,
      timeoutMs: config.timeout ?? defaults.timeout,
      responseType: mapResponseType(config.responseType)
    })

    return response.data
  } catch (error) {
    console.error('[NetworkWrapper] Request failed', error)
    return {
      code: 500,
      message: 'Server error',
      data: null,
      error
    }
  }
}

export function wrapperAxios(
  url = 'http://localhost:9981',
  data: WrapperDefaults = { timeout: 6000 }
) {
  const request = async (config: IReqConfig) => {
    return await performRequest(url, data, config)
  }

  const get = async (targetUrl: string, config?: IReqConfig) => {
    return await request({ ...(config ?? {}), url: targetUrl, method: 'GET' })
  }

  const post = async (targetUrl: string, requestData: unknown, config?: IReqConfig) => {
    return await request({ ...(config ?? {}), url: targetUrl, method: 'POST', data: requestData })
  }

  const put = async (targetUrl: string, requestData: unknown, config?: IReqConfig) => {
    return await request({ ...(config ?? {}), url: targetUrl, method: 'PUT', data: requestData })
  }

  const del = async (targetUrl: string, config?: IReqConfig) => {
    return await request({ ...(config ?? {}), url: targetUrl, method: 'DELETE' })
  }

  const patch = async (targetUrl: string, requestData: unknown, config?: IReqConfig) => {
    return await request({ ...(config ?? {}), url: targetUrl, method: 'PATCH', data: requestData })
  }

  const head = async (targetUrl: string, config?: IReqConfig) => {
    return await request({ ...(config ?? {}), url: targetUrl, method: 'HEAD' })
  }

  const options = async (targetUrl: string, config?: IReqConfig) => {
    return await request({ ...(config ?? {}), url: targetUrl, method: 'OPTIONS' })
  }

  const axios = {
    request,
    get,
    post,
    put,
    delete: del,
    patch,
    head,
    options
  }

  return {
    axios,
    post,
    get,
    put,
    del,
    patch,
    head,
    options,
    request
  }
}

export const { axios, get, put, del, patch, head, options, request, post } = wrapperAxios()
