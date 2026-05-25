export function parseMaybeJson<T = unknown>(value: unknown): T | null {
  if (typeof value !== 'string')
    return value as T

  const trimmed = value.trim()
  if (!trimmed)
    return null

  try {
    return JSON.parse(trimmed) as T
  }
  catch {
    return null
  }
}

export function coerceJsonArray<T = unknown>(value: unknown): T[] {
  const parsed = parseMaybeJson<unknown>(value)
  return Array.isArray(parsed) ? parsed as T[] : []
}

export function coerceJsonRecord<T extends Record<string, unknown> = Record<string, unknown>>(value: unknown): T | null {
  const parsed = parseMaybeJson<unknown>(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null
  return parsed as T
}
