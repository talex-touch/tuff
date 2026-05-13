import type { Ref } from 'vue'

export type JsonRequestOptions = Record<string, unknown>
export type RequestErrorLike = {
  statusCode?: number
  message?: string
  data?: {
    statusCode?: number
    statusMessage?: string
  }
} | null

type JsonRequestLike = <T = unknown>(request: string, options?: JsonRequestOptions) => Promise<T>

export function requestJson<T = unknown>(request: string, options?: JsonRequestOptions) {
  const requestFn = $fetch as unknown as JsonRequestLike
  return requestFn<T>(request, options)
}

export type TypedFetchOptions<T> = {
  key?: string | Ref<string>
  default?: () => T
  [key: string]: unknown
}

export interface TypedFetchResult<T> {
  data: Ref<T>
  pending: Ref<boolean>
  error: Ref<RequestErrorLike>
  status: Ref<'idle' | 'pending' | 'success' | 'error'>
  refresh: () => Promise<unknown>
}

type TypedFetchLike = <T>(request: string, options?: TypedFetchOptions<T>) => TypedFetchResult<T>

export function useTypedFetch<T>(request: string, options?: TypedFetchOptions<T>) {
  const fetchData = useFetch as unknown as TypedFetchLike
  return fetchData<T>(request, options)
}
