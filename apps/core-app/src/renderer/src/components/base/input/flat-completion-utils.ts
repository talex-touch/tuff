export interface FlatCompletionUpdate {
  query: string
  results: unknown[]
}

export function resolveFlatCompletionPlaceholder(placeholder?: string): string {
  return placeholder ?? ''
}

export function createFlatCompletionUpdate(
  query: string | null | undefined,
  queryFetcher: (query: string) => unknown[]
): FlatCompletionUpdate {
  const normalizedQuery = query ?? ''
  const results = queryFetcher(normalizedQuery)

  return {
    query: normalizedQuery,
    results: results.length > 8 ? results.slice(0, 8) : results
  }
}
