import { $fetch as rawFetch } from 'ofetch'

interface ContentApiRequestOptions {
  query: Record<string, string>
}

type ContentApiRequest = (request: string, options: ContentApiRequestOptions) => Promise<unknown>

export function fetchContentApi<T>(request: string, query: Record<string, string>): Promise<T> {
  const requestFetch = import.meta.server
    ? useRequestFetch() as ContentApiRequest
    : rawFetch as ContentApiRequest
  return requestFetch(request, { query }) as Promise<T>
}
