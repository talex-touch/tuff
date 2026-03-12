import type { NetworkFileOptions, NetworkRequestOptions, NetworkResponse } from './types'
import { isHttpSource, resolveLocalFilePath, toTfileUrl } from './file'
import { NetworkHttpStatusError, NetworkTimeoutError, isTimeoutLikeError } from './core/errors'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

function appendQuery(
  url: string,
  query: Record<string, string | number | boolean | null | undefined> | undefined
): string {
  if (!query || Object.keys(query).length === 0) {
    return url
  }

  const parsed = new URL(url)
  for (const [key, value] of Object.entries(query)) {
    if (value === null || typeof value === 'undefined') {
      continue
    }
    parsed.searchParams.set(key, String(value))
  }

  return parsed.toString()
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function toBodyInit(body: unknown, headers: Headers, method: string): BodyInit | undefined {
  if (typeof body === 'undefined' || body === null) {
    return undefined
  }

  if (method === 'GET' || method === 'HEAD') {
    return undefined
  }

  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof FormData ||
    body instanceof ReadableStream
  ) {
    return body as BodyInit
  }

  if (ArrayBuffer.isView(body)) {
    return body as BodyInit
  }

  if (isPlainObject(body) || Array.isArray(body)) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }
    return JSON.stringify(body)
  }

  return String(body)
}

function createAbortSignal(timeoutMs?: number): AbortSignal | undefined {
  if (!timeoutMs || timeoutMs <= 0) {
    return undefined
  }
  return AbortSignal.timeout(timeoutMs)
}

async function parseResponseData(
  response: Response,
  responseType: NetworkRequestOptions['responseType']
): Promise<unknown> {
  if (responseType === 'text') {
    return await response.text()
  }

  if (responseType === 'arrayBuffer') {
    return await response.arrayBuffer()
  }

  if (responseType === 'stream') {
    return response.body
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function shouldTreatAsSuccess(status: number, validateStatus?: number[]): boolean {
  if (Array.isArray(validateStatus) && validateStatus.length > 0) {
    return validateStatus.includes(status)
  }
  return status >= 200 && status < 300
}

export async function request<T = unknown>(
  options: NetworkRequestOptions
): Promise<NetworkResponse<T>> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers ?? {})
  const url = appendQuery(options.url, options.query)
  const body = toBodyInit(options.body, headers, method)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      signal: options.signal ?? createAbortSignal(options.timeoutMs)
    })
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      throw new NetworkTimeoutError(options.timeoutMs)
    }
    throw error
  }

  const data = (await parseResponseData(response, options.responseType ?? 'json')) as T
  const normalizedResponse: NetworkResponse<T> = {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeHeaders(response.headers),
    data,
    url: response.url,
    ok: response.ok
  }

  if (!shouldTreatAsSuccess(response.status, options.validateStatus)) {
    throw new NetworkHttpStatusError(response.status, response.statusText, response.url || url)
  }

  return normalizedResponse
}

type FsPromiseLike = {
  readFile: (path: string, options?: unknown) => Promise<Uint8Array | string>
}

function getNodeFsPromises(): FsPromiseLike | null {
  const globalRequire = (globalThis as { require?: ((id: string) => unknown) | undefined }).require
  const req = typeof globalRequire === 'function' ? globalRequire : null
  if (!req) {
    return null
  }

  try {
    return req('node:fs/promises') as FsPromiseLike
  } catch {
    try {
      return req('fs/promises') as FsPromiseLike
    } catch {
      return null
    }
  }
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(view.byteLength)
  copied.set(view)
  return copied.buffer
}

export async function readText(source: string, options: NetworkFileOptions = {}): Promise<string> {
  if (isHttpSource(source)) {
    const response = await request<string>({
      url: source,
      method: 'GET',
      timeoutMs: options.timeoutMs,
      responseType: 'text',
      proxyOverride: options.proxyOverride,
      retryPolicy: options.retryPolicy,
      cooldownPolicy: options.cooldownPolicy
    })
    return response.data
  }

  const localPath = resolveLocalFilePath(source)
  if (localPath) {
    const fs = getNodeFsPromises()
    if (fs) {
      try {
        const value = await fs.readFile(localPath, options.encoding || 'utf-8')
        return typeof value === 'string' ? value : new TextDecoder().decode(value)
      } catch (error) {
        if (options.allowMissing) {
          return ''
        }
        throw error
      }
    }

    const response = await fetch(toTfileUrl(localPath))
    if (!response.ok && options.allowMissing) {
      return ''
    }
    if (!response.ok) {
      throw new Error(`NETWORK_FILE_READ_FAILED_${response.status}`)
    }
    return await response.text()
  }

  throw new Error('NETWORK_UNSUPPORTED_FILE_SOURCE')
}

export async function readBinary(
  source: string,
  options: NetworkFileOptions = {}
): Promise<ArrayBuffer> {
  if (isHttpSource(source)) {
    const response = await request<ArrayBuffer>({
      url: source,
      method: 'GET',
      timeoutMs: options.timeoutMs,
      responseType: 'arrayBuffer',
      proxyOverride: options.proxyOverride,
      retryPolicy: options.retryPolicy,
      cooldownPolicy: options.cooldownPolicy
    })
    return response.data
  }

  const localPath = resolveLocalFilePath(source)
  if (localPath) {
    const fs = getNodeFsPromises()
    if (fs) {
      try {
        const value = await fs.readFile(localPath)
        if (typeof value === 'string') {
          return toArrayBuffer(new TextEncoder().encode(value))
        }
        return toArrayBuffer(value)
      } catch (error) {
        if (options.allowMissing) {
          return new ArrayBuffer(0)
        }
        throw error
      }
    }

    const response = await fetch(toTfileUrl(localPath))
    if (!response.ok && options.allowMissing) {
      return new ArrayBuffer(0)
    }
    if (!response.ok) {
      throw new Error(`NETWORK_FILE_READ_FAILED_${response.status}`)
    }
    return await response.arrayBuffer()
  }

  throw new Error('NETWORK_UNSUPPORTED_FILE_SOURCE')
}
